/**
 * Compare baseline vs pad+softgain+postprocess on ja-loanwords fixture.
 *   node scripts/bench-asr-accuracy.mjs [--limit-sec 90]
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const sherpa = require("sherpa-onnx-node");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { postprocessText } = await import(
  pathToFileURL(path.join(root, "dist/postprocess.js")).href
);

const SR = 16000;
const limIdx = process.argv.indexOf("--limit-sec");
const LIMIT =
  limIdx >= 0 && process.argv[limIdx + 1] ? Number(process.argv[limIdx + 1]) : 90;

const MODELS = path.join(
  process.env.USERPROFILE || process.env.HOME || "",
  ".config/baribari/models",
);
const SV = path.join(
  MODELS,
  "sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17",
);
const WAV = path.join(
  root,
  "fixtures/meetings/ja-loanwords/_parts/videoplayback-16k.wav",
);
const SRT = path.join(
  root,
  "fixtures/meetings/ja-loanwords/[Japanese (auto-generated)] ビジネス日本語ーZoomで打ち合わせー(カラオケミーティングのお知らせもあります) [DownSub.com].srt",
);

function prepareAsrAudio(samples, sampleRate) {
  const padSec = 0.12;
  const quietPeak = 0.35;
  const targetPeak = 0.85;
  const maxGain = 4;
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs(samples[i]);
    if (a > peak) peak = a;
  }
  let gain = 1;
  if (peak > 1e-4 && peak < quietPeak) {
    gain = Math.min(targetPeak / peak, maxGain);
  }
  const pad = Math.max(0, Math.floor(padSec * sampleRate));
  if (pad === 0 && gain === 1) return samples;
  const out = new Float32Array(samples.length + pad * 2);
  if (gain === 1) out.set(samples, pad);
  else for (let i = 0; i < samples.length; i++) out[pad + i] = samples[i] * gain;
  return out;
}

function runVad(samples) {
  const vad = new sherpa.Vad(
    {
      sileroVad: {
        model: path.join(MODELS, "silero_vad.onnx"),
        threshold: 0.55,
        minSpeechDuration: 0.28,
        minSilenceDuration: 0.32,
        maxSpeechDuration: 9,
        windowSize: 512,
      },
      sampleRate: SR,
      debug: false,
      numThreads: 1,
    },
    60,
  );
  const segs = [];
  const w = 512;
  for (let i = 0; i + w <= samples.length; i += w) {
    vad.acceptWaveform(samples.subarray(i, i + w));
    while (!vad.isEmpty()) {
      const s = vad.front();
      vad.pop();
      segs.push(s.samples);
    }
  }
  try {
    vad.flush();
  } catch {
    /* */
  }
  while (!vad.isEmpty()) {
    const s = vad.front();
    vad.pop();
    segs.push(s.samples);
  }
  return segs;
}

function parseTs(s) {
  const [h, m, rest] = s.trim().split(":");
  const [sec, ms] = rest.split(",");
  return +h * 3600 + +m * 60 + +sec + +ms / 1000;
}

function parseSrt(file) {
  const raw = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  const cues = [];
  for (const b of raw.trim().split(/\r?\n\r?\n/)) {
    const lines = b.split(/\r?\n/);
    const m = lines.find((l) => l.includes("-->"));
    if (!m) continue;
    const [a] = m.split("-->").map((x) => x.trim());
    const text = lines
      .slice(lines.indexOf(m) + 1)
      .join("")
      .replace(/\s+/g, "");
    if (text) cues.push({ start: parseTs(a), text });
  }
  return cues;
}

function norm(s) {
  return (s || "")
    .toLowerCase()
    .replace(/[、。．，,.!！?？\s\u3000「」『』（）()【】\[\]…・ー−-]/g, "")
    .replace(/[ァ-ン]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

function lev(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const m = a.length;
  const n = b.length;
  let p = new Uint32Array(n + 1);
  let c = new Uint32Array(n + 1);
  for (let j = 0; j <= n; j++) p[j] = j;
  for (let i = 1; i <= m; i++) {
    c[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + cost);
    }
    [p, c] = [c, p];
  }
  return p[n];
}

const wave = sherpa.readWave(WAV);
const samples = Float32Array.from(wave.samples).subarray(0, LIMIT * SR);
const segs = runVad(samples);
const rec = new sherpa.OfflineRecognizer({
  modelConfig: {
    senseVoice: {
      model: path.join(SV, "model.int8.onnx"),
      language: "ja",
      useInverseTextNormalization: true,
    },
    tokens: path.join(SV, "tokens.txt"),
    numThreads: 2,
    debug: false,
  },
});

function asr(useOpt) {
  const texts = [];
  for (const s of segs) {
    const audio = useOpt ? prepareAsrAudio(s, SR) : s;
    const st = rec.createStream();
    st.acceptWaveform({ sampleRate: SR, samples: audio });
    rec.decode(st);
    let t = (rec.getResult(st).text || "").trim().replace(/<\|[^|]*\|>/g, "").trim();
    if (!t) continue;
    if (useOpt) t = postprocessText(t);
    texts.push(t);
  }
  return texts;
}

const ref = norm(
  parseSrt(SRT)
    .filter((c) => c.start < LIMIT)
    .map((c) => c.text)
    .join(""),
);
const raw = asr(false);
const opt = asr(true);
const r1 = norm(raw.join(""));
const r2 = norm(opt.join(""));
const cer1 = lev(r1, ref) / ref.length;
const cer2 = lev(r2, ref) / ref.length;

console.log(`limit ${LIMIT}s · VAD segs ${segs.length}`);
console.log(`baseline CER  ${cer1.toFixed(4)}  chars ${r1.length}`);
console.log(`optimized CER ${cer2.toFixed(4)}  chars ${r2.length}`);
console.log(
  `relative improvement ${(((cer1 - cer2) / cer1) * 100).toFixed(1)}%`,
);
console.log("\nChanged lines:");
for (let i = 0; i < Math.min(raw.length, opt.length); i++) {
  if (raw[i] !== opt[i]) {
    console.log(`  - ${raw[i]}`);
    console.log(`  + ${opt[i]}`);
  }
}
