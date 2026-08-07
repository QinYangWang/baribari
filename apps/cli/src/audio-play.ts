/**
 * Resume timeline audio playback.
 * Prefer ffplay (seek + stream). Fallback: ffmpeg extract → OS player.
 * Only one playback session at a time (global epoch kills previous).
 */

import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/** Bumped on every start/stop so stale processes never call onExit / keep playing. */
let playEpoch = 0;

export type PlayHandle = {
  stop: () => void;
  proc: ChildProcess;
  epoch: number;
};

function existsFile(p: string): boolean {
  try {
    return fs.existsSync(p) && fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

export function findOnPath(names: string[]): string | null {
  const pathEnv = process.env.PATH || "";
  const sep = process.platform === "win32" ? ";" : ":";
  const exts =
    process.platform === "win32"
      ? (process.env.PATHEXT || ".EXE;.CMD;.BAT").split(";").filter(Boolean)
      : [""];

  for (const dir of pathEnv.split(sep)) {
    if (!dir) continue;
    for (const name of names) {
      const base = path.join(dir, name);
      if (existsFile(base)) return base;
      if (process.platform === "win32") {
        for (const ext of exts) {
          const e = ext.startsWith(".") ? ext : `.${ext}`;
          const p = base.toLowerCase().endsWith(e.toLowerCase())
            ? base
            : base + e;
          if (existsFile(p)) return p;
        }
      }
    }
  }

  if (process.platform === "win32") {
    const extras = [
      path.join(process.env.ProgramFiles || "C:\\Program Files", "ffmpeg", "bin"),
      path.join(
        process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)",
        "ffmpeg",
        "bin",
      ),
      path.join(process.env.USERPROFILE || "", "scoop", "shims"),
      path.join(
        process.env.USERPROFILE || "",
        "scoop",
        "apps",
        "ffmpeg",
        "current",
        "bin",
      ),
      path.join(process.env.LOCALAPPDATA || "", "Microsoft", "WinGet", "Links"),
      "C:\\ffmpeg\\bin",
    ];
    for (const dir of extras) {
      for (const name of names) {
        for (const ext of ["", ".exe"]) {
          const p = path.join(dir, name + ext);
          if (existsFile(p)) return p;
        }
      }
    }
  }

  return null;
}

export function findFfplay(): string | null {
  return findOnPath(["ffplay", "ffplay.exe"]);
}

export function findFfmpeg(): string | null {
  try {
    const bundled = require("ffmpeg-static") as string | null;
    if (bundled && existsFile(bundled)) return bundled;
  } catch {
    /* optional */
  }
  return findOnPath(["ffmpeg", "ffmpeg.exe"]);
}

export type AudioHit = {
  path: string;
  offsetSec: number;
  durationSec?: number;
};

function killTree(proc: ChildProcess | null | undefined): void {
  if (!proc || proc.killed) return;
  const pid = proc.pid;
  try {
    if (process.platform === "win32" && pid) {
      // Kill process tree — PowerShell/ffmpeg children otherwise keep playing
      spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
    } else {
      proc.kill("SIGTERM");
      setTimeout(() => {
        try {
          if (!proc.killed) proc.kill("SIGKILL");
        } catch {
          /* ignore */
        }
      }, 400).unref?.();
    }
  } catch {
    try {
      proc.kill("SIGKILL");
    } catch {
      /* ignore */
    }
  }
}

/** Invalidate any in-flight playback (call before starting a new one). */
export function stopAllAudioPlayback(): void {
  playEpoch += 1;
}

/**
 * Start exclusive playback at hit.offsetSec.
 * Previous playback is force-stopped via epoch + process tree kill.
 */
export function startAudioPlayback(
  hit: AudioHit,
  opts?: { onExit?: (code: number | null) => void },
): PlayHandle | null {
  // End any previous session first
  playEpoch += 1;
  const epoch = playEpoch;
  const alive = () => epoch === playEpoch;

  const ffplay = findFfplay();
  if (ffplay) {
    const args = [
      "-nodisp",
      "-autoexit",
      "-loglevel",
      "quiet",
      "-ss",
      String(Math.max(0, hit.offsetSec)),
    ];
    if (hit.durationSec != null && hit.durationSec > 0) {
      args.push("-t", String(hit.durationSec));
    }
    args.push(hit.path);
    const proc = spawn(ffplay, args, { stdio: "ignore", windowsHide: true });
    let finished = false;
    const finish = (code: number | null) => {
      if (finished) return;
      finished = true;
      if (alive()) opts?.onExit?.(code);
    };
    proc.on("exit", (code) => finish(code));
    proc.on("error", () => finish(1));
    return {
      epoch,
      proc,
      stop: () => {
        if (epoch === playEpoch) playEpoch += 1;
        killTree(proc);
      },
    };
  }

  const ffmpeg = findFfmpeg();
  if (!ffmpeg) return null;

  const tmp = path.join(
    os.tmpdir(),
    `baribari-play-${process.pid}-${Date.now()}-${epoch}.wav`,
  );
  const ffArgs = [
    "-nostdin",
    "-hide_banner",
    "-loglevel",
    "error",
    "-ss",
    String(Math.max(0, hit.offsetSec)),
  ];
  if (hit.durationSec != null && hit.durationSec > 0) {
    ffArgs.push("-t", String(Math.min(hit.durationSec, 3600)));
  }
  // Limit fallback extract length to avoid huge temp files / long overlaps
  else {
    ffArgs.push("-t", "120");
  }
  ffArgs.push("-i", hit.path, "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1", "-y", tmp);

  let extract: ChildProcess | null = null;
  let player: ChildProcess | null = null;
  let finished = false;

  const cleanup = () => {
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  };

  const finish = (code: number | null) => {
    if (finished) return;
    finished = true;
    cleanup();
    if (alive()) opts?.onExit?.(code);
  };

  const stopAll = () => {
    if (epoch === playEpoch) playEpoch += 1;
    killTree(player);
    killTree(extract);
    player = null;
    extract = null;
    cleanup();
  };

  extract = spawn(ffmpeg, ffArgs, { stdio: "ignore", windowsHide: true });
  extract.on("error", () => finish(1));
  extract.on("exit", (code) => {
    if (!alive()) {
      cleanup();
      return;
    }
    if (code !== 0 || !existsFile(tmp)) {
      finish(code ?? 1);
      return;
    }
    player = spawnOsWavPlayer(tmp);
    if (!player) {
      finish(1);
      return;
    }
    player.on("error", () => finish(1));
    player.on("exit", (c) => finish(c));
  });

  return {
    epoch,
    proc: extract,
    stop: stopAll,
  };
}

function spawnOsWavPlayer(wavPath: string): ChildProcess | null {
  if (process.platform === "win32") {
    const ps = findOnPath(["powershell", "powershell.exe", "pwsh", "pwsh.exe"]);
    if (!ps) return null;
    // PlaySync blocks this process until done — killable via taskkill /T on the shell
    const script = `$p = New-Object System.Media.SoundPlayer '${wavPath.replace(/'/g, "''")}'; $p.PlaySync();`;
    return spawn(ps, ["-NoProfile", "-NonInteractive", "-Command", script], {
      stdio: "ignore",
      windowsHide: true,
    });
  }
  if (process.platform === "darwin") {
    const afplay = findOnPath(["afplay"]);
    if (!afplay) return null;
    return spawn(afplay, [wavPath], { stdio: "ignore" });
  }
  const aplay = findOnPath(["aplay", "paplay", "play"]);
  if (!aplay) return null;
  return spawn(aplay, [wavPath], { stdio: "ignore" });
}

export type PlayerBackend = "ffplay" | "ffmpeg+os" | "none";

export function detectPlayerBackend(): PlayerBackend {
  if (findFfplay()) return "ffplay";
  if (findFfmpeg()) return "ffmpeg+os";
  return "none";
}
