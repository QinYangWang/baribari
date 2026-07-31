/**
 * Read-only session resume / replay TUI.
 * Keys differ from live meeting mode.
 */

import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import type { SessionData, SessionSegment } from "./session.js";
import { segmentDisplay } from "./session.js";

const ESC = "\x1b";
const RESET = `${ESC}[0m`;
const BOLD = `${ESC}[1m`;
const DIM = `${ESC}[2m`;
const HIDE = `${ESC}[?25l`;
const SHOW = `${ESC}[?25h`;
const ALT_ON = `${ESC}[?1049h`;
const ALT_OFF = `${ESC}[?1049l`;
const CLEAR = `${ESC}[2J${ESC}[H`;
const HOME = `${ESC}[H`;

const FG = {
  accent: "\x1b[38;2;167;139;250m",
  ok: "\x1b[38;2;52;211;153m",
  muted: "\x1b[38;2;161;161;170m",
  title: "\x1b[38;2;244;244;245m",
  cyan: "\x1b[38;2;94;234;212m",
  tr: "\x1b[38;2;52;211;153m",
  border: "\x1b[38;2;63;63;70m",
  warn: "\x1b[38;2;251;191;36m",
  key: "\x1b[38;2;212;212;216m",
};

const SPK = [
  "\x1b[38;2;94;234;212m",
  "\x1b[38;2;251;191;36m",
  "\x1b[38;2;244;114;182m",
  "\x1b[38;2;129;140;248m",
  "\x1b[38;2;74;222;128m",
];

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

function dw(s: string): number {
  let w = 0;
  for (const ch of stripAnsi(s)) {
    const c = ch.codePointAt(0)!;
    if (
      c >= 0x1100 &&
      (c <= 0x115f ||
        (c >= 0x2e80 && c <= 0xa4cf) ||
        (c >= 0xac00 && c <= 0xd7a3) ||
        (c >= 0xf900 && c <= 0xfaff) ||
        (c >= 0xff00 && c <= 0xff60))
    )
      w += 2;
    else w += 1;
  }
  return w;
}

function trunc(s: string, max: number): string {
  if (dw(s) <= max) return s;
  let out = "";
  let w = 0;
  for (const ch of s) {
    const cw = dw(ch);
    if (w + cw > max - 1) break;
    out += ch;
    w += cw;
  }
  return out + "…";
}

function pad(s: string, n: number): string {
  const d = dw(s);
  if (d >= n) return trunc(s, n);
  return s + " ".repeat(n - d);
}

function fmtDur(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

function wrap(text: string, width: number): string[] {
  if (width < 4) return [trunc(text, Math.max(1, width))];
  const out: string[] = [];
  let line = "";
  let lw = 0;
  for (const ch of text) {
    const cw = dw(ch);
    if (lw + cw > width && line) {
      out.push(line);
      line = ch;
      lw = cw;
    } else {
      line += ch;
      lw += cw;
    }
  }
  if (line) out.push(line);
  return out.length ? out : [""];
}

function progressBar(t: number, total: number, width: number): string {
  if (total <= 0) total = 1;
  const ratio = Math.min(1, Math.max(0, t / total));
  const fill = Math.round(ratio * width);
  return (
    `${FG.accent}${"█".repeat(fill)}${RESET}` +
    `${FG.border}${"░".repeat(Math.max(0, width - fill))}${RESET}`
  );
}

export async function runResumeTui(data: SessionData): Promise<void> {
  const stdout = process.stdout;
  const stdin = process.stdin;
  if (!stdout.isTTY) {
    // plain dump
    console.log(`Session ${data.meta.id}  ${data.meta.name}`);
    for (const s of data.segments) {
      const sp =
        data.speakers.find((x) => x.spk === s.spk)?.displayName ||
        (s.spk != null ? `Speaker ${s.spk}` : "—");
      console.log(
        `[${fmtDur(s.start)}–${fmtDur(s.end)}] ${sp}  ${segmentDisplay(s)}`,
      );
      if (s.translation) console.log(`  → ${s.translation}`);
    }
    return;
  }

  const total = Math.max(
    data.meta.durationSec,
    ...data.segments.map((s) => s.end),
    1,
  );
  let cursor = 0; // playback position seconds
  let playing = false;
  let closed = false;
  let player: ChildProcess | null = null;
  let playTimer: ReturnType<typeof setInterval> | null = null;
  const startedWall = Date.now();

  const cols = () => stdout.columns || 80;
  const rows = () => stdout.rows || 24;

  function stopAudio() {
    if (playTimer) {
      clearInterval(playTimer);
      playTimer = null;
    }
    if (player) {
      try {
        player.kill("SIGTERM");
      } catch {
        /* ignore */
      }
      player = null;
    }
    playing = false;
  }

  function tryPlayFrom(sec: number) {
    stopAudio();
    if (!data.audioPath || !fs.existsSync(data.audioPath)) return;
    // Prefer ffplay; fall back to afplay/aplay without seek
    const bin =
      which("ffplay") || which("ffplay.exe") || null;
    if (bin) {
      player = spawn(
        bin,
        [
          "-nodisp",
          "-autoexit",
          "-loglevel",
          "quiet",
          "-ss",
          String(Math.max(0, sec)),
          data.audioPath!,
        ],
        { stdio: "ignore" },
      );
      player.on("exit", () => {
        player = null;
        playing = false;
      });
      playing = true;
      const t0 = Date.now();
      const base = sec;
      playTimer = setInterval(() => {
        cursor = Math.min(total, base + (Date.now() - t0) / 1000);
        if (cursor >= total) stopAudio();
        paint();
      }, 200);
      return;
    }
    // No seekable player — mark playing without audio
    playing = false;
  }

  function which(cmd: string): string | null {
    const pathEnv = process.env.PATH || "";
    const sep = process.platform === "win32" ? ";" : ":";
    for (const dir of pathEnv.split(sep)) {
      const p = `${dir}${process.platform === "win32" ? "\\" : "/"}${cmd}`;
      try {
        if (fs.existsSync(p)) return p;
      } catch {
        /* ignore */
      }
    }
    return null;
  }

  function visibleSegments(): SessionSegment[] {
    // show segments that started at or before cursor (history up to now)
    return data.segments.filter((s) => s.start <= cursor + 0.05);
  }

  function activeSegment(): SessionSegment | undefined {
    return data.segments.find((s) => s.start <= cursor && cursor < s.end);
  }

  function paint() {
    if (closed) return;
    const W = cols();
    const H = rows();
    if (W < 40 || H < 12) {
      stdout.write(CLEAR + "Terminal too small");
      return;
    }
    const lines: string[] = [];
    const inner = W - 2;
    lines.push(`${FG.border}╭${"─".repeat(inner)}╮${RESET}`);
    const title = `◆ resume  ${data.meta.name}`;
    const id = data.meta.id;
    const headPad = Math.max(1, inner - dw(title) - dw(id) - 2);
    lines.push(
      `${FG.border}│${RESET}${BOLD}${FG.accent}${trunc(title, inner - dw(id) - 2)}${RESET}${" ".repeat(headPad)}${FG.muted}${id}${RESET}${FG.border}│${RESET}`,
    );
    lines.push(`${FG.border}├${"─".repeat(inner)}┤${RESET}`);

    // progress
    const barW = Math.max(10, inner - 28);
    const bar = progressBar(cursor, total, barW);
    const ts = `${fmtDur(cursor)} / ${fmtDur(total)}`;
    const playTag = playing
      ? `${FG.ok}▶ play${RESET}`
      : data.audioPath
        ? `${FG.muted}❚❚ pause${RESET}`
        : `${FG.warn}no audio${RESET}`;
    const prog = ` ${playTag}  ${bar}  ${FG.muted}${ts}${RESET}`;
    lines.push(
      `${FG.border}│${RESET}${pad(prog, inner)}${FG.border}│${RESET}`,
    );
    lines.push(`${FG.border}├${"─".repeat(inner)}┤${RESET}`);

    const footerH = 2;
    const headerH = 5;
    const bodyH = Math.max(3, H - headerH - footerH);
    const bodyW = inner - 2;

    const vis = visibleSegments();
    const visual: string[] = [];
    if (!vis.length) {
      visual.push("");
      visual.push(
        pad(
          `${FG.muted}${DIM}Seek with ← → · Space play/pause · q quit${RESET}`,
          bodyW,
        ),
      );
    } else {
      const act = activeSegment();
      for (const s of vis) {
        const sp =
          data.speakers.find((x) => x.spk === s.spk)?.displayName ||
          (s.spk != null ? `Speaker ${s.spk}` : "—");
        const col = s.spk != null ? SPK[(s.spk - 1) % SPK.length]! : FG.muted;
        const hot = act?.id === s.id;
        const time = `${fmtDur(s.start)}–${fmtDur(s.end)}`;
        visual.push(
          pad(
            `${hot ? FG.accent + BOLD : col}${hot ? "●" : "○"} ${sp}${RESET}  ${DIM}${FG.muted}${time}${RESET}`,
            bodyW,
          ),
        );
        const text = segmentDisplay(s);
        for (const wl of wrap(text, bodyW - 2)) {
          visual.push(
            pad(
              `  ${hot ? FG.title : FG.muted}${wl}${RESET}`,
              bodyW,
            ),
          );
        }
        if (s.translation) {
          for (const wl of wrap(s.translation, bodyW - 2)) {
            visual.push(pad(`  ${DIM}${FG.tr}${wl}${RESET}`, bodyW));
          }
        }
        visual.push("");
      }
    }

    // stick bottom
    const start = Math.max(0, visual.length - bodyH);
    const slice = visual.slice(start, start + bodyH);
    while (slice.length < bodyH) slice.push("");
    for (const row of slice) {
      lines.push(
        `${FG.border}│${RESET} ${pad(row || "", bodyW)} ${FG.border}│${RESET}`,
      );
    }

    lines.push(`${FG.border}├${"─".repeat(inner)}┤${RESET}`);
    const keys =
      `${FG.key}${BOLD}←→${RESET}${FG.muted} seek  ${RESET}` +
      `${FG.key}${BOLD}Space${RESET}${FG.muted} play  ${RESET}` +
      `${FG.key}${BOLD}g${RESET}${FG.muted} start  ${RESET}` +
      `${FG.key}${BOLD}G${RESET}${FG.muted} end  ${RESET}` +
      `${FG.key}${BOLD}q${RESET}${FG.muted} quit${RESET}`;
    lines.push(
      `${FG.border}│${RESET} ${pad(keys, inner - 2)} ${FG.border}│${RESET}`,
    );
    lines.push(`${FG.border}╰${"─".repeat(inner)}╯${RESET}`);

    stdout.write(HOME + HIDE + lines.join("\n"));
    if (lines.length < H) {
      stdout.write("\n" + (" ".repeat(W) + "\n").repeat(H - lines.length));
    }
  }

  function seek(delta: number) {
    const was = playing;
    stopAudio();
    cursor = Math.min(total, Math.max(0, cursor + delta));
    if (was && data.audioPath) tryPlayFrom(cursor);
    paint();
  }

  function togglePlay() {
    if (playing) {
      stopAudio();
      paint();
      return;
    }
    if (data.audioPath) tryPlayFrom(cursor);
    else {
      // synthetic play without audio
      playing = true;
      const t0 = Date.now();
      const base = cursor;
      playTimer = setInterval(() => {
        cursor = Math.min(total, base + (Date.now() - t0) / 1000);
        if (cursor >= total) {
          stopAudio();
        }
        paint();
      }, 200);
    }
    paint();
  }

  function onKey(key: string) {
    if (key === "q" || key === "Q" || key === "\x03") {
      shutdown();
      return;
    }
    if (key === " " || key === "p" || key === "P") {
      togglePlay();
      return;
    }
    if (key === "\x1b[C" || key === "l") {
      seek(2);
      return;
    }
    if (key === "\x1b[D" || key === "h") {
      seek(-2);
      return;
    }
    if (key === "\x1b[1;2C" || key === "\x1b[C" && false) {
      /* skip */
    }
    if (key === "\x1b[5~") {
      seek(-10);
      return;
    }
    if (key === "\x1b[6~") {
      seek(10);
      return;
    }
    if (key === "g") {
      stopAudio();
      cursor = 0;
      paint();
      return;
    }
    if (key === "G") {
      stopAudio();
      cursor = total;
      paint();
      return;
    }
    if (key === "." || key === ">") {
      seek(5);
      return;
    }
    if (key === "," || key === "<") {
      seek(-5);
      return;
    }
  }

  let keyBuf = "";
  let keyTimer: NodeJS.Timeout | null = null;
  function feed(chunk: Buffer) {
    for (let i = 0; i < chunk.length; i++) {
      const b = chunk[i]!;
      const ch = String.fromCharCode(b);
      if (b === 0x1b) {
        keyBuf = "\x1b";
        if (keyTimer) clearTimeout(keyTimer);
        keyTimer = setTimeout(() => {
          if (keyBuf) onKey(keyBuf);
          keyBuf = "";
        }, 40);
        continue;
      }
      if (keyBuf) {
        keyBuf += ch;
        if (keyBuf.length >= 3 && /[A-Za-z~]$/.test(keyBuf)) {
          if (keyTimer) clearTimeout(keyTimer);
          onKey(keyBuf);
          keyBuf = "";
        } else if (keyBuf.length > 8) {
          if (keyTimer) clearTimeout(keyTimer);
          onKey(keyBuf);
          keyBuf = "";
        }
        continue;
      }
      if (b === 0x03 || b >= 0x20 || b === 0x0d) onKey(ch);
    }
  }

  function shutdown() {
    if (closed) return;
    closed = true;
    stopAudio();
    if (keyTimer) clearTimeout(keyTimer);
    try {
      stdin.removeListener("data", feed);
      if (stdin.isTTY) stdin.setRawMode?.(false);
      stdin.pause();
    } catch {
      /* ignore */
    }
    try {
      stdout.write(SHOW + ALT_OFF + RESET);
    } catch {
      /* ignore */
    }
    resolveClosed();
  }

  let resolveClosed!: () => void;
  const done = new Promise<void>((r) => {
    resolveClosed = r;
  });

  if (stdin.isTTY) {
    try {
      stdin.setRawMode?.(true);
    } catch {
      /* ignore */
    }
    stdin.resume();
    stdin.on("data", feed);
  }
  stdout.write(ALT_ON + HIDE + CLEAR);
  paint();

  // auto-start at first segment
  if (data.segments[0]) cursor = data.segments[0].start;
  paint();

  process.on("SIGINT", shutdown);
  await done;
  void startedWall;
}
