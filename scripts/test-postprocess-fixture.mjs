/**
 * Offline: VAD + SenseVoice + local postprocess on ja-loanwords video.
 *   node scripts/test-postprocess-fixture.mjs [--limit-sec 90]
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const sherpa = require("sherpa-onnx-node");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const toFileUrl = (p) =>
  "file:///" + path.resolve(p).replace(/\\/g, "/");
const {
  postprocessText,
  ensureReplaceExample,
  replaceJsonPath,
  loadPostprocessConfig,
} = await import(toFileUrl(path.join(root, "dist/postprocess.js")));
const { joinUtterance } = await import(
  toFileUrl(path.join(root, "dist/speaker-turn.js")),
);

const SAMPLE_RATE = 16000;
const WAV = path.join(
  root,
  "fixtures/meetings/ja-loanwords/_parts/videoplayback-16k.wav",
);
const SRT = path.join(
  root,
  "fixtures/meetings/ja-loanwords/[Japanese (auto-generated)] ビジネス日本語ーZoomで打ち合わせー(カラオケミーティングのお知らせもあります) [DownSub.com].srt",
);
const MODELS = path.join(
  process.env.BARIBARI_CONFIG_DIR ||
    path.join(
      process.env.USERPROFILE || process.env.HOME || "",
      ".config/baribari",
    ),
  "models",
);
const VAD_MODEL = path.join(MODELS, "silero_vad.onnx");
const SV_DIR = path.join(
  MODELS,
  "sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17",
);

const limIdx = process.argv.indexOf("--limit-sec");
const LIMIT_SEC =
  limIdx >= 0 && process.argv[limIdx + 1] ? Number(process.argv[limIdx + 1]) : 90;

ensureReplaceExample();
const replacePath = replaceJsonPath();
const testRules = {
  enabled: true,
  replacements: [
    { from: "日言語", to: "日本語" },
    { from: "ズーム", to: "Zoom" },
    { from: "みさん", to: "みなさん" },
    { from: "茜かね", to: "あかね" },
    { from: "よしくお願", to: "よろしくお願" },
    { from: "お願いたします", to: "お願いいたします" },
  ],
};
let backup = null;
if (fs.existsSync(replacePath)) backup = fs.readFileSync(replacePath, "utf8");
fs.mkdirSync(path.dirname(replacePath), { recursive: true });
fs.writeFileSync(replacePath, JSON.stringify(testRules, null, 2) + "\n", "utf8");
// bust cache
loadPostprocessConfig(true);

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
    const [a, b2] = m.split("-->").map((x) => x.trim());
    const text = lines
      .slice(lines.indexOf(m) + 1)
      .join("")
      .replace(/\s+/g, "");
    if (text) cues.push({ start: parseTs(a), end: parseTs(b2), text });
  }
  return cues;
}
function normalizeJa(s) {
  return (s || "")
    .toLowerCase()
    .replace(/[、。．，,.!！?？\s\u3000「」『』（）()【】\[\]…・ー−-]/g, "")
    .replace(/[ァ-ン]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
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

function runVad(samples, cfg) {
  const vad = new sherpa.Vad(
    {
      sileroVad: {
        model: VAD_MODEL,
        threshold: cfg.threshold,
        minSpeechDuration: cfg.minSpeechDuration,
        minSilenceDuration: cfg.minSilenceDuration,
        maxSpeechDuration: cfg.maxSpeechDuration,
        windowSize: 512,
      },
      sampleRate: SAMPLE_RATE,
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
      segs.push({
        start: s.start / SAMPLE_RATE,
        end: (s.start + s.samples.length) / SAMPLE_RATE,
        samples: s.samples,
      });
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
    segs.push({
      start: s.start / SAMPLE_RATE,
      end: (s.start + s.samples.length) / SAMPLE_RATE,
      samples: s.samples,
    });
  }
  return segs;
}

/** Gap-only turn merge (demo; live path also uses speaker id). */
function mergeTurns(items, maxGapSec = 1.2) {
  const turns = [];
  let open = null;
  for (const it of items) {
    if (
      open &&
      it.start - open.end <= maxGapSec
    ) {
      open.text = joinUtterance(open.text, it.text);
      open.end = Math.max(open.end, it.end);
      open.parts += 1;
    } else {
      if (open) turns.push(open);
      open = { start: it.start, end: it.end, text: it.text, parts: 1 };
    }
  }
  if (open) turns.push(open);
  return turns;
}

try {
  if (!fs.existsSync(WAV)) throw new Error("missing wav: " + WAV);

  const wave = sherpa.readWave(WAV);
  let samples = Float32Array.from(wave.samples);
  samples = samples.subarray(
    0,
    Math.min(Math.floor(LIMIT_SEC * SAMPLE_RATE), samples.length),
  );
  const audioDur = samples.length / SAMPLE_RATE;

  const cues = parseSrt(SRT).filter((c) => c.start < audioDur);
  const refText = normalizeJa(cues.map((c) => c.text).join(""));

  const vadCfg = {
    threshold: 0.55,
    minSpeechDuration: 0.28,
    minSilenceDuration: 0.32,
    maxSpeechDuration: 9,
  };

  console.log(`audio ${audioDur.toFixed(1)}s · VAD thr=${vadCfg.threshold} sil=${vadCfg.minSilenceDuration} max=${vadCfg.maxSpeechDuration}`);
  console.log(`replace.json → ${replacePath}`);
  console.log(
    `rules: ${testRules.replacements.map((r) => `${r.from}→${r.to}`).join(" | ")}`,
  );

  const t0 = Date.now();
  const segs = runVad(samples, vadCfg);
  console.log(`VAD segments: ${segs.length} (${Date.now() - t0}ms)`);

  const rec = new sherpa.OfflineRecognizer({
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

  const items = [];
  const changed = [];
  const t1 = Date.now();
  for (const s of segs) {
    const stream = rec.createStream();
    stream.acceptWaveform({ sampleRate: SAMPLE_RATE, samples: s.samples });
    rec.decode(stream);
    const text = (rec.getResult(stream).text ?? "").trim();
    if (!text) continue;
    const polished = postprocessText(text);
    items.push({ start: s.start, end: s.end, raw: text, text: polished });
    if (polished !== text) changed.push({ raw: text, out: polished });
  }
  console.log(`ASR non-empty: ${items.length} (${Date.now() - t1}ms)`);

  const rawJoin = items.map((i) => i.raw).join("");
  const polJoin = items.map((i) => i.text).join("");
  const rawN = normalizeJa(rawJoin);
  const polN = normalizeJa(polJoin);
  const cerRaw = refText.length ? levenshtein(rawN, refText) / refText.length : 1;
  const cerPol = refText.length ? levenshtein(polN, refText) / refText.length : 1;

  const turns = mergeTurns(items, 1.2);

  console.log("\n=== Metrics ===");
  console.log(`ref chars:     ${refText.length}`);
  console.log(`raw CER:       ${cerRaw.toFixed(4)}  (norm chars ${rawN.length})`);
  console.log(`post CER:      ${cerPol.toFixed(4)}  (norm chars ${polN.length})`);
  console.log(`dict/cleanup:  ${changed.length} / ${items.length} segs changed`);
  console.log(`turns (gap≤1.2s merge): ${turns.length} from ${items.length} segs`);

  console.log("\n=== Changed by local postprocess ===");
  if (!changed.length) console.log("(none in this window)");
  for (const c of changed.slice(0, 25)) {
    console.log(`  - ${c.raw}`);
    console.log(`  + ${c.out}`);
  }

  console.log("\n=== First 15 polished lines (* = dict/cleanup hit) ===");
  for (let i = 0; i < Math.min(15, items.length); i++) {
    const it = items[i];
    const mark = it.raw !== it.text ? " *" : "";
    console.log(
      `${String(i + 1).padStart(2)}. [${it.start.toFixed(1)}–${it.end.toFixed(1)}] ${it.text}${mark}`,
    );
  }

  console.log("\n=== First 8 speaker-turn merges (gap-only demo) ===");
  for (let i = 0; i < Math.min(8, turns.length); i++) {
    const t = turns[i];
    console.log(
      `${String(i + 1).padStart(2)}. parts=${t.parts} [${t.start.toFixed(1)}–${t.end.toFixed(1)}] ${t.text}`,
    );
  }
} finally {
  if (backup != null) {
    fs.writeFileSync(replacePath, backup, "utf8");
    console.log("\nrestored previous replace.json");
  } else {
    console.log("\nleft test replace.json at", replacePath);
  }
}
