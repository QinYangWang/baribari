/**
 * Generate multi-speaker JA (w/ loanwords) + EN meeting audio + subtitles.
 * Uses node-edge-tts (Microsoft Edge online TTS) + ffmpeg-static.
 *
 *   node scripts/generate-meeting-fixtures.mjs
 *
 * Output: fixtures/meetings/{ja-loanwords,en-standup}/
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { EdgeTTS } = require("node-edge-tts");
const ffmpegPath = require("ffmpeg-static");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "fixtures", "meetings");
const GAP_SEC = 0.55;

/** @typedef {{ speaker: string; voice: string; lang: string; text: string }} Turn */

const JA_MEETING = {
  id: "ja-loanwords",
  title: "プロダクト定例（日本語・外来語多め）",
  lang: "ja",
  turns: /** @type {Turn[]} */ ([
    {
      speaker: "A-Keita",
      voice: "ja-JP-KeitaNeural",
      lang: "ja-JP",
      text: "皆さん、おはようございます。今日のアジェンダは、ロードマップのレビューと、APIのパフォーマンスについてです。",
    },
    {
      speaker: "B-Nanami",
      voice: "ja-JP-NanamiNeural",
      lang: "ja-JP",
      text: "お願いします。まずバックエンドのレイテンシですが、キャッシュを入れたあと、ピーナインティファイブで百二十ミリ秒まで下がりました。",
    },
    {
      speaker: "A-Keita",
      voice: "ja-JP-KeitaNeural",
      lang: "ja-JP",
      text: "ナイスです。フロントエンドのバンドルサイズは？ウェブパックからバイトに移行した効果は出てますか？",
    },
    {
      speaker: "B-Nanami",
      voice: "ja-JP-NanamiNeural",
      lang: "ja-JP",
      text: "はい、gzip後でだいたい十八パーセント削減です。ただ、サードパーティのトラッキングスクリプトがまだ重いです。",
    },
    {
      speaker: "A-Keita",
      voice: "ja-JP-KeitaNeural",
      lang: "ja-JP",
      text: "了解。セキュリティ面では、オーオースのトークンリフレッシュと、シーエスアールエフ対策は完了していますか？",
    },
    {
      speaker: "B-Nanami",
      voice: "ja-JP-NanamiNeural",
      lang: "ja-JP",
      text: "トークン側はマージ済みです。シーエスアールエフはプルリクエストレビュー待ちで、今日中にはマージ予定です。",
    },
    {
      speaker: "A-Keita",
      voice: "ja-JP-KeitaNeural",
      lang: "ja-JP",
      text: "ありがとうございます。ではアクションアイテムとして、ダッシュボードのユーザビリティテストを来週のスプリントに入れましょう。",
    },
    {
      speaker: "B-Nanami",
      voice: "ja-JP-NanamiNeural",
      lang: "ja-JP",
      text: "承知しました。ミーティングノートはコンフルエンスにアップします。以上です、ありがとうございました。",
    },
  ]),
};

const EN_MEETING = {
  id: "en-standup",
  title: "Engineering standup (English, 3 speakers)",
  lang: "en",
  turns: /** @type {Turn[]} */ ([
    {
      speaker: "Alex",
      voice: "en-US-BrianNeural",
      lang: "en-US",
      text: "Good morning everyone. Quick standup. Yesterday I finished the WebSocket reconnect logic and opened a PR for review.",
    },
    {
      speaker: "Jordan",
      voice: "en-US-JennyNeural",
      lang: "en-US",
      text: "Thanks Alex. I worked on the onboarding funnel metrics in Mixpanel. Conversion from signup to first session is still low.",
    },
    {
      speaker: "Sam",
      voice: "en-US-GuyNeural",
      lang: "en-US",
      text: "I'm blocked on the staging database migration. The replica lag spiked after we enabled full-text search.",
    },
    {
      speaker: "Alex",
      voice: "en-US-BrianNeural",
      lang: "en-US",
      text: "Got it Sam. Let's pair after this call. Jordan, can you share the funnel dashboard link in Slack?",
    },
    {
      speaker: "Jordan",
      voice: "en-US-JennyNeural",
      lang: "en-US",
      text: "Sure. Also, for the customer demo tomorrow, please avoid mentioning the beta feature flags that are still internal.",
    },
    {
      speaker: "Sam",
      voice: "en-US-GuyNeural",
      lang: "en-US",
      text: "Understood. Today I'll stabilize the migration and add a health check for search indexing.",
    },
    {
      speaker: "Alex",
      voice: "en-US-BrianNeural",
      lang: "en-US",
      text: "Perfect. Action items: PR review from me, dashboard link from Jordan, migration fix from Sam. Thanks everyone.",
    },
  ]),
};

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function writeSilenceWav(file, sec, sampleRate = 24000) {
  const n = Math.floor(sec * sampleRate);
  const dataSize = n * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  fs.writeFileSync(file, buf);
}

function ffprobeDuration(file) {
  const r = spawnSync(ffmpegPath, ["-i", file, "-f", "null", "-"], {
    encoding: "utf8",
  });
  const err = (r.stderr || "") + (r.stdout || "");
  const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(err);
  if (!m) return 0;
  return (
    parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseFloat(m[3])
  );
}

function secToSrt(t) {
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  const ms = Math.round((t - Math.floor(t)) * 1000);
  return (
    String(h).padStart(2, "0") +
    ":" +
    String(m).padStart(2, "0") +
    ":" +
    String(s).padStart(2, "0") +
    "," +
    String(ms).padStart(3, "0")
  );
}

function secToVtt(t) {
  return secToSrt(t).replace(",", ".");
}

async function ttsToFile(text, voice, lang, file) {
  const tts = new EdgeTTS({
    voice,
    lang,
    outputFormat: "audio-24khz-48kbitrate-mono-mp3",
    timeout: 30000,
  });
  await tts.ttsPromise(text, file);
}

async function synthMeeting(spec) {
  const dir = path.join(OUT, spec.id);
  const partsDir = path.join(dir, "_parts");
  ensureDir(partsDir);

  console.log(`\n=== ${spec.title} ===`);
  const parts = [];
  const timeline = [];
  let tCursor = 0;

  const silence = path.join(partsDir, "silence.wav");
  writeSilenceWav(silence, GAP_SEC);

  for (let i = 0; i < spec.turns.length; i++) {
    const turn = spec.turns[i];
    const mp3 = path.join(partsDir, `turn_${String(i).padStart(2, "0")}.mp3`);
    process.stdout.write(
      `  [${i + 1}/${spec.turns.length}] ${turn.speaker} … `,
    );
    let lastErr;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await ttsToFile(turn.text, turn.voice, turn.lang, mp3);
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
        await new Promise((r) => setTimeout(r, 800 * attempt));
      }
    }
    if (lastErr) throw lastErr;

    const dur = ffprobeDuration(mp3);
    console.log(`${dur.toFixed(2)}s`);

    const start = tCursor;
    const end = tCursor + dur;
    timeline.push({
      index: i + 1,
      speaker: turn.speaker,
      voice: turn.voice,
      start,
      end,
      text: turn.text,
    });
    parts.push(mp3);
    tCursor = end + GAP_SEC;
  }

  const listFile = path.join(partsDir, "concat.txt");
  const lines = [];
  for (let i = 0; i < parts.length; i++) {
    lines.push(`file '${parts[i].replace(/\\/g, "/")}'`);
    if (i < parts.length - 1) {
      lines.push(`file '${silence.replace(/\\/g, "/")}'`);
    }
  }
  fs.writeFileSync(listFile, lines.join("\n") + "\n", "utf8");

  const outWav = path.join(dir, "meeting.wav");
  const outMp3 = path.join(dir, "meeting.mp3");

  console.log("  concat → meeting.wav (16k mono) …");
  let r = spawnSync(
    ffmpegPath,
    [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listFile,
      "-ac",
      "1",
      "-ar",
      "16000",
      "-c:a",
      "pcm_s16le",
      outWav,
    ],
    { encoding: "utf8" },
  );
  if (r.status !== 0) {
    console.error(r.stderr?.slice(-500));
    throw new Error("ffmpeg wav failed");
  }

  console.log("  concat → meeting.mp3 …");
  r = spawnSync(
    ffmpegPath,
    [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listFile,
      "-ac",
      "1",
      "-ar",
      "24000",
      "-b:a",
      "64k",
      outMp3,
    ],
    { encoding: "utf8" },
  );
  if (r.status !== 0) {
    console.error(r.stderr?.slice(-300));
    throw new Error("ffmpeg mp3 failed");
  }

  const srt = timeline
    .map((seg, i) => {
      return (
        `${i + 1}\n` +
        `${secToSrt(seg.start)} --> ${secToSrt(seg.end)}\n` +
        `[${seg.speaker}] ${seg.text}\n`
      );
    })
    .join("\n");
  fs.writeFileSync(path.join(dir, "meeting.srt"), srt, "utf8");

  const vtt =
    "WEBVTT\n\n" +
    timeline
      .map((seg, i) => {
        return (
          `${i + 1}\n` +
          `${secToVtt(seg.start)} --> ${secToVtt(seg.end)}\n` +
          `<v ${seg.speaker}>${seg.text}\n`
        );
      })
      .join("\n");
  fs.writeFileSync(path.join(dir, "meeting.vtt"), vtt, "utf8");

  const txt =
    timeline
      .map(
        (seg) =>
          `[${secToVtt(seg.start).slice(0, 8)}–${secToVtt(seg.end).slice(0, 8)}] ${seg.speaker}: ${seg.text}`,
      )
      .join("\n") + "\n";
  fs.writeFileSync(path.join(dir, "meeting.txt"), txt, "utf8");

  const meta = {
    id: spec.id,
    title: spec.title,
    lang: spec.lang,
    generatedAt: new Date().toISOString(),
    generator: "node-edge-tts + ffmpeg-static",
    sampleRateWav: 16000,
    gapSec: GAP_SEC,
    durationSec: timeline.length ? timeline[timeline.length - 1].end : 0,
    speakers: [...new Set(timeline.map((x) => x.speaker))],
    segments: timeline,
    notes:
      spec.lang === "ja"
        ? "Japanese product meeting with loanwords (API, latency/P95, cache, webpack→vite, gzip, OAuth, CSRF, PR, dashboard, sprint, Confluence)."
        : "English multi-speaker standup (WebSocket, Mixpanel, migration, Slack, feature flags).",
  };
  fs.writeFileSync(
    path.join(dir, "meeting.json"),
    JSON.stringify(meta, null, 2) + "\n",
    "utf8",
  );

  console.log(`  ✓ ${outWav}`);
  console.log(`  ✓ subtitles: .srt .vtt .txt .json`);
  console.log(
    `  duration ≈ ${meta.durationSec.toFixed(1)}s · speakers: ${meta.speakers.join(", ")}`,
  );
  return meta;
}

async function main() {
  if (!ffmpegPath || !fs.existsSync(ffmpegPath)) {
    throw new Error("ffmpeg-static not found; npm i -D ffmpeg-static");
  }
  ensureDir(OUT);
  const results = [];
  results.push(await synthMeeting(JA_MEETING));
  results.push(await synthMeeting(EN_MEETING));

  const index = {
    description:
      "Synthetic multi-speaker meeting fixtures for baribari ASR / diarization tests",
    createdAt: new Date().toISOString(),
    fixtures: results.map((r) => ({
      id: r.id,
      title: r.title,
      lang: r.lang,
      durationSec: r.durationSec,
      speakers: r.speakers,
      files: {
        wav: `fixtures/meetings/${r.id}/meeting.wav`,
        mp3: `fixtures/meetings/${r.id}/meeting.mp3`,
        srt: `fixtures/meetings/${r.id}/meeting.srt`,
        vtt: `fixtures/meetings/${r.id}/meeting.vtt`,
        txt: `fixtures/meetings/${r.id}/meeting.txt`,
        json: `fixtures/meetings/${r.id}/meeting.json`,
      },
    })),
  };

  fs.writeFileSync(
    path.join(OUT, "index.json"),
    JSON.stringify(index, null, 2) + "\n",
    "utf8",
  );

  fs.writeFileSync(
    path.join(OUT, "README.md"),
    `# Meeting test fixtures

Synthetic multi-person meetings via **node-edge-tts** (Edge online TTS) + ffmpeg.

| ID | Lang | Speakers | ~Duration |
|----|------|----------|-----------|
${index.fixtures
  .map(
    (f) =>
      `| \`${f.id}\` | ${f.lang} | ${f.speakers.join(", ")} | ~${Math.round(f.durationSec)}s |`,
  )
  .join("\n")}

## Files

- \`meeting.wav\` — 16 kHz mono PCM (ASR-friendly)
- \`meeting.mp3\` — listening copy
- \`meeting.srt\` / \`.vtt\` / \`.txt\` / \`.json\` — reference captions

## Regenerate

\`\`\`bash
npm i -D node-edge-tts ffmpeg-static
node scripts/generate-meeting-fixtures.mjs
\`\`\`

Requires network. Japanese script includes loanwords (API, latency, cache, webpack/vite, OAuth, CSRF, dashboard, sprint, Confluence).

## Test with baribari

\`\`\`bash
# Terminal A
baribari --source loopback --lang ja

# Terminal B / media player: play on default speakers
# fixtures/meetings/ja-loanwords/meeting.wav
# or en-standup with --lang en
\`\`\`

Compare live transcript against \`meeting.srt\`.
`,
    "utf8",
  );

  // drop tiny probe file if present
  const probe = path.join(ROOT, "fixtures", "_test_ja.mp3");
  if (fs.existsSync(probe)) fs.unlinkSync(probe);

  console.log("\nDone → fixtures/meetings/");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
