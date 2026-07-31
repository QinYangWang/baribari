/**
 * First-run setup: ensure ~/.config/baribari, guide model download.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import {
  MODEL_DOWNLOADS,
  checkModels,
  configDir,
  ensureConfigDir,
  modelPaths,
  type ModelPathOverrides,
} from "./paths.js";
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
  println(`${DIM}${t("setup.configDir", { dir: configDir() })}${RESET}`);
  println(`${DIM}${t("setup.modelsDir", { dir: modelsDir })}${RESET}`);
  println();
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
  println(`${BOLD}${t("setup.spkOptional")}${RESET}  ${DIM}${MODEL_DOWNLOADS.spk.approx}${RESET}`);
  println(`   ${t("setup.file")} ${MODEL_DOWNLOADS.spk.dest}`);
  println(`   ${MODEL_DOWNLOADS.spk.url}`);
  println();
  println(`${BOLD}${t("setup.pages")}${RESET}`);
  println(`   ${t("setup.asrVad")} ${MODEL_DOWNLOADS.pages.asr}`);
  println(`   ${t("setup.spk")}    ${MODEL_DOWNLOADS.pages.spk}`);
  println();
  println(`${BOLD}${t("setup.customExample")}${RESET} (${path.join(configDir(), "config.json")})`);
  println(`${DIM}{
  "modelsDir": "D:/models/baribari",
  "models": {
    "vad": "D:/models/silero_vad.onnx",
    "senseVoiceDir": "D:/models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17",
    "spk": "D:/models/3dspeaker_speech_campplus_sv_zh_en_16k-common_advanced.onnx"
  }
}${RESET}`);
  println();
  println(t("setup.autoDownload"));
  println(t("setup.statusOnly"));
  println();
}

async function downloadFile(
  url: string,
  dest: string,
  label: string,
): Promise<void> {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = dest + ".partial";
  println(`${ACC}↓${RESET} ${label}`);
  println(`  ${DIM}${url}${RESET}`);

  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) {
    throw new Error(t("setup.downloadFail", { status: res.status, url }));
  }
  const total = Number(res.headers.get("content-length") || 0);
  const file = fs.createWriteStream(tmp);
  const reader = res.body.getReader();
  let got = 0;
  let lastPct = -1;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      file.write(Buffer.from(value));
      got += value.length;
      if (total > 0) {
        const pct = Math.floor((got / total) * 100);
        if (pct !== lastPct && pct % 5 === 0) {
          process.stdout.write(
            `\r  ${pct}%  ${(got / 1048576).toFixed(1)} / ${(total / 1048576).toFixed(1)} MB`,
          );
          lastPct = pct;
        }
      } else if (got % (5 * 1048576) < value.length) {
        process.stdout.write(`\r  ${(got / 1048576).toFixed(1)} MB`);
      }
    }
  }
  await new Promise<void>((resolve, reject) => {
    file.end(() => resolve());
    file.on("error", reject);
  });
  process.stdout.write("\n");
  fs.renameSync(tmp, dest);
  println(`  ${OK}✓${RESET} ${dest}`);
}

function extractTarBz2(archive: string, modelsDir: string): void {
  println(`${ACC}⋯${RESET} ${t("setup.extract", { name: path.basename(archive) })}`);
  // Windows 10+ tar, Linux/mac tar
  const r = spawnSync(
    "tar",
    ["-xjf", archive, "-C", modelsDir],
    { encoding: "utf8", shell: false },
  );
  if (r.status !== 0) {
    const err = (r.stderr || r.stdout || "").trim();
    throw new Error(
      t("setup.extractFail", { dir: modelsDir, err }),
    );
  }
  println(`  ${OK}✓${RESET} ${t("setup.extractOk", { dir: modelsDir })}`);
}

export async function downloadModels(opts?: {
  skipSpk?: boolean;
}): Promise<void> {
  ensureConfigDir();
  const paths = modelPaths(modelOverridesFromSettings());
  const modelsDir = paths.modelsDir;
  fs.mkdirSync(modelsDir, { recursive: true });

  // VAD
  if (!fs.existsSync(paths.vad)) {
    await downloadFile(
      MODEL_DOWNLOADS.vad.url,
      path.join(modelsDir, MODEL_DOWNLOADS.vad.dest),
      MODEL_DOWNLOADS.vad.name,
    );
  } else {
    println(`${OK}✓${RESET} ${t("setup.vadExists")}`);
  }

  // SenseVoice
  if (!fs.existsSync(paths.senseVoiceModel)) {
    const arch = path.join(modelsDir, MODEL_DOWNLOADS.senseVoice.dest);
    if (!fs.existsSync(arch)) {
      await downloadFile(
        MODEL_DOWNLOADS.senseVoice.url,
        arch,
        MODEL_DOWNLOADS.senseVoice.name,
      );
    }
    extractTarBz2(arch, modelsDir);
    // optional: keep archive
  } else {
    println(`${OK}✓${RESET} ${t("setup.asrExists")}`);
  }

  // Speaker
  if (!opts?.skipSpk) {
    if (!fs.existsSync(paths.spk)) {
      await downloadFile(
        MODEL_DOWNLOADS.spk.url,
        path.join(modelsDir, MODEL_DOWNLOADS.spk.dest),
        MODEL_DOWNLOADS.spk.name,
      );
    } else {
      println(`${OK}✓${RESET} ${t("setup.spkExists")}`);
    }
  }

  println();
  println(`${OK}${t("setup.downloadDone", { dir: modelsDir })}${RESET}`);
}

function ask(rl: readline.Interface, q: string): Promise<string> {
  return new Promise((resolve) => rl.question(q, resolve));
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
    UI_LANGS.forEach((lang, i) => {
      const mark = lang === DEFAULT_UI_LANG ? " (default)" : "";
      println(`  ${i + 1}) ${uiLangLabel(lang)}${mark}`);
    });
    println();
    const ans = (
      await ask(rl, `Select [1-${UI_LANGS.length}] (default 1=English): `)
    )
      .trim()
      .toLowerCase();

    let pick: UiLang = DEFAULT_UI_LANG;
    if (ans === "" || ans === "1" || ans === "en" || ans === "english") pick = "en";
    else if (ans === "2" || ans === "zh" || ans === "cn" || ans === "中文") pick = "zh";
    else if (ans === "3" || ans === "ja" || ans === "jp" || ans === "日本語") pick = "ja";
    else {
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
  skipSpk?: boolean;
  modelsDir?: string;
  uiLangFlag?: string;
  skipLangPrompt?: boolean;
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

  const overrides: ModelPathOverrides = modelOverridesFromSettings();
  const check = checkModels(overrides, { requireSpk: !opts?.skipSpk });

  println(`${BOLD}${ACC}${t("setup.setupHeader")}${RESET}`);
  println(`${DIM}config: ${configDir()}${RESET}`);
  println(`${DIM}models: ${check.paths.modelsDir}${RESET}`);
  println();

  if (check.ok) {
    println(`${OK}${t("setup.allReady")}${RESET}`);
    println(`  vad:  ${check.paths.vad}`);
    println(`  asr:  ${check.paths.senseVoiceModel}`);
    println(`  spk:  ${check.paths.spk}`);
    return true;
  }

  println(`${WARN}${t("setup.missingCount", { n: check.missing.length })}${RESET}`);
  for (const m of check.missing) {
    println(`  - [${m.key}] ${m.path}`);
  }

  printManualGuide(check.paths.modelsDir);

  let doDownload = !!opts?.download || !!opts?.yes;
  if (!doDownload && process.stdin.isTTY && !opts?.download) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    try {
      const ans = (await ask(rl, t("setup.promptDownload"))).trim().toLowerCase();
      doDownload = ans === "" || ans === "y" || ans === "yes";
    } finally {
      rl.close();
    }
  }

  if (doDownload) {
    try {
      await downloadModels({ skipSpk: opts?.skipSpk });
    } catch (e) {
      println(`${WARN}${t("setup.autoFail", { err: e instanceof Error ? e.message : String(e) })}${RESET}`);
      println(t("setup.manualHint"));
      return false;
    }
    const again = checkModels(overrides, { requireSpk: !opts?.skipSpk });
    if (again.ok) {
      println(`${OK}${t("setup.canStart")}${RESET}`);
      return true;
    }
    println(`${WARN}${t("setup.stillMissing")}${RESET}`);
    return false;
  }

  println(t("setup.afterManual"));
  return false;
}

/**
 * Ensure config dir + models before ASR. If missing, run setup guide.
 * @returns false if should abort (models still missing)
 */
export async function ensureReadyForAsr(opts?: {
  requireSpk?: boolean;
  autoSetup?: boolean;
  uiLangFlag?: string;
}): Promise<boolean> {
  ensureConfigDir();
  await ensureUiLang({ flag: opts?.uiLangFlag });
  const overrides = modelOverridesFromSettings();
  const check = checkModels(overrides, {
    requireSpk: opts?.requireSpk !== false,
  });
  if (check.ok) return true;

  println(`${WARN}${t("setup.firstRun")}${RESET}`);
  if (opts?.autoSetup !== false) {
    const ok = await runSetup({
      skipSpk: opts?.requireSpk === false,
      uiLangFlag: opts?.uiLangFlag,
      skipLangPrompt: true,
    });
    return ok;
  }
  printManualGuide(check.paths.modelsDir);
  return false;
}

export function printPaths(): void {
  ensureConfigDir();
  const p = modelPaths(modelOverridesFromSettings());
  println(`configDir:       ${p.configDir}`);
  println(`config.json:     ${path.join(p.configDir, "config.json")}`);
  println(`modelsDir:       ${p.modelsDir}`);
  println(`vad:             ${p.vad}`);
  println(`senseVoiceModel: ${p.senseVoiceModel}`);
  println(`senseVoiceTokens:${p.senseVoiceTokens}`);
  println(`spk:             ${p.spk}`);
  println(`recordings:      ${path.join(p.configDir, "recordings")}`);
}
