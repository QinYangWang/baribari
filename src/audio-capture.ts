/**
 * Audio capture: microphone (node-cpal) + Windows WASAPI loopback (bionic-audio).
 * Emits mono float32 @ SAMPLE_RATE.
 *
 * Loopback notes (bionic-audio recorder.exe):
 * - Use 16-bit PCM stdout (`-p -l`), NOT `-32` (float path produces garbage).
 * - Prefer `-d 0` (infinite) + `-t` for streaming.
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import type { AudioDevice } from "node-cpal";
import type { AudioSource } from "./types.js";
import { SAMPLE_RATE } from "./paths.js";
import { t } from "./i18n/index.js";

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cpal: any = require("node-cpal");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sherpa_onnx: any = require("sherpa-onnx-node");

export interface CaptureHandle {
  label: string;
  source: AudioSource;
  start(onPcm: (samples: Float32Array) => void): void;
  stop(): void;
}

export interface MicDevice {
  id: string;
  name: string;
}

export function listMicDevices(): MicDevice[] {
  try {
    const devices = cpal.getDevices() as AudioDevice[];
    return devices
      .filter(
        (d) =>
          d.isDefaultInput ||
          (d.supportedInputConfigs && d.supportedInputConfigs.length > 0),
      )
      .map((d) => ({ id: d.deviceId, name: d.name }));
  } catch {
    try {
      const def = cpal.getDefaultInputDevice() as AudioDevice;
      return [{ id: def.deviceId, name: def.name }];
    } catch {
      return [];
    }
  }
}

export function resolveMicDevice(
  device?: string | number,
): { id: string; name: string } {
  const all = listMicDevices();
  if (device === undefined) {
    const def = cpal.getDefaultInputDevice() as AudioDevice;
    return { id: def.deviceId, name: def.name };
  }
  const key = String(device);
  const asIndex = Number(device);
  if (
    Number.isInteger(asIndex) &&
    asIndex >= 0 &&
    asIndex < all.length &&
    String(asIndex) === key
  ) {
    return all[asIndex]!;
  }
  const hit = all.find((d) => d.id === key || d.name === key);
  if (!hit) {
    throw new Error(
      `找不到麦克风设备: ${device}\n可用设备:\n` +
        all.map((d, i) => `  [${i}] ${d.name}`).join("\n"),
    );
  }
  return hit;
}

function toMono(data: Float32Array, channels: number): Float32Array {
  if (channels <= 1) return data;
  const n = Math.floor(data.length / channels);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let c = 0; c < channels; c++) s += data[i * channels + c]!;
    out[i] = s / channels;
  }
  return out;
}

function findRecorderExe(): string {
  const candidates = [
    path.join(
      path.dirname(require.resolve("bionic-audio/package.json")),
      "recorder.exe",
    ),
    path.join(process.cwd(), "node_modules", "bionic-audio", "recorder.exe"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error(
    "未找到 bionic-audio/recorder.exe（系统声/loopback 需要 Windows 包 bionic-audio）",
  );
}

interface LinearResampler {
  resample(samples: Float32Array): Float32Array;
}

function makeResampler(from: number, to: number): LinearResampler | null {
  if (from === to) return null;
  return new sherpa_onnx.LinearResampler(from, to) as LinearResampler;
}

/** Int16 LE interleaved PCM → Float32 in [-1, 1] (copy, alignment-safe). */
function i16BufToF32(buf: Buffer): Float32Array {
  const n = Math.floor(buf.length / 2);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = buf.readInt16LE(i * 2) / 32768;
  }
  return out;
}

function openMicStream(
  deviceId: string,
  onNative: (samples: Float32Array, channels: number, rate: number) => void,
): { close: () => void; rate: number; channels: number } {
  const deviceConfig = cpal.getDefaultInputConfig(deviceId) as {
    sampleRate: number;
    channels: number;
    sampleFormat: string;
  };
  const rate = deviceConfig.sampleRate;
  const channels = Math.max(1, deviceConfig.channels || 1);
  const stream = cpal.createStream(
    deviceId,
    true,
    {
      sampleRate: rate,
      channels,
      sampleFormat: deviceConfig.sampleFormat || "f32",
    },
    (data: Float32Array) => onNative(data, channels, rate),
  );
  return {
    close: () => {
      try {
        cpal.closeStream(stream);
      } catch {
        /* ignore */
      }
    },
    rate,
    channels,
  };
}

/**
 * WASAPI loopback via recorder.exe → mono f32 @ SAMPLE_RATE.
 * 16-bit PCM path is required (float -32 is broken in this binary).
 */
function openLoopbackStream(
  onMono16k: (samples: Float32Array) => void,
  onError?: (msg: string) => void,
): { close: () => void; label: string } {
  if (process.platform !== "win32") {
    throw new Error(t("errors.loopbackWinOnly"));
  }
  const { spawn } =
    require("node:child_process") as typeof import("node:child_process");
  const exe = findRecorderExe();
  // -d 0 infinite, -p raw PCM, -l loopback, -t threaded (needed for timely stdout)
  // DO NOT use -32 — produces unusable samples
  const child = spawn(exe, ["-d", "0", "-o", "-", "-p", "-l", "-t"], {
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    // keep in same process tree so taskkill /T can reap it on exit
    detached: false,
  });

  let nativeRate = 48000;
  let nativeCh = 2;
  let resampler: LinearResampler | null = null;
  let tail: Buffer = Buffer.alloc(0);
  let stderr = "";
  let gotData = false;
  let gotAudible = false;
  let alive = true;
  let silentWarned = false;
  const startedAt = Date.now();

  child.stderr?.on("data", (d: Buffer) => {
    const s = d.toString();
    stderr += s;
    // capture format: tag=65534 channels=2 rate=48000 bits=32 (float)
    // (device is float; recorder converts to int16 when not -32)
    const m = /channels=(\d+)\s+rate=(\d+)/i.exec(s);
    if (m) {
      nativeCh = parseInt(m[1]!, 10) || 2;
      nativeRate = parseInt(m[2]!, 10) || 48000;
      resampler = makeResampler(nativeRate, SAMPLE_RATE);
    }
  });

  child.stdout?.on("data", (chunk: Buffer) => {
    if (!alive) return;
    gotData = true;
    const merged = tail.length ? Buffer.concat([tail, chunk]) : chunk;
    // 2 bytes per int16 sample
    const n = merged.length - (merged.length % 2);
    tail = Buffer.from(merged.subarray(n));
    const buf = merged.subarray(0, n);
    if (!buf.length) return;

    if (!resampler && nativeRate !== SAMPLE_RATE) {
      resampler = makeResampler(nativeRate, SAMPLE_RATE);
    }

    let f32 = i16BufToF32(buf);
    f32 = toMono(f32, nativeCh);
    // gentle boost: loopback often quieter than mic
    let peak = 0;
    for (let i = 0; i < f32.length; i++) {
      let v = f32[i]! * 1.4;
      f32[i] = v > 1 ? 1 : v < -1 ? -1 : v;
      const a = Math.abs(f32[i]!);
      if (a > peak) peak = a;
    }
    // Any real signal clears "silent" soft-warn state
    if (peak > 0.008) {
      gotAudible = true;
      silentWarned = false;
    }
    if (resampler) f32 = resampler.resample(f32);
    if (f32.length) onMono16k(f32);
  });

  child.on("error", (err) => {
    onError?.(t("status.loopbackFail", { err: err.message }));
  });

  child.on("exit", (code) => {
    alive = false;
    if (code && code !== 0 && !gotData) {
      onError?.(t("status.loopbackExit", { code: code ?? "" }));
    }
  });

  // Soft hint only once, and only if we never got PCM at all for a long while.
  // Do NOT warn merely because recent frames are quiet (music/pauses are normal).
  const watchdog = setTimeout(() => {
    if (!alive || silentWarned) return;
    if (!gotData) {
      silentWarned = true;
      onError?.(t("status.loopbackSilent"));
    }
  }, 8000);

  // One soft warn if PCM flows but is pure digital silence for a long time
  // (device open but nothing playing). Never re-spam once cleared by audio.
  const silencePoll = setInterval(() => {
    if (!alive || silentWarned) return;
    if (Date.now() - startedAt < 12000) return;
    if (gotData && !gotAudible) {
      silentWarned = true;
      onError?.(t("status.loopbackSilent"));
    }
  }, 4000);

  return {
    label: t("status.labelLoopback"),
    close: () => {
      alive = false;
      clearTimeout(watchdog);
      clearInterval(silencePoll);
      try {
        child.stdout?.removeAllListeners();
        child.stderr?.removeAllListeners();
        child.stdout?.destroy();
        child.stderr?.destroy();
      } catch {
        /* ignore */
      }
      try {
        if (!child.killed) {
          // Windows: SIGTERM often won't kill console-less native apps
          child.kill("SIGKILL");
        }
      } catch {
        /* ignore */
      }
      try {
        if (child.pid) {
          const killer = spawn(
            "taskkill",
            ["/PID", String(child.pid), "/F", "/T"],
            { windowsHide: true, stdio: "ignore" },
          );
          // don't keep node alive waiting for taskkill
          killer.unref();
        }
      } catch {
        /* ignore */
      }
      try {
        child.unref();
      } catch {
        /* ignore */
      }
    },
  };
}

function startMicCapture(
  device: string | number | undefined,
  onPcm: (s: Float32Array) => void,
): { close: () => void; label: string } {
  const mic = resolveMicDevice(device);
  const resamplerRef: { r: LinearResampler | null } = { r: null };
  const h = openMicStream(mic.id, (data, ch, rate) => {
    if (!resamplerRef.r && rate !== SAMPLE_RATE) {
      resamplerRef.r = makeResampler(rate, SAMPLE_RATE);
    }
    let s = toMono(data, ch);
    if (resamplerRef.r) s = resamplerRef.r.resample(s);
    if (s.length) onPcm(s);
  });
  return { close: h.close, label: mic.name };
}

function startLoopbackCapture(
  onPcm: (s: Float32Array) => void,
  onError?: (msg: string) => void,
): { close: () => void; label: string } {
  return openLoopbackStream(onPcm, onError);
}

function startBothCapture(
  device: string | number | undefined,
  onPcm: (s: Float32Array) => void,
  onError?: (msg: string) => void,
): { close: () => void; label: string } {
  if (process.platform !== "win32") {
    return startMicCapture(device, onPcm);
  }
  const micQ: Float32Array[] = [];
  const lbQ: Float32Array[] = [];
  let stopped = false;

  const mic = startMicCapture(device, (s) => {
    if (!stopped) micQ.push(s);
  });
  const lb = startLoopbackCapture((s) => {
    if (!stopped) lbQ.push(s);
  }, onError);

  const mixTimer = setInterval(() => {
    if (stopped) return;
    // mix aligned samples (sum + clamp, not average — keeps level)
    while (micQ.length && lbQ.length) {
      const a = micQ[0]!;
      const b = lbQ[0]!;
      const n = Math.min(a.length, b.length);
      const out = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const v = a[i]! + b[i]!;
        out[i] = v > 1 ? 1 : v < -1 ? -1 : v;
      }
      onPcm(out);
      if (n === a.length) micQ.shift();
      else micQ[0] = a.subarray(n);
      if (n === b.length) lbQ.shift();
      else lbQ[0] = b.subarray(n);
    }
    // if one side lags, pass through after ~100ms so meeting audio isn't stuck
    const flushSide = (q: Float32Array[]) => {
      let samples = 0;
      for (const c of q) samples += c.length;
      if (samples > SAMPLE_RATE * 0.1) {
        while (q.length) onPcm(q.shift()!);
      }
    };
    flushSide(micQ);
    flushSide(lbQ);
    if (micQ.length > 80) micQ.splice(0, micQ.length - 40);
    if (lbQ.length > 80) lbQ.splice(0, lbQ.length - 40);
  }, 15);

  return {
    label: t("status.labelBoth", { mic: mic.label }),
    close: () => {
      stopped = true;
      clearInterval(mixTimer);
      mic.close();
      lb.close();
    },
  };
}

/**
 * Create a capture handle. Call start/stop; may be recreated for hot-switch.
 */
export function createCapture(
  source: AudioSource,
  device?: string | number,
  onError?: (msg: string) => void,
): CaptureHandle {
  let active: { close: () => void } | null = null;
  let label =
    source === "loopback"
      ? t("status.labelLoopbackShort")
      : source === "both"
        ? t("status.labelBothShort")
        : t("source.mic");

  // non-windows: force mic for loopback/both
  const effective: AudioSource =
    process.platform !== "win32" && source !== "mic" ? "mic" : source;

  if (effective !== source) {
    label = t("source.mic");
  }

  return {
    get label() {
      return label;
    },
    source: effective,
    start(onPcm) {
      if (active) active.close();
      if (effective === "loopback") {
        const h = startLoopbackCapture(onPcm, onError);
        label = h.label;
        active = h;
      } else if (effective === "both") {
        const h = startBothCapture(device, onPcm, onError);
        label = h.label;
        active = h;
      } else {
        const h = startMicCapture(device, onPcm);
        label = h.label;
        active = h;
      }
    },
    stop() {
      try {
        active?.close();
      } catch {
        /* ignore */
      }
      active = null;
    },
  };
}
