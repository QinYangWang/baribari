import type { SpkEngine } from "./speaker-models.js";
export type { SpkEngine } from "./speaker-models.js";
export {
  DEFAULT_SPK_ENGINE,
  LEGACY_SPK_ENGINE,
  SPK_ENGINES,
  defaultSpkThreshold,
  isSpkEngine,
  spkEngineLabel,
} from "./speaker-models.js";

export type Lang = "auto" | "zh" | "en" | "ja" | "ko" | "yue";

/** Local speech-recognition backend. */
export type AsrEngine = "sensevoice" | "funasr-nano" | "reazonspeech-ja";
export const DEFAULT_ASR_ENGINE: AsrEngine = "sensevoice";

/** UI display language (separate from ASR `lang`). */
export type UiLang = "zh" | "ja" | "en";

/** Audio capture source. */
export type AudioSource = "mic" | "loopback" | "both";

/** Target language for AI translation (empty = no translate). */
export type TranslateLang =
  | ""
  | "zh"
  | "en"
  | "ja"
  | "ko"
  | "yue"
  | "fr"
  | "de"
  | "es"
  | "ru"
  | "pt"
  | "vi"
  | "th"
  | "id";

export interface AiConfig {
  enabled: boolean;
  /** Correct ASR errors with LLM. */
  correct: boolean;
  /** Translate into this language; empty disables. */
  translateTo: TranslateLang;
  /** OpenAI-compatible base URL, e.g. https://api.openai.com/v1 */
  baseUrl: string;
  /** API key (also readable from BARIBARI_AI_KEY / OPENAI_API_KEY). */
  apiKey: string;
  /** Chat model id. */
  model: string;
}

/**
 * Built-in OpenAI-compatible providers (←→ in settings).
 * Gemini uses Google's official OpenAI-compat endpoint — no extra SDK required.
 */
export interface AiProviderPreset {
  id: string;
  /** Display name (English; UI may i18n by id). */
  name: string;
  baseUrl: string;
  /** Suggested default model for this endpoint. */
  model: string;
  /** Optional hint for key env / console. */
  keyHint?: string;
}

export const AI_PROVIDER_PRESETS: AiProviderPreset[] = [
  {
    id: "openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    keyHint: "OPENAI_API_KEY / BARIBARI_AI_KEY",
  },
  {
    id: "gemini",
    name: "Google Gemini",
    // Official OpenAI-compatible API (AI Studio / Gemini API key)
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "gemini-2.0-flash",
    keyHint: "Google AI Studio API key",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
    keyHint: "DeepSeek API key",
  },
  {
    id: "groq",
    name: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    model: "llama-3.3-70b-versatile",
    keyHint: "Groq API key",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "google/gemini-2.0-flash-001",
    keyHint: "OpenRouter API key",
  },
  {
    id: "ollama",
    name: "Ollama (local)",
    baseUrl: "http://127.0.0.1:11434/v1",
    model: "qwen2.5:7b",
    keyHint: "any non-empty key if required (e.g. ollama)",
  },
  {
    id: "custom",
    name: "Custom",
    baseUrl: "",
    model: "",
    keyHint: "Edit BASE_URL + model manually",
  },
];

/** Match preset by baseUrl (host); falls back to custom. */
export function matchAiProvider(baseUrl: string): AiProviderPreset {
  const n = (baseUrl || "").replace(/\/+$/, "").toLowerCase();
  if (!n) return AI_PROVIDER_PRESETS.find((p) => p.id === "custom")!;
  for (const p of AI_PROVIDER_PRESETS) {
    if (p.id === "custom" || !p.baseUrl) continue;
    const pb = p.baseUrl.replace(/\/+$/, "").toLowerCase();
    if (n === pb || n.startsWith(pb + "/") || pb.startsWith(n)) return p;
    // host-only match
    try {
      const h1 = new URL(n.includes("://") ? n : `https://${n}`).host;
      const h2 = new URL(pb).host;
      if (h1 && h1 === h2) return p;
    } catch {
      /* ignore */
    }
  }
  return AI_PROVIDER_PRESETS.find((p) => p.id === "custom")!;
}

export interface ShareConfig {
  /** Host: broadcast segments on LAN. */
  enabled: boolean;
  port: number;
  /** Bind / advertise host (display + future bind). Default 0.0.0.0 */
  host: string;
}

/**
 * Silero VAD endpointing — how raw audio is split into ASR chunks.
 * Not a fixed time window: speech ends when silence lasts minSilenceDuration.
 */
export interface VadConfig {
  /**
   * Speech probability threshold 0~1.
   * Lower = more sensitive (more false speech); higher = stricter.
   * Default 0.5.
   */
  threshold: number;
  /**
   * Minimum speech length in seconds; shorter blobs are discarded.
   * Default 0.4.
   */
  minSpeechDuration: number;
  /**
   * Silence duration (seconds) that ends a speech segment → send to ASR.
   * Smaller = snappier/choppier; larger = longer phrases.
   * Default 0.6.
   */
  minSilenceDuration: number;
  /**
   * Hard cap on one segment length (seconds); force-flush if still talking.
   * Default 30.
   */
  maxSpeechDuration: number;
  /**
   * VAD analysis frame size in samples @ 16 kHz.
   * 512 ≈ 32 ms. Usually leave at 512 (Silero default).
   */
  windowSize: number;
}

/**
 * Merge short VAD/ASR finals from the same speaker into one turn.
 * AI correct/translate runs when the turn commits (idle / speaker change).
 */
export interface SpeakerTurnConfig {
  /**
   * Master switch (default true).
   * Works with speaker ID (preferred) or gap-only when spk is null / --no-spk.
   */
  enabled: boolean;
  /** Max gap (sec) between same-speaker chunks still merged. Default 1.4. */
  maxGapSec: number;
  /** Force-commit open turn after this length (sec). Default 24. */
  maxTurnSec: number;
  /**
   * Wall-clock quiet after last chunk before commit+AI (ms). Default 4000.
   * Must exceed typical ASR latency so mid-utterance chunks stay draft-only.
   * No reopen after commit — next speech starts a new turn.
   */
  idleMs: number;
  /**
   * Max VAD/ASR chunks (≈ short sentences) merged into one turn before commit.
   * After this many pieces, merge is considered done → one AI translate. Default 3.
   */
  maxChunks: number;
}

export const DEFAULT_SPEAKER_TURN: SpeakerTurnConfig = {
  enabled: true,
  maxGapSec: 1.4,
  maxTurnSec: 24,
  idleMs: 4000,
  maxChunks: 3,
};

export interface TranscribeArgs {
  lang: Lang;
  /** Runtime-mutable ASR backend; the recognizer reloads between segments. */
  asrEngine: AsrEngine;
  /** TUI/CLI UI language (zh|ja|en). Independent of ASR lang. */
  uiLang: UiLang;
  /** Device index (from --list-devices) or deviceId/name string. Mic only. */
  device?: string | number;
  /**
   * Capture source:
   * - mic: microphone only
   * - loopback: system speaker (WASAPI, Windows)
   * - both: mix mic + loopback (Windows)
   */
  source: AudioSource;
  output?: string;
  noSpk: boolean;
  /** Active speaker embedding model (CAM++ / ERes2Net-large). */
  spkEngine: SpkEngine;
  spkThreshold: number;
  noTui: boolean;
  /**
   * Default directory for session recordings (r toggle).
   * Persisted; default `./recordings`.
   */
  recordDir: string;
  /**
   * Runtime-mutable recording path (no extension or .wav).
   * Set/clear while running to start/stop wav capture (Python parity).
   * Not persisted.
   */
  record?: string;
  /** Runtime pause flag shared with UI / CLI handlers. */
  paused: { value: boolean };
  ai: AiConfig;
  share: ShareConfig;
  /** VAD endpointing / chunking. */
  vad: VadConfig;
  /** Same-speaker turn merge (after VAD; before AI). */
  speakerTurn: SpeakerTurnConfig;
  /**
   * Called once when speaker tracker is ready (global roster seeded).
   * Used by TUI/session to resolve names and promote renames to the roster.
   */
  onSpeakerTracker?: (
    tracker: import("./speaker-tracker.js").SherpaSpeakerTracker,
  ) => void;
}

/**
 * Live transcript event kind.
 * - `partial`: refreshable “current utterance” line (not persisted / not shared by default)
 * - `final`: committed segment (history, session jsonl, LAN share, AI)
 * Omitted `kind` is treated as `final` for backward compatibility.
 */
export type SegmentKind = "partial" | "final";

export interface Segment {
  /** Stable id for UI updates (ASR → AI enhance). */
  id?: string;
  /**
   * Event kind. Defaults to `final` when omitted.
   * Partials replace the previous live line; finals append to history.
   */
  kind?: SegmentKind;
  start: number;
  /** May be missing/open for partials (still decoding). */
  end?: number;
  wall: Date;
  spk: number | null;
  /** Raw ASR text (never replaced by translation). */
  text: string;
  /** AI-corrected text in the same language as ASR (optional). */
  corrected?: string;
  /** AI translation (optional). */
  translation?: string;
  /** ISO wall time for JSON wire format. */
  wallIso?: string;
  /** True while AI enhancement is still running (finals only). */
  pending?: boolean;
  /**
   * Same-speaker turn still open (text may grow). UI/session may upsert;
   * skip LAN share, AI, and append-only transcript files until commit.
   */
  draft?: boolean;
}

/** True when the segment is a committed final (or legacy emit without kind). */
export function isFinalSegment(seg: Segment): boolean {
  return seg.kind !== "partial";
}

/** True when the segment is a refreshable live/partial line. */
export function isPartialSegment(seg: Segment): boolean {
  return seg.kind === "partial";
}

export type EmitFn = (seg: Segment) => void;
export type StatusFn = (msg: string) => void;

export const DEFAULT_AI: AiConfig = {
  enabled: false,
  correct: true,
  translateTo: "",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-4o-mini",
};

export const DEFAULT_SHARE: ShareConfig = {
  enabled: false,
  port: 8787,
  host: "0.0.0.0",
};

/** Default VAD endpointing parameters. */
export const DEFAULT_VAD: VadConfig = {
  threshold: 0.5,
  minSpeechDuration: 0.4,
  minSilenceDuration: 0.6,
  maxSpeechDuration: 30,
  windowSize: 512,
};

/**
 * Named VAD presets for TUI ←→ (and docs).
 * Users can still fine-tune individual fields after picking a preset.
 */
export type VadPresetId =
  | "balanced"
  | "meeting"
  | "lowLatency"
  | "smooth"
  | "aggressive"
  | "custom";

export interface VadPreset {
  id: Exclude<VadPresetId, "custom">;
  /** English name; UI uses i18n by id. */
  name: string;
  /** One-line English hint. */
  hint: string;
  vad: VadConfig;
}

export const VAD_PRESETS: VadPreset[] = [
  {
    id: "balanced",
    name: "Balanced",
    hint: "Default-like; fewer cuts, longer phrases",
    // Keep in sync with DEFAULT_VAD so stock config shows as Balanced
    vad: {
      threshold: 0.5,
      minSpeechDuration: 0.4,
      minSilenceDuration: 0.6,
      maxSpeechDuration: 30,
      windowSize: 512,
    },
  },
  {
    id: "meeting",
    name: "Meeting",
    hint: "Multi-speaker turn-taking (recommended)",
    vad: {
      threshold: 0.55,
      minSpeechDuration: 0.28,
      minSilenceDuration: 0.32,
      maxSpeechDuration: 9,
      windowSize: 512,
    },
  },
  {
    id: "lowLatency",
    name: "Low latency",
    hint: "Faster final subtitles; tuned for the selected ASR model",
    vad: {
      threshold: 0.55,
      minSpeechDuration: 0.3,
      minSilenceDuration: 0.22,
      maxSpeechDuration: 8,
      windowSize: 512,
    },
  },
  {
    id: "smooth",
    name: "Smooth",
    hint: "Fewer fragments; better punctuation feel",
    vad: {
      threshold: 0.53,
      minSpeechDuration: 0.3,
      minSilenceDuration: 0.4,
      maxSpeechDuration: 12,
      windowSize: 512,
    },
  },
  {
    id: "aggressive",
    name: "Aggressive",
    hint: "Short cuts; rely on same-speaker merge",
    vad: {
      threshold: 0.58,
      minSpeechDuration: 0.25,
      minSilenceDuration: 0.25,
      maxSpeechDuration: 6,
      windowSize: 512,
    },
  },
];

/** Model-aware VAD parameters for the low-latency preset. */
export function lowLatencyVad(asrEngine: AsrEngine): VadConfig {
  return asrEngine === "funasr-nano"
    ? {
        threshold: 0.53,
        minSpeechDuration: 0.4,
        minSilenceDuration: 0.28,
        maxSpeechDuration: 12,
        windowSize: 512,
      }
    : {
        threshold: 0.55,
        minSpeechDuration: 0.3,
        minSilenceDuration: 0.22,
        maxSpeechDuration: 8,
        windowSize: 512,
      };
}

function vadClose(a: number, b: number, eps = 0.02): boolean {
  return Math.abs(a - b) <= eps;
}

/** Match current VAD to a preset, or "custom" if fine-tuned. */
export function matchVadPreset(
  v: VadConfig,
  asrEngine: AsrEngine = DEFAULT_ASR_ENGINE,
): VadPresetId {
  const low = lowLatencyVad(asrEngine);
  if (
    vadClose(v.threshold, low.threshold) &&
    vadClose(v.minSpeechDuration, low.minSpeechDuration) &&
    vadClose(v.minSilenceDuration, low.minSilenceDuration) &&
    Math.abs(v.maxSpeechDuration - low.maxSpeechDuration) <= 0.5 &&
    v.windowSize === low.windowSize
  ) return "lowLatency";
  for (const p of VAD_PRESETS) {
    if (p.id === "lowLatency") continue;
    const x = p.vad;
    if (
      vadClose(v.threshold, x.threshold) &&
      vadClose(v.minSpeechDuration, x.minSpeechDuration) &&
      vadClose(v.minSilenceDuration, x.minSilenceDuration) &&
      Math.abs(v.maxSpeechDuration - x.maxSpeechDuration) <= 0.5 &&
      v.windowSize === x.windowSize
    ) {
      return p.id;
    }
  }
  return "custom";
}

export function applyVadPreset(
  id: Exclude<VadPresetId, "custom">,
  asrEngine: AsrEngine = DEFAULT_ASR_ENGINE,
): VadConfig {
  if (id === "lowLatency") return lowLatencyVad(asrEngine);
  const p = VAD_PRESETS.find((x) => x.id === id);
  return { ...(p?.vad ?? DEFAULT_VAD) };
}

/**
 * Cycle named VAD presets (←→ in settings).
 * Fine-tuned values show as "custom" until a named preset is applied.
 */
export function cycleVadPreset(
  current: VadConfig,
  dir: 1 | -1,
  asrEngine: AsrEngine = DEFAULT_ASR_ENGINE,
): { id: Exclude<VadPresetId, "custom">; vad: VadConfig } {
  const ids = VAD_PRESETS.map((p) => p.id);
  const cur = matchVadPreset(current, asrEngine);
  let i = cur === "custom" ? -1 : ids.indexOf(cur as Exclude<VadPresetId, "custom">);
  // From custom: → first preset, ← last preset
  if (i < 0) i = dir > 0 ? -1 : 0;
  const next = ids[(i + dir + ids.length) % ids.length]!;
  return { id: next, vad: applyVadPreset(next, asrEngine) };
}

/** Human-readable help for TUI / docs. */
export const VAD_FIELD_HELP: Record<
  keyof VadConfig,
  { label: string; help: string; unit: string }
> = {
  threshold: { label: "VAD threshold", help: "Speech probability sensitivity", unit: "" },
  minSpeechDuration: { label: "Min speech", help: "Drop segments shorter than this", unit: "s" },
  minSilenceDuration: { label: "Silence split", help: "Silence duration to end a segment", unit: "s" },
  maxSpeechDuration: { label: "Max speech", help: "Hard cap on one segment", unit: "s" },
  windowSize: { label: "VAD frame", help: "Analysis frame size @16kHz", unit: "smp" },
};

/**
 * Text shown as the primary (source-language) line.
 * Never falls back to translation — that is a separate field.
 */
export function displayText(seg: Segment): string {
  const raw = (seg.text || "").trim();
  const corr = (seg.corrected || "").trim();
  const tr = (seg.translation || "").trim();
  if (tr) return raw;
  if (!corr) return raw;
  return corr;
}

export function vadFingerprint(v: VadConfig): string {
  return [
    v.threshold,
    v.minSpeechDuration,
    v.minSilenceDuration,
    v.maxSpeechDuration,
    v.windowSize,
  ].join("|");
}
