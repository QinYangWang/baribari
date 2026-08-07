/**
 * Speaker ID via embedding template banks (cosine + multi-window voting).
 * Multi-window voting + energy-focused windows to reduce errors when
 * speakers barge in / overlap within one VAD segment.
 *
 * Global roster: fixed attendees are seeded first (indices 0..G-1 → spk 1..G).
 * Session-only speakers enroll after that. Display names for globals come from roster.
 *
 * Design:
 * - Bounded representative template bank per speaker (not a single drifting centroid).
 * - Weak / short audio never enrolls a new speaker.
 * - Multi-window agreement required for enrollment when multiple windows exist.
 * - Global identities update only on strong confidence.
 * - Temporal hysteresis only in the ambiguous score band.
 */

import type { TranscribeArgs } from "./types.js";
import { SAMPLE_RATE } from "./paths.js";
import {
  spkEngineDefaults,
  type SpkEngine,
  type SpkEngineDefaults,
} from "./speaker-models.js";

// loose typing: sherpa-onnx-node ships without complete TS defs
export interface SpeakerEmbeddingExtractor {
  createStream(): SpeakerStream;
  compute(stream: SpeakerStream): Float32Array | number[];
  dim?: number;
}

export interface SpeakerStream {
  acceptWaveform(opts: { sampleRate: number; samples: Float32Array }): void;
}

/** Seed from ~/.config/baribari/speakers/roster.json */
export interface GlobalSpeakerSeed {
  id: string;
  displayName: string;
  /** Primary / representative embedding (first template). */
  embedding: number[] | Float32Array;
  /** Optional extra templates for this model. */
  embeddings?: Array<number[] | Float32Array>;
  count?: number;
}

/** Min audio length for a reliable embedding window (~0.6s). */
const MIN_WINDOW_SAMPLES = Math.floor(0.6 * SAMPLE_RATE);
/** Prefer ~1.2s windows when available. */
const PREFERRED_WINDOW_SAMPLES = Math.floor(1.2 * SAMPLE_RATE);
/** Max windows to score per segment. */
const MAX_WINDOWS = 5;
/** RMS below this → skip window (silence / very quiet). */
const MIN_RMS = 0.008;
/** Absolute min speech for any assign attempt (~0.8s). */
const MIN_ASSIGN_SAMPLES = Math.floor(0.8 * SAMPLE_RATE);
/** Prefer this much speech before first enrollment (~1.2s). */
const MIN_ENROLL_SAMPLES = Math.floor(1.2 * SAMPLE_RATE);
/** Consecutive strong mismatches needed before enrolling a new speaker. */
const ENROLL_MISMATCH_STREAK = 2;
/** Multi-window vote share required to enroll as new. */
const ENROLL_VOTE_SHARE = 0.55;
/** Do not carry ambiguous continuity across a long pause. */
const HYSTERESIS_MAX_GAP_MS = 8_000;

interface SpeakerSlot {
  templates: Float32Array[];
  counts: number[];
  name: string;
  globalId: string | null;
  isGlobal: boolean;
  /** Total successful match weight. */
  hits: number;
}

export class SherpaSpeakerTracker {
  private slots: SpeakerSlot[] = [];
  private dirtyGlobal = false;
  private lastSpk: number | null = null;
  private lastSeenMs = 0;
  /** Pending weak mismatch streak (for deferred enrollment). */
  private pendingMismatch = 0;
  private pendingEmb: Float32Array | null = null;
  private readonly model: SpkEngine;
  private readonly defaults: SpkEngineDefaults;
  private readonly dim: number;
  /** Threshold used by the extractor active in this session. */
  private activeThreshold: number;

  constructor(
    private extractor: SpeakerEmbeddingExtractor,
    private args: TranscribeArgs,
    opts?: { model?: SpkEngine; dim?: number },
  ) {
    this.model = opts?.model ?? args.spkEngine ?? "campplus";
    this.defaults = spkEngineDefaults(this.model);
    this.activeThreshold =
      typeof args.spkThreshold === "number" && Number.isFinite(args.spkThreshold)
        ? args.spkThreshold
        : this.defaults.threshold;
    const fromExt =
      typeof extractor.dim === "number" && extractor.dim > 0
        ? extractor.dim
        : 0;
    this.dim =
      opts?.dim && opts.dim > 0
        ? opts.dim
        : fromExt || this.defaults.dim || 0;
  }

  get spkEngine(): SpkEngine {
    return this.model;
  }

  get embeddingDim(): number {
    return this.dim;
  }

  /**
   * Load fixed attendees as the first slots (spk 1..N).
   * Call once before any assign(). Embeddings with wrong dim are skipped.
   */
  seedGlobal(seeds: GlobalSpeakerSeed[]): void {
    if (this.slots.length) {
      throw new Error("seedGlobal must be called before any assign()");
    }
    for (const s of seeds) {
      const templates = collectTemplates(s, this.dim);
      if (!templates.length) continue;
      this.slots.push({
        templates,
        counts: templates.map(() => Math.max(1, s.count ?? 1)),
        name: (s.displayName || "").trim() || s.id,
        globalId: s.id,
        isGlobal: true,
        hits: Math.max(1, s.count ?? 1),
      });
    }
  }

  embed(audio: Float32Array): Float32Array {
    const stream = this.extractor.createStream();
    stream.acceptWaveform({ sampleRate: SAMPLE_RATE, samples: audio });
    const raw = this.extractor.compute(stream);
    const emb = Float32Array.from(raw);
    if (this.dim > 0 && emb.length !== this.dim) {
      // dim mismatch: normalize anyway but matching will fail length checks
    }
    return l2Normalize(emb);
  }

  /**
   * Returns 1-based speaker id, or null if audio too short / weak / ambiguous.
   * Uses multi-window voting for long or mixed segments.
   */
  assign(audio: Float32Array): number | null {
    if (audio.length < MIN_ASSIGN_SAMPLES) return null;

    const windows = pickWindows(audio);
    if (!windows.length) {
      // single full-clip attempt only if loud enough
      const rms = calcRms(audio);
      if (rms < MIN_RMS) return null;
      return this.decideFromEmbeddings(
        [this.embed(audio)],
        [rms],
        audio.length,
      );
    }

    const embs: Float32Array[] = [];
    const weights: number[] = [];
    for (const w of windows) {
      embs.push(this.embed(w.samples));
      weights.push(w.rms);
    }
    return this.decideFromEmbeddings(embs, weights, audio.length);
  }

  /** Display name for 1-based spk (global roster name or Speaker N). */
  getDisplayName(spk: number): string {
    const i = spk - 1;
    if (i < 0 || i >= this.slots.length) return `Speaker ${spk}`;
    return this.slots[i]!.name || `Speaker ${spk}`;
  }

  getGlobalId(spk: number): string | null {
    const i = spk - 1;
    if (i < 0 || i >= this.slots.length) return null;
    return this.slots[i]!.globalId;
  }

  isGlobal(spk: number): boolean {
    const i = spk - 1;
    return i >= 0 && i < this.slots.length && this.slots[i]!.isGlobal;
  }

  setDisplayName(spk: number, name: string): void {
    const i = spk - 1;
    if (i < 0 || i >= this.slots.length) return;
    const n = name.trim();
    if (!n) return;
    this.slots[i]!.name = n;
    if (this.slots[i]!.isGlobal) this.dirtyGlobal = true;
  }

  /**
   * Promote session speaker to global roster candidate, or refresh global name+emb.
   * Returns payload for speaker-library upsert (templates bank).
   */
  promoteOrUpdateGlobal(
    spk: number,
    displayName: string,
  ): {
    id: string | null;
    displayName: string;
    embedding: Float32Array;
    embeddings: Float32Array[];
    count: number;
    isNew: boolean;
    model: SpkEngine;
  } | null {
    const i = spk - 1;
    if (i < 0 || i >= this.slots.length) return null;
    const slot = this.slots[i]!;
    if (!slot.templates.length) return null;
    const n = displayName.trim() || slot.name || `Speaker ${spk}`;
    slot.name = n;
    const primary = slot.templates[0]!;
    const existingId = slot.globalId;
    slot.isGlobal = true;
    this.dirtyGlobal = true;
    if (existingId) {
      return {
        id: existingId,
        displayName: n,
        embedding: primary,
        embeddings: slot.templates.slice(),
        count: Math.max(1, slot.hits),
        isNew: false,
        model: this.model,
      };
    }
    return {
      id: null,
      displayName: n,
      embedding: primary,
      embeddings: slot.templates.slice(),
      count: Math.max(1, slot.hits),
      isNew: true,
      model: this.model,
    };
  }

  bindGlobalId(spk: number, id: string): void {
    const i = spk - 1;
    if (i < 0 || i >= this.slots.length) return;
    this.slots[i]!.globalId = id;
    this.slots[i]!.isGlobal = true;
  }

  /** Export all global template banks for roster merge on session end. */
  exportGlobalUpdates(): Array<{
    id: string;
    displayName: string;
    embedding: number[];
    embeddings: number[][];
    count: number;
    model: SpkEngine;
  }> {
    const out: Array<{
      id: string;
      displayName: string;
      embedding: number[];
      embeddings: number[][];
      count: number;
      model: SpkEngine;
    }> = [];
    for (const slot of this.slots) {
      if (!slot.globalId || !slot.isGlobal || !slot.templates.length) continue;
      out.push({
        id: slot.globalId,
        displayName: slot.name || slot.globalId,
        embedding: Array.from(slot.templates[0]!),
        embeddings: slot.templates.map((t) => Array.from(t)),
        count: Math.max(1, slot.hits),
        model: this.model,
      });
    }
    return out;
  }

  get hasDirtyGlobal(): boolean {
    return this.dirtyGlobal;
  }

  get numSpeakers(): number {
    return this.slots.length;
  }

  get numGlobal(): number {
    return this.slots.filter((s) => s.isGlobal).length;
  }

  // ── matching internals ─────────────────────────────────

  private threshold(): number {
    const t = this.args.spkThreshold;
    if (
      this.args.spkEngine === this.model &&
      typeof t === "number" &&
      Number.isFinite(t)
    ) {
      this.activeThreshold = t;
    }
    return this.activeThreshold;
  }

  private decideFromEmbeddings(
    embs: Float32Array[],
    weights: number[],
    audioLen: number,
  ): number | null {
    if (!embs.length) return null;

    const thr = this.threshold();
    // Score each embedding against all slots
    const vote = new Map<number, number>(); // 1-based id or -1 unknown
    let bestOverall: {
      id: number;
      sim: number;
      second: number;
      emb: Float32Array;
      margin: number;
    } | null = null;

    for (let wi = 0; wi < embs.length; wi++) {
      const emb = embs[wi]!;
      const w = weights[wi] ?? 1;
      const match = this.bestMatch(emb);
      if (!match || match.sim < thr) {
        vote.set(-1, (vote.get(-1) || 0) + w * 0.5);
        if (match && (!bestOverall || match.sim > bestOverall.sim)) {
          bestOverall = { ...match, emb };
        }
        continue;
      }
      const conf =
        Math.max(0, match.sim) *
        (0.5 + Math.min(0.5, match.margin * 2));
      vote.set(match.id, (vote.get(match.id) || 0) + w * (0.3 + conf));
      if (!bestOverall || match.sim > bestOverall.sim) {
        bestOverall = { ...match, emb };
      }
    }

    const updateMin = Math.max(thr, this.defaults.updateMinSim);
    const minMargin = this.defaults.minMargin;

    // Aggregate winner among known ids
    let winId = -1;
    let winW = -1;
    let totalKnown = 0;
    let totalAll = 0;
    for (const [id, w] of vote) {
      totalAll += w;
      if (id < 0) continue;
      totalKnown += w;
      if (w > winW) {
        winW = w;
        winId = id;
      }
    }
    const unknownW = vote.get(-1) || 0;

    // Strong multi-window agreement on a known speaker
    if (
      winId > 0 &&
      bestOverall &&
      bestOverall.id === winId &&
      bestOverall.sim >= thr &&
      bestOverall.margin >= minMargin * 0.5
    ) {
      const agree =
        embs.length === 1 ||
        (totalKnown > 0 && winW / Math.max(totalAll, 1e-6) >= 0.45);
      if (agree) {
        if (bestOverall.sim >= updateMin && bestOverall.margin >= minMargin) {
          this.maybeUpdateTemplates(winId - 1, bestOverall.emb, bestOverall.sim);
        }
        return this.commitSpk(winId, bestOverall.sim, thr);
      }
    }

    // Ambiguous: hysteresis may keep last speaker
    if (bestOverall && this.lastSpk != null) {
      const band = this.defaults.hysteresisBand;
      const continuityIsRecent =
        this.lastSeenMs > 0 && Date.now() - this.lastSeenMs <= HYSTERESIS_MAX_GAP_MS;
      const near =
        bestOverall.sim >= thr - band && bestOverall.sim < thr + band * 0.5;
      const lastSim = this.scoreAgainst(embs[0]!, this.lastSpk - 1);
      if (
        continuityIsRecent &&
        near &&
        lastSim >= thr - band &&
        (bestOverall.id === this.lastSpk ||
          bestOverall.sim - lastSim < minMargin)
      ) {
        return this.commitSpk(this.lastSpk, lastSim, thr, /*sticky*/ true);
      }
      // Clear speaker change with strong score → allow switch
      if (
        bestOverall.id !== this.lastSpk &&
        bestOverall.sim >= thr &&
        bestOverall.margin >= minMargin
      ) {
        if (bestOverall.sim >= updateMin) {
          this.maybeUpdateTemplates(
            bestOverall.id - 1,
            bestOverall.emb,
            bestOverall.sim,
          );
        }
        return this.commitSpk(bestOverall.id, bestOverall.sim, thr);
      }
    } else if (
      bestOverall &&
      bestOverall.sim >= thr &&
      bestOverall.margin >= minMargin * 0.5
    ) {
      if (bestOverall.sim >= updateMin) {
        this.maybeUpdateTemplates(
          bestOverall.id - 1,
          bestOverall.emb,
          bestOverall.sim,
        );
      }
      return this.commitSpk(bestOverall.id, bestOverall.sim, thr);
    }

    // No confident match → maybe enroll (never from one weak short clip)
    const canEnroll =
      audioLen >= MIN_ENROLL_SAMPLES &&
      (embs.length === 1 ||
        unknownW / Math.max(totalAll, 1e-6) >= ENROLL_VOTE_SHARE ||
        !this.slots.length);

    if (!canEnroll) {
      this.pendingMismatch = 0;
      this.pendingEmb = null;
      // stick to last if we have continuity and not a strong rejection
      if (
        this.lastSpk != null &&
        bestOverall &&
        bestOverall.sim >= thr - this.defaults.hysteresisBand
      ) {
        return this.commitSpk(this.lastSpk, bestOverall.sim, thr, true);
      }
      return null;
    }

    // Require repeated mismatch before creating a new speaker (unless empty roster)
    const rep = representativeEmb(embs, weights);
    if (!this.slots.length) {
      return this.enrollNew(rep);
    }

    if (this.pendingEmb) {
      const sameUnknownMin = Math.max(
        thr,
        this.defaults.updateMinSim - 0.05,
      );
      const pendingSim = dot(this.pendingEmb, rep);
      if (pendingSim < sameUnknownMin) {
        // A different unknown speaker must start its own confirmation streak.
        this.pendingMismatch = 1;
        this.pendingEmb = rep;
      } else {
        this.pendingMismatch += 1;
        this.pendingEmb = representativeEmb(
          [this.pendingEmb, rep],
          [1, 1],
        );
      }
    } else {
      this.pendingMismatch = 1;
      this.pendingEmb = rep;
    }
    if (this.pendingMismatch < ENROLL_MISMATCH_STREAK) {
      // Don't invent a speaker yet; keep last if any
      if (this.lastSpk != null) {
        return this.commitSpk(this.lastSpk, bestOverall?.sim ?? 0, thr, true);
      }
      return null;
    }

    // Confirm pending still doesn't match anyone strongly
    const recheck = this.bestMatch(this.pendingEmb!);
    if (recheck && recheck.sim >= thr) {
      this.pendingMismatch = 0;
      this.pendingEmb = null;
      return this.commitSpk(recheck.id, recheck.sim, thr);
    }

    const enrolled = this.enrollNew(this.pendingEmb!);
    this.pendingMismatch = 0;
    this.pendingEmb = null;
    return enrolled;
  }

  private commitSpk(
    spk: number,
    _sim: number,
    _thr: number,
    sticky = false,
  ): number {
    if (this.lastSpk !== spk || !sticky) {
      this.pendingMismatch = 0;
      this.pendingEmb = null;
    }
    this.lastSpk = spk;
    this.lastSeenMs = Date.now();
    return spk;
  }

  private enrollNew(emb: Float32Array): number | null {
    if (this.dim > 0 && emb.length !== this.dim) {
      return this.lastSpk;
    }
    this.slots.push({
      templates: [emb],
      counts: [1],
      name: `Speaker ${this.slots.length + 1}`,
      globalId: null,
      isGlobal: false,
      hits: 1,
    });
    const spk = this.slots.length;
    this.lastSpk = spk;
    this.lastSeenMs = Date.now();
    return spk;
  }

  private bestMatch(
    emb: Float32Array,
  ): { id: number; sim: number; second: number; margin: number } | null {
    if (!this.slots.length) return null;
    if (this.dim > 0 && emb.length !== this.dim) return null;
    let best = -1;
    let bestSim = -1;
    let second = -1;
    for (let i = 0; i < this.slots.length; i++) {
      const sim = this.scoreAgainst(emb, i);
      if (sim > bestSim) {
        second = bestSim;
        bestSim = sim;
        best = i;
      } else if (sim > second) {
        second = sim;
      }
    }
    if (best < 0) return null;
    const margin = bestSim - Math.max(0, second);
    return {
      id: best + 1,
      sim: bestSim,
      second: Math.max(0, second),
      margin,
    };
  }

  private scoreAgainst(emb: Float32Array, index: number): number {
    const slot = this.slots[index];
    if (!slot?.templates.length) return -1;
    if (this.dim > 0 && emb.length !== this.dim) return -1;
    let best = -1;
    for (const t of slot.templates) {
      if (t.length !== emb.length) continue;
      const s = dot(emb, t);
      if (s > best) best = s;
    }
    return best;
  }

  /**
   * Add embedding to template bank if diverse enough; replace weakest if full.
   * Globals require stronger similarity than session speakers.
   */
  private maybeUpdateTemplates(
    index: number,
    emb: Float32Array,
    sim: number,
  ): void {
    const slot = this.slots[index];
    if (!slot) return;
    if (this.dim > 0 && emb.length !== this.dim) return;

    const thr = this.threshold();
    const updateMin = Math.max(thr, this.defaults.updateMinSim);
    // Protect globals: need stronger confidence
    const need = slot.isGlobal
      ? Math.max(updateMin, thr + 0.08)
      : updateMin;
    if (sim < need) return;

    slot.hits += 1;

    // If very close to an existing template, lightly blend that one only
    let closest = -1;
    let closestSim = -1;
    for (let i = 0; i < slot.templates.length; i++) {
      const t = slot.templates[i]!;
      if (t.length !== emb.length) continue;
      const s = dot(emb, t);
      if (s > closestSim) {
        closestSim = s;
        closest = i;
      }
    }

    const maxT = this.defaults.maxTemplates;
    if (closest >= 0 && closestSim >= 0.92) {
      // EMA blend into that template (small alpha for globals)
      const alpha = slot.isGlobal
        ? Math.max(0.04, 0.12 / Math.sqrt(slot.counts[closest] || 1))
        : Math.max(0.08, 0.25 / Math.sqrt(slot.counts[closest] || 1));
      const cur = slot.templates[closest]!;
      const updated = new Float32Array(cur.length);
      for (let i = 0; i < cur.length; i++) {
        updated[i] = (1 - alpha) * cur[i]! + alpha * emb[i]!;
      }
      slot.templates[closest] = l2Normalize(updated);
      slot.counts[closest] = (slot.counts[closest] || 1) + 1;
      if (slot.isGlobal) this.dirtyGlobal = true;
      return;
    }

    // Diverse enough → add or replace farthest/weakest
    if (slot.templates.length < maxT) {
      slot.templates.push(emb);
      slot.counts.push(1);
      if (slot.isGlobal) this.dirtyGlobal = true;
      return;
    }

    // Replace the template with lowest count that is farthest from new emb
    let victim = 0;
    let victimScore = Infinity;
    for (let i = 0; i < slot.templates.length; i++) {
      const t = slot.templates[i]!;
      const s = t.length === emb.length ? dot(emb, t) : -1;
      const score = s + (slot.counts[i] || 1) * 0.01;
      if (score < victimScore) {
        victimScore = score;
        victim = i;
      }
    }
    // Only replace if new is not worse than victim similarity cluster
    if (sim >= need) {
      slot.templates[victim] = emb;
      slot.counts[victim] = 1;
      if (slot.isGlobal) this.dirtyGlobal = true;
    }
  }
}

function collectTemplates(
  s: GlobalSpeakerSeed,
  expectedDim: number,
): Float32Array[] {
  const raw: Array<number[] | Float32Array> = [];
  if (s.embeddings?.length) {
    for (const e of s.embeddings) raw.push(e);
  } else if (s.embedding) {
    raw.push(s.embedding);
  }
  const out: Float32Array[] = [];
  for (const e of raw) {
    if (!e || e.length < 8) continue;
    if (expectedDim > 0 && e.length !== expectedDim) continue;
    out.push(l2Normalize(Float32Array.from(e)));
  }
  return out;
}

function representativeEmb(
  embs: Float32Array[],
  weights: number[],
): Float32Array {
  if (embs.length === 1) return embs[0]!;
  const dim = embs[0]!.length;
  const acc = new Float32Array(dim);
  let wSum = 0;
  for (let i = 0; i < embs.length; i++) {
    const e = embs[i]!;
    if (e.length !== dim) continue;
    const w = weights[i] ?? 1;
    wSum += w;
    for (let d = 0; d < dim; d++) acc[d]! += e[d]! * w;
  }
  if (wSum <= 0) return embs[0]!;
  for (let d = 0; d < dim; d++) acc[d]! /= wSum;
  return l2Normalize(acc);
}

interface WindowSlice {
  samples: Float32Array;
  rms: number;
}

function pickWindows(audio: Float32Array): WindowSlice[] {
  const n = audio.length;
  if (n < MIN_WINDOW_SAMPLES) return [];

  const win = Math.min(PREFERRED_WINDOW_SAMPLES, n);
  const out: WindowSlice[] = [];
  const seen = new Set<number>();

  const pushAt = (start: number) => {
    let s = Math.max(0, Math.min(start, n - win));
    s = Math.floor(s);
    if (seen.has(s)) return;
    seen.add(s);
    const slice = audio.subarray(s, s + win);
    const rms = calcRms(slice);
    if (rms < MIN_RMS) return;
    out.push({ samples: new Float32Array(slice), rms });
  };

  pushAt(0);
  if (n > win * 1.2) pushAt(n - win);
  if (n > win * 1.5) {
    const hop = Math.max(Math.floor(win / 2), Math.floor(0.25 * SAMPLE_RATE));
    const peaks: Array<{ i: number; e: number }> = [];
    for (let i = 0; i + win <= n; i += hop) {
      const e = calcRms(audio.subarray(i, i + win));
      peaks.push({ i, e });
    }
    peaks.sort((a, b) => b.e - a.e);
    for (const p of peaks) {
      if (out.length >= MAX_WINDOWS) break;
      pushAt(p.i);
    }
  }

  out.sort((a, b) => b.rms - a.rms);
  return out.slice(0, MAX_WINDOWS);
}

function calcRms(v: Float32Array): number {
  if (!v.length) return 0;
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i]! * v[i]!;
  return Math.sqrt(s / v.length);
}

function l2Normalize(v: Float32Array): Float32Array {
  let n = 0;
  for (let i = 0; i < v.length; i++) n += v[i]! * v[i]!;
  n = Math.sqrt(n) + 1e-8;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i]! / n;
  return out;
}

function dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i]! * b[i]!;
  return s;
}

/** Test helpers (not part of public runtime API surface beyond tests). */
export const _speakerTrackerTest = {
  MIN_ASSIGN_SAMPLES,
  MIN_ENROLL_SAMPLES,
  ENROLL_MISMATCH_STREAK,
  l2Normalize,
  dot,
};
