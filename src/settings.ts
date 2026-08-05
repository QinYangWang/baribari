/**
 * Persist user settings under ~/.config/baribari/config.json
 * (BARIBARI_CONFIG_DIR overrides the base dir).
 * CLI flags always override saved values.
 * API keys prefer env BARIBARI_AI_KEY / OPENAI_API_KEY.
 */

import fs from "node:fs";
import path from "node:path";
import {
  configDir,
  ensureConfigDir,
  type ModelPathOverrides,
} from "./paths.js";
import type {
  AiConfig,
  AsrEngine,
  AudioSource,
  Lang,
  ShareConfig,
  SpeakerTurnConfig,
  TranslateLang,
  UiLang,
  VadConfig,
} from "./types.js";
import {
  DEFAULT_AI,
  DEFAULT_ASR_ENGINE,
  DEFAULT_SHARE,
  DEFAULT_SPEAKER_TURN,
  DEFAULT_VAD,
} from "./types.js";
import { isUiLang } from "./i18n/index.js";

/** Default recordings dir: ~/.config/baribari/recordings */
export function defaultRecordDir(): string {
  return path.join(configDir(), "recordings");
}

/** @deprecated use defaultRecordDir() — kept for import sites that expect a string constant */
export const DEFAULT_RECORD_DIR = "recordings";

export interface SavedSettings {
  lang?: Lang;
  asrEngine?: AsrEngine;
  /** UI language: zh | ja | en */
  uiLang?: UiLang;
  source?: AudioSource;
  device?: string | number;
  noSpk?: boolean;
  spkThreshold?: number;
  output?: string;
  recordDir?: string;
  /** Override models root (absolute or relative to configDir). */
  modelsDir?: string;
  /** Per-file model path overrides. */
  models?: ModelPathOverrides;
  ai?: Partial<AiConfig>;
  share?: Partial<ShareConfig>;
  vad?: Partial<VadConfig>;
  /** Same-speaker turn merge after VAD (before AI). */
  speakerTurn?: Partial<SpeakerTurnConfig>;
}

const LANGS: Lang[] = ["auto", "zh", "en", "ja", "ko", "yue"];
const ASR_ENGINES: AsrEngine[] = ["sensevoice", "funasr-nano", "reazonspeech-ja"];
const SOURCES: AudioSource[] = ["mic", "loopback", "both"];
const TRANSLATE: TranslateLang[] = [
  "",
  "zh",
  "en",
  "ja",
  "ko",
  "yue",
  "fr",
  "de",
  "es",
  "ru",
  "vi",
  "th",
  "id",
  "pt",
];

export function configPath(): string {
  return path.join(configDir(), "config.json");
}

function isLang(v: unknown): v is Lang {
  return typeof v === "string" && (LANGS as string[]).includes(v);
}
function isAsrEngine(v: unknown): v is AsrEngine {
  return typeof v === "string" && (ASR_ENGINES as string[]).includes(v);
}

function isSource(v: unknown): v is AudioSource {
  return typeof v === "string" && (SOURCES as string[]).includes(v);
}

function isTranslate(v: unknown): v is TranslateLang {
  return typeof v === "string" && (TRANSLATE as string[]).includes(v);
}

export function normalizeRecordDir(v: string): string {
  const t = v.trim().replace(/\\/g, "/");
  if (!t || t === "./recordings" || t === "recordings") {
    return defaultRecordDir();
  }
  if (path.isAbsolute(t) || /^[A-Za-z]:[\\/]/.test(t)) {
    return t.replace(/\/+$/, "") || defaultRecordDir();
  }
  // relative → under configDir
  return path.resolve(configDir(), t.replace(/\/+$/, "") || "recordings");
}

function num(
  v: unknown,
  min: number,
  max: number,
): number | undefined {
  if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
  return Math.min(max, Math.max(min, v));
}

function parseAi(raw: unknown): Partial<AiConfig> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const out: Partial<AiConfig> = {};
  if (typeof r.enabled === "boolean") out.enabled = r.enabled;
  if (typeof r.correct === "boolean") out.correct = r.correct;
  if (isTranslate(r.translateTo)) out.translateTo = r.translateTo;
  if (typeof r.baseUrl === "string" && r.baseUrl.trim()) {
    out.baseUrl = r.baseUrl.trim().replace(/\/+$/, "");
  }
  if (typeof r.apiKey === "string") out.apiKey = r.apiKey;
  if (typeof r.model === "string" && r.model.trim()) out.model = r.model.trim();
  return out;
}

function parseShare(raw: unknown): Partial<ShareConfig> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const out: Partial<ShareConfig> = {};
  if (typeof r.enabled === "boolean") out.enabled = r.enabled;
  const port = num(r.port, 1024, 65535);
  if (port !== undefined) out.port = Math.floor(port);
  if (typeof r.host === "string" && r.host.trim()) {
    out.host = r.host.trim();
  }
  return out;
}

function parseVad(raw: unknown): Partial<VadConfig> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const out: Partial<VadConfig> = {};
  const th = num(r.threshold, 0.05, 0.95);
  if (th !== undefined) out.threshold = Math.round(th * 100) / 100;
  const ms = num(r.minSpeechDuration, 0.1, 5);
  if (ms !== undefined) out.minSpeechDuration = Math.round(ms * 100) / 100;
  const sil = num(r.minSilenceDuration, 0.1, 5);
  if (sil !== undefined) out.minSilenceDuration = Math.round(sil * 100) / 100;
  const max = num(r.maxSpeechDuration, 2, 120);
  if (max !== undefined) out.maxSpeechDuration = Math.round(max * 10) / 10;
  if (typeof r.windowSize === "number" && Number.isFinite(r.windowSize)) {
    const w = Math.floor(r.windowSize);
    if (w === 256 || w === 512 || w === 1024 || w === 768) out.windowSize = w;
  }
  return Object.keys(out).length ? out : undefined;
}

function parseModels(raw: unknown): ModelPathOverrides | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const out: ModelPathOverrides = {};
  for (const k of [
    "modelsDir",
    "vad",
    "senseVoiceDir",
    "senseVoiceModel",
    "senseVoiceTokens",
    "funAsrNanoDir",
    "funAsrNanoEncoderAdaptor",
    "funAsrNanoLlm",
    "funAsrNanoEmbedding",
    "funAsrNanoTokenizer",
    "reazonSpeechDir",
    "reazonSpeechEncoder",
    "reazonSpeechDecoder",
    "reazonSpeechJoiner",
    "reazonSpeechTokens",
    "spk",
  ] as const) {
    if (typeof r[k] === "string" && (r[k] as string).trim()) {
      out[k] = (r[k] as string).trim();
    }
  }
  return Object.keys(out).length ? out : undefined;
}

/** Migrate legacy project-root baribari.config.json once. */
function migrateLegacyConfig(): void {
  try {
    const legacy = path.join(process.cwd(), "baribari.config.json");
    const dest = configPath();
    if (fs.existsSync(dest) || !fs.existsSync(legacy)) return;
    ensureConfigDir();
    fs.copyFileSync(legacy, dest);
  } catch {
    /* ignore */
  }
}

export function loadSettings(): SavedSettings {
  migrateLegacyConfig();
  ensureConfigDir();
  const file = configPath();
  try {
    if (!fs.existsSync(file)) return {};
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Record<
      string,
      unknown
    >;
    const out: SavedSettings = {};
    if (isLang(raw.lang)) out.lang = raw.lang;
    if (isAsrEngine(raw.asrEngine)) out.asrEngine = raw.asrEngine;
    if (isUiLang(raw.uiLang)) out.uiLang = raw.uiLang;
    if (isSource(raw.source)) {
      if (process.platform !== "win32" && raw.source !== "mic") {
        out.source = "mic";
      } else {
        out.source = raw.source;
      }
    }
    if (typeof raw.device === "string" || typeof raw.device === "number") {
      out.device = raw.device;
    }
    if (typeof raw.noSpk === "boolean") out.noSpk = raw.noSpk;
    if (
      typeof raw.spkThreshold === "number" &&
      Number.isFinite(raw.spkThreshold)
    ) {
      out.spkThreshold = Math.min(0.95, Math.max(0.2, raw.spkThreshold));
    }
    if (typeof raw.output === "string" && raw.output.trim()) {
      out.output = raw.output.trim();
    }
    if (typeof raw.recordDir === "string" && raw.recordDir.trim()) {
      out.recordDir = normalizeRecordDir(raw.recordDir);
    }
    if (typeof raw.modelsDir === "string" && raw.modelsDir.trim()) {
      out.modelsDir = raw.modelsDir.trim();
    }
    const models = parseModels(raw.models);
    if (models) out.models = models;
    // hoist top-level modelsDir into models
    if (out.modelsDir && !out.models?.modelsDir) {
      out.models = { ...out.models, modelsDir: out.modelsDir };
    }
    const ai = parseAi(raw.ai);
    if (ai) out.ai = ai;
    const share = parseShare(raw.share);
    if (share) out.share = share;
    const vad = parseVad(raw.vad);
    if (vad) out.vad = vad;
    return out;
  } catch {
    return {};
  }
}

export function modelOverridesFromSettings(
  s: SavedSettings = loadSettings(),
): ModelPathOverrides {
  return {
    modelsDir: s.modelsDir || s.models?.modelsDir,
    vad: s.models?.vad,
    senseVoiceDir: s.models?.senseVoiceDir,
    senseVoiceModel: s.models?.senseVoiceModel,
    senseVoiceTokens: s.models?.senseVoiceTokens,
    funAsrNanoDir: s.models?.funAsrNanoDir,
    funAsrNanoEncoderAdaptor: s.models?.funAsrNanoEncoderAdaptor,
    funAsrNanoLlm: s.models?.funAsrNanoLlm,
    funAsrNanoEmbedding: s.models?.funAsrNanoEmbedding,
    funAsrNanoTokenizer: s.models?.funAsrNanoTokenizer,
    reazonSpeechDir: s.models?.reazonSpeechDir,
    reazonSpeechEncoder: s.models?.reazonSpeechEncoder,
    reazonSpeechDecoder: s.models?.reazonSpeechDecoder,
    reazonSpeechJoiner: s.models?.reazonSpeechJoiner,
    reazonSpeechTokens: s.models?.reazonSpeechTokens,
    spk: s.models?.spk,
  };
}

export function mergeAi(partial?: Partial<AiConfig>): AiConfig {
  return {
    ...DEFAULT_AI,
    ...partial,
    baseUrl: (partial?.baseUrl || DEFAULT_AI.baseUrl).replace(/\/+$/, ""),
    apiKey: partial?.apiKey ?? DEFAULT_AI.apiKey,
    model: partial?.model || DEFAULT_AI.model,
  };
}

export function mergeShare(partial?: Partial<ShareConfig>): ShareConfig {
  return {
    ...DEFAULT_SHARE,
    ...partial,
    port: partial?.port ?? DEFAULT_SHARE.port,
    host: (partial?.host || DEFAULT_SHARE.host).trim() || DEFAULT_SHARE.host,
  };
}

export function mergeVad(partial?: Partial<VadConfig>): VadConfig {
  const m = { ...DEFAULT_VAD, ...partial };
  m.threshold = Math.min(0.95, Math.max(0.05, m.threshold));
  m.minSpeechDuration = Math.min(5, Math.max(0.1, m.minSpeechDuration));
  m.minSilenceDuration = Math.min(5, Math.max(0.1, m.minSilenceDuration));
  m.maxSpeechDuration = Math.min(120, Math.max(2, m.maxSpeechDuration));
  if (![256, 512, 768, 1024].includes(m.windowSize)) m.windowSize = 512;
  return m;
}

export function mergeSpeakerTurn(
  partial?: Partial<SpeakerTurnConfig>,
): SpeakerTurnConfig {
  const m = { ...DEFAULT_SPEAKER_TURN, ...partial };
  m.maxGapSec = Math.min(5, Math.max(0.15, m.maxGapSec));
  m.maxTurnSec = Math.min(120, Math.max(2, m.maxTurnSec));
  // Idle must stay long enough that AI waits for merge, not each VAD piece
  m.idleMs = Math.min(15000, Math.max(2500, Math.round(m.idleMs)));
  m.maxChunks = Math.min(20, Math.max(1, Math.round(m.maxChunks || 3)));
  m.enabled = Boolean(m.enabled);
  return m;
}

export function saveSettings(partial: SavedSettings): void {
  ensureConfigDir();
  const file = configPath();
  const prev = loadSettings();
  const next: SavedSettings = {
    ...prev,
    ...partial,
    ai: partial.ai ? { ...prev.ai, ...partial.ai } : prev.ai,
    share: partial.share ? { ...prev.share, ...partial.share } : prev.share,
    vad: partial.vad ? { ...prev.vad, ...partial.vad } : prev.vad,
    speakerTurn: partial.speakerTurn
      ? { ...prev.speakerTurn, ...partial.speakerTurn }
      : prev.speakerTurn,
    models: partial.models ? { ...prev.models, ...partial.models } : prev.models,
  };

  const clean: Record<string, unknown> = {};
  if (next.lang !== undefined) clean.lang = next.lang;
  clean.asrEngine = next.asrEngine ?? DEFAULT_ASR_ENGINE;
  if (next.uiLang !== undefined) clean.uiLang = next.uiLang;
  if (next.source !== undefined) clean.source = next.source;
  if (next.device !== undefined) clean.device = next.device;
  if (next.noSpk !== undefined) clean.noSpk = next.noSpk;
  if (next.spkThreshold !== undefined) clean.spkThreshold = next.spkThreshold;
  if (next.output !== undefined) clean.output = next.output;
  if (next.recordDir !== undefined) {
    clean.recordDir = normalizeRecordDir(String(next.recordDir));
  }
  if (next.modelsDir !== undefined) clean.modelsDir = next.modelsDir;
  if (next.models && Object.keys(next.models).length) {
    clean.models = { ...next.models };
  }
  if (next.ai) {
    clean.ai = {
      enabled: next.ai.enabled ?? DEFAULT_AI.enabled,
      correct: next.ai.correct ?? DEFAULT_AI.correct,
      translateTo: next.ai.translateTo ?? DEFAULT_AI.translateTo,
      baseUrl: next.ai.baseUrl ?? DEFAULT_AI.baseUrl,
      model: next.ai.model ?? DEFAULT_AI.model,
      ...(next.ai.apiKey ? { apiKey: next.ai.apiKey } : {}),
    };
  }
  if (next.share) {
    clean.share = {
      enabled: next.share.enabled ?? DEFAULT_SHARE.enabled,
      port: next.share.port ?? DEFAULT_SHARE.port,
      host: next.share.host ?? DEFAULT_SHARE.host,
    };
  }
  if (next.vad) {
    const v = mergeVad(next.vad);
    clean.vad = {
      threshold: v.threshold,
      minSpeechDuration: v.minSpeechDuration,
      minSilenceDuration: v.minSilenceDuration,
      maxSpeechDuration: v.maxSpeechDuration,
      windowSize: v.windowSize,
    };
  }
  if (next.speakerTurn) {
    const st = mergeSpeakerTurn(next.speakerTurn);
    clean.speakerTurn = {
      enabled: st.enabled,
      maxGapSec: st.maxGapSec,
      maxTurnSec: st.maxTurnSec,
      idleMs: st.idleMs,
      maxChunks: st.maxChunks,
    };
  }

  fs.writeFileSync(file, JSON.stringify(clean, null, 2) + "\n", "utf8");
}

export function snapshotFromArgs(args: {
  lang: Lang;
  asrEngine: AsrEngine;
  uiLang?: UiLang;
  source: AudioSource;
  device?: string | number;
  noSpk: boolean;
  spkThreshold: number;
  output?: string;
  recordDir?: string;
  ai?: AiConfig;
  share?: ShareConfig;
  vad?: VadConfig;
  speakerTurn?: SpeakerTurnConfig;
}): SavedSettings {
  const prev = loadSettings();
  return {
    lang: args.lang,
    asrEngine: args.asrEngine,
    uiLang: args.uiLang,
    source: args.source,
    device: args.device,
    noSpk: args.noSpk,
    spkThreshold: args.spkThreshold,
    output: args.output,
    recordDir: args.recordDir
      ? normalizeRecordDir(args.recordDir)
      : defaultRecordDir(),
    modelsDir: prev.modelsDir,
    models: prev.models,
    ai: args.ai
      ? {
          enabled: args.ai.enabled,
          correct: args.ai.correct,
          translateTo: args.ai.translateTo,
          baseUrl: args.ai.baseUrl,
          model: args.ai.model,
          apiKey: args.ai.apiKey,
        }
      : undefined,
    share: args.share
      ? {
          enabled: args.share.enabled,
          port: args.share.port,
          host: args.share.host,
        }
      : undefined,
    vad: args.vad ? { ...args.vad } : undefined,
    speakerTurn: args.speakerTurn ? { ...args.speakerTurn } : undefined,
  };
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

export function scheduleSaveSettings(
  getSnapshot: () => SavedSettings,
  delayMs = 200,
): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveSettings(getSnapshot());
  }, delayMs);
}

export function flushSaveSettings(getSnapshot: () => SavedSettings): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  saveSettings(getSnapshot());
}
