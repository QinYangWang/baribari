/**
 * Deterministic speaker-ID tests with fake extractors/embeddings.
 * Run: npx tsx scripts/test-speaker-id.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  SherpaSpeakerTracker,
  type SpeakerEmbeddingExtractor,
  type SpeakerStream,
  _speakerTrackerTest,
} from "../src/speaker-tracker.js";
import {
  loadSpeakerRoster,
  mergeGlobalSpeakerUpdates,
  speakersForModel,
  upsertGlobalSpeaker,
} from "../src/speaker-library.js";
import type { TranscribeArgs } from "../src/types.js";
import {
  DEFAULT_AI,
  DEFAULT_SHARE,
  DEFAULT_SPEAKER_TURN,
  DEFAULT_VAD,
} from "../src/types.js";
import { modelPaths, SAMPLE_RATE } from "../src/paths.js";

const { MIN_ASSIGN_SAMPLES, MIN_ENROLL_SAMPLES, l2Normalize } =
  _speakerTrackerTest;

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (e) {
    failed += 1;
    console.error(`  FAIL ${name}`);
    console.error(e instanceof Error ? e.stack || e.message : e);
  }
}

function makeArgs(over: Partial<TranscribeArgs> = {}): TranscribeArgs {
  return {
    lang: "en",
    asrEngine: "sensevoice",
    uiLang: "en",
    source: "mic",
    noSpk: false,
    spkEngine: "campplus",
    spkThreshold: 0.55,
    noTui: true,
    recordDir: "/tmp",
    paused: { value: false },
    ai: { ...DEFAULT_AI },
    share: { ...DEFAULT_SHARE },
    vad: { ...DEFAULT_VAD },
    speakerTurn: { ...DEFAULT_SPEAKER_TURN },
    ...over,
  };
}

/** Fixed unit vector in dim (index-based pattern). */
function unitVec(dim: number, seed: number): Float32Array {
  const v = new Float32Array(dim);
  for (let i = 0; i < dim; i++) {
    v[i] = Math.sin((i + 1) * (seed + 1) * 0.17) + Math.cos(i * seed * 0.11);
  }
  return l2Normalize(v);
}

function mix(a: Float32Array, b: Float32Array, t: number): Float32Array {
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = (1 - t) * a[i]! + t * b[i]!;
  return l2Normalize(out);
}

/**
 * Fake extractor: maps RMS energy patterns in audio to predetermined embeddings.
 * Audio content encodes an integer speaker key via mean amplitude level bands.
 */
class FakeExtractor implements SpeakerEmbeddingExtractor {
  dim: number;
  private map: Map<number, Float32Array>;
  private defaultEmb: Float32Array;

  constructor(dim: number, speakers: Float32Array[]) {
    this.dim = dim;
    this.map = new Map();
    speakers.forEach((e, i) => this.map.set(i, e));
    this.defaultEmb = speakers[0] ?? unitVec(dim, 0);
  }

  /** Encode speaker index into audio amplitude (deterministic). */
  static audioForSpeaker(spkIndex: number, samples: number): Float32Array {
    const a = new Float32Array(samples);
    // Base level encodes speaker id; add slight variation
    const level = 0.05 + spkIndex * 0.04;
    for (let i = 0; i < samples; i++) {
      a[i] = level * Math.sin((i / SAMPLE_RATE) * 440 * 2 * Math.PI);
    }
    return a;
  }

  createStream(): SpeakerStream {
    const chunks: Float32Array[] = [];
    return {
      acceptWaveform: ({ samples }) => {
        chunks.push(samples);
      },
      // stash for compute
      _chunks: chunks,
    } as SpeakerStream & { _chunks: Float32Array[] };
  }

  compute(stream: SpeakerStream): Float32Array {
    const chunks = (stream as SpeakerStream & { _chunks?: Float32Array[] })
      ._chunks;
    let samples: Float32Array;
    if (chunks?.length) {
      const n = chunks.reduce((s, c) => s + c.length, 0);
      samples = new Float32Array(n);
      let o = 0;
      for (const c of chunks) {
        samples.set(c, o);
        o += c.length;
      }
    } else {
      samples = new Float32Array(0);
    }
    // Decode speaker from RMS
    let sum = 0;
    for (let i = 0; i < samples.length; i++) sum += samples[i]! * samples[i]!;
    const rms = samples.length ? Math.sqrt(sum / samples.length) : 0;
    // level ≈ 0.05 + idx*0.04 → rms ≈ level/√2
    const level = rms * Math.SQRT2;
    let idx = Math.round((level - 0.05) / 0.04);
    if (idx < 0) idx = 0;
    const emb = this.map.get(idx);
    if (emb) return new Float32Array(emb);
    // unknown → near-orthogonal
    return unitVec(this.dim, 99 + idx);
  }
}

function longAudio(spk: number): Float32Array {
  return FakeExtractor.audioForSpeaker(spk, MIN_ENROLL_SAMPLES + 800);
}

function mediumAudio(spk: number): Float32Array {
  return FakeExtractor.audioForSpeaker(spk, MIN_ASSIGN_SAMPLES + 400);
}

function shortAudio(spk: number): Float32Array {
  return FakeExtractor.audioForSpeaker(spk, Math.floor(0.4 * SAMPLE_RATE));
}

// ── tests ──────────────────────────────────────────────

console.log("speaker-id tests");

test("short audio is not enrolled", () => {
  const dim = 8;
  const a = unitVec(dim, 1);
  const ext = new FakeExtractor(dim, [a]);
  const tr = new SherpaSpeakerTracker(ext, makeArgs(), {
    model: "campplus",
    dim,
  });
  const r = tr.assign(shortAudio(0));
  assert.equal(r, null);
  assert.equal(tr.numSpeakers, 0);
});

test("repeated same speaker becomes stable", () => {
  const dim = 16;
  const a = unitVec(dim, 1);
  const ext = new FakeExtractor(dim, [a]);
  const tr = new SherpaSpeakerTracker(ext, makeArgs({ spkThreshold: 0.5 }), {
    model: "campplus",
    dim,
  });
  const first = tr.assign(longAudio(0));
  assert.equal(first, 1);
  const second = tr.assign(longAudio(0));
  assert.equal(second, 1);
  const third = tr.assign(mediumAudio(0));
  assert.equal(third, 1);
  assert.equal(tr.numSpeakers, 1);
});

test("similar but distinct speakers do not collapse", () => {
  const dim = 32;
  const base = unitVec(dim, 1);
  const other = unitVec(dim, 7);
  // moderately similar but below threshold when threshold is high enough
  const a = base;
  const b = mix(base, other, 0.55);
  const sim = (() => {
    let s = 0;
    for (let i = 0; i < dim; i++) s += a[i]! * b[i]!;
    return s;
  })();
  assert.ok(sim < 0.85, `fixture sim should be moderate, got ${sim}`);

  const ext = new FakeExtractor(dim, [a, b]);
  const thr = Math.max(0.5, sim + 0.08);
  const tr = new SherpaSpeakerTracker(
    ext,
    makeArgs({ spkThreshold: thr }),
    { model: "campplus", dim },
  );
  const s1 = tr.assign(longAudio(0));
  assert.equal(s1, 1);
  // first mismatch may stick/hysteresis; second should enroll
  const m1 = tr.assign(longAudio(1));
  const m2 = tr.assign(longAudio(1));
  const ids = new Set([s1, m1, m2].filter((x) => x != null));
  assert.ok(ids.size >= 2, `expected 2 speakers, got ${[...ids]} (sim=${sim.toFixed(3)} thr=${thr})`);
  assert.notEqual(m2, 1);
});

test("weak mismatch does not instantly create a speaker", () => {
  const dim = 16;
  const a = unitVec(dim, 1);
  const b = unitVec(dim, 9); // near-orthogonal
  const ext = new FakeExtractor(dim, [a, b]);
  const tr = new SherpaSpeakerTracker(ext, makeArgs({ spkThreshold: 0.55 }), {
    model: "campplus",
    dim,
  });
  assert.equal(tr.assign(longAudio(0)), 1);
  // One weak mismatch should not enroll speaker 2 yet
  const once = tr.assign(longAudio(1));
  assert.ok(once === 1 || once === null, `unexpected instant enroll: ${once}`);
  assert.equal(tr.numSpeakers, 1);
  // After streak, new speaker allowed
  const twice = tr.assign(longAudio(1));
  assert.equal(twice, 2);
  assert.equal(tr.numSpeakers, 2);
});

test("multi-window unknown audio can enroll after confirmation", () => {
  const dim = 16;
  const a = new Float32Array(dim);
  const b = new Float32Array(dim);
  a[0] = 1;
  b[1] = 1;
  const ext = new FakeExtractor(dim, [a, b]);
  const tr = new SherpaSpeakerTracker(ext, makeArgs({ spkThreshold: 0.7 }), {
    model: "campplus",
    dim,
  });
  const multiWindow = (speaker: number) =>
    FakeExtractor.audioForSpeaker(speaker, 3 * SAMPLE_RATE);

  assert.equal(tr.assign(multiWindow(0)), 1);
  assert.equal(tr.assign(multiWindow(1)), 1);
  assert.equal(tr.numSpeakers, 1);
  assert.equal(tr.assign(multiWindow(1)), 2);
  assert.equal(tr.numSpeakers, 2);
});

test("different unknown speakers do not share an enrollment streak", () => {
  const dim = 16;
  const a = new Float32Array(dim);
  const b = new Float32Array(dim);
  const c = new Float32Array(dim);
  a[0] = 1;
  b[1] = 1;
  c[2] = 1;
  const ext = new FakeExtractor(dim, [a, b, c]);
  const tr = new SherpaSpeakerTracker(ext, makeArgs({ spkThreshold: 0.7 }), {
    model: "campplus",
    dim,
  });

  assert.equal(tr.assign(longAudio(0)), 1);
  assert.equal(tr.assign(longAudio(1)), 1);
  assert.equal(tr.assign(longAudio(2)), 1);
  assert.equal(tr.numSpeakers, 1);
  assert.equal(tr.assign(longAudio(2)), 2);
});

test("a known match breaks an unknown enrollment streak", () => {
  const dim = 16;
  const a = new Float32Array(dim);
  const b = new Float32Array(dim);
  a[0] = 1;
  b[1] = 1;
  const ext = new FakeExtractor(dim, [a, b]);
  const tr = new SherpaSpeakerTracker(ext, makeArgs({ spkThreshold: 0.7 }), {
    model: "campplus",
    dim,
  });

  assert.equal(tr.assign(longAudio(0)), 1);
  assert.equal(tr.assign(longAudio(1)), 1);
  assert.equal(tr.assign(longAudio(0)), 1);
  assert.equal(tr.assign(longAudio(1)), 1);
  assert.equal(tr.numSpeakers, 1);
  assert.equal(tr.assign(longAudio(1)), 2);
});

test("next-session model switch does not retune the active tracker", () => {
  const dim = 16;
  const a = new Float32Array(dim);
  const b = new Float32Array(dim);
  a[0] = 1;
  b[0] = 0.5;
  b[1] = Math.sqrt(0.75);
  const ext = new FakeExtractor(dim, [a, b]);
  const args = makeArgs({
    spkEngine: "campplus",
    spkThreshold: 0.55,
  });
  const tr = new SherpaSpeakerTracker(ext, args, {
    model: "campplus",
    dim,
  });

  assert.equal(tr.assign(longAudio(0)), 1);
  args.spkEngine = "eres2net-large";
  args.spkThreshold = 0.45;
  assert.equal(tr.assign(longAudio(1)), 1);
  assert.equal(tr.assign(longAudio(1)), 2);
});

test("legacy speaker path remains scoped to CAM++", () => {
  const p = modelPaths(
    {
      modelsDir: "/tmp/baribari-speaker-path-test",
      spk: "/tmp/legacy-campplus.onnx",
    },
    { spkEngine: "eres2net-large" },
  );
  assert.equal(p.spkByEngine.campplus, "/tmp/legacy-campplus.onnx");
  assert.notEqual(p.spkByEngine["eres2net-large"], p.spkByEngine.campplus);
});

test("model mismatch roster ignored on seed", () => {
  const dim = 16;
  const a = unitVec(dim, 1);
  const wrongDim = unitVec(64, 2);
  const ext = new FakeExtractor(dim, [a]);
  const tr = new SherpaSpeakerTracker(ext, makeArgs(), {
    model: "campplus",
    dim,
  });
  tr.seedGlobal([
    {
      id: "gs_wrong",
      displayName: "WrongModel",
      embedding: Array.from(wrongDim),
      count: 3,
    },
    {
      id: "gs_ok",
      displayName: "Alice",
      embedding: Array.from(a),
      count: 2,
    },
  ]);
  assert.equal(tr.numGlobal, 1);
  assert.equal(tr.getDisplayName(1), "Alice");
});

test("global identity does not drift on weak matches", () => {
  const dim = 16;
  const a = unitVec(dim, 1);
  const drift = mix(a, unitVec(dim, 5), 0.35);
  const ext = new FakeExtractor(dim, [a, drift]);
  const tr = new SherpaSpeakerTracker(ext, makeArgs({ spkThreshold: 0.4 }), {
    model: "campplus",
    dim,
  });
  tr.seedGlobal([
    {
      id: "gs_alice",
      displayName: "Alice",
      embedding: Array.from(a),
      count: 10,
    },
  ]);
  const before = tr.exportGlobalUpdates()[0]!.embedding.slice();
  // Feed moderately similar audio many times — should not heavily rewrite global
  for (let i = 0; i < 5; i++) {
    tr.assign(longAudio(1)); // drift embedding
  }
  const after = tr.exportGlobalUpdates()[0]!.embedding;
  let cos = 0;
  for (let i = 0; i < dim; i++) cos += before[i]! * after[i]!;
  assert.ok(
    cos > 0.97,
    `global template drifted too much: cos=${cos.toFixed(4)}`,
  );
});

test("roster speakersForModel filters other models", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "baribari-spk-"));
  process.env.BARIBARI_CONFIG_DIR = dir;
  try {
    const emb192 = Array.from(unitVec(192, 1));
    const emb512 = Array.from(unitVec(512, 2));
    upsertGlobalSpeaker({
      displayName: "CamPerson",
      embedding: emb192,
      model: "campplus",
    });
    upsertGlobalSpeaker({
      displayName: "EresPerson",
      embedding: emb512,
      model: "eres2net-large",
    });
    const roster = loadSpeakerRoster();
    assert.equal(roster.speakers.length, 2);
    assert.equal(speakersForModel(roster, "campplus").length, 1);
    assert.equal(speakersForModel(roster, "eres2net-large").length, 1);
    assert.equal(speakersForModel(roster, "campplus")[0]!.displayName, "CamPerson");
  } finally {
    delete process.env.BARIBARI_CONFIG_DIR;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("legacy roster migrates as campplus without data loss", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "baribari-spk-"));
  process.env.BARIBARI_CONFIG_DIR = dir;
  try {
    const speakersDir = path.join(dir, "speakers");
    fs.mkdirSync(speakersDir, { recursive: true });
    const legacy = {
      version: 1,
      speakers: [
        {
          id: "gs_legacy",
          displayName: "Bob",
          embedding: Array.from(unitVec(192, 3)),
          count: 4,
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z",
        },
      ],
    };
    fs.writeFileSync(
      path.join(speakersDir, "roster.json"),
      JSON.stringify(legacy),
      "utf8",
    );
    const roster = loadSpeakerRoster();
    assert.equal(roster.version, 2);
    assert.equal(roster.speakers.length, 1);
    assert.equal(roster.speakers[0]!.model, "campplus");
    assert.equal(roster.speakers[0]!.displayName, "Bob");
    assert.equal(roster.speakers[0]!.embedding.length, 192);
  } finally {
    delete process.env.BARIBARI_CONFIG_DIR;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("mergeGlobalSpeakerUpdates refuses cross-model write", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "baribari-spk-"));
  process.env.BARIBARI_CONFIG_DIR = dir;
  try {
    const emb = Array.from(unitVec(192, 1));
    const sp = upsertGlobalSpeaker({
      displayName: "Carol",
      embedding: emb,
      model: "campplus",
    });
    mergeGlobalSpeakerUpdates([
      {
        id: sp.id,
        displayName: "Carol",
        embedding: Array.from(unitVec(512, 9)),
        count: 99,
        model: "eres2net-large", // wrong model for this id
      },
    ]);
    const roster = loadSpeakerRoster();
    const hit = roster.speakers.find((s) => s.id === sp.id)!;
    assert.equal(hit.model, "campplus");
    assert.equal(hit.embedding.length, 192);
    assert.ok(hit.count < 99);
  } finally {
    delete process.env.BARIBARI_CONFIG_DIR;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("template bank keeps multiple representatives", () => {
  const dim = 16;
  const a = unitVec(dim, 1);
  // Diverse enough to add (cos < 0.92) but still match at thr 0.35
  const a2 = mix(a, unitVec(dim, 2), 0.45);
  const a3 = mix(a, unitVec(dim, 3), 0.48);
  const cosA2 = (() => {
    let s = 0;
    for (let i = 0; i < dim; i++) s += a[i]! * a2[i]!;
    return s;
  })();
  assert.ok(cosA2 < 0.92 && cosA2 > 0.35, `fixture cos=${cosA2}`);

  class BankExt implements SpeakerEmbeddingExtractor {
    dim = dim;
    private seq = [a, a2, a3, a2, a3, a];
    private i = 0;
    createStream(): SpeakerStream {
      return { acceptWaveform() {} };
    }
    compute(): Float32Array {
      const e = this.seq[this.i % this.seq.length]!;
      this.i += 1;
      return new Float32Array(e);
    }
  }
  const tr = new SherpaSpeakerTracker(
    new BankExt(),
    makeArgs({ spkThreshold: 0.35 }),
    { model: "campplus", dim },
  );
  assert.equal(tr.assign(longAudio(0)), 1);
  for (let i = 0; i < 8; i++) tr.assign(longAudio(0));
  const exp = tr.promoteOrUpdateGlobal(1, "Pat");
  assert.ok(exp);
  assert.ok(
    exp!.embeddings.length >= 2,
    `expected multi-template bank, got ${exp!.embeddings.length} (cosA2=${cosA2.toFixed(3)})`,
  );
});

console.log("");
console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
