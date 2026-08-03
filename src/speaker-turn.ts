/**
 * Coalesce short VAD/ASR finals into speaker turns.
 *
 * AI correct/translate must run ONLY after a turn is fully merged:
 *   - speaker change / long audio gap (decided when next chunk arrives)
 *   - maxChunks reached (default 3 short VAD pieces)
 *   - long wall-clock idle (fallback when speech truly ends)
 *   - flush / close
 *
 * No reopen-after-commit: once committed (AI started), further speech is a new turn.
 * That prevents “translate every fragment” when idle fired between slow ASR results.
 */

import type { Segment } from "./types.js";

export interface SpeakerTurnOptions {
  /** Max gap (sec) between same-speaker chunks to still merge. */
  maxGapSec: number;
  /** Force-commit if open turn longer than this (sec). */
  maxTurnSec: number;
  /**
   * Wall-clock quiet after last chunk before commit (ms).
   * Must be comfortably longer than typical ASR latency between chunks,
   * otherwise every VAD piece becomes its own AI call.
   */
  idleMs: number;
  /**
   * Max ASR chunks (≈ short sentences) in one turn before force-commit.
   * Caps how large one translate unit grows. Default 3.
   */
  maxChunks: number;
}

export const DEFAULT_SPEAKER_TURN: SpeakerTurnOptions = {
  maxGapSec: 1.4,
  maxTurnSec: 24,
  idleMs: 4000,
  maxChunks: 3,
};

export interface SpeakerTurnHandlers {
  /** Growing draft — UI only, never AI. */
  onProvisional: (seg: Segment) => void;
  /** Merge finished — AI / share once. */
  onCommit: (seg: Segment) => void;
}

const CJK_END =
  /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\uac00-\ud7af\u3000-\u303f]/;

export function joinUtterance(a: string, b: string): string {
  const left = (a || "").trimEnd();
  const right = (b || "").trimStart();
  if (!left) return right;
  if (!right) return left;
  const lch = left[left.length - 1]!;
  const rch = right[0]!;
  if (CJK_END.test(lch) || CJK_END.test(rch)) return left + right;
  if (/[、。．，,.!！?？…~～)]$/.test(left)) return left + right;
  if (/^[、。．，,.!！?？…]/.test(right)) return left + right;
  return `${left} ${right}`;
}

function spkCompatible(
  openSpk: number | null,
  nextSpk: number | null,
  gapSec: number,
): boolean {
  if (openSpk === nextSpk) return true;
  if (nextSpk == null) return true;
  if (openSpk == null) return true;
  if (gapSec <= 0.65) return true;
  return false;
}

type TurnState = {
  id: string;
  spk: number | null;
  start: number;
  end: number;
  wall: Date;
  text: string;
  parts: number;
};

export function createSpeakerTurnCoalescer(
  opts: SpeakerTurnOptions,
  handlers: SpeakerTurnHandlers,
): {
  push: (seg: Segment) => void;
  flush: () => void;
  close: () => void;
} {
  const maxGap = Math.max(0.15, opts.maxGapSec);
  const maxTurn = Math.max(2, opts.maxTurnSec);
  // Floor idle at 2.5s so slow SenseVoice between chunks doesn't force AI each time
  const idleMs = Math.max(2500, opts.idleMs);
  const maxChunks = Math.min(20, Math.max(1, Math.round(opts.maxChunks || 3)));

  let seq = 0;
  let open: TurnState | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  const clearTimer = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const toSeg = (state: TurnState, committed: boolean): Segment => ({
    kind: "final",
    id: state.id,
    start: state.start,
    end: state.end,
    wall: state.wall,
    spk: state.spk,
    text: state.text,
    pending: false,
    draft: !committed,
  });

  const commit = () => {
    if (!open) return;
    clearTimer();
    const state: TurnState = { ...open };
    open = null;
    handlers.onCommit(toSeg(state, true));
  };

  const armTimer = () => {
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      if (!closed) commit();
    }, idleMs);
    timer.unref?.();
  };

  const canMergeOnto = (
    base: TurnState,
    seg: Segment,
    end: number,
  ): boolean => {
    if (base.parts >= maxChunks) return false;
    const gap = Math.max(0, seg.start - base.end);
    const turnLen = end - base.start;
    const same = spkCompatible(base.spk, seg.spk, gap);
    return same && gap <= maxGap && turnLen <= maxTurn;
  };

  const mergeOnto = (
    base: TurnState,
    seg: Segment,
    text: string,
    end: number,
  ) => {
    base.text = joinUtterance(base.text, text);
    base.end = Math.max(base.end, end);
    base.parts += 1;
    if (base.spk == null && seg.spk != null) base.spk = seg.spk;
  };

  const openTurn = (seg: Segment, text: string, end: number) => {
    open = {
      id: seg.id || `turn_${Date.now()}_${++seq}`,
      spk: seg.spk,
      start: seg.start,
      end,
      wall: seg.wall,
      text,
      parts: 1,
    };
    handlers.onProvisional(toSeg(open, false));
    // maxChunks===1 → still wait for idle so AI is not per-micro-chunk unless forced
    if (maxChunks <= 1) {
      armTimer();
      return;
    }
    armTimer();
  };

  return {
    push(seg: Segment) {
      if (closed) return;
      if (seg.kind === "partial") {
        handlers.onProvisional(seg);
        return;
      }
      const text = (seg.text || "").trim();
      if (!text) return;

      const end =
        seg.end != null && Number.isFinite(seg.end) ? seg.end : seg.start;

      if (open) {
        if (canMergeOnto(open, seg, end)) {
          mergeOnto(open, seg, text, end);
          handlers.onProvisional(toSeg(open, false));
          // Batch full (e.g. 3 sentences) → merge done → one AI translate
          if (open.parts >= maxChunks) {
            commit();
            return;
          }
          // Still merging: reset idle; AI only after quiet
          armTimer();
          return;
        }
        // Cannot merge (speaker change / long gap / turn too long) → finish previous first
        commit();
      }

      openTurn(seg, text, end);
    },

    flush() {
      if (closed) return;
      commit();
    },

    close() {
      if (closed) return;
      closed = true;
      commit();
      clearTimer();
    },
  };
}
