export type Lang = "auto" | "zh" | "en" | "ja" | "ko" | "yue";

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

export interface TranscribeArgs {
  lang: Lang;
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
}

export interface Segment {
  /** Stable id for UI updates (ASR → AI enhance). */
  id?: string;
  start: number;
  end: number;
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
  /** True while AI enhancement is still running. */
  pending?: boolean;
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
  if (!corr) return raw;
  // Model sometimes puts the translation into "corrected"
  if (tr && corr === tr && corr !== raw) return raw;
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
