/**
 * Speaker ID via embedding centroids (cosine + EMA).
 * Multi-window voting + energy-focused windows to reduce errors when
 * speakers barge in / overlap within one VAD segment.
 *
 * Global roster: fixed attendees are seeded first (indices 0..G-1 → spk 1..G).
 * Session-only speakers enroll after that. Display names for globals come from roster.
 */

import type { TranscribeArgs } from "./types.js";
import { SAMPLE_RATE } from "./paths.js";

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
  embedding: number[] | Float32Array;
  count?: number;
}

/** Min audio length for a reliable embedding window (~0.6s). */
const MIN_WINDOW_SAMPLES = Math.floor(0.6 * SAMPLE_RATE);
/** Prefer ~1.2s windows when available. */
const PREFERRED_WINDOW_SAMPLES = Math.floor(1.2 * SAMPLE_RATE);
/** Max windows to score per segment. */
const MAX_WINDOWS = 5;
/** Best-vs-second margin required to trust a match (reduces mixed-speech flips). */
const MIN_MARGIN = 0.06;
/** Only EMA-update centroid when match is this confident. */
const UPDATE_MIN_SIM = 0.62;
/** RMS below this → skip window (silence / very quiet). */
const MIN_RMS = 0.008;

export class SherpaSpeakerTracker {
  private centroids: Float32Array[] = [];
  private counts: number[] = []; // enrollment weight per speaker
  private names: string[] = []; // display name per index
  private globalIds: (string | null)[] = []; // roster id or null if session-only
  private globalFlags: boolean[] = []; // true = fixed global attendee
  private ema: number;
  private dirtyGlobal = false;

  constructor(
    private extractor: SpeakerEmbeddingExtractor,
    private args: TranscribeArgs,
    ema = 0.25,
  ) {
    this.ema = ema;
  }

  /**
   * Load fixed attendees as the first centroids (spk 1..N).
   * Call once before any assign().
   */
  seedGlobal(seeds: GlobalSpeakerSeed[]): void {
    if (this.centroids.length) {
      throw new Error("seedGlobal must be called before any assign()");
    }
    for (const s of seeds) {
      if (!s.embedding || s.embedding.length < 8) continue;
      const emb = l2Normalize(Float32Array.from(s.embedding));
      this.centroids.push(emb);
      this.counts.push(Math.max(1, s.count ?? 1));
      this.names.push((s.displayName || "").trim() || s.id);
      this.globalIds.push(s.id);
      this.globalFlags.push(true);
    }
  }

  embed(audio: Float32Array): Float32Array {
    const stream = this.extractor.createStream();
    stream.acceptWaveform({ sampleRate: SAMPLE_RATE, samples: audio });
    const raw = this.extractor.compute(stream);
    const emb = Float32Array.from(raw);
    return l2Normalize(emb);
  }

  /**
   * Returns 1-based speaker id, or null if audio too short / empty.
   * Uses multi-window voting for long or mixed segments.
   */
  assign(audio: Float32Array): number | null {
    if (audio.length < MIN_WINDOW_SAMPLES) return null;

    const windows = pickWindows(audio);
    if (!windows.length) {
      return this.assignEmbedding(this.embed(audio), /*allowUpdate*/ true);
    }

    const votes = new Map<number, number>();
    let bestGlobal: { id: number; sim: number; emb: Float32Array } | null =
      null;

    for (const w of windows) {
      const emb = this.embed(w.samples);
      const match = this.matchEmbedding(emb);
      if (!match) {
        const key = -1;
        votes.set(key, (votes.get(key) || 0) + w.rms * 0.5);
        continue;
      }
      const { id, sim, second } = match;
      const margin = sim - second;
      const conf = Math.max(0, sim) * (0.5 + Math.min(0.5, margin * 2));
      const weight = w.rms * (0.3 + conf);
      votes.set(id, (votes.get(id) || 0) + weight);
      if (!bestGlobal || sim > bestGlobal.sim) {
        bestGlobal = { id, sim, emb };
      }
    }

    if (!bestGlobal || (votes.size === 1 && votes.has(-1))) {
      const loudest = windows.reduce((a, b) => (a.rms >= b.rms ? a : b));
      return this.assignEmbedding(this.embed(loudest.samples), true);
    }

    let winId = bestGlobal.id;
    let winW = -1;
    for (const [id, w] of votes) {
      if (id < 0) continue;
      if (w > winW) {
        winW = w;
        winId = id;
      }
    }

    if (
      bestGlobal.id === winId &&
      bestGlobal.sim >= Math.max(this.args.spkThreshold, UPDATE_MIN_SIM)
    ) {
      this.updateCentroid(winId - 1, bestGlobal.emb);
    }

    return winId;
  }

  /** Display name for 1-based spk (global roster name or Speaker N). */
  getDisplayName(spk: number): string {
    const i = spk - 1;
    if (i < 0 || i >= this.names.length) return `Speaker ${spk}`;
    return this.names[i] || `Speaker ${spk}`;
  }

  getGlobalId(spk: number): string | null {
    const i = spk - 1;
    if (i < 0 || i >= this.globalIds.length) return null;
    return this.globalIds[i] ?? null;
  }

  isGlobal(spk: number): boolean {
    const i = spk - 1;
    return i >= 0 && i < this.globalFlags.length && !!this.globalFlags[i];
  }

  /**
   * Set display name for 1-based spk.
   * If promoteToGlobal and speaker is session-only, mark as global (new id needed by caller via export).
   */
  setDisplayName(spk: number, name: string): void {
    const i = spk - 1;
    if (i < 0 || i >= this.names.length) return;
    const n = name.trim();
    if (!n) return;
    this.names[i] = n;
    if (this.globalFlags[i]) this.dirtyGlobal = true;
  }

  /**
   * Promote session speaker to global roster candidate, or refresh global name+emb.
   * Returns payload for speaker-library upsert.
   */
  promoteOrUpdateGlobal(
    spk: number,
    displayName: string,
  ): {
    id: string | null;
    displayName: string;
    embedding: Float32Array;
    count: number;
    isNew: boolean;
  } | null {
    const i = spk - 1;
    if (i < 0 || i >= this.centroids.length) return null;
    const emb = this.centroids[i];
    if (!emb) return null;
    const n = displayName.trim() || this.names[i] || `Speaker ${spk}`;
    this.names[i] = n;
    const existingId = this.globalIds[i];
    if (existingId) {
      this.globalFlags[i] = true;
      this.dirtyGlobal = true;
      return {
        id: existingId,
        displayName: n,
        embedding: emb,
        count: this.counts[i] ?? 1,
        isNew: false,
      };
    }
    // Session-only → will get new id from library; mark pending global
    this.globalFlags[i] = true;
    this.dirtyGlobal = true;
    return {
      id: null,
      displayName: n,
      embedding: emb,
      count: this.counts[i] ?? 1,
      isNew: true,
    };
  }

  /** After library assigns a new global id, bind it to this spk index. */
  bindGlobalId(spk: number, id: string): void {
    const i = spk - 1;
    if (i < 0 || i >= this.globalIds.length) return;
    this.globalIds[i] = id;
    this.globalFlags[i] = true;
  }

  /** Export all global centroids for roster merge on session end. */
  exportGlobalUpdates(): Array<{
    id: string;
    displayName: string;
    embedding: number[];
    count: number;
  }> {
    const out: Array<{
      id: string;
      displayName: string;
      embedding: number[];
      count: number;
    }> = [];
    for (let i = 0; i < this.centroids.length; i++) {
      const id = this.globalIds[i];
      if (!id || !this.globalFlags[i]) continue;
      const emb = this.centroids[i];
      if (!emb) continue;
      out.push({
        id,
        displayName: this.names[i] || id,
        embedding: Array.from(emb),
        count: this.counts[i] ?? 1,
      });
    }
    return out;
  }

  get hasDirtyGlobal(): boolean {
    return this.dirtyGlobal;
  }

  /** Match against existing centroids only (no enroll). */
  private matchEmbedding(
    emb: Float32Array,
  ): { id: number; sim: number; second: number } | null {
    if (!this.centroids.length) return null;
    let best = -1;
    let bestSim = -1;
    let second = -1;
    for (let i = 0; i < this.centroids.length; i++) {
      const sim = dot(emb, this.centroids[i]!);
      if (sim > bestSim) {
        second = bestSim;
        bestSim = sim;
        best = i;
      } else if (sim > second) {
        second = sim;
      }
    }
    if (best < 0) return null;
    if (bestSim < this.args.spkThreshold) return null;
    if (second >= 0 && bestSim - second < MIN_MARGIN) {
      if (bestSim - second < MIN_MARGIN * 0.5) return null;
    }
    return { id: best + 1, sim: bestSim, second: Math.max(0, second) };
  }

  private assignEmbedding(emb: Float32Array, allowUpdate: boolean): number {
    const match = this.matchEmbedding(emb);
    if (match) {
      if (
        allowUpdate &&
        match.sim >= Math.max(this.args.spkThreshold, UPDATE_MIN_SIM)
      ) {
        this.updateCentroid(match.id - 1, emb);
      }
      return match.id;
    }
    this.centroids.push(emb);
    this.counts.push(1);
    this.names.push(`Speaker ${this.centroids.length}`);
    this.globalIds.push(null);
    this.globalFlags.push(false);
    return this.centroids.length;
  }

  private updateCentroid(index: number, emb: Float32Array): void {
    const c = this.centroids[index];
    if (!c) return;
    const n = this.counts[index] ?? 1;
    const alpha = Math.max(0.08, this.ema / Math.sqrt(n));
    const updated = new Float32Array(c.length);
    for (let i = 0; i < c.length; i++) {
      updated[i] = (1 - alpha) * c[i]! + alpha * emb[i]!;
    }
    this.centroids[index] = l2Normalize(updated);
    this.counts[index] = n + 1;
    if (this.globalFlags[index]) this.dirtyGlobal = true;
  }

  get numSpeakers(): number {
    return this.centroids.length;
  }

  get numGlobal(): number {
    return this.globalFlags.filter(Boolean).length;
  }
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
