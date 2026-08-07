import {
  displayText,
  isPartialSegment,
  type Segment,
} from "../types.js";
import type { LivePartialView, SpeakerView, TranscriptRow } from "./types.js";
import { SPK_COLOR_COUNT } from "./types.js";

export function speakerIdFromSpk(spk: number | null): string | null {
  if (spk == null) return null;
  return `spk_${spk}`;
}

export function ensureSpeakerFromSeg(
  speakers: SpeakerView[],
  spk: number | null,
  resolveName?: (spk: number) => string | undefined,
  fallbackName?: (spk: number) => string,
): { speakers: SpeakerView[]; speakerId: string | null } {
  if (spk == null) return { speakers, speakerId: null };
  const id = speakerIdFromSpk(spk)!;
  const existing = speakers.find((s) => s.id === id);
  const roster = resolveName?.(spk)?.trim();
  if (existing) {
    if (
      roster &&
      !existing.manual &&
      (existing.displayName.startsWith("Speaker ") ||
        existing.displayName.includes(`${spk}`))
    ) {
      return {
        speakers: speakers.map((s) =>
          s.id === id ? { ...s, displayName: roster } : s,
        ),
        speakerId: id,
      };
    }
    return { speakers, speakerId: id };
  }
  const next: SpeakerView = {
    id,
    displayName: roster || fallbackName?.(spk) || `Speaker ${spk}`,
    colorIndex: (spk - 1) % SPK_COLOR_COUNT,
    segmentCount: 0,
    isActive: false,
    manual: false,
    spkIndex: spk,
  };
  return { speakers: [...speakers, next], speakerId: id };
}

export function mapPartial(seg: Segment): LivePartialView | null {
  if (!isPartialSegment(seg)) return null;
  const text = (seg.text || "").trim();
  if (!text) return null;
  return {
    text,
    start: seg.start,
    wallMs: seg.wall.getTime(),
    spk: seg.spk,
  };
}

export function mapFinalSegment(
  seg: Segment,
  speakerId: string | null,
  existing?: TranscriptRow,
  seqFallback?: string,
): TranscriptRow {
  const main = displayText(seg);
  const rawAsr = (seg.text || "").trim();
  const id = seg.id || existing?.id || seqFallback || `seg_${Date.now()}`;
  const prevText = existing?.originalText || "";
  const nextText = main || rawAsr || prevText;
  const textGrew =
    !!nextText &&
    !!prevText &&
    nextText !== prevText &&
    nextText.length >= prevText.length;

  let translatedText = existing?.translatedText;
  if (seg.translation?.trim()) {
    const tr = seg.translation.trim();
    if (tr !== nextText) translatedText = tr;
  } else if (seg.draft && textGrew && !seg.pending) {
    translatedText = undefined;
  }

  let pending = existing?.pending;
  let isDraft = existing?.isDraft;
  let isFinal = existing?.isFinal ?? true;

  if (seg.draft) {
    isDraft = true;
    isFinal = false;
    if (!seg.pending) pending = false;
  }
  if (seg.pending) {
    pending = true;
    isFinal = false;
    isDraft = false;
  } else if (!seg.draft) {
    pending = false;
    isDraft = false;
    isFinal = true;
  }

  return {
    id,
    speakerId: speakerId ?? existing?.speakerId ?? null,
    startedAtMs: existing?.startedAtMs ?? seg.start,
    endedAtMs:
      seg.end != null && Number.isFinite(seg.end)
        ? seg.end
        : existing?.endedAtMs,
    originalText: nextText,
    translatedText,
    isFinal: !!isFinal,
    isActive: true,
    pending: !!pending,
    isDraft: !!isDraft,
    wallMs: existing?.wallMs ?? seg.wall.getTime(),
  };
}

export function bumpSpeakerCount(
  speakers: SpeakerView[],
  speakerId: string | null,
  activeId: string | null,
): SpeakerView[] {
  return speakers.map((s) => ({
    ...s,
    segmentCount:
      speakerId && s.id === speakerId ? s.segmentCount + 1 : s.segmentCount,
    isActive: activeId ? s.id === activeId : false,
  }));
}
