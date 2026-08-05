/**
 * Engine layer: SenseVoice + Silero VAD + speaker embedding.
 * SenseVoice + Silero VAD transcription engine.
 *
 * VAD: sherpa high-level Vad configured to match Python endpoint params
 * (min speech 0.4s, min silence 0.6s, max speech 30s). Node addon has no
 * low-level is_speech(); pre-roll is handled inside sherpa Vad.
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sherpa_onnx: any = require("sherpa-onnx-node");

import { SAMPLE_RATE, assertModelsExist, modelPaths } from "./paths.js";
import { SherpaSpeakerTracker } from "./speaker-tracker.js";
import {
  loadSpeakerRoster,
  mergeGlobalSpeakerUpdates,
  upsertGlobalSpeaker,
} from "./speaker-library.js";
import {
  createCapture,
  listMicDevices,
} from "./audio-capture.js";
import type {
  AudioSource,
  AsrEngine,
  EmitFn,
  Lang,
  StatusFn,
  TranscribeArgs,
  VadConfig,
} from "./types.js";
import { vadFingerprint } from "./types.js";
import {
  modelOverridesFromSettings,
  scheduleSaveSettings,
  snapshotFromArgs,
} from "./settings.js";
import { t } from "./i18n/index.js";

interface OfflineStream {
  acceptWaveform(opts: { sampleRate: number; samples: Float32Array }): void;
}
interface OfflineRecognizer {
  createStream(): OfflineStream;
  decode(stream: OfflineStream): void;
  getResult(stream: OfflineStream): { text: string };
}
interface Vad {
  config: {
    sampleRate: number;
    sileroVad: { windowSize: number };
  };
  acceptWaveform(samples: Float32Array): void;
  isEmpty(): boolean;
  front(): { samples: Float32Array; start: number };
  pop(): void;
  flush(): void;
  clear(): void;
  reset(): void;
}
interface CircularBuffer {
  push(samples: Float32Array): void;
  size(): number;
  get(start: number, n: number): Float32Array;
  pop(n: number): void;
  head(): number;
  reset(): void;
}

function buildRecognizer(
  engine: AsrEngine,
  lang: Lang,
  paths: ReturnType<typeof modelPaths>,
): OfflineRecognizer {
  if (engine === "funasr-nano") {
    return new sherpa_onnx.OfflineRecognizer({
      featConfig: { sampleRate: SAMPLE_RATE, featureDim: 80 },
      modelConfig: {
        funasrNano: {
          encoderAdaptor: paths.funAsrNanoEncoderAdaptor,
          llm: paths.funAsrNanoLlm,
          embedding: paths.funAsrNanoEmbedding,
          tokenizer: paths.funAsrNanoTokenizer,
          language: lang === "auto" ? "" : lang,
          itn: 1,
        },
        tokens: "",
        numThreads: 2,
        provider: "cpu",
        debug: 0,
      },
    });
  }
  if (engine === "reazonspeech-ja") {
    return new sherpa_onnx.OfflineRecognizer({
      featConfig: { sampleRate: SAMPLE_RATE, featureDim: 80 },
      modelConfig: {
        transducer: {
          encoder: paths.reazonSpeechEncoder,
          decoder: paths.reazonSpeechDecoder,
          joiner: paths.reazonSpeechJoiner,
        },
        tokens: paths.reazonSpeechTokens,
        numThreads: 4,
        provider: "cpu",
        debug: 0,
      },
    });
  }
  const language = lang === "auto" ? "" : lang;
  return new sherpa_onnx.OfflineRecognizer({
    featConfig: {
      sampleRate: SAMPLE_RATE,
      featureDim: 80,
    },
    modelConfig: {
      senseVoice: {
        model: paths.senseVoiceModel,
        language,
        useInverseTextNormalization: 1,
      },
      tokens: paths.senseVoiceTokens,
      numThreads: 4,
      provider: "cpu",
      debug: 0,
    },
  });
}

/** Silero VAD from runtime config. */
function buildVad(
  paths: ReturnType<typeof modelPaths>,
  vadCfg: VadConfig,
): Vad {
  return new sherpa_onnx.Vad(
    {
      sileroVad: {
        model: paths.vad,
        threshold: vadCfg.threshold,
        minSpeechDuration: vadCfg.minSpeechDuration,
        minSilenceDuration: vadCfg.minSilenceDuration,
        maxSpeechDuration: vadCfg.maxSpeechDuration,
        windowSize: vadCfg.windowSize,
      },
      sampleRate: SAMPLE_RATE,
      debug: false,
      numThreads: 1,
    },
    60,
  );
}

function buildSpeakerExtractor(paths: ReturnType<typeof modelPaths>) {
  if (!fs.existsSync(paths.spk)) {
    throw new Error(
      t("errors.spkModelMissing", { path: paths.spk }),
    );
  }
  return new sherpa_onnx.SpeakerEmbeddingExtractor({
    model: paths.spk,
    numThreads: 2,
    debug: false,
  });
}

export function listInputDevices(): { id: string; name: string }[] {
  return listMicDevices();
}

export function defaultSource(): AudioSource {
  return process.platform === "win32" ? "both" : "mic";
}

export async function transcribe(
  args: TranscribeArgs,
  emit: EmitFn,
  stop: { value: boolean },
  onStatus: StatusFn = () => {},
): Promise<void> {
  const paths = modelPaths(modelOverridesFromSettings());
  assertModelsExist(paths, { requireSpk: !args.noSpk, asrEngine: args.asrEngine });

  onStatus(t("status.loadingModels"));
  let recognizer = buildRecognizer(args.asrEngine, args.lang, paths);
  let currentLang: Lang = args.lang;
  let currentAsrEngine: AsrEngine = args.asrEngine;
  let vad = buildVad(paths, args.vad);
  let vadFp = vadFingerprint(args.vad);

  let tracker: SherpaSpeakerTracker | null = null;
  if (!args.noSpk) {
    tracker = new SherpaSpeakerTracker(buildSpeakerExtractor(paths), args);
    // Fixed attendees: seed centroids so spk 1..G match roster across meetings
    try {
      const roster = loadSpeakerRoster();
      if (roster.speakers.length) {
        tracker.seedGlobal(
          roster.speakers.map((s) => ({
            id: s.id,
            displayName: s.displayName,
            embedding: s.embedding,
            count: s.count,
          })),
        );
        onStatus(
          t("status.globalSpeakersLoaded", { n: roster.speakers.length }),
        );
      }
    } catch {
      /* ignore roster load errors */
    }
  }

  // Expose for UI rename → promote to global roster (via args hook if present)
  if (tracker && args.onSpeakerTracker) {
    args.onSpeakerTracker(tracker);
  }

  const buffer: CircularBuffer = new sherpa_onnx.CircularBuffer(
    30 * SAMPLE_RATE,
  );

  const startTime = Date.now();
  let lastText: string | null = null;

  // runtime record (Python: follow args.record open/close)
  let activeRecordPath: string | null = null;
  const wavChunks: Float32Array[] = [];

  const flushWav = () => {
    if (!activeRecordPath || !wavChunks.length) {
      wavChunks.length = 0;
      return;
    }
    const fresh = concatFloat32(wavChunks);
    wavChunks.length = 0;
    const file = activeRecordPath.endsWith(".wav")
      ? activeRecordPath
      : `${activeRecordPath}.wav`;
    try {
      let samples = fresh;
      // Continue-session: append new PCM after existing wav instead of overwrite
      if (fs.existsSync(file)) {
        try {
          const prev = sherpa_onnx.readWave(file) as {
            samples: Float32Array | number[];
            sampleRate: number;
          };
          if (prev?.samples && prev.samples.length) {
            const a = Float32Array.from(prev.samples as ArrayLike<number>);
            const merged = new Float32Array(a.length + fresh.length);
            merged.set(a, 0);
            merged.set(fresh, a.length);
            samples = merged;
          }
        } catch {
          /* if read fails, write fresh only */
        }
      }
      try {
        sherpa_onnx.writeWave(file, { samples, sampleRate: SAMPLE_RATE });
      } catch {
        writeWavPcm16(file, samples, SAMPLE_RATE);
      }
      onStatus(t("status.recordSaved", { file }));
    } catch (e) {
      onStatus(t("status.recordSaveFail", { err: String(e) }));
    }
  };

  const syncRecordState = () => {
    const want = args.record?.trim() || "";
    if (want && want !== activeRecordPath) {
      if (activeRecordPath) flushWav();
      activeRecordPath = want;
      onStatus(t("status.recordStart", { path: want }));
    } else if (!want && activeRecordPath) {
      flushWav();
      activeRecordPath = null;
      onStatus(t("status.recordStopped"));
    }
  };

  const flushSegment = (audio: Float32Array, segStartSample: number) => {
    if (args.lang !== currentLang || args.asrEngine !== currentAsrEngine) {
      onStatus(t("status.reloadLang"));
      assertModelsExist(paths, { requireSpk: false, asrEngine: args.asrEngine });
      recognizer = buildRecognizer(args.asrEngine, args.lang, paths);
      currentLang = args.lang;
      currentAsrEngine = args.asrEngine;
      onStatus("");
    }

    const segStartS = segStartSample / SAMPLE_RATE;
    const wall = new Date(startTime + segStartS * 1000);
    // Fake-streaming: show a single refreshable live line while SenseVoice decodes
    // (no online ASR tokens yet — status only, not invented text)
    emit({
      kind: "partial",
      start: segStartS,
      wall,
      spk: null,
      text: t("status.recognizing"),
    });

    // Accuracy: pad silence + soft peak normalize before offline decode
    // (measured ~CER 0.20→0.17 on ja meeting fixture with pad)
    const asrAudio = prepareAsrAudio(audio, SAMPLE_RATE);
    const stream = recognizer.createStream();
    stream.acceptWaveform({ sampleRate: SAMPLE_RATE, samples: asrAudio });
    recognizer.decode(stream);
    let text = (recognizer.getResult(stream).text ?? "").trim();
    // Strip SenseVoice emotion / event tags if present
    text = text
      .replace(/<\|[^|]*\|>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) {
      emit({
        kind: "partial",
        start: segStartS,
        wall,
        spk: null,
        text: "",
      });
      return;
    }
    // Drop only exact consecutive duplicates that are very short (VAD double-fire).
    // Do NOT drop longer repeats — legitimate re-statements must stay.
    if (
      lastText &&
      text === lastText &&
      text.length <= 8 &&
      audio.length < Math.floor(1.2 * SAMPLE_RATE)
    ) {
      emit({
        kind: "partial",
        start: segStartS,
        wall,
        spk: null,
        text: "",
      });
      return;
    }
    lastText = text;

    let spk: number | null = null;
    if (
      tracker &&
      !args.noSpk &&
      audio.length >= Math.floor(0.5 * SAMPLE_RATE)
    ) {
      // Multi-window voting inside tracker; null → leave unknown
      // Use original (unpadded) audio for speaker embedding timing fidelity
      spk = tracker.assign(audio);
    }

    emit({
      kind: "final",
      start: segStartS,
      end: segStartS + audio.length / SAMPLE_RATE,
      wall,
      spk,
      text,
    });
  };

  onStatus("");

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const pcmQueue: Float32Array[] = [];
    let pendingSegs: Array<{ samples: Float32Array; start: number }> = [];
    let processing = false;
    let wasPaused = false;
    let guardedOversizedChunk = false;
    let capture = createCapture(args.source, args.device, (msg) =>
      onStatus(msg),
    );
    let activeSource: AudioSource = capture.source;

    const onPcm = (samples: Float32Array) => {
      if (stop.value || settled) return;
      if (args.paused.value) return;

      // Native capture must never be allowed to grow sherpa's C++ buffer by
      // minutes at once. Drop an invalid block and keep the TUI responsive.
      if (samples.length > SAMPLE_RATE * 2) {
        if (!guardedOversizedChunk) {
          guardedOversizedChunk = true;
          onStatus(t("status.audioChunkGuard"));
        }
        return;
      }
      if (guardedOversizedChunk) {
        guardedOversizedChunk = false;
        onStatus("");
      }

      if (activeRecordPath || args.record) {
        syncRecordState();
        if (activeRecordPath) wavChunks.push(new Float32Array(samples));
      }

      if (pcmQueue.length > 60) pcmQueue.splice(0, pcmQueue.length - 30);
      pcmQueue.push(samples);
    };

    const clearPipeline = () => {
      pcmQueue.length = 0;
      pendingSegs = [];
      try {
        buffer.reset();
        vad.clear();
      } catch {
        /* ignore */
      }
    };

    /** Hot-switch mic / loopback / both without restarting the process. */
    const switchSource = (next: AudioSource) => {
      if (next === activeSource) return;
      onStatus(t("status.switchSourceDot", { name: next }));
      try {
        capture.stop();
      } catch {
        /* ignore */
      }
      clearPipeline();
      capture = createCapture(next, args.device, (msg) => onStatus(msg));
      activeSource = capture.source;
      args.source = activeSource;
      scheduleSaveSettings(() => snapshotFromArgs(args));
      try {
        capture.start(onPcm);
        onStatus(t("status.deviceDot", { name: capture.label }));
        const clearToast = setTimeout(() => {
          if (!stop.value && !settled) onStatus("");
        }, 1600);
        // don't pin the process if user quits during the toast
        clearToast.unref?.();
      } catch (e) {
        onStatus(
          t("status.sourceFail", {
            err: e instanceof Error ? e.message : String(e),
          }),
        );
        // fall back to mic
        try {
          capture = createCapture("mic", args.device, (msg) => onStatus(msg));
          activeSource = "mic";
          args.source = "mic";
          scheduleSaveSettings(() => snapshotFromArgs(args));
          capture.start(onPcm);
          onStatus(t("status.fallbackMic", { name: capture.label }));
        } catch (e2) {
          done(e2 instanceof Error ? e2 : new Error(String(e2)));
        }
      }
    };

    const done = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearInterval(stopTimer);
      clearInterval(pumpTimer);
      try {
        capture.stop();
      } catch {
        /* ignore */
      }
      pcmQueue.length = 0;
      pendingSegs = [];
      try {
        if (activeRecordPath) flushWav();
      } catch {
        /* ignore */
      }
      // Persist global voiceprint updates (EMA centroids for fixed attendees)
      try {
        if (tracker?.hasDirtyGlobal) {
          mergeGlobalSpeakerUpdates(tracker.exportGlobalUpdates());
        }
      } catch {
        /* ignore */
      }
      if (err) reject(err);
      else resolve();
    };

    const stopTimer = setInterval(() => {
      if (stop.value) done();
    }, 50);

    const pump = () => {
      if (settled || stop.value || processing) return;

      syncRecordState();

      // hot-reload VAD when settings/CLI-driven args.vad change
      const nextVadFp = vadFingerprint(args.vad);
      if (nextVadFp !== vadFp) {
        try {
          clearPipeline();
          vad = buildVad(paths, args.vad);
          vadFp = nextVadFp;
          onStatus(
            t("status.vadReloaded", {
              thr: args.vad.threshold,
              sil: args.vad.minSilenceDuration,
              min: args.vad.minSpeechDuration,
            }),
          );
          const clearToast = setTimeout(() => {
            if (!stop.value && !settled) onStatus("");
          }, 2000);
          clearToast.unref?.();
        } catch (e) {
          onStatus(
            t("status.vadReloadFail", {
              err: e instanceof Error ? e.message : String(e),
            }),
          );
        }
      }

      // hot-switch when TUI/settings changes args.source
      if (args.source !== activeSource) {
        switchSource(args.source);
        return;
      }

      if (args.paused.value) {
        if (!wasPaused) {
          clearPipeline();
          wasPaused = true;
        }
        return;
      }
      wasPaused = false;

      processing = true;
      try {
        const windowSize = vad.config.sileroVad.windowSize ?? 512;
        let steps = 0;
        while (pcmQueue.length > 0 && steps < 8) {
          const samples = pcmQueue.shift()!;
          buffer.push(samples);
          steps += 1;
        }
        steps = 0;
        while (buffer.size() >= windowSize && steps < 32) {
          const win = buffer.get(buffer.head(), windowSize);
          buffer.pop(windowSize);
          vad.acceptWaveform(win);
          steps += 1;
        }
        while (!vad.isEmpty()) {
          const segment = vad.front();
          vad.pop();
          pendingSegs.push({
            samples: segment.samples,
            start: segment.start,
          });
        }
        if (pendingSegs.length > 0 && !stop.value) {
          const seg = pendingSegs.shift()!;
          flushSegment(seg.samples, seg.start);
        }
      } catch (e) {
        processing = false;
        done(e instanceof Error ? e : new Error(String(e)));
        return;
      }
      processing = false;
    };

    const pumpTimer = setInterval(pump, 20);

    try {
      capture.start(onPcm);
      activeSource = capture.source;
      args.source = activeSource;
      onStatus(t("status.deviceDot", { name: capture.label }));
      // clear device toast shortly so header stays clean
      const t0 = setTimeout(() => {
        if (!stop.value && !settled) onStatus("");
      }, 1800);
      t0.unref?.();
    } catch (e) {
      done(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

/**
 * Pre-ASR audio conditioning for SenseVoice offline decode.
 * - Soft peak normalize only when clip is quiet (avoid distorting loud speech)
 * - Pad ~120ms silence on both ends (helps first/last phones; measured win on fixture)
 */
function prepareAsrAudio(
  samples: Float32Array,
  sampleRate: number,
  opts?: { padSec?: number; quietPeak?: number; targetPeak?: number; maxGain?: number },
): Float32Array {
  const padSec = opts?.padSec ?? 0.12;
  const quietPeak = opts?.quietPeak ?? 0.35;
  const targetPeak = opts?.targetPeak ?? 0.85;
  const maxGain = opts?.maxGain ?? 4;

  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs(samples[i]!);
    if (a > peak) peak = a;
  }
  let gain = 1;
  if (peak > 1e-4 && peak < quietPeak) {
    gain = Math.min(targetPeak / peak, maxGain);
  }

  const pad = Math.max(0, Math.floor(padSec * sampleRate));
  if (pad === 0 && gain === 1) return samples;

  const out = new Float32Array(samples.length + pad * 2);
  if (gain === 1) {
    out.set(samples, pad);
  } else {
    for (let i = 0; i < samples.length; i++) {
      out[pad + i] = samples[i]! * gain;
    }
  }
  return out;
}

function concatFloat32(chunks: Float32Array[]): Float32Array {
  let n = 0;
  for (const c of chunks) n += c.length;
  const out = new Float32Array(n);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

function writeWavPcm16(
  file: string,
  samples: Float32Array,
  sampleRate: number,
): void {
  const dataSize = samples.length * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  let o = 44;
  for (let i = 0; i < samples.length; i++) {
    let s = Math.max(-1, Math.min(1, samples[i]!));
    s = s < 0 ? s * 0x8000 : s * 0x7fff;
    buf.writeInt16LE(s | 0, o);
    o += 2;
  }
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file, buf);
}
