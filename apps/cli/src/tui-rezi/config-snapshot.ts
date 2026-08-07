import {
  aiActive,
  aiProviderLabel,
  resolveApiKey,
} from "../ai.js";
import { getUiLang } from "../i18n/index.js";
import { matchVadPreset, type TranscribeArgs } from "../types.js";
import { checkModels } from "../paths.js";
import { modelOverridesFromSettings } from "../settings.js";
import type { AsrModelCard, ConfigSnapshot } from "./types.js";
import type { AsrEngine } from "../types.js";

export function snapshotConfig(args: TranscribeArgs, deviceName = "—"): ConfigSnapshot {
  return {
    lang: args.lang,
    asrEngine: args.asrEngine,
    uiLang: args.uiLang || getUiLang(),
    source: args.source,
    noSpk: args.noSpk,
    spkEngine: args.spkEngine,
    spkThreshold: args.spkThreshold,
    recordDir: args.recordDir,
    recording: !!args.record,
    paused: !!args.paused.value,
    aiEnabled: args.ai.enabled,
    aiCorrect: args.ai.correct,
    aiTranslateTo: args.ai.translateTo,
    aiBaseUrl: args.ai.baseUrl,
    aiModel: args.ai.model,
    aiHasKey: !!resolveApiKey(args.ai) || !!args.ai.apiKey,
    aiProviderLabel: aiProviderLabel(args.ai),
    shareEnabled: args.share.enabled,
    sharePort: args.share.port,
    shareHost: args.share.host,
    vadThreshold: args.vad.threshold,
    vadMinSpeech: args.vad.minSpeechDuration,
    vadSilence: args.vad.minSilenceDuration,
    vadMaxSpeech: args.vad.maxSpeechDuration,
    vadWindow: args.vad.windowSize,
    vadPresetId: matchVadPreset(args.vad, args.asrEngine),
    deviceName,
  };
}

export function buildAsrModelCards(args: TranscribeArgs): AsrModelCard[] {
  const engines: AsrEngine[] = ["sensevoice", "funasr-nano", "reazonspeech-ja"];
  const overrides = modelOverridesFromSettings();
  return engines.map((engine) => {
    const st = checkModels(overrides, {
      requireSpk: false,
      asrEngine: engine,
    });
    const label =
      engine === "funasr-nano"
        ? "Fun-ASR-Nano"
        : engine === "reazonspeech-ja"
          ? "ReazonSpeech"
          : "SenseVoice";
    const size =
      engine === "funasr-nano"
        ? "1 GB"
        : engine === "reazonspeech-ja"
          ? "162 MB"
          : "230 MB";
    return {
      engine,
      label,
      size,
      installed: st.ok,
      current: args.asrEngine === engine,
    };
  });
}

export function aiIsActive(args: TranscribeArgs): boolean {
  return aiActive(args.ai);
}
