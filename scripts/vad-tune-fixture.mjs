/**
 * Offline VAD (+ optional ASR) sweep against a reference SRT.
 * Usage:
 *   node scripts/vad-tune-fixture.mjs [--asr] [--limit-sec N]
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);
const sherpa = require("sherpa-onnx-node");
const ffmpeg = require("ffmpeg-static");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const FIXTURE = path.join(root, "fixtures/meetings/ja-loanwords");
const M4A = path.join(FIXTURE, "videoplayback.m4a");
const SRT = path.join(
  FIXTURE,
  "[Japanese (auto-generated)] ビジネス日本語ーZoomで打ち合わせー(カラオケミーティングのお知らせもあります) [DownSub.com].srt",
);
const WAV = path.join(FIXTURE, "_parts/videoplayback-16k.wav");
const SAMPLE_RATE = 16000;

const args = process.argv.slice(2);
const DO_ASR = args.includes("--asr");
const limIdx = args.indexOf("--limit-sec");
const LIMIT_SEC =
  limIdx >= 0 && args[limIdx + 1] ? Number(args[limIdx + 1]) : 0;

const MODELS = path.join(
  process.env.BARIBARI_CONFIG_DIR ||
    path.join(process.env.USERPROFILE || process.env.HOME || "", ".config/baribari"),
  "models",
);
const VAD_MODEL = path.join(MODELS, "silero_vad.onnx");
const SV_DIR = path.join(
  MODELS,
  "sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17",
);

function parseTs(s) {
  const [h, m, rest] = s.trim().split(":");
  const [sec, ms] = rest.split(",");
  return +h * 3600 + +m * 60 + +sec + +ms / 1000;
}

function parseSrt(file) {
  const raw = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  const blocks = raw.trim().split(/\r?\n\r?\n/);
  const cues = [];
  for (const b of blocks) {
    const lines = b.split(/\r?\n/);
    const m = lines.find((l) => l.includes("-->"));
    if (!m) continue;
    const [a, b2] = m.split("-->").map((x) => x.trim());
    const text = lines
      .slice(lines.indexOf(m) + 1)
      .join("")
      .replace(/\s+/g, "")
      .trim();
    if (!text) continue;
    cues.push({ start: parseTs(a), end: parseTs(b2), text });
  }
  return cues;
}

function ensureWav() {
  fs.mkdirSync(path.dirname(WAV), { recursive: true });
  if (fs.existsSync(WAV) && fs.statSync(WAV).size > 1000) {
    console.log("wav cache:", WAV);
    return;
  }
  if (!ffmpeg || !fs.existsSync(ffmpeg)) {
    throw new Error("ffmpeg-static not found");
  }
  console.log("converting m4a → 16k mono wav…");
  const r = spawnSync(
    ffmpeg,
    [
      "-y",
      "-i",
      M4A,
      "-ac",
      "1",
      "-ar",
      String(SAMPLE_RATE),
      "-c:a",
      "pcm_s16le",
      WAV,
    ],
    { encoding: "utf8" },
  );
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout);
    throw new Error("ffmpeg failed");
  }
  console.log("wrote", WAV, fs.statSync(WAV).size);
}

function readSamples(limitSec = 0) {
  const wave = sherpa.readWave(WAV);
  let samples = Float32Array.from(wave.samples);
  if (wave.sampleRate !== SAMPLE_RATE) {
    throw new Error(`expected ${SAMPLE_RATE}, got ${wave.sampleRate}`);
  }
  if (limitSec > 0) {
    const n = Math.floor(limitSec * SAMPLE_RATE);
    samples = samples.subarray(0, Math.min(n, samples.length));
  }
  return samples;
}

function runVad(samples, vadCfg) {
  // 2nd arg is bufferSizeInSeconds (same as src/transcribe.ts), not samples
  const vad = new sherpa.Vad(
    {
      sileroVad: {
        model: VAD_MODEL,
        threshold: vadCfg.threshold,
        minSpeechDuration: vadCfg.minSpeechDuration,
        minSilenceDuration: vadCfg.minSilenceDuration,
        maxSpeechDuration: vadCfg.maxSpeechDuration,
        windowSize: vadCfg.windowSize || 512,
      },
      sampleRate: SAMPLE_RATE,
      debug: false,
      numThreads: 1,
    },
    60,
  );

  const windowSize = vadCfg.windowSize || 512;
  const segs = [];
  // feed in chunks
  for (let i = 0; i + windowSize <= samples.length; i += windowSize) {
    const win = samples.subarray(i, i + windowSize);
    vad.acceptWaveform(win);
    while (!vad.isEmpty()) {
      const s = vad.front();
      vad.pop();
      segs.push({
        start: s.start / SAMPLE_RATE,
        end: (s.start + s.samples.length) / SAMPLE_RATE,
        samples: s.samples,
      });
    }
  }
  // flush tail
  try {
    vad.flush();
  } catch {
    /* older bindings */
  }
  while (!vad.isEmpty()) {
    const s = vad.front();
    vad.pop();
    segs.push({
      start: s.start / SAMPLE_RATE,
      end: (s.start + s.samples.length) / SAMPLE_RATE,
      samples: s.samples,
    });
  }
  return segs;
}

function normalizeJa(s) {
  return (s || "")
    .toLowerCase()
    .replace(/[、。．，,.!！?？\s\u3000「」『』（）()【】\[\]…・ー−-]/g, "")
    .replace(/[ァ-ン]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0x60),
    );
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const m = a.length;
  const n = b.length;
  let prev = new Uint32Array(n + 1);
  let cur = new Uint32Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= n; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}

function buildRecognizer() {
  return new sherpa.OfflineRecognizer({
    modelConfig: {
      senseVoice: {
        model: path.join(SV_DIR, "model.int8.onnx"),
        language: "ja",
        useInverseTextNormalization: true,
      },
      tokens: path.join(SV_DIR, "tokens.txt"),
      numThreads: 2,
      debug: false,
    },
  });
}

function asrSegments(recognizer, segs) {
  const texts = [];
  for (const s of segs) {
    const stream = recognizer.createStream();
    stream.acceptWaveform({ sampleRate: SAMPLE_RATE, samples: s.samples });
    recognizer.decode(stream);
    const text = (recognizer.getResult(stream).text ?? "").trim();
    if (text) texts.push(text);
  }
  return texts;
}

function scoreVad(segs, audioDur, refCues) {
  const n = segs.length;
  const durs = segs.map((s) => s.end - s.start);
  const sum = durs.reduce((a, b) => a + b, 0);
  const mean = n ? sum / n : 0;
  const max = n ? Math.max(...durs) : 0;
  const over8 = durs.filter((d) => d > 8).length;
  const over12 = durs.filter((d) => d > 12).length;
  const under1 = durs.filter((d) => d < 1).length;
  // coverage: speech seconds / audio
  const coverage = audioDur > 0 ? sum / audioDur : 0;
  // ref cue avg ~2.9s; prefer mean segment in 2.5–6s, not too many tiny
  const targetMean = 3.5;
  const meanPenalty = Math.abs(mean - targetMean);
  // prefer n not extreme vs ref cue count (scaled to audio window)
  const refN = refCues.length;
  const ratio = refN > 0 ? n / refN : 1;
  // ideal ratio roughly 0.35–0.9 (VAD segs longer than YT line breaks)
  let ratioPenalty = 0;
  if (ratio < 0.2) ratioPenalty = (0.2 - ratio) * 20;
  else if (ratio > 1.4) ratioPenalty = (ratio - 1.4) * 8;
  const fragPenalty = under1 * 0.15 + (mean < 1.5 ? 2 : 0);
  const mergePenalty = over8 * 0.8 + over12 * 1.5 + (mean > 8 ? 3 : 0);
  const score =
    meanPenalty * 0.6 + ratioPenalty + fragPenalty + mergePenalty - coverage * 0.5;
  return {
    n,
    mean: +mean.toFixed(2),
    max: +max.toFixed(2),
    over8,
    over12,
    under1,
    coverage: +coverage.toFixed(3),
    score: +score.toFixed(3),
  };
}

function main() {
  if (!fs.existsSync(M4A)) throw new Error("missing m4a: " + M4A);
  if (!fs.existsSync(SRT)) throw new Error("missing srt: " + SRT);
  if (!fs.existsSync(VAD_MODEL)) throw new Error("missing VAD: " + VAD_MODEL);

  ensureWav();
  const allCues = parseSrt(SRT);
  const samples = readSamples(LIMIT_SEC);
  const audioDur = samples.length / SAMPLE_RATE;
  const cues = allCues.filter((c) => c.start < audioDur);
  const refText = normalizeJa(cues.map((c) => c.text).join(""));
  console.log(
    `audio ${audioDur.toFixed(1)}s · ref cues ${cues.length}/${allCues.length} · ref chars ${refText.length}`,
  );

  /** @type {Array<{name:string,threshold:number,minSpeechDuration:number,minSilenceDuration:number,maxSpeechDuration:number,windowSize?:number}>} */
  const configs = [
    { name: "default", threshold: 0.5, minSpeechDuration: 0.4, minSilenceDuration: 0.6, maxSpeechDuration: 30 },
    { name: "user-prev", threshold: 0.6, minSpeechDuration: 0.25, minSilenceDuration: 0.25, maxSpeechDuration: 6 },
    { name: "user-soft", threshold: 0.58, minSpeechDuration: 0.28, minSilenceDuration: 0.32, maxSpeechDuration: 8 },
    { name: "bal-A", threshold: 0.55, minSpeechDuration: 0.3, minSilenceDuration: 0.35, maxSpeechDuration: 10 },
    { name: "bal-B", threshold: 0.55, minSpeechDuration: 0.28, minSilenceDuration: 0.3, maxSpeechDuration: 8 },
    { name: "bal-C", threshold: 0.58, minSpeechDuration: 0.28, minSilenceDuration: 0.28, maxSpeechDuration: 8 },
    { name: "bal-D", threshold: 0.52, minSpeechDuration: 0.3, minSilenceDuration: 0.4, maxSpeechDuration: 12 },
    { name: "meet-E", threshold: 0.55, minSpeechDuration: 0.25, minSilenceDuration: 0.28, maxSpeechDuration: 10 },
    { name: "meet-F", threshold: 0.57, minSpeechDuration: 0.28, minSilenceDuration: 0.3, maxSpeechDuration: 9 },
    { name: "agg-G", threshold: 0.6, minSpeechDuration: 0.22, minSilenceDuration: 0.22, maxSpeechDuration: 6 },
    { name: "agg-H", threshold: 0.58, minSpeechDuration: 0.25, minSilenceDuration: 0.26, maxSpeechDuration: 7 },
    { name: "long-I", threshold: 0.5, minSpeechDuration: 0.35, minSilenceDuration: 0.45, maxSpeechDuration: 15 },
  ];

  const vadRows = [];
  for (const cfg of configs) {
    const t0 = Date.now();
    const segs = runVad(samples, cfg);
    const st = scoreVad(segs, audioDur, cues);
    const ms = Date.now() - t0;
    vadRows.push({ cfg, segs, st, ms });
    console.log(
      `[VAD] ${cfg.name.padEnd(10)} thr=${cfg.threshold} sil=${cfg.minSilenceDuration} max=${cfg.maxSpeechDuration} → n=${st.n} mean=${st.mean}s max=${st.max}s over8=${st.over8} under1=${st.under1} cov=${st.coverage} score=${st.score} (${ms}ms)`,
    );
  }

  vadRows.sort((a, b) => a.st.score - b.st.score);
  console.log("\n=== VAD ranking (lower score better) ===");
  for (const r of vadRows.slice(0, 6)) {
    const c = r.cfg;
    console.log(
      `  ${r.st.score.toFixed(3)}  ${c.name}  --vad-threshold ${c.threshold} --vad-min-speech ${c.minSpeechDuration} --vad-min-silence ${c.minSilenceDuration} --vad-max-speech ${c.maxSpeechDuration}`,
    );
  }

  if (!DO_ASR) {
    console.log("\n(Re-run with --asr to measure SenseVoice CER + 、 density on top configs)");
    return;
  }
  if (!fs.existsSync(path.join(SV_DIR, "model.int8.onnx"))) {
    throw new Error("SenseVoice model missing: " + SV_DIR);
  }

  // ASR top 4 VAD + user-prev + default
  const want = new Set([
    ...vadRows.slice(0, 4).map((r) => r.cfg.name),
    "user-prev",
    "user-soft",
    "default",
  ]);
  const asrTargets = vadRows.filter((r) => want.has(r.cfg.name));
  console.log("\n=== ASR on selected configs ===");
  const recognizer = buildRecognizer();
  const asrRows = [];
  for (const r of asrTargets) {
    const t0 = Date.now();
    const texts = asrSegments(recognizer, r.segs);
    const joined = texts.join("");
    const norm = normalizeJa(joined);
    const dist = levenshtein(norm, refText);
    const cer = refText.length ? dist / refText.length : 1;
    const ton = (joined.match(/、/g) || []).length;
    const period = (joined.match(/[。．]/g) || []).length;
    const perSeg = texts.length ? ton / texts.length : 0;
    const ms = Date.now() - t0;
    const row = {
      name: r.cfg.name,
      n: texts.length,
      cer: +cer.toFixed(4),
      dist,
      ton,
      period,
      perSeg: +perSeg.toFixed(2),
      chars: joined.length,
      ms,
      cfg: r.cfg,
      st: r.st,
    };
    asrRows.push(row);
    console.log(
      `[ASR] ${row.name.padEnd(10)} segs=${row.n} CER=${row.cer} 、=${row.ton} 。=${row.period} 、/seg=${row.perSeg} chars=${row.chars} (${ms}ms)`,
    );
  }

  // Combined rank: CER primary, then 、/seg, then VAD score
  asrRows.sort((a, b) => {
    if (Math.abs(a.cer - b.cer) > 0.01) return a.cer - b.cer;
    if (Math.abs(a.perSeg - b.perSeg) > 0.05) return a.perSeg - b.perSeg;
    return a.st.score - b.st.score;
  });
  console.log("\n=== Recommended (ASR CER → fewer 、/seg → VAD score) ===");
  for (const r of asrRows) {
    const c = r.cfg;
    console.log(
      `  CER=${r.cer} 、/seg=${r.perSeg} n=${r.n}  ${c.name}\n    baribari --lang ja --vad-threshold ${c.threshold} --vad-min-speech ${c.minSpeechDuration} --vad-min-silence ${c.minSilenceDuration} --vad-max-speech ${c.maxSpeechDuration}`,
    );
  }
}

main();
