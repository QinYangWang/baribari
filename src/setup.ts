/**
 * First-run setup: ensure ~/.config/baribari, guide model download.
 */

import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import {
  MODEL_DOWNLOADS,
  checkModels,
  configDir,
  ensureConfigDir,
  funAsrNanoRequiredFiles,
  modelPaths,
  reazonSpeechRequiredFiles,
  spkDownloadInfo,
  type ModelPathOverrides,
  type SpkEngine,
} from "./paths.js";
import {
  DEFAULT_SPK_ENGINE,
  LEGACY_SPK_ENGINE,
  SPK_ENGINES,
  spkEngineLabel,
  spkModelInfo,
} from "./speaker-models.js";
import {
  loadSettings,
  modelOverridesFromSettings,
  saveSettings,
} from "./settings.js";
import {
  DEFAULT_UI_LANG,
  isUiLang,
  setUiLang,
  t,
  UI_LANGS,
  uiLangLabel,
  type UiLang,
} from "./i18n/index.js";
import type { AsrEngine } from "./types.js";

const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const OK = "\x1b[32m";
const WARN = "\x1b[33m";
const ACC = "\x1b[35m";
const RESET = "\x1b[0m";

function println(s = ""): void {
  console.log(s);
}

function printManualGuide(modelsDir: string): void {
  println();
  println(`${BOLD}${ACC}${t("setup.title")}${RESET}`);
  println(t("setup.placeFiles"));
  println();
  println(`${BOLD}${t("setup.vad")}${RESET}  ${DIM}${MODEL_DOWNLOADS.vad.approx}${RESET}`);
  println(`   ${t("setup.file")} ${MODEL_DOWNLOADS.vad.dest}`);
  println(`   ${MODEL_DOWNLOADS.vad.url}`);
  println();
  println(`${BOLD}${t("setup.asr")}${RESET}  ${DIM}${MODEL_DOWNLOADS.senseVoice.approx}${RESET}`);
  println(`   ${t("setup.asrExtract")}`);
  println(`   · sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17/`);
  println(`   · sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/`);
  println(`   ${t("setup.asrContains")}`);
  println(`   ${MODEL_DOWNLOADS.senseVoice.url}`);
  println();
  println(`${BOLD}${t("setup.funAsrNano")}${RESET}  ${DIM}${MODEL_DOWNLOADS.funAsrNano.approx}${RESET}`);
  println(`   ${t("setup.funAsrNanoExtract", { dir: MODEL_DOWNLOADS.funAsrNano.extractDir })}`);
  println(`   ${MODEL_DOWNLOADS.funAsrNano.url}`);
  println();
  println(`${BOLD}${t("setup.reazonSpeech")}${RESET}  ${DIM}${MODEL_DOWNLOADS.reazonSpeech.approx}${RESET}`);
  println(`   ${t("setup.reazonSpeechContains")}`);
  for (const file of MODEL_DOWNLOADS.reazonSpeech.files) {
    println(`   ${file.name}`);
    println(`   ${file.url}`);
  }
  println();
  println(`${BOLD}${t("setup.spkOptional")}${RESET}`);
  for (const engine of SPK_ENGINES) {
    const info = spkModelInfo(engine);
    const tag =
      engine === DEFAULT_SPK_ENGINE
        ? t("setup.spkRecommended")
        : t("setup.spkLegacy");
    println(
      `   ${info.name} (${engine}) ${tag}  ${DIM}${info.approx}${RESET}`,
    );
    println(`   ${t("setup.file")} ${info.fileName}`);
    println(`   ${info.url}`);
  }
  println(`   ${t("setup.spkNoSpkHint")}`);
  println();
  println(`${BOLD}${t("setup.pages")}${RESET}`);
  println(`   ${t("setup.asrVad")} ${MODEL_DOWNLOADS.pages.asr}`);
  println(`   ${t("setup.spk")}    ${MODEL_DOWNLOADS.pages.spk}`);
  println();
  println(`${BOLD}${t("setup.customExample")}${RESET} (${path.join(configDir(), "config.json")})`);
  println(`${DIM}{
  "spkEngine": "${DEFAULT_SPK_ENGINE}",
  "modelsDir": "D:/models/baribari",
  "models": {
    "vad": "D:/models/silero_vad.onnx",
    "senseVoiceDir": "D:/models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17",
    "funAsrNanoDir": "D:/models/${MODEL_DOWNLOADS.funAsrNano.extractDir}",
    "reazonSpeechDir": "D:/models/${MODEL_DOWNLOADS.reazonSpeech.dir}",
    "spkEres2netLarge": "D:/models/${spkModelInfo("eres2net-large").fileName}",
    "spkCampplus": "D:/models/${spkModelInfo("campplus").fileName}"
  }
}${RESET}`);
  println();
}

type DownloadFileOptions = {
  quiet?: boolean;
  onProgress?: (percent: number) => void;
  onRetry?: () => void;
};

async function downloadFileOnce(
  url: string,
  dest: string,
  label: string,
  opts?: DownloadFileOptions,
): Promise<void> {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = dest + ".partial";
  if (!opts?.quiet) println(`${ACC}↓${RESET} ${label}`);

  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) {
    throw new Error(t("setup.downloadFail", { status: res.status, url }));
  }
  const total = Number(res.headers.get("content-length") || 0);
  const file = fs.createWriteStream(tmp);
  const reader = res.body.getReader();
  let got = 0;
  let lastPct = -1;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        if (!file.write(Buffer.from(value))) await once(file, "drain");
        got += value.length;
        if (total > 0) {
          const pct = Math.floor((got / total) * 100);
          opts?.onProgress?.(pct);
          if (!opts?.quiet && pct !== lastPct && pct % 5 === 0) {
            process.stdout.write(
              `\r  ${pct}%  ${(got / 1048576).toFixed(1)} / ${(total / 1048576).toFixed(1)} MB`,
            );
            lastPct = pct;
          }
        } else if (!opts?.quiet && got % (5 * 1048576) < value.length) {
          process.stdout.write(`\r  ${(got / 1048576).toFixed(1)} MB`);
        }
      }
    }
    if (total > 0 && got !== total) {
      throw new Error(t("setup.downloadIncomplete", {
        name: label,
        received: (got / 1048576).toFixed(1),
        expected: (total / 1048576).toFixed(1),
      }));
    }
    await new Promise<void>((resolve, reject) => {
      file.end(() => resolve());
      file.on("error", reject);
    });
    if (!opts?.quiet) process.stdout.write("\n");
    fs.renameSync(tmp, dest);
    if (!opts?.quiet) println(`  ${OK}✓${RESET} ${dest}`);
  } catch (error) {
    void reader.cancel().catch(() => {});
    file.destroy();
    if (!file.closed) await once(file, "close").catch(() => {});
    fs.rmSync(tmp, { force: true });
    throw error;
  }
}

async function downloadFile(
  url: string,
  dest: string,
  label: string,
  opts?: DownloadFileOptions,
): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await downloadFileOnce(url, dest, label, opts);
      return;
    } catch (error) {
      if (attempt === 0) {
        opts?.onRetry?.();
        if (!opts?.quiet) println(`${WARN}${t("setup.downloadRetry", { name: label })}${RESET}`);
        continue;
      }
      throw error;
    }
  }
}

function extractTarBz2(archive: string, modelsDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("tar", ["-xjf", archive, "-C", modelsDir], {
      shell: false, stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr?.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", reject);
    child.on("close", (code) => code === 0
      ? resolve()
      : reject(new Error(stderr.trim() || `tar exited with code ${code}`)));
  });
}

function looksLikeDamagedArchive(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /truncated|unexpected (?:end|eof)|short read|corrupt|invalid.*archive|not.*archive/i
    .test(message);
}

async function downloadAndExtract(options: {
  url: string;
  archive: string;
  label: string;
  modelsDir: string;
  quiet: boolean;
  onProgress?: (percent: number) => void;
  onExtract?: () => void;
  onRetry?: () => void;
}): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!fs.existsSync(options.archive)) {
      await downloadFile(options.url, options.archive, options.label, {
        quiet: options.quiet,
        onProgress: options.onProgress,
        onRetry: options.onRetry,
      });
    }
    options.onExtract?.();
    if (!options.quiet) {
      println(`${ACC}⋯${RESET} ${t("setup.extract", { name: path.basename(options.archive) })}`);
    }
    try {
      await extractTarBz2(options.archive, options.modelsDir);
      if (!options.quiet) {
        println(`  ${OK}✓${RESET} ${t("setup.extractOk", { dir: options.modelsDir })}`);
      }
      return;
    } catch (error) {
      if (looksLikeDamagedArchive(error)) {
        fs.rmSync(options.archive, { force: true });
        if (attempt === 0) {
          options.onRetry?.();
          if (!options.quiet) {
            println(`${WARN}${t("setup.archiveCorruptRetry", { name: path.basename(options.archive) })}${RESET}`);
          }
          continue;
        }
      }
      const err = error instanceof Error ? error.message : String(error);
      throw new Error(
        t("setup.extractFail", { dir: options.modelsDir, err }),
      );
    }
  }
}

/** Download the optional Fun-ASR-Nano bundle without writing into a live TUI. */
export async function downloadFunAsrNano(opts?: {
  onProgress?: (percent: number) => void;
  onExtract?: () => void;
  onRetry?: () => void;
  quiet?: boolean;
}): Promise<void> {
  ensureConfigDir();
  const paths = modelPaths(modelOverridesFromSettings());
  if (funAsrNanoRequiredFiles(paths).every((item) => fs.existsSync(item.path))) return;
  fs.mkdirSync(paths.modelsDir, { recursive: true });
  const archive = path.join(paths.modelsDir, MODEL_DOWNLOADS.funAsrNano.dest);
  await downloadAndExtract({
    url: MODEL_DOWNLOADS.funAsrNano.url,
    archive,
    label: MODEL_DOWNLOADS.funAsrNano.name,
    modelsDir: paths.modelsDir,
    quiet: opts?.quiet !== false,
    onProgress: opts?.onProgress,
    onExtract: opts?.onExtract,
    onRetry: opts?.onRetry,
  });
  const missing = funAsrNanoRequiredFiles(paths)
    .filter((item) => !fs.existsSync(item.path));
  if (missing.length) throw new Error(missing.map((item) => item.path).join(", "));
}

/** Download the compact ReazonSpeech Japanese model as four individual files. */
export async function downloadReazonSpeech(opts?: {
  onProgress?: (percent: number) => void;
  onRetry?: () => void;
  quiet?: boolean;
}): Promise<void> {
  ensureConfigDir();
  const paths = modelPaths(modelOverridesFromSettings());
  if (reazonSpeechRequiredFiles(paths).every((item) => fs.existsSync(item.path))) return;
  fs.mkdirSync(paths.reazonSpeechDir, { recursive: true });

  const totalBytes = MODEL_DOWNLOADS.reazonSpeech.files
    .reduce((sum, file) => sum + file.bytes, 0);
  const destinations = [
    paths.reazonSpeechEncoder,
    paths.reazonSpeechDecoder,
    paths.reazonSpeechJoiner,
    paths.reazonSpeechTokens,
  ];
  let completedBytes = 0;
  for (const [index, file] of MODEL_DOWNLOADS.reazonSpeech.files.entries()) {
    const dest = destinations[index]!;
    if (!fs.existsSync(dest)) {
      await downloadFile(file.url, dest, file.name, {
        quiet: opts?.quiet !== false,
        onRetry: opts?.onRetry,
        onProgress: (percent) => {
          const current = file.bytes * percent / 100;
          opts?.onProgress?.(Math.floor((completedBytes + current) / totalBytes * 100));
        },
      });
    }
    completedBytes += file.bytes;
    opts?.onProgress?.(Math.floor(completedBytes / totalBytes * 100));
  }

  const missing = reazonSpeechRequiredFiles(paths)
    .filter((item) => !fs.existsSync(item.path));
  if (missing.length) throw new Error(missing.map((item) => item.path).join(", "));
}

/** Download one ASR backend for use by the live settings dialog. */
export async function downloadAsrModel(
  engine: import("./types.js").AsrEngine,
  opts?: {
    onProgress?: (percent: number) => void;
    onExtract?: () => void;
    onRetry?: () => void;
  },
): Promise<void> {
  if (engine === "funasr-nano") return downloadFunAsrNano(opts);
  if (engine === "reazonspeech-ja") return downloadReazonSpeech(opts);
  ensureConfigDir();
  const paths = modelPaths(modelOverridesFromSettings());
  if (fs.existsSync(paths.senseVoiceModel) && fs.existsSync(paths.senseVoiceTokens)) return;
  fs.mkdirSync(paths.modelsDir, { recursive: true });
  const archive = path.join(paths.modelsDir, MODEL_DOWNLOADS.senseVoice.dest);
  await downloadAndExtract({
    url: MODEL_DOWNLOADS.senseVoice.url,
    archive,
    label: MODEL_DOWNLOADS.senseVoice.name,
    modelsDir: paths.modelsDir,
    quiet: true,
    onProgress: opts?.onProgress,
    onExtract: opts?.onExtract,
    onRetry: opts?.onRetry,
  });
  const missing = [paths.senseVoiceModel, paths.senseVoiceTokens]
    .filter((file) => !fs.existsSync(file));
  if (missing.length) throw new Error(missing.join(", "));
}

/** Download one speaker embedding model (CAM++ or ERes2Net-large). */
export async function downloadSpkModel(
  engine: SpkEngine,
  opts?: {
    onProgress?: (percent: number) => void;
    onRetry?: () => void;
    quiet?: boolean;
  },
): Promise<void> {
  ensureConfigDir();
  const paths = modelPaths(modelOverridesFromSettings(), { spkEngine: engine });
  const dest = paths.spkByEngine[engine] || paths.spk;
  if (fs.existsSync(dest)) {
    opts?.onProgress?.(100);
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const info = spkDownloadInfo(engine);
  await downloadFile(info.url, dest, info.name, {
    quiet: opts?.quiet !== false,
    onProgress: opts?.onProgress,
    onRetry: opts?.onRetry,
  });
  if (!fs.existsSync(dest)) throw new Error(dest);
}

export async function downloadModels(opts?: {
  skipSpk?: boolean;
  asrEngine?: AsrEngine;
  asrEngines?: AsrEngine[];
  spkEngine?: SpkEngine;
}): Promise<void> {
  ensureConfigDir();
  const spkEngine = opts?.spkEngine ?? loadSettings().spkEngine ?? DEFAULT_SPK_ENGINE;
  const paths = modelPaths(modelOverridesFromSettings(), { spkEngine });
  const modelsDir = paths.modelsDir;
  fs.mkdirSync(modelsDir, { recursive: true });

  // VAD
  if (!fs.existsSync(paths.vad)) {
    await downloadFile(
      MODEL_DOWNLOADS.vad.url,
      path.join(modelsDir, MODEL_DOWNLOADS.vad.dest),
      MODEL_DOWNLOADS.vad.name,
    );
  }

  // Selected ASR model(s)
  const engines = opts?.asrEngines ?? [opts?.asrEngine ?? "sensevoice"];
  for (const engine of engines) {
    if (engine === "funasr-nano") {
      const ready = funAsrNanoRequiredFiles(paths).every((item) => fs.existsSync(item.path));
      if (!ready) await downloadFunAsrNano({ quiet: false });
    } else if (engine === "reazonspeech-ja") {
      const ready = reazonSpeechRequiredFiles(paths).every((item) => fs.existsSync(item.path));
      if (!ready) await downloadReazonSpeech({ quiet: false });
    } else if (!fs.existsSync(paths.senseVoiceModel) || !fs.existsSync(paths.senseVoiceTokens)) {
      const archive = path.join(modelsDir, MODEL_DOWNLOADS.senseVoice.dest);
      await downloadAndExtract({
        url: MODEL_DOWNLOADS.senseVoice.url,
        archive,
        label: MODEL_DOWNLOADS.senseVoice.name,
        modelsDir,
        quiet: false,
      });
      // optional: keep archive
    }
  }

  // Speaker (selected engine only; --skip-spk / --no-spk skips)
  if (!opts?.skipSpk) {
    const dest = paths.spkByEngine[spkEngine] || paths.spk;
    if (!fs.existsSync(dest)) {
      await downloadSpkModel(spkEngine, { quiet: false });
    }
  }

  println();
  println(`${OK}${t("setup.downloadDone", { dir: modelsDir })}${RESET}`);
}

function ask(rl: readline.Interface, q: string): Promise<string> {
  return new Promise((resolve) => rl.question(q, resolve));
}

type SetupModelChoice = AsrEngine | "all";

async function chooseSetupModels(defaultEngine: AsrEngine): Promise<SetupModelChoice> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const defaultChoice = defaultEngine === "funasr-nano"
    ? 2
    : defaultEngine === "reazonspeech-ja"
      ? 3
      : 1;
  try {
    println(`${BOLD}${t("setup.chooseModels")}${RESET}`);
    println(`  1) ${t("setup.senseVoiceOption")}`);
    println(`  2) ${t("setup.funAsrNanoOption")}`);
    println(`  3) ${t("setup.reazonSpeechOption")}`);
    println(`  4) ${t("setup.allOption")}`);
    println();
    const answer = (await ask(rl, t("setup.selectModels", { n: defaultChoice })))
      .trim()
      .toLowerCase();
    if (answer === "2" || answer === "funasr" || answer === "funasr-nano" || answer === "nano") {
      return "funasr-nano";
    }
    if (["3", "reazon", "reazonspeech", "reazonspeech-ja", "ja"].includes(answer)) {
      return "reazonspeech-ja";
    }
    if (answer === "4" || answer === "both" || answer === "all") return "all";
    if (answer === "1" || answer === "sensevoice" || answer === "sense" || answer === "") {
      return answer === "" ? defaultEngine : "sensevoice";
    }
    return defaultEngine;
  } finally {
    rl.close();
  }
}

function selectedModelCheck(
  overrides: ModelPathOverrides,
  engines: AsrEngine[],
  requireSpk: boolean,
  spkEngine?: SpkEngine,
) {
  const checks = engines.map((asrEngine) =>
    checkModels(overrides, { requireSpk, asrEngine, spkEngine }),
  );
  const primary = checks[0]!;
  const missing = [...new Map(
    checks.flatMap((check) => check.missing).map((item) => [item.path, item]),
  ).values()];
  return {
    ok: checks.every((check) => check.ok),
    paths: primary.paths,
    missing,
  };
}

async function chooseSetupSpkEngine(
  defaultEngine: SpkEngine,
): Promise<{ engine: SpkEngine; skip: boolean }> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    println(`${BOLD}${t("setup.chooseSpk")}${RESET}`);
    println(
      `  1) ${spkEngineLabel("eres2net-large")} — ${t("setup.spkEres2netOption")}`,
    );
    println(
      `  2) ${spkEngineLabel("campplus")} — ${t("setup.spkCampplusOption")}`,
    );
    println(`  3) ${t("setup.spkSkipOption")}`);
    println();
    const def = defaultEngine === "campplus" ? 2 : 1;
    const answer = (await ask(rl, t("setup.selectSpk", { n: def })))
      .trim()
      .toLowerCase();
    if (answer === "3" || answer === "skip" || answer === "none" || answer === "no") {
      return { engine: defaultEngine, skip: true };
    }
    if (
      answer === "2" ||
      answer === "campplus" ||
      answer === "cam++" ||
      answer === "cam"
    ) {
      return { engine: "campplus", skip: false };
    }
    if (
      answer === "1" ||
      answer === "eres2net" ||
      answer === "eres2net-large" ||
      answer === "large"
    ) {
      return { engine: "eres2net-large", skip: false };
    }
    if (answer === "") {
      return { engine: defaultEngine, skip: false };
    }
    return { engine: defaultEngine, skip: false };
  } finally {
    rl.close();
  }
}

/**
 * First-run UI language picker (before other setup text).
 * Multilingual prompt; persists uiLang to config.json.
 */
export async function ensureUiLang(opts?: {
  flag?: string;
  skipPrompt?: boolean;
}): Promise<UiLang> {
  ensureConfigDir();
  const saved = loadSettings();

  if (isUiLang(opts?.flag)) {
    setUiLang(opts.flag);
    if (saved.uiLang !== opts.flag) saveSettings({ uiLang: opts.flag });
    return opts.flag;
  }
  if (isUiLang(saved.uiLang)) {
    setUiLang(saved.uiLang);
    return saved.uiLang;
  }

  if (opts?.skipPrompt || !process.stdin.isTTY) {
    const envLang = process.env.BARIBARI_UI_LANG;
    const pick = isUiLang(envLang) ? envLang : DEFAULT_UI_LANG;
    setUiLang(pick);
    saveSettings({ uiLang: pick });
    return pick;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    println();
    println(`${BOLD}${ACC}◆ baribari${RESET}`);
    println(`${DIM}UI language / 界面语言 / 表示言語${RESET}`);
    println();
    const defaultIdx = Math.max(0, UI_LANGS.indexOf(DEFAULT_UI_LANG));
    UI_LANGS.forEach((lang, i) => {
      const mark = lang === DEFAULT_UI_LANG ? " (default)" : "";
      println(`  ${i + 1}) ${uiLangLabel(lang)}${mark}`);
    });
    println();
    const ans = (
      await ask(
        rl,
        `Select [1-${UI_LANGS.length}] (default ${defaultIdx + 1}=${uiLangLabel(DEFAULT_UI_LANG)}): `,
      )
    )
      .trim()
      .toLowerCase();

    let pick: UiLang = DEFAULT_UI_LANG;
    if (ans === "") {
      pick = DEFAULT_UI_LANG;
    } else if (ans === "en" || ans === "english") {
      pick = "en";
    } else if (ans === "zh" || ans === "cn" || ans === "中文") {
      pick = "zh";
    } else if (ans === "ja" || ans === "jp" || ans === "日本語") {
      pick = "ja";
    } else {
      const n = parseInt(ans, 10);
      if (n >= 1 && n <= UI_LANGS.length) pick = UI_LANGS[n - 1]!;
    }
    setUiLang(pick);
    saveSettings({ uiLang: pick });
    println(`${OK}✓${RESET} ${uiLangLabel(pick)}`);
    println();
    return pick;
  } finally {
    rl.close();
  }
}

/**
 * Interactive / non-interactive setup entry.
 * Returns true if models are ready to run ASR.
 */
export async function runSetup(opts?: {
  download?: boolean;
  yes?: boolean;
  manual?: boolean;
  skipSpk?: boolean;
  modelsDir?: string;
  uiLangFlag?: string;
  skipLangPrompt?: boolean;
  asrEngine?: AsrEngine;
  spkEngine?: SpkEngine;
}): Promise<boolean> {
  ensureConfigDir();

  await ensureUiLang({
    flag: opts?.uiLangFlag,
    skipPrompt: opts?.skipLangPrompt || opts?.yes,
  });

  // optional custom modelsDir from CLI
  if (opts?.modelsDir) {
    const abs = path.resolve(opts.modelsDir);
    fs.mkdirSync(abs, { recursive: true });
    const prev = loadSettings();
    saveSettings({
      modelsDir: abs,
      models: { ...prev.models, modelsDir: abs },
    });
    println(`${OK}✓${RESET} ${t("setup.modelsDirSet", { dir: abs })}`);
  }

  const saved = loadSettings();
  const configuredEngine = opts?.asrEngine ?? saved.asrEngine ?? "sensevoice";
  let engines: AsrEngine[] = [configuredEngine];
  let selectedActiveEngine = configuredEngine;
  if (!opts?.asrEngine && !opts?.yes && !opts?.manual && process.stdin.isTTY) {
    const choice = await chooseSetupModels(configuredEngine);
    engines = choice === "all"
      ? ["sensevoice", "funasr-nano", "reazonspeech-ja"]
      : [choice];
    selectedActiveEngine = choice === "all" ? configuredEngine : choice;
    println();
  }

  let skipSpk = !!opts?.skipSpk;
  let choseNoSpk = false;
  let selectedSpkEngine: SpkEngine =
    opts?.spkEngine ??
    saved.spkEngine ??
    DEFAULT_SPK_ENGINE;
  // Interactive: offer recommended ERes2Net-large unless skipped
  if (
    !opts?.skipSpk &&
    !opts?.spkEngine &&
    !opts?.yes &&
    !opts?.manual &&
    process.stdin.isTTY
  ) {
    const pick = await chooseSetupSpkEngine(
      saved.spkEngine ?? DEFAULT_SPK_ENGINE,
    );
    selectedSpkEngine = pick.engine;
    if (pick.skip) {
      skipSpk = true;
      choseNoSpk = true;
    }
    println();
  }

  const saveSelectedEngine = () => {
    const patch: Parameters<typeof saveSettings>[0] = {};
    if (!opts?.asrEngine && saved.asrEngine !== selectedActiveEngine) {
      patch.asrEngine = selectedActiveEngine;
    }
    if (!skipSpk && saved.spkEngine !== selectedSpkEngine) {
      patch.spkEngine = selectedSpkEngine;
      const previousEngine = saved.spkEngine ?? LEGACY_SPK_ENGINE;
      if (
        saved.spkThreshold === undefined ||
        Math.abs(
          saved.spkThreshold - spkModelInfo(previousEngine).defaults.threshold,
        ) < 0.001
      ) {
        patch.spkThreshold = spkModelInfo(
          selectedSpkEngine,
        ).defaults.threshold;
      }
    }
    if (choseNoSpk) patch.noSpk = true;
    if (Object.keys(patch).length) saveSettings(patch);
  };

  const overrides: ModelPathOverrides = modelOverridesFromSettings();
  const check = selectedModelCheck(
    overrides,
    engines,
    !skipSpk,
    selectedSpkEngine,
  );

  println(`${BOLD}${ACC}${t("setup.setupHeader")}${RESET}`);
  println(`${DIM}config: ${configDir()}${RESET}`);
  println(`${DIM}models: ${check.paths.modelsDir}${RESET}`);
  println();

  if (check.ok) {
    saveSelectedEngine();
    println(`${OK}${t("setup.allReady")}${RESET}`);
    println(`  vad:  ${check.paths.vad}`);
    for (const engine of engines) {
      const modelPath = engine === "funasr-nano"
        ? check.paths.funAsrNanoDir
        : engine === "reazonspeech-ja"
          ? check.paths.reazonSpeechDir
          : check.paths.senseVoiceModel;
      println(`  asr (${engine}):  ${modelPath}`);
    }
    if (!skipSpk) {
      println(
        `  spk (${selectedSpkEngine}):  ${check.paths.spkByEngine[selectedSpkEngine] || check.paths.spk}`,
      );
    }
    return true;
  }

  println(`${WARN}${t("setup.missingCount", { n: check.missing.length })}${RESET}`);
  for (const m of check.missing) {
    const relative = path.relative(check.paths.modelsDir, m.path);
    println(`  ${WARN}•${RESET} ${relative && !relative.startsWith("..") ? relative : m.path}`);
  }
  println();

  if (opts?.manual) {
    printManualGuide(check.paths.modelsDir);
    return false;
  }

  let doDownload = !!opts?.download || !!opts?.yes;
  let declinedDownload = false;
  if (!doDownload && process.stdin.isTTY && !opts?.download) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    try {
      const ans = (await ask(rl, t("setup.promptDownload"))).trim().toLowerCase();
      doDownload = ans === "" || ans === "y" || ans === "yes";
      declinedDownload = !doDownload;
    } finally {
      rl.close();
    }
  }

  if (doDownload) {
    try {
      await downloadModels({
        skipSpk,
        asrEngines: engines,
        spkEngine: selectedSpkEngine,
      });
    } catch (e) {
      println(`${WARN}${t("setup.autoFail", { err: e instanceof Error ? e.message : String(e) })}${RESET}`);
      println(t("setup.manualHint"));
      return false;
    }
    const again = selectedModelCheck(
      overrides,
      engines,
      !skipSpk,
      selectedSpkEngine,
    );
    if (again.ok) {
      saveSelectedEngine();
      println(`${OK}${t("setup.canStart")}${RESET}`);
      return true;
    }
    println(`${WARN}${t("setup.stillMissing")}${RESET}`);
    return false;
  }

  if (declinedDownload) {
    printManualGuide(check.paths.modelsDir);
  } else {
    println(t("setup.nextSteps"));
    println(`  ${t("setup.autoDownload")}`);
    println(`  ${t("setup.manualCommand")}`);
  }
  return false;
}

/**
 * Ensure config dir + models before ASR. If missing, run setup guide.
 * @returns false if should abort (models still missing)
 */
export async function ensureReadyForAsr(opts?: {
  requireSpk?: boolean;
  asrEngine?: import("./types.js").AsrEngine;
  spkEngine?: SpkEngine;
  autoSetup?: boolean;
  uiLangFlag?: string;
}): Promise<boolean> {
  ensureConfigDir();
  await ensureUiLang({ flag: opts?.uiLangFlag });
  const saved = loadSettings();
  const configuredSpkEngine = opts?.spkEngine ?? saved.spkEngine;
  const spkEngine = configuredSpkEngine ?? LEGACY_SPK_ENGINE;
  const overrides = modelOverridesFromSettings();
  const check = checkModels(overrides, {
    requireSpk: opts?.requireSpk !== false,
    asrEngine: opts?.asrEngine,
    spkEngine,
  });
  if (check.ok) return true;

  println(`${WARN}${t("setup.firstRun")}${RESET}`);
  if (opts?.autoSetup !== false) {
    const ok = await runSetup({
      skipSpk: opts?.requireSpk === false,
      uiLangFlag: opts?.uiLangFlag,
      skipLangPrompt: true,
      asrEngine: opts?.asrEngine,
      spkEngine: configuredSpkEngine,
    });
    return ok;
  }
  printManualGuide(check.paths.modelsDir);
  return false;
}

export function printPaths(): void {
  ensureConfigDir();
  const saved = loadSettings();
  const spkEngine = saved.spkEngine ?? LEGACY_SPK_ENGINE;
  const p = modelPaths(modelOverridesFromSettings(), { spkEngine });
  println(`configDir:       ${p.configDir}`);
  println(`config.json:     ${path.join(p.configDir, "config.json")}`);
  println(`replace.json:    ${path.join(p.configDir, "replace.json")}  # local non-AI dict`);
  println(`modelsDir:       ${p.modelsDir}`);
  println(`vad:             ${p.vad}`);
  println(`senseVoiceModel: ${p.senseVoiceModel}`);
  println(`senseVoiceTokens:${p.senseVoiceTokens}`);
  println(`funAsrNanoDir:   ${p.funAsrNanoDir}`);
  println(`reazonSpeechDir: ${p.reazonSpeechDir}`);
  println(`spkEngine:       ${spkEngine}`);
  for (const engine of SPK_ENGINES) {
    const f = p.spkByEngine[engine];
    const mark = fs.existsSync(f) ? "ok" : "missing";
    println(`spk (${engine}): ${f}  [${mark}]`);
  }
  println(`spk (active):    ${p.spk}`);
  println(`recordings:      ${path.join(p.configDir, "recordings")}`);
}
