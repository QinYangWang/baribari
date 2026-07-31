#!/usr/bin/env node
/**
 * CLI entry — installable like `pi`:
 *   npm i -g baribari  →  baribari
 *
 * Config & models: ~/.config/baribari  (BARIBARI_CONFIG_DIR)
 * First run: setup guide / optional download.
 */

import { Command } from "commander";
import {
  defaultSource,
  listInputDevices,
  transcribe,
} from "./transcribe.js";
import type { AudioSource, Lang, Segment, TranscribeArgs, UiLang } from "./types.js";
import { DEFAULT_AI, DEFAULT_SHARE, DEFAULT_VAD } from "./types.js";
import { createEmitter, onStatus as plainStatus } from "./ui.js";
import { createTui } from "./tui.js";
import {
  defaultRecordDir,
  flushSaveSettings,
  loadSettings,
  mergeAi,
  mergeShare,
  mergeVad,
  normalizeRecordDir,
  snapshotFromArgs,
} from "./settings.js";
import { aiActive, createAiPipeline } from "./ai.js";
import { startShareServer, type ShareServer } from "./share-server.js";
import { joinShareSession } from "./share-client.js";
import { configDir, ensureConfigDir } from "./paths.js";
import {
  ensureReadyForAsr,
  ensureUiLang,
  printPaths,
  runSetup,
} from "./setup.js";
import {
  detectUiLang,
  isUiLang,
  resolveUiLang,
  setUiLang,
  t,
  UI_LANGS,
} from "./i18n/index.js";

const LANGS: Lang[] = ["auto", "zh", "en", "ja", "ko", "yue"];
const SOURCES: AudioSource[] = ["mic", "loopback", "both"];

function hasFlag(...names: string[]): boolean {
  const argv = process.argv.slice(2);
  return names.some((n) =>
    argv.some((a) => a === n || a.startsWith(`${n}=`)),
  );
}

function hardExit(code: number): never {
  try {
    process.exitCode = code;
  } catch {
    /* ignore */
  }
  process.exit(code);
}

function readUiLangFlag(argv: string[] = process.argv): string | undefined {
  const flagIdx = argv.findIndex(
    (a) => a === "--ui-lang" || a.startsWith("--ui-lang="),
  );
  if (flagIdx < 0) return undefined;
  const a = argv[flagIdx]!;
  if (a.includes("=")) return a.split("=")[1];
  return argv[flagIdx + 1];
}

/** Subcommands that do not need models. */
async function runUtilityCommands(argv: string[]): Promise<boolean> {
  const cmd = argv[0];
  if (cmd === "setup") {
    const rest = argv.slice(1);
    const download = rest.includes("--download") || rest.includes("-d");
    const yes = rest.includes("--yes") || rest.includes("-y");
    const skipSpk = rest.includes("--skip-spk") || rest.includes("--no-spk");
    let modelsDir: string | undefined;
    const md = rest.findIndex((a) => a === "--models-dir");
    if (md >= 0 && rest[md + 1]) modelsDir = rest[md + 1];
    const ok = await runSetup({
      download,
      yes,
      skipSpk,
      modelsDir,
      uiLangFlag: readUiLangFlag(process.argv),
    });
    hardExit(ok ? 0 : 1);
  }
  if (cmd === "paths" || cmd === "config") {
    const saved = loadSettings();
    setUiLang(resolveUiLang({ flag: readUiLangFlag(), saved: saved.uiLang }));
    printPaths();
    hardExit(0);
  }
  return false;
}

async function main() {
  ensureConfigDir();
  const utilArgv = process.argv.slice(2);
  if (await runUtilityCommands(utilArgv)) return;

  const saved = loadSettings();
  const recDefault = defaultRecordDir();
  const uiLangFlag = readUiLangFlag();

  // Resolve UI language early (prompt on first run if unset)
  {
    await ensureUiLang({
      flag: uiLangFlag,
      skipPrompt:
        utilArgv.includes("--help") ||
        utilArgv.includes("-h") ||
        utilArgv.includes("--list-devices"),
    });
  }

  const program = new Command();
  program
    .name("baribari")
    .description(
      `${t("app.desc")}\n` +
        `config: ${configDir()}\n` +
        "commands: setup | paths",
    )
    .option("--lang <lang>", `${t("cli.lang")}: ${LANGS.join("|")}`)
    .option("--ui-lang <lang>", `${t("cli.uiLang")}`)
    .option("--device <id>", t("cli.deviceOpt"))
    .option("--list-devices", t("cli.listDevices"))
    .option("--source <src>", t("cli.sourceOpt"))
    .option("-o, --output <file>", t("cli.outputOpt"))
    .option("--no-spk", t("cli.noSpk"))
    .option(
      "--spk-threshold <n>",
      t("cli.spkThreshold"),
      (v) => parseFloat(v),
    )
    .option("--no-tui", t("cli.noTui"))
    .option("--record <path>", t("cli.record"))
    .option("--record-dir <dir>", t("cli.recordDir"))
    .option("--ai", t("cli.ai"))
    .option("--no-ai", t("cli.noAi"))
    .option("--ai-correct", t("cli.aiCorrect"))
    .option("--no-ai-correct", t("cli.noAiCorrect"))
    .option("--ai-translate <lang>", t("cli.aiTranslate"))
    .option("--ai-base-url <url>", t("cli.aiBaseUrl"))
    .option("--ai-model <id>", t("cli.aiModel"))
    .option("--ai-key <key>", t("cli.aiKey"))
    .option("--share", t("cli.share"))
    .option("--no-share", t("cli.noShare"))
    .option("--share-port <n>", t("cli.sharePort"), (v) => parseInt(v, 10))
    .option("--join <url>", t("cli.join"))
    .option(
      "--vad-threshold <n>",
      t("cli.vadThreshold"),
      (v) => parseFloat(v),
    )
    .option(
      "--vad-min-speech <sec>",
      t("cli.vadMinSpeech"),
      (v) => parseFloat(v),
    )
    .option(
      "--vad-min-silence <sec>",
      t("cli.vadMinSilence"),
      (v) => parseFloat(v),
    )
    .option(
      "--vad-max-speech <sec>",
      t("cli.vadMaxSpeech"),
      (v) => parseFloat(v),
    )
    .option(
      "--vad-window <samples>",
      t("cli.vadWindow"),
      (v) => parseInt(v, 10),
    )
    .option("--demo", t("cli.demo"))
    .parse(process.argv);

  const opts = program.opts<{
    lang?: string;
    uiLang?: string;
    device?: string;
    listDevices?: boolean;
    source?: string;
    output?: string;
    spk: boolean;
    spkThreshold?: number;
    tui: boolean;
    record?: string;
    recordDir?: string;
    ai?: boolean;
    aiCorrect?: boolean;
    aiTranslate?: string;
    aiBaseUrl?: string;
    aiModel?: string;
    aiKey?: string;
    share?: boolean;
    sharePort?: number;
    join?: string;
    vadThreshold?: number;
    vadMinSpeech?: number;
    vadMinSilence?: number;
    vadMaxSpeech?: number;
    vadWindow?: number;
    demo?: boolean;
  }>();

  if (opts.demo) {
    await runDemo();
    return;
  }

  if (opts.listDevices) {
    const devices = listInputDevices();
    if (!devices.length) {
      console.log(t("cli.noDevices"));
      process.exit(1);
    }
    devices.forEach((d, i) => {
      console.log(`[${i}]\t${d.name}`);
    });
    if (process.platform === "win32") {
      console.log("\n" + t("cli.sourceHint"));
    }
    return;
  }

  // ── join mode: no local ASR ───────────────────────────
  if (opts.join) {
    await runJoin(opts.join, {
      noTui: opts.tui === false || !process.stdout.isTTY,
      output: opts.output ?? saved.output,
    });
    return;
  }

  // merge: CLI explicit > saved > defaults
  const lang = (hasFlag("--lang")
    ? opts.lang
    : (saved.lang ?? opts.lang ?? "auto")) as string;
  const source = (hasFlag("--source")
    ? opts.source
    : (saved.source ?? opts.source ?? defaultSource())) as string;
  const device = hasFlag("--device")
    ? opts.device
    : (opts.device ?? saved.device);
  const spkThreshold = hasFlag("--spk-threshold")
    ? (opts.spkThreshold as number)
    : (saved.spkThreshold ?? opts.spkThreshold ?? 0.55);
  const noSpk = hasFlag("--no-spk")
    ? opts.spk === false
    : (saved.noSpk ?? opts.spk === false);
  const output = hasFlag("-o", "--output")
    ? opts.output
    : (opts.output ?? saved.output);
  const recordDir = normalizeRecordDir(
    hasFlag("--record-dir")
      ? (opts.recordDir as string)
      : (saved.recordDir ?? opts.recordDir ?? recDefault),
  );

  const ai = mergeAi(saved.ai);
  if (hasFlag("--ai")) ai.enabled = true;
  if (hasFlag("--no-ai")) ai.enabled = false;
  if (hasFlag("--ai-correct")) ai.correct = true;
  if (hasFlag("--no-ai-correct")) ai.correct = false;
  if (hasFlag("--ai-translate") && opts.aiTranslate !== undefined) {
    ai.translateTo = opts.aiTranslate as typeof ai.translateTo;
    if (ai.translateTo) ai.enabled = true;
  }
  if (hasFlag("--ai-base-url") && opts.aiBaseUrl) {
    ai.baseUrl = opts.aiBaseUrl.replace(/\/+$/, "");
  }
  if (hasFlag("--ai-model") && opts.aiModel) ai.model = opts.aiModel;
  if (hasFlag("--ai-key") && opts.aiKey) ai.apiKey = opts.aiKey;

  const share = mergeShare(saved.share);
  if (hasFlag("--share")) share.enabled = true;
  if (hasFlag("--no-share")) share.enabled = false;
  if (hasFlag("--share-port") && opts.sharePort) {
    share.port = Math.min(65535, Math.max(1024, opts.sharePort));
  }

  const vad = mergeVad(saved.vad);
  if (hasFlag("--vad-threshold") && opts.vadThreshold !== undefined) {
    vad.threshold = opts.vadThreshold;
  }
  if (hasFlag("--vad-min-speech") && opts.vadMinSpeech !== undefined) {
    vad.minSpeechDuration = opts.vadMinSpeech;
  }
  if (hasFlag("--vad-min-silence") && opts.vadMinSilence !== undefined) {
    vad.minSilenceDuration = opts.vadMinSilence;
  }
  if (hasFlag("--vad-max-speech") && opts.vadMaxSpeech !== undefined) {
    vad.maxSpeechDuration = opts.vadMaxSpeech;
  }
  if (hasFlag("--vad-window") && opts.vadWindow !== undefined) {
    vad.windowSize = opts.vadWindow;
  }
  // re-merge clamps
  Object.assign(vad, mergeVad(vad));

  if (!LANGS.includes(lang as Lang)) {
    console.error(
      t("cli.invalidLang", { lang, opts: LANGS.join(", ") }),
    );
    process.exit(2);
  }
  if (!SOURCES.includes(source as AudioSource)) {
    console.error(
      t("cli.invalidSource", { source, opts: SOURCES.join(", ") }),
    );
    process.exit(2);
  }

  if (hasFlag("--ui-lang") && opts.uiLang !== undefined && !isUiLang(opts.uiLang)) {
    console.error(
      t("cli.invalidUiLang", {
        lang: String(opts.uiLang),
        opts: UI_LANGS.join(", "),
      }),
    );
    process.exit(2);
  }
  const uiLang: UiLang =
    loadSettings().uiLang ??
    resolveUiLang({ flag: opts.uiLang, saved: saved.uiLang });
  setUiLang(uiLang);

  const useTui = opts.tui !== false && Boolean(process.stdout.isTTY);

  // First run / missing models → interactive setup guide
  const ready = await ensureReadyForAsr({
    requireSpk: !noSpk,
    uiLangFlag: uiLang,
  });
  if (!ready) {
    console.error(t("cli.modelsNotReady"));
    hardExit(1);
  }

  const args: TranscribeArgs = {
    lang: lang as Lang,
    uiLang,
    device,
    source: source as AudioSource,
    output,
    noSpk,
    spkThreshold,
    noTui: !useTui,
    recordDir,
    record: opts.record,
    paused: { value: false },
    ai,
    share,
    vad,
  };

  const stop = { value: false };

  if (useTui) {
    await runTui(args, stop);
  } else {
    await runPlain(args, stop);
  }
}

/** Wire ASR emit → optional AI → UI + optional LAN share. */
function createSegmentPipeline(
  args: TranscribeArgs,
  emitUi: (seg: Segment) => void,
  onStatus: (msg: string) => void,
  onAiBusy?: (busy: boolean) => void,
): {
  onAsr: (seg: Segment) => void;
  close: () => void;
  ensureShare: () => Promise<void>;
} {
  let share: ShareServer | null = null;
  let shareWanted = args.share.enabled;
  let shareStarting = false;

  const deliver = (seg: Segment) => {
    // Don't broadcast provisional AI-pending rows to LAN peers
    if (!seg.pending) {
      seg.wallIso = seg.wall.toISOString();
    }
    emitUi(seg);
    if (share && !seg.pending) {
      try {
        share.broadcast(seg);
      } catch {
        /* ignore */
      }
    }
  };

  const aiPipe = createAiPipeline(
    () => args.ai,
    deliver,
    (msg) => onStatus(`AI: ${msg}`),
    onAiBusy,
  );

  const onAsr = (seg: Segment) => {
    if (aiActive(args.ai)) {
      aiPipe.push(seg);
    } else {
      deliver(seg);
    }
  };

  const ensureShare = async () => {
    shareWanted = args.share.enabled;
    if (!shareWanted) {
      if (share) {
        share.close();
        share = null;
        onStatus(t("status.shareStopped"));
      }
      return;
    }
    if (share) {
      // port change → restart
      if (share.port !== args.share.port) {
        share.close();
        share = null;
      } else {
        return;
      }
    }
    if (shareStarting) return;
    shareStarting = true;
    try {
      share = await startShareServer(args.share.port, {
        title: "baribari meeting",
      });
      const url = share.urls[0] || `http://127.0.0.1:${share.port}/`;
      onStatus(t("status.shareOn", { port: share.port }) + ` · ${url}`);
    } catch (e) {
      onStatus(
        t("status.shareFailed", {
          err: e instanceof Error ? e.message : String(e),
        }),
      );
      args.share.enabled = false;
    } finally {
      shareStarting = false;
    }
  };

  // poll share toggle from TUI settings
  const sharePoll = setInterval(() => {
    if (args.share.enabled !== shareWanted || (args.share.enabled && !share)) {
      void ensureShare();
    }
  }, 500);
  sharePoll.unref?.();

  return {
    onAsr,
    async ensureShare() {
      await ensureShare();
    },
    close() {
      clearInterval(sharePoll);
      aiPipe.close();
      try {
        share?.close();
      } catch {
        /* ignore */
      }
      share = null;
    },
  };
}

async function runTui(args: TranscribeArgs, stop: { value: boolean }) {
  let forceTimer: ReturnType<typeof setTimeout> | null = null;
  let pipe: ReturnType<typeof createSegmentPipeline> | null = null;

  const requestStop = (hard = false) => {
    if (hard || stop.value) {
      if (forceTimer) clearTimeout(forceTimer);
      try {
        pipe?.close();
      } catch {
        /* ignore */
      }
      try {
        tui.close();
      } catch {
        /* ignore */
      }
      hardExit(130);
    }
    tui.setStatus(t("status.stopping"));
    stop.value = true;
    forceTimer = setTimeout(() => {
      try {
        pipe?.close();
      } catch {
        /* ignore */
      }
      try {
        tui.close();
      } catch {
        /* ignore */
      }
      hardExit(0);
    }, 800);
  };

  const tui = createTui(args, {
    onQuit: () => requestStop(false),
  });

  const onStatus = (msg: string) => {
    const sep = msg.indexOf(" · ");
    if (sep > 0) {
      const head = msg.slice(0, sep);
      const rest = msg.slice(sep + 3).trim();
      const deviceHead = t("status.deviceDot", { name: "\0" }).split(" · ")[0];
      if (rest && head === deviceHead) tui.setDevice(rest);
    }
    tui.setStatus(msg);
  };

  process.on("SIGINT", () => requestStop(false));
  process.on("SIGTERM", () => requestStop(true));

  pipe = createSegmentPipeline(
    args,
    (seg) => tui.emit(seg),
    onStatus,
    (busy) => tui.setAiBusy?.(busy),
  );
  await pipe.ensureShare();
  if (aiActive(args.ai)) {
    onStatus(t("status.aiOnModel", { model: args.ai.model }));
  } else if (args.ai.enabled) {
    onStatus(t("status.aiMissingKey"));
  }

  let exitCode = 0;
  try {
    await transcribe(args, pipe.onAsr, stop, onStatus);
  } catch (e) {
    exitCode = 1;
    console.error(e instanceof Error ? e.message : e);
  }
  if (forceTimer) clearTimeout(forceTimer);
  try {
    pipe.close();
  } catch {
    /* ignore */
  }
  try {
    flushSaveSettings(() => snapshotFromArgs(args));
  } catch {
    /* ignore */
  }
  try {
    tui.close();
  } catch {
    /* ignore */
  }
  hardExit(exitCode);
}

async function runPlain(args: TranscribeArgs, stop: { value: boolean }) {
  setUiLang(args.uiLang);
  const { emit, close } = createEmitter(args.output);
  const pipe = createSegmentPipeline(args, emit, plainStatus);

  const onSig = () => {
    if (stop.value) hardExit(130);
    plainStatus(t("status.stopping"));
    stop.value = true;
  };
  process.on("SIGINT", onSig);
  process.on("SIGTERM", onSig);

  if (process.stdin.isTTY) {
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk: string) => {
      const cmd = chunk.trim().toLowerCase();
      if (cmd === "q" || cmd === "quit" || cmd === "exit") onSig();
      else if (cmd === "p" || cmd === "pause") {
        args.paused.value = !args.paused.value;
        plainStatus(args.paused.value ? t("plain.paused") : t("plain.resumed"));
      } else if (cmd === "r" || cmd === "record") {
        if (args.record) {
          args.record = undefined;
          plainStatus(t("plain.stopRecord"));
        } else {
          const stamp = new Date()
            .toISOString()
            .replace(/[:.]/g, "-")
            .slice(0, 19);
          const dir = (args.recordDir || defaultRecordDir()).replace(
            /[/\\]+$/,
            "",
          );
          args.record = `${dir}/meeting-${stamp}`;
          plainStatus(t("plain.startRecord", { path: args.record }));
        }
      }
    });
  }

  await pipe.ensureShare();
  if (aiActive(args.ai)) {
    plainStatus(t("status.aiOnModel", { model: args.ai.model }));
  }

  let exitCode = 0;
  try {
    await transcribe(args, pipe.onAsr, stop, plainStatus);
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    exitCode = 1;
  } finally {
    try {
      pipe.close();
    } catch {
      /* ignore */
    }
    try {
      flushSaveSettings(() => snapshotFromArgs(args));
    } catch {
      /* ignore */
    }
    close();
    try {
      if (process.stdin.isTTY) process.stdin.pause();
    } catch {
      /* ignore */
    }
    plainStatus(t("status.exited"));
  }
  hardExit(exitCode);
}

async function runJoin(
  url: string,
  opts: { noTui: boolean; output?: string },
) {
  const stop = { value: false };

  if (!opts.noTui && process.stdout.isTTY) {
    const ui = loadSettings().uiLang ?? detectUiLang();
    setUiLang(ui);
    const args: TranscribeArgs = {
      lang: "auto",
      uiLang: ui,
      source: "mic",
      noSpk: true,
      spkThreshold: 0.55,
      noTui: false,
      recordDir: defaultRecordDir(),
      paused: { value: false },
      ai: { ...DEFAULT_AI, enabled: false },
      share: { ...DEFAULT_SHARE, enabled: false },
      vad: { ...DEFAULT_VAD },
      output: opts.output,
    };
    const tui = createTui(args, {
      onQuit: () => {
        stop.value = true;
        join.close();
        tui.close();
        hardExit(0);
      },
    });
    tui.setDevice("share");
    tui.setStatus(t("status.joining", { url }));

    const join = joinShareSession(url, {
      onSegment: (seg) => tui.emit(seg),
      onStatus: (m) => tui.setStatus(m),
      onClose: () => {
        if (!stop.value) {
          tui.setStatus(t("status.connClosed"));
        }
      },
    });

    process.on("SIGINT", () => {
      stop.value = true;
      join.close();
      tui.close();
      hardExit(0);
    });

    await tui.waitClosed();
    join.close();
    hardExit(0);
  }

  // plain join
  const { emit, close } = createEmitter(opts.output);
  plainStatus(t("plain.joining", { url }));
  const join = joinShareSession(url, {
    onSegment: emit,
    onStatus: plainStatus,
  });
  process.on("SIGINT", () => {
    join.close();
    close();
    hardExit(0);
  });
  // keep alive
  await new Promise<void>(() => {
    /* until SIGINT */
  });
}

async function runDemo() {
  if (!process.stdout.isTTY) {
    console.error(t("cli.demoNeedTty"));
    process.exit(1);
  }
  const ui = loadSettings().uiLang ?? detectUiLang();
  setUiLang(ui);
  const args: TranscribeArgs = {
    lang: "zh",
    uiLang: ui,
    source: "mic",
    noSpk: false,
    spkThreshold: 0.55,
    noTui: false,
    recordDir: defaultRecordDir(),
    paused: { value: false },
    ai: { ...DEFAULT_AI },
    share: { ...DEFAULT_SHARE },
    vad: { ...DEFAULT_VAD },
  };
  const stop = { value: false };
  const tui = createTui(args, {
    onQuit: () => {
      stop.value = true;
      tui.close();
    },
  });
  tui.setDevice("Demo Mic");
  tui.setStatus(t("status.demoMode"));

  const samples: Array<{
    spk: number | null;
    text: string;
    translation?: string;
    dur: number;
  }> = [
    { spk: 1, text: "大家好，我们开始今天的产品评审。", translation: "Hello everyone, let's start today's product review.", dur: 2.4 },
    { spk: 2, text: "好的，我先同步一下上周的进度：登录流程已经上线。", dur: 3.1 },
    { spk: 1, text: "不错。语音转写这块呢？延迟有压下来吗？", dur: 2.2 },
    { spk: 3, text: "端到端大概 400ms，VAD 切段还在调阈值。", dur: 2.8 },
    {
      spk: 2,
      text: "阈值我建议先 0.55，误切太多会影响说话人聚类。",
      translation: "I suggest starting with 0.55 for the threshold.",
      dur: 3.0,
    },
  ];

  let audioT = 0;
  let i = 0;
  const timer = setInterval(() => {
    if (stop.value) {
      clearInterval(timer);
      return;
    }
    if (args.paused.value) return;
    const s = samples[i % samples.length]!;
    i += 1;
    const start = audioT;
    audioT += s.dur + 0.4;
    tui.emit({
      start,
      end: start + s.dur,
      wall: new Date(),
      spk: s.spk,
      text: s.text,
      translation: s.translation,
    });
    tui.setStatus(t("status.demoPushed", { n: i }));
  }, 1600);

  process.on("SIGINT", () => {
    stop.value = true;
    clearInterval(timer);
    tui.close();
  });

  await tui.waitClosed();
  clearInterval(timer);
  hardExit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
