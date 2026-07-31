/**
 * Centroid cosine match + EMA update (same strategy as Python SherpaSpeakerTracker).
 * Embedding backend: sherpa-onnx-node SpeakerEmbeddingExtractor (3dspeaker CAM++).
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

export class SherpaSpeakerTracker {
  private centroids: Float32Array[] = [];
  private ema: number;

  constructor(
    private extractor: SpeakerEmbeddingExtractor,
    private args: TranscribeArgs,
    ema = 0.3,
  ) {
    this.ema = ema;
  }

  embed(audio: Float32Array): Float32Array {
    const stream = this.extractor.createStream();
    stream.acceptWaveform({ sampleRate: SAMPLE_RATE, samples: audio });
    const raw = this.extractor.compute(stream);
    const emb = Float32Array.from(raw);
    return l2Normalize(emb);
  }

  /** Returns 1-based speaker id. */
  assign(audio: Float32Array): number {
    const emb = this.embed(audio);
    let best = -1;
    let bestSim = -1;

    for (let i = 0; i < this.centroids.length; i++) {
      const sim = dot(emb, this.centroids[i]!);
      if (sim > bestSim) {
        best = i;
        bestSim = sim;
      }
    }

    if (bestSim >= this.args.spkThreshold && best >= 0) {
      const c = this.centroids[best]!;
      const updated = new Float32Array(c.length);
      for (let i = 0; i < c.length; i++) {
        updated[i] = (1 - this.ema) * c[i]! + this.ema * emb[i]!;
      }
      this.centroids[best] = l2Normalize(updated);
      return best + 1;
    }

    this.centroids.push(emb);
    return this.centroids.length;
  }

  get numSpeakers(): number {
    return this.centroids.length;
  }
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
