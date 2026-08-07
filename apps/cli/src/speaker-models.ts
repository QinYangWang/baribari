/**
 * Speaker embedding model catalog (CAM++ / ERes2Net-large).
 * Paths, download URLs, and per-model match defaults live here.
 */

import path from "node:path";

export type SpkEngine = "campplus" | "eres2net-large";

export const SPK_ENGINES: SpkEngine[] = ["campplus", "eres2net-large"];

/** Recommended default for new installs / setup downloads. */
export const DEFAULT_SPK_ENGINE: SpkEngine = "eres2net-large";

/** Legacy default when config has no spkEngine (preserves CAM++ behavior). */
export const LEGACY_SPK_ENGINE: SpkEngine = "campplus";

export function isSpkEngine(v: unknown): v is SpkEngine {
  return typeof v === "string" && (SPK_ENGINES as string[]).includes(v);
}

export interface SpkEngineDefaults {
  /** Cosine match threshold (user-facing default). */
  threshold: number;
  /** Min sim to add/replace a template (session + global). */
  updateMinSim: number;
  /** Best−second margin required to trust a match. */
  minMargin: number;
  /** Ambiguous band below threshold where hysteresis may stick. */
  hysteresisBand: number;
  /** Expected embedding dim (0 = unknown / accept any ≥8). */
  dim: number;
  /** Max representative templates per speaker. */
  maxTemplates: number;
}

export interface SpkModelInfo {
  id: SpkEngine;
  /** Short UI name. */
  name: string;
  /** ONNX filename under models/. */
  fileName: string;
  url: string;
  approx: string;
  defaults: SpkEngineDefaults;
}

/**
 * Official sherpa-onnx speaker-recognition release assets.
 * Note: upstream tag is historically misspelled "speaker-recongition-models".
 */
export const SPK_MODELS: Record<SpkEngine, SpkModelInfo> = {
  campplus: {
    id: "campplus",
    name: "CAM++",
    fileName: "3dspeaker_speech_campplus_sv_zh_en_16k-common_advanced.onnx",
    url: "https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/3dspeaker_speech_campplus_sv_zh_en_16k-common_advanced.onnx",
    approx: "~27 MB",
    defaults: {
      threshold: 0.55,
      updateMinSim: 0.62,
      minMargin: 0.06,
      hysteresisBand: 0.04,
      dim: 192,
      maxTemplates: 4,
    },
  },
  "eres2net-large": {
    id: "eres2net-large",
    name: "ERes2Net-large",
    fileName:
      "3dspeaker_speech_eres2net_large_sv_zh-cn_3dspeaker_16k.onnx",
    url: "https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/3dspeaker_speech_eres2net_large_sv_zh-cn_3dspeaker_16k.onnx",
    approx: "~111 MB",
    defaults: {
      // ERes2Net-large typically yields larger same-speaker separation;
      // a slightly lower default still rejects weak mismatches.
      threshold: 0.45,
      updateMinSim: 0.55,
      minMargin: 0.05,
      hysteresisBand: 0.035,
      dim: 512,
      maxTemplates: 5,
    },
  },
};

export function spkModelInfo(engine: SpkEngine): SpkModelInfo {
  return SPK_MODELS[engine];
}

export function spkEngineDefaults(engine: SpkEngine): SpkEngineDefaults {
  return SPK_MODELS[engine].defaults;
}

export function defaultSpkThreshold(engine: SpkEngine): number {
  return SPK_MODELS[engine].defaults.threshold;
}

export function spkEngineLabel(engine: SpkEngine): string {
  return SPK_MODELS[engine].name;
}

export function spkModelPath(modelsDir: string, engine: SpkEngine): string {
  return path.join(modelsDir, SPK_MODELS[engine].fileName);
}
