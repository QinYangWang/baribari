/**
 * Config / model layout (pi-style global install):
 *
 *   ~/.config/baribari/           (BARIBARI_CONFIG_DIR overrides)
 *     config.json
 *     replace.json                # local non-AI dictionary polish
 *     models/
 *       silero_vad.onnx
 *       sherpa-onnx-sense-voice-…/
 *       3dspeaker_….onnx
 *     sessions/
 *     speakers/
 *     recordings/
 *
 * Custom paths may be set in config.json (modelsDir / models.*).
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { t } from "./i18n/index.js";

export const SAMPLE_RATE = 16_000;

/** Package install root (contains package.json / dist). */
export function packageRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // dist/ -> package root; src/ during tsx -> package root
  return path.resolve(here, "..");
}

/** @deprecated use packageRoot — kept for any external imports */
export function projectRoot(): string {
  return packageRoot();
}

/**
 * User config directory.
 * - BARIBARI_CONFIG_DIR if set
 * - else ~/.config/baribari  (cross-platform, incl. Windows)
 */
export function configDir(): string {
  const env = process.env.BARIBARI_CONFIG_DIR?.trim();
  if (env) return path.resolve(env);
  return path.join(os.homedir(), ".config", "baribari");
}

export function ensureConfigDir(): string {
  const dir = configDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(dir, "models"), { recursive: true });
  fs.mkdirSync(path.join(dir, "recordings"), { recursive: true });
  fs.mkdirSync(path.join(dir, "sessions"), { recursive: true });
  fs.mkdirSync(path.join(dir, "speakers"), { recursive: true });
  return dir;
}

export const SENSEVOICE_DIR_NAMES = [
  "sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17",
  "sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17",
] as const;

export interface ModelPathOverrides {
  /** Override root models directory. */
  modelsDir?: string;
  /** Absolute or relative (to configDir) paths for individual assets. */
  vad?: string;
  senseVoiceDir?: string;
  senseVoiceModel?: string;
  senseVoiceTokens?: string;
  spk?: string;
}

export interface ResolvedModelPaths {
  configDir: string;
  modelsDir: string;
  vad: string;
  senseVoiceDir: string;
  senseVoiceModel: string;
  senseVoiceTokens: string;
  spk: string;
}

function resolveMaybe(p: string | undefined, base: string): string | undefined {
  if (!p?.trim()) return undefined;
  const t = p.trim();
  if (path.isAbsolute(t)) return t;
  return path.resolve(base, t);
}

function findSenseVoiceDir(modelsDir: string, preferred?: string): string {
  if (preferred && fs.existsSync(preferred)) return preferred;
  for (const name of SENSEVOICE_DIR_NAMES) {
    const d = path.join(modelsDir, name);
    if (fs.existsSync(path.join(d, "model.int8.onnx"))) return d;
    if (fs.existsSync(path.join(d, "tokens.txt"))) return d;
  }
  // default expected name (int8 folder from official releases)
  return path.join(modelsDir, SENSEVOICE_DIR_NAMES[1]);
}

/**
 * Resolve model file locations.
 * Priority: per-file overrides > modelsDir override > ~/.config/baribari/models
 * Also falls back to package-local ./models for dev checkouts.
 */
export function modelPaths(overrides: ModelPathOverrides = {}): ResolvedModelPaths {
  const cfg = configDir();
  const pkgModels = path.join(packageRoot(), "models");

  const modelsDir =
    resolveMaybe(overrides.modelsDir, cfg) ||
    (fs.existsSync(path.join(cfg, "models"))
      ? path.join(cfg, "models")
      : fs.existsSync(pkgModels)
        ? pkgModels
        : path.join(cfg, "models"));

  const senseVoiceDir = findSenseVoiceDir(
    modelsDir,
    resolveMaybe(overrides.senseVoiceDir, cfg),
  );

  const vad =
    resolveMaybe(overrides.vad, cfg) || path.join(modelsDir, "silero_vad.onnx");
  const senseVoiceModel =
    resolveMaybe(overrides.senseVoiceModel, cfg) ||
    path.join(senseVoiceDir, "model.int8.onnx");
  const senseVoiceTokens =
    resolveMaybe(overrides.senseVoiceTokens, cfg) ||
    path.join(senseVoiceDir, "tokens.txt");
  const spk =
    resolveMaybe(overrides.spk, cfg) ||
    path.join(
      modelsDir,
      "3dspeaker_speech_campplus_sv_zh_en_16k-common_advanced.onnx",
    );

  return {
    configDir: cfg,
    modelsDir,
    vad,
    senseVoiceDir,
    senseVoiceModel,
    senseVoiceTokens,
    spk,
  };
}

export interface ModelCheckResult {
  ok: boolean;
  paths: ResolvedModelPaths;
  missing: { key: string; path: string; required: boolean }[];
}

export function checkModels(
  overrides: ModelPathOverrides = {},
  opts?: { requireSpk?: boolean },
): ModelCheckResult {
  const paths = modelPaths(overrides);
  const requireSpk = opts?.requireSpk !== false;
  const missing: ModelCheckResult["missing"] = [];
  const need = [
    { key: "vad", path: paths.vad, required: true },
    { key: "senseVoiceModel", path: paths.senseVoiceModel, required: true },
    { key: "senseVoiceTokens", path: paths.senseVoiceTokens, required: true },
    { key: "spk", path: paths.spk, required: requireSpk },
  ];
  for (const n of need) {
    if (n.required && !fs.existsSync(n.path)) missing.push(n);
  }
  return { ok: missing.length === 0, paths, missing };
}

export function assertModelsExist(
  paths: ResolvedModelPaths,
  opts?: { requireSpk?: boolean },
): void {
  const requireSpk = opts?.requireSpk !== false;
  const missing: string[] = [];
  for (const p of [paths.vad, paths.senseVoiceModel, paths.senseVoiceTokens]) {
    if (!fs.existsSync(p)) missing.push(p);
  }
  if (requireSpk && !fs.existsSync(paths.spk)) missing.push(paths.spk);
  if (missing.length) {
    throw new Error(
      t("errors.modelsMissing", {
        list: missing.map((m) => `  - ${m}`).join("\n"),
        dir: paths.configDir,
      }),
    );
  }
}

/** Official download URLs (manual fallback). */
export const MODEL_DOWNLOADS = {
  vad: {
    name: "silero_vad.onnx",
    url: "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx",
    dest: "silero_vad.onnx",
    approx: "~630 KB",
  },
  senseVoice: {
    name: "SenseVoice int8 (zh/en/ja/ko/yue)",
    url: "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17.tar.bz2",
    dest: "sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17.tar.bz2",
    extractDir: "sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17",
    approx: "~156 MB (tar.bz2) → ~230 MB extracted",
  },
  spk: {
    name: "3dspeaker CAM++ (speaker embedding)",
    url: "https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/3dspeaker_speech_campplus_sv_zh_en_16k-common_advanced.onnx",
    dest: "3dspeaker_speech_campplus_sv_zh_en_16k-common_advanced.onnx",
    approx: "~27 MB",
  },
  pages: {
    asr: "https://github.com/k2-fsa/sherpa-onnx/releases/tag/asr-models",
    spk: "https://github.com/k2-fsa/sherpa-onnx/releases/tag/speaker-recongition-models",
  },
} as const;
