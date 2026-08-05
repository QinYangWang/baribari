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
import type { AsrEngine } from "./types.js";
import {
  DEFAULT_SPK_ENGINE,
  LEGACY_SPK_ENGINE,
  SPK_ENGINES,
  SPK_MODELS,
  isSpkEngine,
  spkModelPath,
  type SpkEngine,
} from "./speaker-models.js";

export type { SpkEngine };
export {
  DEFAULT_SPK_ENGINE,
  LEGACY_SPK_ENGINE,
  SPK_ENGINES,
  SPK_MODELS,
  isSpkEngine,
  spkModelPath,
};

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
export const FUNASR_NANO_DIR_NAME =
  "sherpa-onnx-funasr-nano-int8-2025-12-30";
export const REAZONSPEECH_DIR_NAME =
  "sherpa-onnx-zipformer-ja-reazonspeech-2024-08-01";

export interface ModelPathOverrides {
  /** Override root models directory. */
  modelsDir?: string;
  /** Absolute or relative (to configDir) paths for individual assets. */
  vad?: string;
  senseVoiceDir?: string;
  senseVoiceModel?: string;
  senseVoiceTokens?: string;
  funAsrNanoDir?: string;
  funAsrNanoEncoderAdaptor?: string;
  funAsrNanoLlm?: string;
  funAsrNanoEmbedding?: string;
  funAsrNanoTokenizer?: string;
  reazonSpeechDir?: string;
  reazonSpeechEncoder?: string;
  reazonSpeechDecoder?: string;
  reazonSpeechJoiner?: string;
  reazonSpeechTokens?: string;
  /** Absolute path override for the active speaker model file. */
  spk?: string;
  /** Per-engine speaker model path overrides. */
  spkCampplus?: string;
  spkEres2netLarge?: string;
}

export interface ResolvedModelPaths {
  configDir: string;
  modelsDir: string;
  vad: string;
  senseVoiceDir: string;
  senseVoiceModel: string;
  senseVoiceTokens: string;
  funAsrNanoDir: string;
  funAsrNanoEncoderAdaptor: string;
  funAsrNanoLlm: string;
  funAsrNanoEmbedding: string;
  funAsrNanoTokenizer: string;
  reazonSpeechDir: string;
  reazonSpeechEncoder: string;
  reazonSpeechDecoder: string;
  reazonSpeechJoiner: string;
  reazonSpeechTokens: string;
  /** Active speaker embedding model path (for selected spkEngine). */
  spk: string;
  /** Resolved path per speaker engine. */
  spkByEngine: Record<SpkEngine, string>;
  spkEngine: SpkEngine;
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
export function modelPaths(
  overrides: ModelPathOverrides = {},
  opts?: { spkEngine?: SpkEngine },
): ResolvedModelPaths {
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
  const funAsrNanoDir =
    resolveMaybe(overrides.funAsrNanoDir, cfg) ||
    path.join(modelsDir, FUNASR_NANO_DIR_NAME);
  const reazonSpeechDir =
    resolveMaybe(overrides.reazonSpeechDir, cfg) ||
    path.join(modelsDir, REAZONSPEECH_DIR_NAME);

  const vad =
    resolveMaybe(overrides.vad, cfg) || path.join(modelsDir, "silero_vad.onnx");
  const senseVoiceModel =
    resolveMaybe(overrides.senseVoiceModel, cfg) ||
    path.join(senseVoiceDir, "model.int8.onnx");
  const senseVoiceTokens =
    resolveMaybe(overrides.senseVoiceTokens, cfg) ||
    path.join(senseVoiceDir, "tokens.txt");

  const campplusDefault = spkModelPath(modelsDir, "campplus");
  const eresDefault = spkModelPath(modelsDir, "eres2net-large");
  const legacySpk = resolveMaybe(overrides.spk, cfg);
  const spkByEngine: Record<SpkEngine, string> = {
    campplus:
      resolveMaybe(overrides.spkCampplus, cfg) ||
      legacySpk ||
      campplusDefault,
    "eres2net-large":
      resolveMaybe(overrides.spkEres2netLarge, cfg) ||
      eresDefault,
  };
  const spkEngine = opts?.spkEngine ?? LEGACY_SPK_ENGINE;
  const spk = spkByEngine[spkEngine];

  const funAsrNanoEncoderAdaptor =
    resolveMaybe(overrides.funAsrNanoEncoderAdaptor, cfg) ||
    path.join(funAsrNanoDir, "encoder_adaptor.int8.onnx");
  const funAsrNanoLlm =
    resolveMaybe(overrides.funAsrNanoLlm, cfg) ||
    path.join(funAsrNanoDir, "llm.int8.onnx");
  const funAsrNanoEmbedding =
    resolveMaybe(overrides.funAsrNanoEmbedding, cfg) ||
    path.join(funAsrNanoDir, "embedding.int8.onnx");
  const funAsrNanoTokenizer =
    resolveMaybe(overrides.funAsrNanoTokenizer, cfg) ||
    path.join(funAsrNanoDir, "Qwen3-0.6B");
  const reazonSpeechEncoder =
    resolveMaybe(overrides.reazonSpeechEncoder, cfg) ||
    path.join(reazonSpeechDir, "encoder-epoch-99-avg-1.int8.onnx");
  const reazonSpeechDecoder =
    resolveMaybe(overrides.reazonSpeechDecoder, cfg) ||
    path.join(reazonSpeechDir, "decoder-epoch-99-avg-1.onnx");
  const reazonSpeechJoiner =
    resolveMaybe(overrides.reazonSpeechJoiner, cfg) ||
    path.join(reazonSpeechDir, "joiner-epoch-99-avg-1.int8.onnx");
  const reazonSpeechTokens =
    resolveMaybe(overrides.reazonSpeechTokens, cfg) ||
    path.join(reazonSpeechDir, "tokens.txt");

  return {
    configDir: cfg,
    modelsDir,
    vad,
    senseVoiceDir,
    senseVoiceModel,
    senseVoiceTokens,
    funAsrNanoDir,
    funAsrNanoEncoderAdaptor,
    funAsrNanoLlm,
    funAsrNanoEmbedding,
    funAsrNanoTokenizer,
    reazonSpeechDir,
    reazonSpeechEncoder,
    reazonSpeechDecoder,
    reazonSpeechJoiner,
    reazonSpeechTokens,
    spk,
    spkByEngine,
    spkEngine,
  };
}

/** Files required by the ReazonSpeech Japanese Zipformer transducer. */
export function reazonSpeechRequiredFiles(paths: ResolvedModelPaths): Array<{
  key: string;
  path: string;
  required: true;
}> {
  return [
    { key: "reazonSpeechEncoder", path: paths.reazonSpeechEncoder, required: true },
    { key: "reazonSpeechDecoder", path: paths.reazonSpeechDecoder, required: true },
    { key: "reazonSpeechJoiner", path: paths.reazonSpeechJoiner, required: true },
    { key: "reazonSpeechTokens", path: paths.reazonSpeechTokens, required: true },
  ];
}

function asrRequiredFiles(paths: ResolvedModelPaths, engine: AsrEngine) {
  if (engine === "funasr-nano") return funAsrNanoRequiredFiles(paths);
  if (engine === "reazonspeech-ja") return reazonSpeechRequiredFiles(paths);
  return [
    { key: "senseVoiceModel", path: paths.senseVoiceModel, required: true as const },
    { key: "senseVoiceTokens", path: paths.senseVoiceTokens, required: true as const },
  ];
}

export interface ModelCheckResult {
  ok: boolean;
  paths: ResolvedModelPaths;
  missing: { key: string; path: string; required: boolean }[];
}

/** Files required inside a complete Fun-ASR-Nano bundle. */
export function funAsrNanoRequiredFiles(paths: ResolvedModelPaths): Array<{
  key: string;
  path: string;
  required: true;
}> {
  return [
    { key: "funAsrNanoEncoderAdaptor", path: paths.funAsrNanoEncoderAdaptor, required: true },
    { key: "funAsrNanoLlm", path: paths.funAsrNanoLlm, required: true },
    { key: "funAsrNanoEmbedding", path: paths.funAsrNanoEmbedding, required: true },
    {
      key: "funAsrNanoTokenizerMerges",
      path: path.join(paths.funAsrNanoTokenizer, "merges.txt"),
      required: true,
    },
    {
      key: "funAsrNanoTokenizerJson",
      path: path.join(paths.funAsrNanoTokenizer, "tokenizer.json"),
      required: true,
    },
    {
      key: "funAsrNanoTokenizerVocab",
      path: path.join(paths.funAsrNanoTokenizer, "vocab.json"),
      required: true,
    },
  ];
}

export function checkModels(
  overrides: ModelPathOverrides = {},
  opts?: {
    requireSpk?: boolean;
    asrEngine?: AsrEngine;
    spkEngine?: SpkEngine;
  },
): ModelCheckResult {
  const spkEngine = opts?.spkEngine;
  const paths = modelPaths(overrides, spkEngine ? { spkEngine } : undefined);
  const requireSpk = opts?.requireSpk !== false;
  const missing: ModelCheckResult["missing"] = [];
  const asrEngine = opts?.asrEngine ?? "sensevoice";
  const asr = asrRequiredFiles(paths, asrEngine);
  const spkPath = spkEngine
    ? paths.spkByEngine[spkEngine] || paths.spk
    : paths.spk;
  const need = [
    { key: "vad", path: paths.vad, required: true },
    ...asr,
    { key: "spk", path: spkPath, required: requireSpk },
  ];
  for (const n of need) {
    if (n.required && !fs.existsSync(n.path)) missing.push(n);
  }
  return { ok: missing.length === 0, paths, missing };
}

export function assertModelsExist(
  paths: ResolvedModelPaths,
  opts?: {
    requireSpk?: boolean;
    asrEngine?: AsrEngine;
    spkEngine?: SpkEngine;
  },
): void {
  const requireSpk = opts?.requireSpk !== false;
  const missing: string[] = [];
  const asr = asrRequiredFiles(paths, opts?.asrEngine ?? "sensevoice")
    .map((item) => item.path);
  for (const p of [paths.vad, ...asr]) {
    if (!fs.existsSync(p)) missing.push(p);
  }
  const spkPath = opts?.spkEngine
    ? paths.spkByEngine[opts.spkEngine] || paths.spk
    : paths.spk;
  if (requireSpk && !fs.existsSync(spkPath)) missing.push(spkPath);
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
  funAsrNano: {
    name: "Fun-ASR-Nano int8 (zh/en/ja)",
    url: "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-funasr-nano-int8-2025-12-30.tar.bz2",
    dest: "sherpa-onnx-funasr-nano-int8-2025-12-30.tar.bz2",
    extractDir: FUNASR_NANO_DIR_NAME,
    approx: "~948 MB extracted",
  },
  reazonSpeech: {
    name: "ReazonSpeech Japanese (int8/fp32)",
    dir: REAZONSPEECH_DIR_NAME,
    approx: "~162 MB",
    files: [
      {
        name: "encoder-epoch-99-avg-1.int8.onnx",
        url: "https://huggingface.co/reazon-research/reazonspeech-k2-v2/resolve/main/encoder-epoch-99-avg-1.int8.onnx",
        bytes: 154_670_139,
      },
      {
        name: "decoder-epoch-99-avg-1.onnx",
        url: "https://huggingface.co/reazon-research/reazonspeech-k2-v2/resolve/main/decoder-epoch-99-avg-1.onnx",
        bytes: 11_767_836,
      },
      {
        name: "joiner-epoch-99-avg-1.int8.onnx",
        url: "https://huggingface.co/reazon-research/reazonspeech-k2-v2/resolve/main/joiner-epoch-99-avg-1.int8.onnx",
        bytes: 2_696_970,
      },
      {
        name: "tokens.txt",
        url: "https://huggingface.co/reazon-research/reazonspeech-k2-v2/resolve/main/tokens.txt",
        bytes: 45_754,
      },
    ],
  },
  spk: {
    name: SPK_MODELS.campplus.name,
    url: SPK_MODELS.campplus.url,
    dest: SPK_MODELS.campplus.fileName,
    approx: SPK_MODELS.campplus.approx,
  },
  spkCampplus: {
    id: "campplus" as const,
    name: `${SPK_MODELS.campplus.name} (speaker embedding)`,
    url: SPK_MODELS.campplus.url,
    dest: SPK_MODELS.campplus.fileName,
    approx: SPK_MODELS.campplus.approx,
  },
  spkEres2netLarge: {
    id: "eres2net-large" as const,
    name: `${SPK_MODELS["eres2net-large"].name} (speaker embedding, recommended)`,
    url: SPK_MODELS["eres2net-large"].url,
    dest: SPK_MODELS["eres2net-large"].fileName,
    approx: SPK_MODELS["eres2net-large"].approx,
  },
  pages: {
    asr: "https://github.com/k2-fsa/sherpa-onnx/releases/tag/asr-models",
    spk: "https://github.com/k2-fsa/sherpa-onnx/releases/tag/speaker-recongition-models",
  },
} as const;

/** Download metadata for a speaker engine. */
export function spkDownloadInfo(engine: SpkEngine) {
  return engine === "eres2net-large"
    ? MODEL_DOWNLOADS.spkEres2netLarge
    : MODEL_DOWNLOADS.spkCampplus;
}
