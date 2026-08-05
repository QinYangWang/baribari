/**
 * Full-screen TUI for live meeting transcription.
 * Three-column layout: speakers | transcript | side status.
 * No heavy deps — ANSI alt-screen + raw keyboard + screen-buffer diff.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AsrEngine, AudioSource, Lang, Segment, SpkEngine, TranscribeArgs } from "./types.js";
import {
  cycleVadPreset,
  displayText,
  isPartialSegment,
  lowLatencyVad,
  matchVadPreset,
  SPK_ENGINES,
  defaultSpkThreshold,
  spkEngineLabel,
} from "./types.js";
import { spkModelInfo } from "./speaker-models.js";
import {
  defaultRecordDir,
  flushSaveSettings,
  normalizeRecordDir,
  scheduleSaveSettings,
  snapshotFromArgs,
} from "./settings.js";
import {
  aiActive,
  aiProviderLabel,
  cycleAiProvider,
  resolveApiKey,
  TRANSLATE_OPTIONS,
  translateLangLabel,
} from "./ai.js";
import {
  t,
  getUiLang,
  setUiLang,
  UI_LANGS,
  uiLangLabel,
  localeTag,
  type UiLang,
} from "./i18n/index.js";
import { renameSession } from "./session.js";
import { createKeyFeeder } from "./key-input.js";
import { checkModels } from "./paths.js";
import { modelOverridesFromSettings } from "./settings.js";
import { downloadAsrModel, downloadSpkModel } from "./setup.js";

/** Prefer a non-internal IPv4 for LAN share URLs. */
function lanIPv4(): string[] {
  const out: string[] = [];
  const ifs = os.networkInterfaces();
  for (const list of Object.values(ifs)) {
    if (!list) continue;
    for (const a of list) {
      if (a.family === "IPv4" && !a.internal) out.push(a.address);
    }
  }
  return out.length ? out : ["127.0.0.1"];
}

function shareAccessHost(port: number): string {
  const ip = lanIPv4()[0] || "127.0.0.1";
  return `${ip}:${port}`;
}

function shareAccessUrl(port: number): string {
  return `http://${shareAccessHost(port)}`;
}

const ESC = "\x1b";
const RESET = `${ESC}[0m`;
const HIDE_CUR = `${ESC}[?25l`;
const SHOW_CUR = `${ESC}[?25h`;
const ALT_ON = `${ESC}[?1049h`;
const ALT_OFF = `${ESC}[?1049l`;
/** Enable mouse tracking (normal + SGR coords) for wheel scroll. */
const MOUSE_ON = `${ESC}[?1000h${ESC}[?1006h`;
const MOUSE_OFF = `${ESC}[?1000l${ESC}[?1006l`;
const CLEAR = `${ESC}[2J${ESC}[H`;

const WIDE_MIN = 140;
const MEDIUM_MIN = 100;
const MIN_W = 80;
const MIN_H = 24;

type RGB = [number, number, number];
type UiMode =
  | "normal"
  | "speaker-list"
  | "speaker-rename"
  | "speaker-merge"
  | "session-rename"
  | "settings"
  | "settings-edit";

interface Cell {
  char: string;
  fg?: RGB;
  bg?: RGB;
  bold?: boolean;
  dim?: boolean;
  continuation?: boolean;
  /** OSC 8 hyperlink target (terminal clickable URL). */
  href?: string;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Layout {
  statusBar: Rect;
  speakerList: Rect | null;
  transcript: Rect;
  sidePanel: Rect | null;
  /** Toast / runtime message strip above footer (null when idle). */
  messageBar: Rect | null;
  footer: Rect;
  settingsDialog: Rect;
  mode: "wide" | "medium" | "narrow" | "tiny";
}

interface Speaker {
  id: string;
  detectedLabel: string;
  displayName: string;
  color: RGB;
  alias?: string;
  segmentCount: number;
  isActive: boolean;
  manual: boolean;
}

interface TranscriptSegment {
  id: string;
  speakerId: string | null;
  startedAtMs: number;
  endedAtMs?: number;
  originalText: string;
  translatedText?: string;
  isFinal: boolean;
  isActive: boolean;
  /** AI still running on this segment. */
  pending?: boolean;
  /** Same-speaker turn still growing (merge in progress). */
  isDraft?: boolean;
  wall: Date;
}

export interface TuiHandle {
  emit: (seg: Segment) => void;
  setStatus: (msg: string) => void;
  setDevice: (name: string) => void;
  /** AI pipeline busy — shows loading in message bar. */
  setAiBusy?: (busy: boolean) => void;
  close: () => void;
  waitClosed: () => Promise<void>;
}

// ── theme ────────────────────────────────────────────────

const C = {
  border: [63, 63, 70] as RGB,
  panelBorder: [82, 82, 91] as RGB,
  title: [244, 244, 245] as RGB,
  muted: [161, 161, 170] as RGB,
  dim: [113, 113, 122] as RGB,
  accent: [167, 139, 250] as RGB,
  ok: [52, 211, 153] as RGB,
  warn: [251, 191, 36] as RGB,
  err: [248, 113, 113] as RGB,
  cyan: [94, 234, 212] as RGB,
  translate: [52, 211, 153] as RGB,
  key: [212, 212, 216] as RGB,
  panelBg: [24, 24, 27] as RGB,
  activeBg: [30, 27, 46] as RGB,
  selectBg: [39, 32, 58] as RGB,
  bar: [39, 39, 42] as RGB,
  white: [250, 250, 250] as RGB,
};

const SPK_COLORS: RGB[] = [
  [94, 234, 212],
  [251, 191, 36],
  [244, 114, 182],
  [129, 140, 248],
  [74, 222, 128],
  [248, 113, 113],
  [56, 189, 248],
  [192, 132, 252],
];

const LANGS: Lang[] = ["auto", "zh", "en", "ja", "ko", "yue"];
const ASR_ENGINES: AsrEngine[] = [
  "sensevoice",
  "funasr-nano",
  "reazonspeech-ja",
];

function asrEngineLabel(engine: AsrEngine): string {
  if (engine === "funasr-nano") return "Fun-ASR-Nano";
  if (engine === "reazonspeech-ja") return t("settings.asrEngine.reazonSpeechName");
  return "SenseVoice";
}

function asrEngineSize(engine: AsrEngine): string {
  if (engine === "funasr-nano") return "1 GB";
  if (engine === "reazonspeech-ja") return "162 MB";
  return "230 MB";
}
function langLabelOf(lang: string): string {
  const key = `lang.${lang}` as const;
  const v = t(key);
  return v === key ? lang : v;
}

// ── text width helpers ───────────────────────────────────

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

/** East-Asian / emoji display width in terminal columns. Critical for panel clipping. */
export function dw(s: string): number {
  let w = 0;
  for (const ch of stripAnsi(s)) {
    const c = ch.codePointAt(0)!;
    // zero-width / combining
    if (
      c === 0x200b ||
      c === 0x200c ||
      c === 0x200d ||
      c === 0xfeff ||
      (c >= 0x0300 && c <= 0x036f) ||
      (c >= 0xfe00 && c <= 0xfe0f) ||
      (c >= 0xe0100 && c <= 0xe01ef)
    ) {
      continue;
    }
    // wide: CJK, Hangul, fullwidth, emoji, rare planes
    if (
      c >= 0x1100 &&
      (c <= 0x115f ||
        c === 0x2329 ||
        c === 0x232a ||
        (c >= 0x2e80 && c <= 0xa4cf) ||
        (c >= 0xac00 && c <= 0xd7a3) ||
        (c >= 0xf900 && c <= 0xfaff) ||
        (c >= 0xfe10 && c <= 0xfe19) ||
        (c >= 0xfe30 && c <= 0xfe6f) ||
        (c >= 0xff00 && c <= 0xff60) ||
        (c >= 0xffe0 && c <= 0xffe6) ||
        (c >= 0x1b000 && c <= 0x1b0ff) ||
        (c >= 0x1f200 && c <= 0x1f9ff) ||
        (c >= 0x20000 && c <= 0x3fffd))
    ) {
      w += 2;
    } else {
      w += 1;
    }
  }
  return w;
}

function truncateDisplay(text: string, maxWidth: number): string {
  if (maxWidth <= 0) return "";
  if (dw(text) <= maxWidth) return text;
  if (maxWidth === 1) return "…";
  let out = "";
  let w = 0;
  for (const ch of text) {
    const cw = dw(ch);
    // keep 1 col for ellipsis; never start a wide char with only 1 col left
    if (w + cw > maxWidth - 1) break;
    out += ch;
    w += cw;
  }
  // if nothing fit (e.g. maxWidth=2 and first char is wide), just ellipsis
  if (!out) return "…";
  return out + "…";
}

/** Keep head + tail for long ids (model names, paths, URLs). */
function truncateMiddleDisplay(text: string, maxWidth: number): string {
  if (maxWidth <= 0) return "";
  if (dw(text) <= maxWidth) return text;
  if (maxWidth <= 3) return truncateDisplay(text, maxWidth);
  const ell = "…";
  const budget = maxWidth - dw(ell);
  const headBudget = Math.max(1, Math.ceil(budget * 0.55));
  const tailBudget = Math.max(1, budget - headBudget);
  let head = "";
  let hw = 0;
  for (const ch of text) {
    const cw = dw(ch);
    if (hw + cw > headBudget) break;
    head += ch;
    hw += cw;
  }
  let tail = "";
  let tw = 0;
  for (let i = text.length - 1; i >= 0; i--) {
    const ch = text[i]!;
    const cw = dw(ch);
    if (tw + cw > tailBudget) break;
    tail = ch + tail;
    tw += cw;
  }
  if (head.length + tail.length >= text.length) return text;
  return head + ell + tail;
}

function padDisplay(
  text: string,
  width: number,
  align: "left" | "right" | "center" = "left",
): string {
  const n = dw(text);
  if (n >= width) return truncateDisplay(text, width);
  const padN = width - n;
  if (align === "right") return " ".repeat(padN) + text;
  if (align === "center") {
    const L = Math.floor(padN / 2);
    return " ".repeat(L) + text + " ".repeat(padN - L);
  }
  return text + " ".repeat(padN);
}

function wrapDisplay(text: string, width: number): string[] {
  if (width < 1) return [""];
  if (width < 4) return [truncateDisplay(text, width)];
  const out: string[] = [];
  let line = "";
  let lw = 0;
  for (const ch of text) {
    const cw = dw(ch);
    if (cw > width) {
      // glyph wider than column (shouldn't happen for normal CJK at width>=2)
      if (line) {
        out.push(line);
        line = "";
        lw = 0;
      }
      continue;
    }
    if (lw + cw > width) {
      if (line) out.push(line);
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

function fmtClock(d: Date): string {
  return d.toLocaleTimeString(localeTag(), { hour12: false });
}

function fmtDur(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

function fmtRange(a: number, b?: number): string {
  if (b == null) return `${fmtDur(a)}–…`;
  return `${fmtDur(a)}–${fmtDur(b)}`;
}

function maskApiKey(key: string): string {
  if (!key) return t("common.unset");
  if (key.length <= 6) return "*".repeat(key.length);
  const prefix = key.slice(0, 3);
  return prefix + "*".repeat(Math.min(20, key.length - 3));
}

function normalizeBaseUrl(url: string): string | null {
  const trimmed = url.trim().replace(/\/+$/, "");
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return trimmed;
  } catch {
    return null;
  }
}

// ── screen buffer ────────────────────────────────────────

function emptyCell(): Cell {
  return { char: " " };
}

function createScreenBuffer(width: number, height: number): Cell[][] {
  const buf: Cell[][] = [];
  for (let y = 0; y < height; y++) {
    const row: Cell[] = [];
    for (let x = 0; x < width; x++) row.push(emptyCell());
    buf.push(row);
  }
  return buf;
}

function rgbEq(a?: RGB, b?: RGB): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

function cellEq(a: Cell, b: Cell): boolean {
  return (
    a.char === b.char &&
    rgbEq(a.fg, b.fg) &&
    rgbEq(a.bg, b.bg) &&
    !!a.bold === !!b.bold &&
    !!a.dim === !!b.dim &&
    !!a.continuation === !!b.continuation &&
    (a.href || "") === (b.href || "")
  );
}

function sgr(cell: Cell): string {
  let s = `${ESC}[0m`;
  if (cell.bold) s += `${ESC}[1m`;
  if (cell.dim) s += `${ESC}[2m`;
  if (cell.fg) s += `${ESC}[38;2;${cell.fg[0]};${cell.fg[1]};${cell.fg[2]}m`;
  if (cell.bg) s += `${ESC}[48;2;${cell.bg[0]};${cell.bg[1]};${cell.bg[2]}m`;
  return s;
}

function putChar(
  buf: Cell[][],
  x: number,
  y: number,
  ch: string,
  style: Partial<Cell> = {},
  /** exclusive right bound (column index). Wide chars that would cross are dropped. */
  maxX?: number,
): void {
  const row = buf[y];
  if (!row || x < 0 || x >= row.length || y < 0) return;
  const cw = dw(ch);
  if (cw <= 0) return;
  // hard clip: never write past maxX or buffer edge
  const right = maxX != null ? Math.min(maxX, row.length) : row.length;
  if (x >= right) return;
  if (x + cw > right) {
    // not enough room for this glyph (typical: wide CJK at last col)
    // leave a blank so we don't spill into the next panel
    row[x] = {
      char: " ",
      fg: style.fg,
      bg: style.bg,
      bold: style.bold,
      dim: style.dim,
      continuation: false,
      href: style.href,
    };
    return;
  }
  // clear previous wide-char tail if overwriting mid-cell
  if (row[x]?.continuation && x > 0) {
    row[x - 1] = emptyCell();
  }
  // if overwriting start of a previous wide char, clear its tail
  if (row[x] && !row[x]!.continuation && dw(row[x]!.char) === 2 && x + 1 < row.length) {
    if (row[x + 1]?.continuation) row[x + 1] = emptyCell();
  }
  row[x] = {
    char: ch,
    fg: style.fg,
    bg: style.bg,
    bold: style.bold,
    dim: style.dim,
    continuation: false,
    href: style.href,
  };
  if (cw === 2) {
    row[x + 1] = {
      char: " ",
      fg: style.fg,
      bg: style.bg,
      bold: style.bold,
      dim: style.dim,
      continuation: true,
      href: style.href,
    };
  }
}

function putText(
  buf: Cell[][],
  x: number,
  y: number,
  text: string,
  style: Partial<Cell> = {},
  maxW?: number,
): number {
  let cx = x;
  const limit = maxW != null ? x + Math.max(0, maxW) : Infinity;
  for (const ch of text) {
    const cw = dw(ch);
    if (cx + cw > limit) break;
    if (cx >= (buf[0]?.length ?? 0)) break;
    putChar(buf, cx, y, ch, style, limit);
    cx += cw;
  }
  return cx - x;
}

/** Clear interior of a box (between borders) so stale cells never bleed. */
function clearPanelInterior(buf: Cell[][], r: Rect, style: Partial<Cell> = {}): void {
  if (r.w < 3 || r.h < 3) return;
  fillRect(
    buf,
    { x: r.x + 1, y: r.y + 1, w: Math.max(0, r.w - 2), h: Math.max(0, r.h - 2) },
    style,
    " ",
  );
}

function fillRect(
  buf: Cell[][],
  r: Rect,
  style: Partial<Cell> = {},
  ch = " ",
): void {
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; ) {
      putChar(buf, x, y, ch, style);
      x += dw(ch) || 1;
    }
  }
}

function drawBox(
  buf: Cell[][],
  r: Rect,
  title?: string,
  border: RGB = C.border,
  titleFg: RGB = C.cyan,
): void {
  if (r.w < 2 || r.h < 2) return;
  const style = { fg: border };
  putChar(buf, r.x, r.y, "┌", style);
  putChar(buf, r.x + r.w - 1, r.y, "┐", style);
  putChar(buf, r.x, r.y + r.h - 1, "└", style);
  putChar(buf, r.x + r.w - 1, r.y + r.h - 1, "┘", style);
  for (let x = r.x + 1; x < r.x + r.w - 1; x++) {
    putChar(buf, x, r.y, "─", style);
    putChar(buf, x, r.y + r.h - 1, "─", style);
  }
  for (let y = r.y + 1; y < r.y + r.h - 1; y++) {
    putChar(buf, r.x, y, "│", style);
    putChar(buf, r.x + r.w - 1, y, "│", style);
  }
  if (title) {
    const titleText = ` ${truncateDisplay(title, r.w - 4)} `;
    putText(buf, r.x + 1, r.y, titleText, { fg: titleFg, bold: true });
  }
}

/**
 * Embed action labels into the bottom border line (right-aligned):
 * └──────── Save(Y/Enter) ─ Cancel(N/Esc) ─┘
 */
function drawBottomBorderActions(
  buf: Cell[][],
  r: Rect,
  border: RGB = C.border,
): void {
  if (r.w < 8 || r.h < 2) return;
  const by = r.y + r.h - 1;
  // Keep border glyphs on accent/border color (never default white)
  const style = { fg: border, bg: C.panelBg };
  putChar(buf, r.x, by, "└", style);
  putChar(buf, r.x + r.w - 1, by, "┘", style);
  for (let x = r.x + 1; x < r.x + r.w - 1; x++) {
    putChar(buf, x, by, "─", style);
  }
  const save = t("footer.btnSave");
  const cancel = t("footer.btnCancel");
  // Right-aligned: " Save ─ Cancel ─"
  const chunkW = 1 + dw(save) + 3 + dw(cancel) + 2;
  let start = r.x + r.w - 1 - chunkW;
  if (start < r.x + 2) start = r.x + 2;
  let x = start;
  putChar(buf, x, by, " ", style);
  x += 1;
  putText(buf, x, by, save, { fg: C.ok, bold: true, bg: C.panelBg });
  x += dw(save);
  putText(buf, x, by, " ─ ", style);
  x += 3;
  putText(buf, x, by, cancel, { fg: C.muted, bg: C.panelBg });
  x += dw(cancel);
  putText(buf, x, by, " ─", style);
}

/** Download prompt actions: foreground, background, cancel. */
function drawDownloadActions(buf: Cell[][], r: Rect, border: RGB): void {
  if (r.w < 8 || r.h < 2) return;
  const by = r.y + r.h - 1;
  const style = { fg: border, bg: C.panelBg };
  putChar(buf, r.x, by, "└", style);
  putChar(buf, r.x + r.w - 1, by, "┘", style);
  for (let x = r.x + 1; x < r.x + r.w - 1; x++) putChar(buf, x, by, "─", style);
  const labels = [
    { text: t("footer.downloadHere"), fg: C.ok },
    { text: t("footer.downloadBackground"), fg: C.accent },
    { text: t("footer.btnCancel"), fg: C.muted },
  ];
  const joined = labels.map((x) => x.text).join("  ");
  let x = Math.max(r.x + 2, r.x + r.w - 2 - dw(joined));
  for (const [i, label] of labels.entries()) {
    if (i > 0) {
      putText(buf, x, by, "  ", style);
      x += 2;
    }
    const room = r.x + r.w - 1 - x;
    if (room <= 0) break;
    const shown = truncateDisplay(label.text, room);
    putText(buf, x, by, shown, { fg: label.fg, bold: i < 2, bg: C.panelBg }, room);
    x += dw(shown);
  }
}

function dimBackground(buf: Cell[][]): void {
  for (const row of buf) {
    for (const cell of row) {
      if (cell.continuation) continue;
      cell.dim = true;
      if (cell.fg) {
        cell.fg = [
          Math.floor(cell.fg[0] * 0.45),
          Math.floor(cell.fg[1] * 0.45),
          Math.floor(cell.fg[2] * 0.45),
        ];
      } else {
        cell.fg = C.dim;
      }
    }
  }
}

function flushDiff(
  prev: Cell[][] | null,
  next: Cell[][],
  stdout: NodeJS.WriteStream,
): void {
  const H = next.length;
  const W = next[0]?.length ?? 0;
  let out = HIDE_CUR;
  let lastSgr = "";

  for (let y = 0; y < H; y++) {
    const nrow = next[y]!;
    const prow = prev?.[y];
    let x = 0;
    while (x < W) {
      const nc = nrow[x]!;
      if (nc.continuation) {
        x++;
        continue;
      }
      const pc = prow?.[x];
      if (pc && cellEq(pc, nc) && (!nrow[x + 1]?.continuation || (prow?.[x + 1] && cellEq(prow[x + 1]!, nrow[x + 1]!)))) {
        x += dw(nc.char) || 1;
        continue;
      }
      // find run of changed cells
      let end = x;
      while (end < W) {
        const c = nrow[end]!;
        if (c.continuation) {
          end++;
          continue;
        }
        const p = prow?.[end];
        const same =
          p &&
          cellEq(p, c) &&
          (!nrow[end + 1]?.continuation ||
            (prow?.[end + 1] && cellEq(prow[end + 1]!, nrow[end + 1]!)));
        if (same && end > x) break;
        if (same && end === x) {
          end += dw(c.char) || 1;
          break;
        }
        end += dw(c.char) || 1;
      }
      // Absolute-position every glyph so a single wrong display-width cannot
      // desync the rest of the line into neighbor panels (CJK overflow).
      let cx = x;
      let openHref: string | undefined;
      while (cx < end && cx < W) {
        const c = nrow[cx]!;
        if (c.continuation) {
          cx++;
          continue;
        }
        out += `${ESC}[${y + 1};${cx + 1}H`;
        const href = c.href;
        if (href !== openHref) {
          if (openHref) out += `${ESC}]8;;${ESC}\\`;
          if (href) out += `${ESC}]8;;${href}${ESC}\\`;
          openHref = href;
        }
        const sg = sgr(c);
        if (sg !== lastSgr) {
          out += sg;
          lastSgr = sg;
        }
        out += c.char === "" ? " " : c.char;
        cx += Math.max(1, dw(c.char) || 1);
      }
      if (openHref) out += `${ESC}]8;;${ESC}\\`;
      x = end;
    }
  }
  out += RESET;
  stdout.write(out);
}

// ── layout ───────────────────────────────────────────────

function computeLayout(W: number, H: number, showMessageBar: boolean): Layout {
  if (W < MIN_W || H < MIN_H) {
    return {
      statusBar: { x: 0, y: 0, w: W, h: 1 },
      speakerList: null,
      transcript: { x: 0, y: 1, w: W, h: Math.max(1, H - 2) },
      sidePanel: null,
      messageBar: null,
      footer: { x: 0, y: H - 1, w: W, h: 1 },
      settingsDialog: {
        x: 1,
        y: 1,
        w: Math.max(2, W - 2),
        h: Math.max(2, H - 2),
      },
      mode: "tiny",
    };
  }

  const statusH = 1;
  const footerH = 1;
  const msgH = showMessageBar ? 3 : 0;
  const bodyY = statusH;
  const bodyH = H - statusH - footerH - msgH;

  let mode: Layout["mode"] = "wide";
  let leftW = 0;
  let rightW = 0;

  if (W >= WIDE_MIN) {
    mode = "wide";
    // Keep speaker column wide enough for CJK hints (display width ≈ 2× chars)
    leftW = Math.min(32, Math.max(26, Math.floor(W * 0.18)));
    rightW = Math.min(34, Math.max(26, Math.floor(W * 0.22)));
  } else if (W >= MEDIUM_MIN) {
    mode = "medium";
    leftW = Math.min(30, Math.max(24, Math.floor(W * 0.22)));
    rightW = 0;
  } else {
    mode = "narrow";
    leftW = 0;
    rightW = 0;
  }

  const midW = W - leftW - rightW;
  const speakerList: Rect | null =
    leftW > 0 ? { x: 0, y: bodyY, w: leftW, h: bodyH } : null;
  const sidePanel: Rect | null =
    rightW > 0 ? { x: leftW + midW, y: bodyY, w: rightW, h: bodyH } : null;
  const transcript: Rect = {
    x: leftW,
    y: bodyY,
    w: midW,
    h: bodyH,
  };

  const messageBar: Rect | null = showMessageBar
    ? { x: 0, y: H - footerH - msgH, w: W, h: msgH }
    : null;

  const dlgW = Math.min(72, Math.max(52, W - 6));
  const dlgH = Math.min(H - 2, Math.max(20, H - 4));
  const settingsDialog: Rect = {
    x: Math.max(0, Math.floor((W - dlgW) / 2)),
    y: Math.max(0, Math.floor((H - dlgH) / 2)),
    w: dlgW,
    h: dlgH,
  };

  return {
    statusBar: { x: 0, y: 0, w: W, h: statusH },
    speakerList,
    transcript,
    sidePanel,
    messageBar,
    footer: { x: 0, y: H - 1, w: W, h: footerH },
    settingsDialog,
    mode,
  };
}

// ── create TUI ───────────────────────────────────────────

export function createTui(
  args: TranscribeArgs,
  opts: {
    onQuit: () => void;
    /** Live session dir for rename (meta.json). */
    sessionDir?: string;
    sessionName?: string;
    sessionId?: string;
    onSessionRenamed?: (name: string) => void;
    /** Global roster / tracker display name for ASR speaker index. */
    resolveSpeakerName?: (spk: number) => string | undefined;
    /** Rename ASR speaker → promote/update global voiceprint roster. */
    onSpeakerRenamed?: (spk: number, name: string) => void;
  },
): TuiHandle {
  if (args.uiLang) setUiLang(args.uiLang);
  /** Committed finals only (history list). */
  const segments: TranscriptSegment[] = [];
  /**
   * Single refreshable live/partial row (TMSpeech-style).
   * Not selectable for speaker assign; not written to session/share.
   */
  let livePartial: {
    text: string;
    start?: number;
    wall: Date;
    spk: number | null;
  } | null = null;
  const speakers = new Map<string, Speaker>();
  let nextManualId = 1;
  let segSeq = 0;

  let status = t("status.starting");
  let deviceName = "—";
  let scroll = 0;
  let dirty = true;
  let closed = false;
  let pulse = 0;
  let aiBusy = false;
  /** Earliest time we may clear aiBusy (keep spinner visible briefly). */
  let aiBusyHoldUntil = 0;
  /** Min time to show AI spinner / keep pending chrome (avoid flash). */
  const AI_BUSY_MIN_MS = 480;
  const pendingHold = new Map<string, number>(); // seg id → show spinner until
  /** Coalesce rapid draft/partial paints to cut merge flicker. */
  let paintTimer: ReturnType<typeof setTimeout> | null = null;
  let lastPaintAt = 0;
  const startedAt = Date.now();
  let recordStartedAt: number | null = null;
  let sessionName = (opts.sessionName || "").trim();
  const sessionDir = opts.sessionDir;
  const sessionId = opts.sessionId || "";

  let mode: UiMode = "normal";
  let focusPanel: "transcript" | "speakers" | "side" = "transcript";
  let speakerSel = 0;
  let speakerScroll = 0;
  let renameDraft = "";
  let sessionRenameDraft = "";
  /** Multi-select merge in speaker panel only. */
  let mergeSelected = new Set<string>();
  /** After Esc: ask whether to save the multi-select merge. */
  let mergeConfirm = false;

  let settingsFocus = 0;
  let settingsScroll = 0;
  let editDraft = "";
  let editField: string | null = null;

  /** Top-right toast / notice (user tips). confirm → center dialog like rename. */
  let toast: {
    kind: "error" | "warn" | "info";
    title: string;
    body: string;
    /** If true, y saves / n·Esc discards (merge confirm). */
    confirm?: boolean;
    onConfirm?: () => void;
    onCancel?: () => void;
    onBackground?: () => void;
    blocking?: boolean;
  } | null = null;
  let modelDownload: {
    kind: "asr" | "spk";
    engine: AsrEngine | SpkEngine;
    name: string;
    percent: number;
    stage: "downloading" | "extracting";
    background: boolean;
  } | null = null;
  let toastTimer: ReturnType<typeof setTimeout> | null = null;

  let prevBuf: Cell[][] | null = null;
  let lastW = 0;
  let lastH = 0;

  let out: fs.WriteStream | null = null;
  if (args.output) {
    out = fs.createWriteStream(args.output, { flags: "a", encoding: "utf8" });
  }

  let resolveClosed!: () => void;
  const closedPromise = new Promise<void>((r) => {
    resolveClosed = r;
  });

  const stdout = process.stdout;
  const stdin = process.stdin;

  function cols(): number {
    return stdout.columns || 80;
  }
  function rows(): number {
    return stdout.rows || 24;
  }

  function speakerIdFromSpk(spk: number | null): string | null {
    if (spk == null) return null;
    return `spk_${spk}`;
  }

  function ensureSpeaker(spk: number | null): string | null {
    if (spk == null) return null;
    const id = speakerIdFromSpk(spk)!;
    const rosterName = opts.resolveSpeakerName?.(spk)?.trim();
    if (!speakers.has(id)) {
      const color = SPK_COLORS[(spk - 1) % SPK_COLORS.length]!;
      speakers.set(id, {
        id,
        detectedLabel: `speaker_${spk}`,
        displayName: rosterName || t("common.speakerN", { n: spk }),
        color,
        segmentCount: 0,
        isActive: false,
        manual: false,
      });
    } else if (rosterName) {
      // Keep UI name in sync when global roster already has a label
      const sp = speakers.get(id)!;
      if (
        !sp.manual &&
        (sp.displayName === t("common.speakerN", { n: spk }) ||
          sp.displayName.startsWith("Speaker "))
      ) {
        sp.displayName = rosterName;
      }
    }
    return id;
  }

  function speakerList(): Speaker[] {
    return [...speakers.values()].sort((a, b) => {
      // auto first by numeric id, then manual
      const an = a.manual ? 1000 : parseInt(a.detectedLabel.replace(/\D/g, ""), 10) || 0;
      const bn = b.manual ? 1000 : parseInt(b.detectedLabel.replace(/\D/g, ""), 10) || 0;
      if (a.manual !== b.manual) return a.manual ? 1 : -1;
      return an - bn || a.displayName.localeCompare(b.displayName);
    });
  }

  function sourceLabel(s: AudioSource): string {
    if (s === "loopback") return t("source.loopback");
    if (s === "both") return t("source.both");
    return t("source.mic");
  }

  function sourceDetail(s: AudioSource): string {
    if (s === "loopback") return t("source.loopbackDetail");
    if (s === "both") return t("source.bothDetail");
    return t("source.mic");
  }

  function langLabel(lang: Lang): string {
    return langLabelOf(lang);
  }

  function persist(): void {
    scheduleSaveSettings(() => snapshotFromArgs(args));
  }

  // ── settings items ─────────────────────────────────────

  type SettingKind =
    | "uiLang"
    | "asrEngine"
    | "lang"
    | "spkEngine"
    | "spkThr"
    | "aiEn"
    | "aiTranslate"
    | "aiProvider"
    | "aiBase"
    | "aiKey"
    | "aiModel"
    | "source"
    | "recDir"
    | "record"
    | "share"
    | "sharePort"
    | "shareHost"
    | "vadPreset"
    | "vadThr"
    | "vadMinSp"
    | "vadSil"
    | "vadMax"
    | "vadWin";

  interface SettingItem {
    key: SettingKind;
    label: string;
    help: string;
    group: string;
  }

  function getSettingItems(): SettingItem[] {
    return [
    {
      key: "uiLang",
      label: t("settings.items.uiLang.label"),
      help: t("settings.items.uiLang.help"),
      group: t("settings.groups.ui"),
    },
    {
      key: "asrEngine",
      label: t("settings.items.asrEngine.label"),
      help: t("settings.items.asrEngine.help"),
      group: t("settings.groups.asr"),
    },
    {
      key: "lang",
      label: t("settings.items.lang.label"),
      help: t("settings.items.lang.help"),
      group: t("settings.groups.asr"),
    },
    {
      key: "spkEngine",
      label: t("settings.items.spkEngine.label"),
      help: t("settings.items.spkEngine.help"),
      group: t("settings.groups.asr"),
    },
    {
      key: "spkThr",
      label: t("settings.items.spkThr.label"),
      help: t("settings.items.spkThr.help"),
      group: t("settings.groups.asr"),
    },
    {
      key: "aiEn",
      label: t("settings.items.aiEn.label"),
      help: t("settings.items.aiEn.help"),
      group: t("settings.groups.ai"),
    },
    {
      key: "aiTranslate",
      label: t("settings.items.aiTranslate.label"),
      help: t("settings.items.aiTranslate.help"),
      group: t("settings.groups.ai"),
    },
    {
      key: "aiProvider",
      label: t("settings.items.aiProvider.label"),
      help: t("settings.items.aiProvider.help"),
      group: t("settings.groups.ai"),
    },
    {
      key: "aiBase",
      label: t("settings.items.aiBase.label"),
      help: t("settings.items.aiBase.help"),
      group: t("settings.groups.ai"),
    },
    {
      key: "aiKey",
      label: t("settings.items.aiKey.label"),
      help: t("settings.items.aiKey.help"),
      group: t("settings.groups.ai"),
    },
    {
      key: "aiModel",
      label: t("settings.items.aiModel.label"),
      help: t("settings.items.aiModel.help"),
      group: t("settings.groups.ai"),
    },
    {
      key: "source",
      label: t("settings.items.source.label"),
      help: t("settings.items.source.help"),
      group: t("settings.groups.audio"),
    },
    {
      key: "recDir",
      label: t("settings.items.recDir.label"),
      help: t("settings.items.recDir.help"),
      group: t("settings.groups.audio"),
    },
    {
      key: "record",
      label: t("settings.items.record.label"),
      help: t("settings.items.record.help"),
      group: t("settings.groups.audio"),
    },
    {
      key: "share",
      label: t("settings.items.share.label"),
      help: t("settings.items.share.help"),
      group: t("settings.groups.share"),
    },
    {
      key: "sharePort",
      label: t("settings.items.sharePort.label"),
      help: t("settings.items.sharePort.help"),
      group: t("settings.groups.share"),
    },
    {
      key: "shareHost",
      label: t("settings.items.shareHost.label"),
      help: t("settings.items.shareHost.help"),
      group: t("settings.groups.share"),
    },
    {
      key: "vadPreset",
      label: t("settings.items.vadPreset.label"),
      help: t("settings.items.vadPreset.help"),
      group: t("settings.groups.vad"),
    },
    {
      key: "vadThr",
      label: t("settings.items.vadThr.label"),
      help: t("settings.items.vadThr.help"),
      group: t("settings.groups.vad"),
    },
    {
      key: "vadMinSp",
      label: t("settings.items.vadMinSp.label"),
      help: t("settings.items.vadMinSp.help"),
      group: t("settings.groups.vad"),
    },
    {
      key: "vadSil",
      label: t("settings.items.vadSil.label"),
      help: t("settings.items.vadSil.help"),
      group: t("settings.groups.vad"),
    },
    {
      key: "vadMax",
      label: t("settings.items.vadMax.label"),
      help: t("settings.items.vadMax.help"),
      group: t("settings.groups.vad"),
    },
    {
      key: "vadWin",
      label: t("settings.items.vadWin.label"),
      help: t("settings.items.vadWin.help"),
      group: t("settings.groups.vad"),
    },
  ];
  }

  type SettingsVisLine =
    | { kind: "group-top"; title: string }
    | { kind: "group-bot" }
    | { kind: "gap" }
    | { kind: "item"; index: number };

  function buildSettingsVisLines(): SettingsVisLine[] {
    const lines: SettingsVisLine[] = [];
    let prevGroup = "";
    const _items = getSettingItems();
    for (let i = 0; i < _items.length; i++) {
      const it = _items[i]!;
      if (it.group !== prevGroup) {
        if (prevGroup) {
          lines.push({ kind: "group-bot" });
          lines.push({ kind: "gap" });
        }
        lines.push({ kind: "group-top", title: it.group });
        prevGroup = it.group;
      }
      lines.push({ kind: "item", index: i });
    }
    if (prevGroup) lines.push({ kind: "group-bot" });
    return lines;
  }

  function settingsItemLineIndex(itemIndex: number): number {
    const lines = buildSettingsVisLines();
    return lines.findIndex((l) => l.kind === "item" && l.index === itemIndex);
  }

  function barStr(v: number, min: number, max: number, w = 10): string {
    const ratio = Math.max(0, Math.min(1, (v - min) / (max - min)));
    const f = Math.round(ratio * w);
    return "█".repeat(f) + "░".repeat(w - f);
  }

  /** bar first, then right-aligned numeric value */
  function barValue(bar: string, value: string, valueW = 7): string {
    return `${bar}  ${padDisplay(value, valueW, "right")}`;
  }

  function settingValueText(key: SettingKind): {
    text: string;
    fg: RGB;
    dim?: boolean;
    barFg?: RGB;
  } {
    const aiOff = !args.ai.enabled;
    switch (key) {
      case "uiLang":
        return {
          text: uiLangLabel(args.uiLang || getUiLang()),
          fg: C.accent,
        };
      case "lang":
        return { text: langLabel(args.lang), fg: C.accent };
      case "asrEngine":
        return {
          text: asrEngineLabel(args.asrEngine),
          fg: C.accent,
        };
      case "spkEngine":
        return {
          text: args.noSpk
            ? t("common.off")
            : spkEngineLabel(args.spkEngine),
          fg: args.noSpk ? C.muted : C.accent,
        };
      case "spkThr":
        return {
          text: barValue(
            barStr(args.spkThreshold, 0.2, 0.95),
            args.spkThreshold.toFixed(2),
          ),
          fg: C.muted,
          barFg: C.accent,
        };
      case "aiEn":
        return args.ai.enabled
          ? aiActive(args.ai)
            ? { text: t("common.on"), fg: C.ok }
            : { text: t("common.openMissingKey"), fg: C.warn }
          : { text: t("common.off"), fg: C.muted };
      case "aiTranslate": {
        const label = translateLangLabel(args.ai.translateTo);
        return {
          text: label,
          fg: args.ai.translateTo
            ? aiOff
              ? C.dim
              : C.accent
            : C.muted,
          dim: aiOff || !args.ai.translateTo,
        };
      }
      case "aiProvider":
        return {
          text: aiProviderLabel(args.ai),
          fg: aiOff ? C.dim : C.accent,
          dim: aiOff,
        };
      case "aiBase":
        return {
          text: args.ai.baseUrl || t("common.empty"),
          fg: aiOff ? C.dim : C.muted,
          dim: aiOff,
        };
      case "aiKey": {
        const k = resolveApiKey(args.ai) || args.ai.apiKey;
        return {
          text: maskApiKey(k),
          fg: aiOff ? C.dim : C.muted,
          dim: aiOff,
        };
      }
      case "aiModel":
        return {
          text: args.ai.model || t("common.empty"),
          fg: aiOff ? C.dim : C.accent,
          dim: aiOff,
        };
      case "source":
        return { text: sourceDetail(args.source), fg: C.accent };
      case "recDir":
        return {
          text: args.recordDir || defaultRecordDir(),
          fg: C.muted,
        };
      case "record":
        return args.record
          ? { text: t("common.on"), fg: C.err }
          : { text: t("common.off"), fg: C.muted };
      case "share":
        return args.share.enabled
          ? { text: t("common.on"), fg: C.ok }
          : { text: t("common.off"), fg: C.muted };
      case "sharePort":
        return { text: String(args.share.port), fg: C.muted };
      case "shareHost":
        return { text: args.share.host || "0.0.0.0", fg: C.muted };
      case "vadPreset": {
        const id = matchVadPreset(args.vad, args.asrEngine);
        return {
          text: t(`settings.vadPreset.${id}`),
          fg: id === "custom" ? C.muted : C.accent,
          dim: id === "custom",
        };
      }
      case "vadThr":
        return {
          text: barValue(
            barStr(args.vad.threshold, 0.05, 0.95),
            args.vad.threshold.toFixed(2),
          ),
          fg: C.muted,
          barFg: C.accent,
        };
      case "vadMinSp":
        return {
          text: barValue(
            barStr(args.vad.minSpeechDuration, 0.1, 2),
            `${args.vad.minSpeechDuration.toFixed(2)}s`,
          ),
          fg: C.muted,
          barFg: C.accent,
        };
      case "vadSil":
        return {
          text: barValue(
            barStr(args.vad.minSilenceDuration, 0.1, 2),
            `${args.vad.minSilenceDuration.toFixed(2)}s`,
          ),
          fg: C.muted,
          barFg: C.accent,
        };
      case "vadMax":
        return {
          text: barValue(
            barStr(args.vad.maxSpeechDuration, 5, 60),
            `${args.vad.maxSpeechDuration.toFixed(0)}s`,
          ),
          fg: C.muted,
          barFg: C.accent,
        };
      case "vadWin":
        return {
          text: `${args.vad.windowSize}  (~${((args.vad.windowSize / 16000) * 1000).toFixed(0)}ms)`,
          fg: C.muted,
        };
    }
  }

  function ensureSettingsVisible(visible: number): void {
    const lines = buildSettingsVisLines();
    const itemLine = settingsItemLineIndex(settingsFocus);
    if (itemLine < 0) return;
    if (itemLine < settingsScroll) settingsScroll = itemLine;
    if (itemLine >= settingsScroll + visible) {
      settingsScroll = itemLine - visible + 1;
    }
    // show group header when selecting first item of group
    const it = getSettingItems()[settingsFocus];
    if (it) {
      const firstInGroup = getSettingItems().findIndex((x) => x.group === it.group);
      if (settingsFocus === firstInGroup && itemLine > 0) {
        const headerLine = itemLine - 1;
        if (headerLine < settingsScroll) settingsScroll = headerLine;
      }
    }
    settingsScroll = Math.max(
      0,
      Math.min(settingsScroll, Math.max(0, lines.length - visible)),
    );
  }

  function ensureSpeakerVisible(visible: number): void {
    const n = speakerList().length;
    if (speakerSel < speakerScroll) speakerScroll = speakerSel;
    if (speakerSel >= speakerScroll + visible) {
      speakerScroll = speakerSel - visible + 1;
    }
    speakerScroll = Math.max(0, Math.min(speakerScroll, Math.max(0, n - visible)));
  }

  // ── render views ───────────────────────────────────────

  function renderStatusBar(buf: Cell[][], layout: Layout): void {
    const r = layout.statusBar;
    fillRect(buf, r, { bg: C.panelBg });
    const paused = args.paused.value;
    const listenFg = paused ? C.warn : C.ok;
    const listen = paused
      ? `❚❚ ${t("tui.paused")}`
      : livePartial
        ? `${pulse % 2 === 0 ? "●" : "○"} ${t("tui.recognizing")}`
        : `${pulse % 2 === 0 ? "●" : "○"} ${t("tui.listening")}`;
    const aiOn = args.ai.enabled;
    const sharePart = args.share.enabled
      ? `${t("tui.share")} :${args.share.port}`
      : t("tui.shareOff");
    const elapsed = fmtDur((Date.now() - startedAt) / 1000);
    const spkN = speakers.size;
    const segN = segments.length;

    // Session alias only (never surface raw session id in the chrome)
    const namePart = sessionName
      ? truncateDisplay(sessionName, 36)
      : "";
    const parts: { t: string; fg: RGB; bold?: boolean }[] = [
      { t: t("tui.brand"), fg: C.accent, bold: true },
      { t: " ", fg: C.muted },
      { t: listen, fg: listenFg, bold: true },
    ];
    if (namePart) {
      parts.push(
        { t: " │ ", fg: C.border },
        {
          t: namePart,
          fg: C.title,
          bold: false,
        },
      );
    }
    parts.push(
      { t: " │ ", fg: C.border },
      { t: `${t("tui.source")} ${sourceLabel(args.source)}`, fg: C.muted },
      { t: " │ ", fg: C.border },
      { t: `${t("tui.language")} ${langLabel(args.lang)}`, fg: C.muted },
      { t: " │ ", fg: C.border },
      { t: `${t("tui.threshold")} ${args.spkThreshold.toFixed(2)}`, fg: C.muted },
      { t: " │ ", fg: C.border },
      {
        t: `${t("tui.aiEnh")} ${aiOn ? t("common.on") : t("common.off")}`,
        fg: aiOn ? C.ok : C.muted,
      },
      { t: " │ ", fg: C.border },
      { t: sharePart, fg: args.share.enabled ? C.ok : C.muted },
      { t: " │ ", fg: C.border },
      { t: t("tui.people", { n: spkN }), fg: C.muted },
      { t: " │ ", fg: C.border },
      { t: t("tui.segs", { n: segN }), fg: C.muted },
      { t: " │ ", fg: C.border },
      { t: elapsed, fg: C.muted },
    );

    let x = r.x + 1;
    const maxX = r.x + r.w - 1;
    for (const p of parts) {
      if (x >= maxX) break;
      const tw = putText(buf, x, r.y, p.t, { fg: p.fg, bold: p.bold, bg: C.panelBg }, maxX - x);
      x += tw;
    }
  }

  function effectiveStatus(): string {
    if (aiBusy) return t("status.aiProcessing");
    return status;
  }

  /** Session alias / idle chrome — never a toast notice. */
  function isAmbientLabel(msg: string): boolean {
    const st = msg.trim();
    if (!st) return true;
    if (sessionName && st === sessionName.trim()) return true;
    // Default auto name: "Meeting 2026-08-03 22:04" (and localized variants)
    if (/^Meeting \d{4}-\d{2}-\d{2}/.test(st)) return true;
    // Continue banner: "Resume {name} · +Ns" / 续录 / 続行
    if (/[·+]\s*\+?\d+s\s*$/i.test(st) && (st.includes("Resume") || st.includes("续录") || st.includes("続行"))) {
      return true;
    }
    return false;
  }

  function isIdleStatus(msg: string): boolean {
    const st = msg.trim();
    if (!st) return true;
    if (aiBusy) return false;
    if (isAmbientLabel(st)) return true;
    if (st === t("status.listening") || st === t("tui.listening")) return true;
    if (st === t("status.listeningLive")) return true;
    if (st === t("status.starting")) return true;
    if (st === t("status.paused") || st === t("status.pausedHint")) return true;
    return false;
  }

  /** Continuous / ambient status stays in message bar; one-shot tips become toasts. */
  function isProgressStatus(msg: string): boolean {
    const st = msg.trim();
    if (!st) return true;
    if (isIdleStatus(st)) return true;
    if (isAmbientLabel(st)) return true;
    if (aiBusy) return true;
    // In-mode guides (merge multi-select) stay non-modal
    if (mode === "speaker-merge") return true;
    if (/…$|\.\.\.$|loading|启动|停止|连接|加入|监听|暂停|处理|翻译中|总结中|starting|stopping|joining|connecting|processing/i.test(st)) {
      return true;
    }
    return false;
  }

  function clearToastTimer(): void {
    if (toastTimer) {
      clearTimeout(toastTimer);
      toastTimer = null;
    }
  }

  function showToast(
    kind: "error" | "warn" | "info",
    title: string,
    body: string,
    opts?: { confirm?: boolean; blocking?: boolean; onConfirm?: () => void; onCancel?: () => void; onBackground?: () => void },
  ): void {
    // A model download owns this persistent modal until it finishes.
    if (toast?.blocking && !opts?.blocking) return;
    clearToastTimer();
    toast = { kind, title, body, confirm: opts?.confirm,
      onConfirm: opts?.onConfirm, onCancel: opts?.onCancel,
      onBackground: opts?.onBackground };
    if (toast) toast.blocking = opts?.blocking;
    // Keep continuous merge guide in status when not a confirm toast
    if (!opts?.confirm) status = "";
    paint({ urgent: true });
    // Ordinary notices auto-dismiss after 3s (confirm waits for y/n)
    if (!opts?.confirm && !opts?.blocking) {
      const snap = toast;
      toastTimer = setTimeout(() => {
        if (toast === snap) dismissToast();
      }, 3000);
      toastTimer.unref?.();
    }
  }

  function dismissToast(): void {
    if (!toast) return;
    clearToastTimer();
    toast = null;
    paint({ urgent: true });
  }

  /** Route one-shot user notice to top-right popup. */
  function notify(msg: string, kind?: "error" | "warn" | "info"): void {
    const lower = msg.toLowerCase();
    const k =
      kind ||
      (/fail|error|错误|失败|无法|不能|invalid|missing|不足/i.test(lower)
        ? "error"
        : /warn|取消|放弃|请|need|cannot|无法|不可/i.test(lower)
          ? "warn"
          : "info");
    const title =
      k === "error"
        ? t("resume.alert.errTitle")
        : k === "warn"
          ? t("resume.alert.hint")
          : t("resume.alert.hint");
    showToast(k, title, msg);
  }

  function statusSeverity(msg: string): "ok" | "warn" | "err" | "info" {
    const lower = msg.toLowerCase();
    if (
      /fail|error|invalid|missing|缺|失败|错误|無効|失敗|不足/i.test(lower)
    ) {
      return "err";
    }
    if (
      /warn|pause|silent|no speaker|reconnect|请|暂无|警告|暂停|無音|再接続/i.test(
        lower,
      )
    ) {
      return "warn";
    }
    if (
      /saved|enabled|connected|joined|✓|已开|成功|保存|接続|完了|ready/i.test(
        lower,
      )
    ) {
      return "ok";
    }
    return "info";
  }

  function renderMessageBar(buf: Cell[][], layout: Layout): void {
    const r = layout.messageBar;
    if (!r) return;
    const st = effectiveStatus().trim();
    if (!st || isIdleStatus(st)) return;

    const sev = aiBusy ? "info" : statusSeverity(st);
    const borderFg = aiBusy
      ? C.accent
      : sev === "err"
        ? C.err
        : sev === "warn"
          ? C.warn
          : sev === "ok"
            ? C.ok
            : C.panelBorder;
    const spin = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
    const icon = aiBusy
      ? spin[pulse % spin.length]!
      : sev === "err"
        ? "!"
        : sev === "warn"
          ? "…"
          : sev === "ok"
            ? "✓"
            : "·";
    const textFg = aiBusy
      ? C.accent
      : sev === "err"
        ? C.err
        : sev === "warn"
          ? C.warn
          : sev === "ok"
            ? C.ok
            : C.title;

    drawBox(buf, r, undefined, borderFg);
    const innerW = Math.max(1, r.w - 4);
    const line = truncateDisplay(`${icon} ${st}`, innerW);
    putText(buf, r.x + 2, r.y + 1, line, {
      fg: textFg,
      bold: sev !== "info" || aiBusy,
    });
  }

  function renderSpeakerList(buf: Cell[][], layout: Layout): void {
    const r = layout.speakerList;
    if (!r) return;
    const focused =
      focusPanel === "speakers" &&
      (mode === "speaker-list" ||
        mode === "speaker-rename" ||
        mode === "speaker-merge");
    // wipe interior first so transcript overflow never lingers here
    clearPanelInterior(buf, r);
    drawBox(buf, r, t("tui.speakersTitle"), focused ? C.accent : C.border, C.cyan);
    // 1 col inset from left border; leave 1 col for ✎ before right border
    const innerX = r.x + 2;
    const innerW = Math.max(1, r.w - 4);
    const textW = Math.max(1, innerW - 2);
    let y = r.y + 1;
    const yMax = r.y + r.h - 2; // last interior row

    // One logical line per hint (\n in locale); wrap if still too wide
    const hintLines = [t("tui.speakersHint1"), t("tui.speakersHint2")]
      .flatMap((s) => s.split(/\r?\n/))
      .filter((s) => s.length > 0)
      .flatMap((s) => wrapDisplay(s, innerW));
    for (const hl of hintLines) {
      if (y > yMax) break;
      putText(buf, innerX, y, hl, { fg: C.dim, dim: true }, innerW);
      y++;
    }
    if (y <= yMax) y++; // gap before list

    const list = speakerList();
    const visible = Math.max(1, yMax - y);
    ensureSpeakerVisible(visible);
    const slice = list.slice(speakerScroll, speakerScroll + visible);

    if (list.length === 0) {
      if (y <= yMax) {
        putText(
          buf,
          innerX,
          y,
          truncateDisplay(t("tui.noSpeakers"), innerW),
          { fg: C.muted, dim: true },
          innerW,
        );
      }
    } else {
      for (let i = 0; i < slice.length; i++) {
        if (y > yMax) break;
        const sp = slice[i]!;
        const idx = speakerScroll + i;
        const sel = focused && idx === speakerSel;
        const dot = sp.isActive ? "●" : "○";
        const inMerge = mode === "speaker-merge";
        const marked = inMerge && mergeSelected.has(sp.id);
        // Merge mode: all hollow white dots; marked → arrow
        const rowDot = inMerge ? (marked ? "→" : "○") : dot;
        const name = sp.displayName;
        const line = truncateDisplay(`${rowDot} ${name}`, textW);
        const style: Partial<Cell> = {
          fg: inMerge
            ? marked
              ? C.warn
              : C.white
            : sel
              ? C.white
              : sp.color,
          bold: sel || sp.isActive || marked,
          bg: sel ? C.selectBg : undefined,
        };
        if (sel) {
          fillRect(buf, { x: innerX, y, w: innerW, h: 1 }, { bg: C.selectBg });
        }
        putText(buf, innerX, y, line, style, textW);
        // pencil just inside right border (after content padding)
        putChar(
          buf,
          r.x + r.w - 2,
          y,
          "✎",
          {
            fg: C.dim,
            bg: sel ? C.selectBg : undefined,
          },
          r.x + r.w - 1,
        );
        y++;
      }
    }

    // + add alias hint
    const addY = r.y + r.h - 2;
    if (addY > y && addY <= yMax) {
      putText(
        buf,
        innerX,
        addY,
        truncateDisplay(t("tui.addAlias"), innerW),
        { fg: C.dim, dim: true },
        innerW,
      );
    }

    // re-assert vertical borders (transcript must never own these cells)
    const bFg = focused ? C.accent : C.border;
    for (let by = r.y + 1; by < r.y + r.h - 1; by++) {
      putChar(buf, r.x, by, "│", { fg: bFg });
      putChar(buf, r.x + r.w - 1, by, "│", { fg: bFg });
    }

    // scrollbar on right border column (after border so it stays visible)
    if (list.length > visible) {
      drawScrollbar(buf, r.x + r.w - 1, r.y + 4, visible, list.length, speakerScroll);
    }
  }

  function drawScrollbar(
    buf: Cell[][],
    x: number,
    y: number,
    view: number,
    total: number,
    offset: number,
  ): void {
    if (total <= view || view <= 0) return;
    const track = view;
    const thumb = Math.max(1, Math.round((view / total) * track));
    const maxOff = total - view;
    const pos =
      maxOff <= 0 ? 0 : Math.round((offset / maxOff) * (track - thumb));
    for (let i = 0; i < track; i++) {
      const on = i >= pos && i < pos + thumb;
      putChar(buf, x, y + i, on ? "█" : "░", { fg: on ? C.accent : C.border });
    }
  }

  function segmentVisualLines(
    seg: TranscriptSegment,
    innerW: number,
  ): { text: string; style: Partial<Cell> }[] {
    const lines: { text: string; style: Partial<Cell> }[] = [];
    const sp = seg.speakerId ? speakers.get(seg.speakerId) : undefined;
    // Show unknown speaker only while still pending AND no speaker id yet
    const name = seg.speakerId
      ? sp?.displayName || t("common.speakerN", { n: seg.speakerId.replace(/\D/g, "") || "?" })
      : t("common.unknownSpeaker");
    const color = sp?.color || (seg.pending ? C.accent : C.muted);
    const hot = seg.isActive || !!seg.pending || !!seg.isDraft;
    // Soft draft indicator (●/○) — full braille spinner only for AI pending
    const spin = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
    const soft = ["●", "◉"];
    const dot = seg.pending
      ? spin[Math.floor(pulse / 2) % spin.length]!
      : seg.isDraft
        ? soft[Math.floor(pulse / 3) % soft.length]!
        : hot
          ? "●"
          : "○";
    // Prefer real end; open-ended only when end unknown
    const time =
      seg.endedAtMs != null && Number.isFinite(seg.endedAtMs)
        ? fmtRange(seg.startedAtMs, seg.endedAtMs)
        : `${fmtDur(seg.startedAtMs)}–…`;
    const head = `${dot} ${name}  ${time}`;
    lines.push({
      text: head,
      style: {
        fg: color,
        bold: true,
        dim: !hot && seg.isFinal,
      },
    });

    const indent = 2;
    const textW = Math.max(4, innerW - indent);
    const body = wrapDisplay(seg.originalText || "…", textW);
    for (const wl of body) {
      lines.push({
        text: " ".repeat(indent) + wl,
        style: {
          fg: hot ? C.title : C.muted,
          dim: !hot,
        },
      });
    }
    // AI loading line only when still waiting and no translation yet
    // (if translation already sticky, don't cover it with a flashing loader)
    if (seg.pending && !seg.translatedText) {
      const dots = ".".repeat((Math.floor(pulse / 2) % 3) + 1);
      const label = t("status.aiProcessing").replace(/…$/, "").replace(/\.\.\.$/, "");
      lines.push({
        text: " ".repeat(indent) + `${label}${dots}`,
        style: { fg: C.accent, dim: false },
      });
    }
    if (seg.translatedText) {
      const tw = wrapDisplay(seg.translatedText, textW);
      for (const wl of tw) {
        lines.push({
          text: " ".repeat(indent) + wl,
          // Keep translation readable even when row is no longer "hot"
          style: { fg: C.translate, dim: false },
        });
      }
    }
    lines.push({ text: "", style: {} });
    return lines;
  }

  function livePartialVisualLines(
    innerW: number,
  ): { text: string; style: Partial<Cell> }[] {
    if (!livePartial) return [];
    const lines: { text: string; style: Partial<Cell> }[] = [];
    // Slow soft pulse for live row (avoid frantic braille flicker)
    const soft = ["●", "◉", "○", "◉"];
    const dot = soft[Math.floor(pulse / 3) % soft.length]!;
    // Look up only — do not create speakers during paint
    const sid =
      livePartial.spk != null ? speakerIdFromSpk(livePartial.spk) : null;
    const sp = sid ? speakers.get(sid) : undefined;
    const name = sid
      ? sp?.displayName ||
        t("common.speakerN", {
          n: String(livePartial.spk ?? "?"),
        })
      : t("tui.liveLine");
    const time =
      livePartial.start != null && Number.isFinite(livePartial.start)
        ? `${fmtDur(livePartial.start)}–…`
        : "…";
    lines.push({
      text: `${dot} ${name}  ${time}`,
      style: { fg: C.accent, bold: true, dim: true },
    });
    const indent = 2;
    const textW = Math.max(4, innerW - indent);
    const body = (livePartial.text || t("status.recognizing")).trim() || "…";
    // Soft ellipsis suffix so live row reads as in-progress
    const shown = body.endsWith("…") || body.endsWith("...") ? body : `${body}…`;
    for (const wl of wrapDisplay(shown, textW)) {
      lines.push({
        text: " ".repeat(indent) + wl,
        style: { fg: C.muted, dim: true },
      });
    }
    lines.push({ text: "", style: {} });
    return lines;
  }

  function renderTranscript(buf: Cell[][], layout: Layout): void {
    const r = layout.transcript;
    const focused = focusPanel === "transcript" && (mode === "normal" || mode === "speaker-list");
    // wipe interior before paint — kills stale wide-char spill into neighbor panels
    clearPanelInterior(buf, r);
    drawBox(
      buf,
      r,
      t("tui.transcriptTitle"),
      focused && mode === "normal" ? C.accent : C.border,
      C.cyan,
    );
    // content lives strictly between borders; leave 1 col padding each side
    const innerX = r.x + 2;
    const innerW = Math.max(1, r.w - 4);
    const contentMaxX = innerX + innerW; // exclusive
    const innerY = r.y + 1;
    const innerH = Math.max(0, r.h - 2);

    if (segments.length === 0 && !livePartial) {
      const h1 = t("tui.waiting1");
      const h2 = t("tui.waiting2");
      const cy = innerY + Math.floor(innerH / 2) - 1;
      putText(
        buf,
        innerX + Math.max(0, Math.floor((innerW - dw(h1)) / 2)),
        cy,
        truncateDisplay(h1, innerW),
        { fg: C.muted, dim: true },
        innerW,
      );
      putText(
        buf,
        innerX + Math.max(0, Math.floor((innerW - dw(h2)) / 2)),
        cy + 2,
        truncateDisplay(h2, innerW),
        { fg: C.dim, dim: true },
        innerW,
      );
      return;
    }

    // History (finals) + pinned live/partial row at bottom (TMSpeech-style)
    const maxKeep = 200;
    const segs = segments.length > maxKeep ? segments.slice(-maxKeep) : segments;
    const visual: {
      text: string;
      style: Partial<Cell>;
      active?: boolean;
      live?: boolean;
    }[] = [];
    for (const seg of segs) {
      const ls = segmentVisualLines(seg, innerW);
      for (const l of ls) {
        visual.push({
          ...l,
          active: seg.isActive || !!seg.pending || !!seg.isDraft,
        });
      }
    }
    const liveLines = livePartialVisualLines(innerW);
    for (const l of liveLines) {
      visual.push({ ...l, active: true, live: true });
    }

    // Reserve space for live row so history scroll does not hide it when pinned
    const liveH = liveLines.length;
    const histH = Math.max(0, innerH - liveH);
    const histVisualLen = Math.max(0, visual.length - liveH);
    const maxScroll = Math.max(0, histVisualLen - histH);
    if (scroll > maxScroll) scroll = maxScroll;
    const stickBottom = scroll === 0;
    // When stick-bottom: show tail of history + live; when scrolled: keep live pinned if room
    let histStart: number;
    if (stickBottom) {
      histStart = Math.max(0, histVisualLen - histH);
    } else {
      histStart = Math.max(0, histVisualLen - histH - scroll);
    }
    const histSlice = visual.slice(histStart, histStart + histH);
    const liveSlice = liveH > 0 ? visual.slice(histVisualLen) : [];
    const slice = histSlice.concat(liveSlice);

    for (let i = 0; i < slice.length; i++) {
      const row = slice[i]!;
      const y = innerY + i;
      // clip to panel interior rows only
      if (y < r.y + 1 || y > r.y + r.h - 2) continue;
      // hard-truncate again at paint time (defense in depth for CJK)
      const text = truncateDisplay(row.text, innerW);
      if (row.active) {
        // left accent bar + soft bg (only interior, not borders)
        fillRect(
          buf,
          { x: r.x + 1, y, w: Math.max(0, r.w - 2), h: 1 },
          { bg: C.activeBg },
        );
        putChar(
          buf,
          r.x + 1,
          y,
          row.live ? "┊" : "▌",
          { fg: C.accent, bg: C.activeBg },
          contentMaxX,
        );
        putText(
          buf,
          innerX,
          y,
          text,
          { ...row.style, bg: C.activeBg },
          innerW,
        );
      } else {
        putText(buf, innerX, y, text, row.style, innerW);
      }
    }

    // re-draw vertical borders so any accidental spill is painted over
    for (let y = r.y + 1; y < r.y + r.h - 1; y++) {
      putChar(buf, r.x, y, "│", { fg: focused && mode === "normal" ? C.accent : C.border });
      putChar(buf, r.x + r.w - 1, y, "│", {
        fg: focused && mode === "normal" ? C.accent : C.border,
      });
    }

    if (maxScroll > 0 && scroll > 0) {
      const tag = ` ↑${scroll} `;
      putText(
        buf,
        Math.max(r.x + 1, r.x + r.w - 1 - dw(tag)),
        r.y,
        tag,
        { fg: C.warn },
        dw(tag),
      );
    }
  }

  function kv(
    buf: Cell[][],
    x: number,
    y: number,
    w: number,
    key: string,
    val: string,
    valFg: RGB = C.title,
  ): void {
    const keyW = Math.min(8, Math.max(0, w));
    const k = padDisplay(key, keyW);
    putText(buf, x, y, k, { fg: C.dim }, keyW);
    const valW = Math.max(0, w - keyW - 1);
    if (valW > 0) {
      putText(
        buf,
        x + keyW + 1,
        y,
        truncateDisplay(val, valW),
        { fg: valFg },
        valW,
      );
    }
  }

  function renderSidePanel(buf: Cell[][], layout: Layout): void {
    const r = layout.sidePanel;
    if (!r) return;
    clearPanelInterior(buf, r);
    drawBox(buf, r, t("tui.sideTitle"), C.border, C.cyan);
    const x = r.x + 2;
    const w = Math.max(1, r.w - 4);
    let y = r.y + 2;
    const yMax = r.y + r.h - 2;

    // 7.1 设备与音频
    if (y <= yMax) {
      putText(buf, x, y++, t("tui.deviceAudio"), { fg: C.cyan, bold: true }, w);
    }
    if (y <= yMax) kv(buf, x, y++, w, t("tui.source"), sourceDetail(args.source), C.accent);
    if (y <= yMax) kv(buf, x, y++, w, t("tui.device"), deviceName || t("common.dash"), C.muted);
    // volume placeholder (no real meter in pipeline)
    const volBar = "━━━━━━━";
    if (y <= yMax) kv(buf, x, y++, w, t("tui.volume"), `${volBar} ${t("common.dash")}`, C.muted);
    if (y <= yMax) kv(buf, x, y++, w, t("tui.mute"), t("tui.unmuted"), C.ok);
    y++;

    // Current endpointing values: these directly affect final-subtitle latency.
    if (y <= yMax) {
      putText(buf, x, y++, t("tui.vadCut"), { fg: C.cyan, bold: true }, w);
    }
    const vadPreset = matchVadPreset(args.vad, args.asrEngine);
    if (y <= yMax) {
      kv(buf, x, y++, w, t("tui.vadPreset"),
        t(`settings.vadPreset.${vadPreset}`), C.accent);
    }
    if (y <= yMax) {
      kv(buf, x, y++, w, t("tui.vadSilence"),
        `${args.vad.minSilenceDuration.toFixed(2)}s`, C.muted);
    }
    if (y <= yMax) {
      kv(buf, x, y++, w, t("tui.vadMaxSpeech"),
        `${args.vad.maxSpeechDuration.toFixed(0)}s`, C.muted);
    }
    y++;

    if (modelDownload && y <= yMax) {
      putText(buf, x, y++, t("tui.modelDownload"), { fg: C.cyan, bold: true }, w);
      if (y <= yMax) kv(buf, x, y++, w, t("tui.downloadModel"), modelDownload.name, C.accent);
      if (y <= yMax) {
        kv(buf, x, y++, w, t("tui.downloadStage"),
          modelDownload.stage === "extracting" ? t("tui.extracting") : t("tui.downloading"),
          modelDownload.stage === "extracting" ? C.warn : C.ok);
      }
      if (y <= yMax) {
        const barW = Math.max(4, Math.min(10, w - 13));
        const filled = Math.round((modelDownload.percent / 100) * barW);
        const progress = `${"█".repeat(filled)}${"░".repeat(barW - filled)} ${modelDownload.percent}%`;
        kv(buf, x, y++, w, t("tui.downloadProgress"), progress, C.ok);
      }
      y++;
    }

    // 7.2 录音设置
    if (y <= yMax) {
      putText(buf, x, y++, t("tui.recSettings"), { fg: C.cyan, bold: true }, w);
    }
    const recOn = Boolean(args.record);
    if (recOn && recordStartedAt == null) recordStartedAt = Date.now();
    if (!recOn) recordStartedAt = null;
    if (y <= yMax) {
      kv(
        buf,
        x,
        y++,
        w,
        t("tui.recState"),
        recOn ? t("tui.recording") : t("tui.notRecording"),
        recOn ? C.err : C.muted,
      );
    }
    if (y <= yMax) kv(buf, x, y++, w, t("tui.format"), "WAV", C.muted);
    if (y <= yMax) {
      kv(
        buf,
        x,
        y++,
        w,
        t("tui.savePath"),
        args.recordDir || defaultRecordDir(),
        C.muted,
      );
    }
    const recDur =
      recOn && recordStartedAt
        ? fmtDur((Date.now() - recordStartedAt) / 1000)
        : "00:00";
    if (y <= yMax) kv(buf, x, y++, w, t("tui.duration"), recDur, C.muted);
    const fileName = args.record
      ? truncateDisplay(args.record.split(/[/\\]/).pop() || args.record, Math.max(1, w - 9))
      : t("common.dash");
    if (y <= yMax) kv(buf, x, y++, w, t("tui.file"), fileName, C.muted);
    y++;

    // 7.3 网络共享
    if (y <= yMax) {
      putText(buf, x, y++, t("tui.netShare"), { fg: C.cyan, bold: true }, w);
      if (y <= yMax) {
        kv(
          buf,
          x,
          y++,
          w,
          t("tui.state"),
          args.share.enabled ? t("tui.enabled") : t("tui.disabled"),
          args.share.enabled ? C.ok : C.muted,
        );
      }
      if (y <= yMax) kv(buf, x, y++, w, t("tui.port"), String(args.share.port), C.muted);
      if (y <= yMax) {
        kv(buf, x, y++, w, t("tui.address"), args.share.host || "0.0.0.0", C.muted);
      }
      // Single URL row: display host:port, click opens http://host:port (OSC 8)
      if (y <= yMax) {
        const fullUrl = shareAccessUrl(args.share.port);
        const displayUrl = shareAccessHost(args.share.port);
        const keyW = Math.min(8, w);
        const label = padDisplay(t("tui.accessUrl"), keyW);
        putText(buf, x, y, label, { fg: C.dim }, keyW);
        const valW = Math.max(0, w - keyW - 1);
        if (valW > 0) {
          putText(
            buf,
            x + keyW + 1,
            y,
            truncateDisplay(displayUrl, valW),
            {
              fg: args.share.enabled ? C.ok : C.dim,
              href: args.share.enabled ? fullUrl : undefined,
            },
            valW,
          );
        }
        y++;
      }
    }

    // re-assert side panel borders after all content
    for (let by = r.y + 1; by < r.y + r.h - 1; by++) {
      putChar(buf, r.x, by, "│", { fg: C.border });
      putChar(buf, r.x + r.w - 1, by, "│", { fg: C.border });
    }
  }

  function renderRenameModal(buf: Cell[][], layout: Layout): void {
    const W = layout.statusBar.w || cols();
    const H = (layout.footer.y || rows() - 1) + 1;
    const boxW = Math.min(56, Math.max(40, W - 8));
    const boxH = 6;
    const r: Rect = {
      x: Math.max(1, Math.floor((W - boxW) / 2)),
      y: Math.max(1, Math.floor((H - boxH) / 2)),
      w: boxW,
      h: boxH,
    };
    fillRect(buf, r, { bg: C.panelBg });
    const isSession = mode === "session-rename";
    const title = isSession
      ? t("resume.renameTitle")
      : t("footer.rename");
    drawBox(buf, r, title, C.accent, C.accent);
    // Actions live on the bottom border (same as merge confirm)
    drawBottomBorderActions(buf, r, C.accent);
    const draft = isSession ? sessionRenameDraft : renameDraft;
    const fieldW = Math.max(8, r.w - 6);
    const field = truncateDisplay(draft, fieldW - 1) + "▌";
    putText(buf, r.x + 3, r.y + 2, field, {
      fg: C.title,
      bold: true,
      bg: C.panelBg,
    }, fieldW);
  }

  /**
 * Ordinary notice → top-right, auto 3s dismiss.
 * Confirm and blocking progress → centered persistent dialog.
 */
  function renderToastModal(buf: Cell[][], layout: Layout): void {
    if (!toast) return;
    const W = layout.statusBar.w || cols();
    const H = (layout.footer.y || rows() - 1) + 1;
    const centered = Boolean(toast.confirm || toast.blocking);
    const boxW = centered
      ? Math.min(56, Math.max(40, Math.floor(W * 0.5)))
      : Math.min(42, Math.max(28, Math.floor(W * 0.32)));
    const kind = toast.kind;
    const accent =
      kind === "error" ? C.err : kind === "warn" ? C.warn : C.cyan;
    const icon = kind === "error" ? "✕" : kind === "warn" ? "!" : "i";
    const bodyLines = wrapDisplay(toast.body.replace(/\r/g, ""), boxW - 6);
    const shown = bodyLines.slice(0, 6);
    const boxH = Math.min(H - 3, (centered ? 5 : 5) + shown.length);
    const r: Rect = centered
      ? {
          x: Math.max(1, Math.floor((W - boxW) / 2)),
          y: Math.max(1, Math.floor((H - boxH) / 2)),
          w: boxW,
          h: boxH,
        }
      : {
          x: Math.max(1, W - boxW - 1),
          y: Math.max(1, 1),
          w: boxW,
          h: boxH,
        };
    fillRect(buf, r, { bg: C.panelBg });
    if (centered) {
      // Same chrome as session-name edit
      drawBox(buf, r, toast.title, C.accent, C.accent);
      if (toast.onBackground) drawDownloadActions(buf, r, C.accent);
      else if (toast.confirm) drawBottomBorderActions(buf, r, C.accent);
      let y = r.y + 2;
      for (const wl of shown) {
        if (y >= r.y + r.h - 1) break;
        putText(buf, r.x + 2, y, truncateDisplay(wl, boxW - 4), {
          fg: C.title,
          bg: C.panelBg,
        }, boxW - 4);
        y++;
      }
    } else {
      drawBox(buf, r, undefined, accent);
      putText(
        buf,
        r.x + 2,
        r.y + 1,
        truncateDisplay(`${icon}  ${toast.title}`, boxW - 4),
        { fg: accent, bold: true, bg: C.panelBg },
        boxW - 4,
      );
      let y = r.y + 3;
      for (const wl of shown) {
        if (y >= r.y + r.h - 2) break;
        putText(buf, r.x + 2, y, truncateDisplay(wl, boxW - 4), {
          fg: C.title,
          bg: C.panelBg,
        }, boxW - 4);
        y++;
      }
      putText(
        buf,
        r.x + 2,
        r.y + r.h - 2,
        truncateDisplay(t("resume.autoDismissHint"), boxW - 4),
        { fg: C.dim, dim: true, bg: C.panelBg },
        boxW - 4,
      );
    }
  }

  function renderFooter(buf: Cell[][], layout: Layout): void {
    const r = layout.footer;
    fillRect(buf, r, { bg: C.panelBg });
    let hints: { k: string; v: string }[] = [];

    if (mode === "settings" || mode === "settings-edit") {
      if (mode === "settings-edit") {
        hints = [
          { k: "Enter", v: t("footer.save") },
          { k: "Ctrl+U", v: t("footer.clearInput") },
          { k: "Esc", v: t("footer.cancel") },
        ];
      } else {
        hints = [
          { k: "↑↓", v: t("footer.move") },
          { k: "←→", v: t("footer.change") },
          { k: "Enter", v: t("footer.editSave") },
          { k: "Space", v: t("footer.toggle") },
          { k: "Esc", v: t("footer.close") },
        ];
      }
    } else if (mode === "speaker-rename" || mode === "session-rename") {
      hints = [
        { k: "Enter", v: t("footer.save") },
        { k: "Esc", v: t("footer.cancel") },
      ];
    } else if (mode === "speaker-merge") {
      hints = [
        { k: "↑↓", v: t("footer.select") },
        { k: "Space", v: t("footer.mergeSpace") },
        { k: "Esc", v: t("footer.close") },
      ];
    } else if (mode === "speaker-list") {
      hints = [
        { k: "↑↓", v: t("footer.select") },
        { k: "Enter", v: t("footer.rename") },
        { k: "m", v: t("footer.merge") },
        { k: "a", v: t("footer.addAlias") },
        { k: "1-9", v: t("footer.assign") },
        { k: "Tab", v: t("footer.switch") },
        { k: "Del", v: t("footer.del") },
      ];
    } else {
      hints = [
        { k: "p", v: t("footer.pause") },
        { k: "s", v: t("footer.settings") },
        { k: "h", v: t("footer.share") },
        { k: "r", v: t("footer.record") },
        { k: "c", v: t("footer.clear") },
        { k: "e", v: t("footer.editName") },
        { k: "Tab", v: t("footer.switch") },
        { k: "q", v: t("footer.quit") },
      ];
    }

    let x = r.x + 1;
    for (const h of hints) {
      if (x >= r.x + r.w - 2) break;
      putText(buf, x, r.y, h.k, { fg: C.key, bold: true, bg: C.panelBg });
      x += dw(h.k) + 1;
      putText(buf, x, r.y, h.v, { fg: C.dim, bg: C.panelBg });
      x += dw(h.v) + 2;
    }
  }

  function renderSettingsDialog(buf: Cell[][], layout: Layout): void {
    const r = layout.settingsDialog;
    fillRect(buf, r, { bg: C.panelBg });
    drawBox(buf, r, t("tui.settingsTitle"), C.panelBorder, C.title);

    const padX = 1;
    const contentX = r.x + 1 + padX;
    const contentW = r.w - 2 - padX * 2;
    const labelW = 12;
    const footerH = 3; // desc + keys
    const viewTop = r.y + 1;
    const visible = Math.max(3, r.h - 2 - footerH);
    const visLines = buildSettingsVisLines();
    ensureSettingsVisible(visible);

    const start = settingsScroll;
    const end = Math.min(visLines.length, start + visible);
    const groupBorder = C.panelBorder;
    const groupFg = C.cyan;

    for (let vi = start; vi < end; vi++) {
      const line = visLines[vi]!;
      const y = viewTop + (vi - start);
      const bg = C.panelBg;

      if (line.kind === "gap") {
        continue;
      }

      if (line.kind === "group-top") {
        // ┌ 语音识别 ──────────┐
        const title = ` ${line.title} `;
        const titleW = dw(title);
        putChar(buf, contentX, y, "┌", { fg: groupBorder, bg });
        putText(buf, contentX + 1, y, title, { fg: groupFg, bold: true, bg });
        const dashStart = contentX + 1 + titleW;
        const dashEnd = contentX + contentW - 2;
        for (let x = dashStart; x <= dashEnd; x++) {
          putChar(buf, x, y, "─", { fg: groupBorder, bg });
        }
        putChar(buf, contentX + contentW - 1, y, "┐", { fg: groupBorder, bg });
        continue;
      }

      if (line.kind === "group-bot") {
        putChar(buf, contentX, y, "└", { fg: groupBorder, bg });
        for (let x = contentX + 1; x < contentX + contentW - 1; x++) {
          putChar(buf, x, y, "─", { fg: groupBorder, bg });
        }
        putChar(buf, contentX + contentW - 1, y, "┘", { fg: groupBorder, bg });
        continue;
      }

      // left/right group borders for item rows
      putChar(buf, contentX, y, "│", { fg: groupBorder, bg });
      putChar(buf, contentX + contentW - 1, y, "│", { fg: groupBorder, bg });

      const innerX = contentX + 1;
      const innerW = contentW - 2;

      // item row
      const it = getSettingItems()[line.index]!;
      const sel = line.index === settingsFocus;
      const editing = mode === "settings-edit" && sel;
      const rowBg = sel ? C.selectBg : bg;

      if (sel) {
        for (let x = innerX; x < innerX + innerW; x++) {
          putChar(buf, x, y, " ", { bg: rowBg });
        }
      }

      const mark = sel ? "▸" : " ";
      putText(buf, innerX, y, mark, {
        fg: C.accent,
        bold: true,
        bg: rowBg,
      });
      putText(buf, innerX + 2, y, padDisplay(it.label, labelW), {
        fg: sel ? C.title : C.muted,
        bold: sel,
        bg: rowBg,
      });

      const valX = innerX + 2 + labelW + 1;
      const valMax = Math.max(4, innerX + innerW - valX);

      if (editing) {
        putText(buf, valX, y, truncateDisplay(editDraft + "▌", valMax), {
          fg: C.accent,
          bg: rowBg,
        });
      } else {
        const v = settingValueText(it.key);
        const middleKeys = new Set([
          "aiModel",
          "aiBase",
          "recDir",
          "shareHost",
        ]);
        const text = middleKeys.has(it.key)
          ? truncateMiddleDisplay(v.text, valMax)
          : truncateDisplay(v.text, valMax);
        if (v.barFg && (text.includes("█") || text.includes("░"))) {
          const m = /^([█░]+)(\s+)(.+)$/.exec(v.text);
          if (m) {
            const bar = m[1]!;
            const sp = m[2]!;
            const num = m[3]!;
            let cx = valX;
            putText(buf, cx, y, bar, { fg: v.barFg, bg: rowBg });
            cx += dw(bar);
            putText(buf, cx, y, sp, { bg: rowBg });
            cx += dw(sp);
            putText(buf, cx, y, truncateDisplay(num, valMax - (cx - valX)), {
              fg: v.fg,
              dim: v.dim,
              bg: rowBg,
            });
          } else {
            putText(buf, valX, y, text, {
              fg: v.fg,
              dim: v.dim,
              bg: rowBg,
            });
          }
        } else {
          putText(buf, valX, y, text, {
            fg: v.fg,
            dim: v.dim,
            bg: rowBg,
          });
        }
      }
    }

    if (visLines.length > visible) {
      drawScrollbar(
        buf,
        r.x + r.w - 1,
        viewTop,
        visible,
        visLines.length,
        settingsScroll,
      );
    }

    // footer: item description + key hints
    const descY = r.y + r.h - 3;
    const keysY = r.y + r.h - 2;
    const focused = getSettingItems()[settingsFocus];
    let desc =
      mode === "settings-edit"
        ? t("tui.editingHint")
        : focused?.help || "";
    if (
      mode !== "settings-edit" &&
      !args.ai.enabled &&
      focused &&
      (focused.key === "aiBase" ||
        focused.key === "aiKey" ||
        focused.key === "aiModel" ||
        focused.key === "aiTranslate")
    ) {
      desc = t("tui.needAiFirst", { help: desc });
    }
    putText(buf, contentX, descY, truncateDisplay(desc, contentW), {
      fg: C.muted,
      bg: C.panelBg,
    });
    const foot =
      mode === "settings-edit"
        ? t("settings.keysEdit")
        : t("settings.keys");
    putText(buf, contentX, keysY, truncateDisplay(foot, contentW), {
      fg: C.dim,
      dim: true,
      bg: C.panelBg,
    });
  }

  function paintNow(): void {
    if (closed) return;
    if (paintTimer) {
      clearTimeout(paintTimer);
      paintTimer = null;
    }
    const W = cols();
    const H = rows();
    const showMsg = !isIdleStatus(effectiveStatus());
    const layout = computeLayout(W, H, showMsg);

    if (layout.mode === "tiny") {
      const msg1 = t("status.termTooSmall", { w: MIN_W, h: MIN_H });
      const msg2 = t("status.termCurrent", { w: W, h: H });
      stdout.write(
        CLEAR + HIDE_CUR + msg1 + "\n" + msg2 + RESET,
      );
      prevBuf = null;
      lastW = W;
      lastH = H;
      dirty = false;
      lastPaintAt = Date.now();
      return;
    }

    if (W !== lastW || H !== lastH) {
      prevBuf = null;
      lastW = W;
      lastH = H;
      stdout.write(CLEAR + HIDE_CUR);
    }

    const next = createScreenBuffer(W, H);

    renderStatusBar(next, layout);
    // transcript first, then side columns last so any CJK spill is painted over
    renderTranscript(next, layout);
    if (layout.speakerList) renderSpeakerList(next, layout);
    if (layout.sidePanel) renderSidePanel(next, layout);
    if (layout.messageBar && !toast) renderMessageBar(next, layout);
    renderFooter(next, layout);

    if (mode === "settings" || mode === "settings-edit") {
      dimBackground(next);
      renderSettingsDialog(next, layout);
    } else if (mode === "speaker-rename" || mode === "session-rename") {
      dimBackground(next);
      renderRenameModal(next, layout);
    }

    // Confirm/progress → center + dim; ordinary tips → top-right, no dim
    if (toast) {
      if (toast.confirm || toast.blocking) dimBackground(next);
      renderToastModal(next, layout);
    }

    flushDiff(prevBuf, next, stdout);
    prevBuf = next;
    dirty = false;
    lastPaintAt = Date.now();
  }

  /**
   * Schedule a paint. High-frequency draft/partial updates are coalesced
   * (~12fps) so speaker-turn merge doesn't flash every chunk.
   * Interactive UI (keys/modals) still paints immediately.
   */
  function paint(opts?: { urgent?: boolean }): void {
    if (closed) return;
    dirty = true;
    if (opts?.urgent) {
      paintNow();
      return;
    }
    const minInterval = 80; // ms between non-urgent paints
    const elapsed = Date.now() - lastPaintAt;
    if (elapsed >= minInterval && !paintTimer) {
      paintNow();
      return;
    }
    if (paintTimer) return;
    const wait = Math.max(0, minInterval - elapsed);
    paintTimer = setTimeout(() => {
      paintTimer = null;
      if (dirty && !closed) paintNow();
    }, wait);
    paintTimer.unref?.();
  }

  // ── settings mutations ─────────────────────────────────

  function round2(n: number): number {
    return Math.round(n * 100) / 100;
  }

  const SOURCES: AudioSource[] =
    process.platform === "win32" ? ["both", "loopback", "mic"] : ["mic"];

  function cycleLang(dir: 1 | -1): void {
    const i = LANGS.indexOf(args.lang);
    args.lang = LANGS[(i + dir + LANGS.length) % LANGS.length]!;
    persist();
  }

  function cycleUiLang(dir: 1 | -1): void {
    const cur = args.uiLang || getUiLang();
    const i = Math.max(0, UI_LANGS.indexOf(cur));
    const next = UI_LANGS[(i + dir + UI_LANGS.length) % UI_LANGS.length]!;
    args.uiLang = next;
    setUiLang(next);
    persist();
  }

  function nudgeThreshold(dir: 1 | -1): void {
    let v = args.spkThreshold + dir * 0.05;
    v = Math.min(0.95, Math.max(0.2, round2(v)));
    args.spkThreshold = v;
    persist();
  }

  function cycleSource(dir: 1 | -1): void {
    const i = Math.max(0, SOURCES.indexOf(args.source));
    const next = SOURCES[(i + dir + SOURCES.length) % SOURCES.length]!;
    if (next !== args.source) {
      args.source = next;
      notify(t("status.switchSource", { name: sourceLabel(next) }));
      persist();
    }
  }

  function toggleAi(): void {
    args.ai.enabled = !args.ai.enabled;
    if (args.ai.enabled && !args.ai.correct && !args.ai.translateTo) {
      args.ai.correct = true;
    }
    notify(
      args.ai.enabled
        ? aiActive(args.ai)
          ? t("status.aiOn")
          : t("status.aiEnabled")
        : t("status.aiDisabled"),
    );
    persist();
  }

  function cycleAiTranslate(dir: 1 | -1): void {
    const opts = TRANSLATE_OPTIONS;
    const cur = args.ai.translateTo;
    let i = opts.indexOf(cur);
    if (i < 0) i = 0;
    const next = opts[(i + dir + opts.length) % opts.length]!;
    args.ai.translateTo = next;
    if (next && !args.ai.enabled) args.ai.enabled = true;
    notify(
      t("status.aiTranslate", {
        lang: translateLangLabel(next),
      }),
    );
    persist();
  }

  function toggleShare(): void {
    args.share.enabled = !args.share.enabled;
    notify(
      args.share.enabled
        ? t("status.shareOn", { port: args.share.port })
        : t("status.shareOff"),
    );
    persist();
  }

  function nudgeSharePort(dir: 1 | -1): void {
    args.share.port = Math.min(
      65535,
      Math.max(1024, args.share.port + dir),
    );
    if (!args.share.enabled) args.share.enabled = true;
    notify(t("status.sharePort", { port: args.share.port }));
    persist();
  }

  function cycleVadPresetSetting(dir: 1 | -1): void {
    const { id, vad } = cycleVadPreset(args.vad, dir, args.asrEngine);
    args.vad = { ...vad };
    notify(
      t("settings.vadPreset.applied", {
        name: t(`settings.vadPreset.${id}`),
      }),
    );
    persist();
  }

  function nudgeVadThreshold(dir: 1 | -1): void {
    args.vad.threshold = round2(
      Math.min(0.95, Math.max(0.05, args.vad.threshold + dir * 0.05)),
    );
    notify(t("status.vadThreshold", { v: args.vad.threshold.toFixed(2) }));
    persist();
  }

  function nudgeVadMinSpeech(dir: 1 | -1): void {
    args.vad.minSpeechDuration = round2(
      Math.min(5, Math.max(0.1, args.vad.minSpeechDuration + dir * 0.05)),
    );
    notify(t("status.minSpeech", { v: args.vad.minSpeechDuration.toFixed(2) }));
    persist();
  }

  function nudgeVadMinSilence(dir: 1 | -1): void {
    args.vad.minSilenceDuration = round2(
      Math.min(5, Math.max(0.1, args.vad.minSilenceDuration + dir * 0.05)),
    );
    notify(t("status.silenceSplit", { v: args.vad.minSilenceDuration.toFixed(2) }));
    persist();
  }

  function nudgeVadMaxSpeech(dir: 1 | -1): void {
    args.vad.maxSpeechDuration = Math.min(
      120,
      Math.max(2, args.vad.maxSpeechDuration + dir),
    );
    notify(t("status.maxSpeech", { v: args.vad.maxSpeechDuration }));
    persist();
  }

  const VAD_WINDOWS = [256, 512, 768, 1024];
  function cycleVadWindow(dir: 1 | -1): void {
    let i = VAD_WINDOWS.indexOf(args.vad.windowSize);
    if (i < 0) i = 1;
    i = (i + dir + VAD_WINDOWS.length) % VAD_WINDOWS.length;
    args.vad.windowSize = VAD_WINDOWS[i]!;
    notify(t("status.vadWindow", { v: args.vad.windowSize }));
    persist();
  }

  function toggleRecord(): void {
    if (args.record) {
      args.record = undefined;
      notify(t("status.stopRecord"));
    } else {
      const dir = (args.recordDir || defaultRecordDir()).replace(/[/\\]+$/, "");
      // Session dirs use fixed audio.wav; otherwise timestamped file
      const isSessionDir =
        /[/\\]sessions[/\\]/.test(dir) || /ses_[a-z0-9]+/i.test(dir);
      args.record = isSessionDir
        ? `${dir}/audio`
        : `${dir}/meeting-${new Date()
            .toISOString()
            .replace(/[:.]/g, "-")
            .slice(0, 19)}`;
      notify(t("status.startRecord", { path: args.record }));
    }
  }

  const RECORD_DIR_PRESETS = [
    defaultRecordDir(),
    "./out",
    "./audio",
    "./meetings",
  ];

  function cycleRecordDir(dir: 1 | -1): void {
    const cur = args.recordDir || defaultRecordDir();
    let i = RECORD_DIR_PRESETS.indexOf(cur);
    if (i < 0) {
      RECORD_DIR_PRESETS.unshift(cur);
      i = 0;
    }
    const n = (i + dir + RECORD_DIR_PRESETS.length) % RECORD_DIR_PRESETS.length;
    args.recordDir = normalizeRecordDir(RECORD_DIR_PRESETS[n]!);
    notify(t("status.recordDir", { path: args.recordDir }));
    persist();
  }

  function beginEdit(field: SettingKind): void {
    editField = field;
    mode = "settings-edit";
    switch (field) {
      case "aiBase":
        editDraft = args.ai.baseUrl || "";
        break;
      case "aiKey":
        editDraft = args.ai.apiKey || "";
        break;
      case "aiModel":
        editDraft = args.ai.model || "";
        break;
      case "recDir":
        editDraft = args.recordDir || defaultRecordDir();
        break;
      case "shareHost":
        editDraft = args.share.host || "0.0.0.0";
        break;
      case "sharePort":
        editDraft = String(args.share.port);
        break;
      default:
        editField = null;
        mode = "settings";
        return;
    }
  }

  function commitEdit(): void {
    if (!editField) {
      mode = "settings";
      return;
    }
    const v = editDraft.trim();
    switch (editField) {
      case "aiBase": {
        const n = normalizeBaseUrl(v);
        if (!n) {
          notify(t("status.baseUrlInvalid"), "error");
        } else {
          args.ai.baseUrl = n;
          notify(t("status.baseUrlSaved"));
          persist();
        }
        break;
      }
      case "aiKey":
        args.ai.apiKey = v;
        notify(v ? t("status.apiKeySaved") : t("status.apiKeyCleared"));
        persist();
        break;
      case "aiModel":
        if (v) {
          args.ai.model = v;
          notify(t("status.modelSet", { model: v }));
          persist();
        }
        break;
      case "recDir":
        args.recordDir = normalizeRecordDir(v || defaultRecordDir());
        notify(t("status.recordDir", { path: args.recordDir }));
        persist();
        break;
      case "shareHost":
        args.share.host = v || "0.0.0.0";
        notify(t("status.shareHost", { host: args.share.host }));
        persist();
        break;
      case "sharePort": {
        const p = parseInt(v, 10);
        if (Number.isFinite(p) && p >= 1024 && p <= 65535) {
          args.share.port = p;
          notify(t("status.sharePort", { port: p }));
          persist();
        } else {
          notify(t("status.portInvalid"), "error");
        }
        break;
      }
    }
    editField = null;
    editDraft = "";
    mode = "settings";
  }

  function cancelEdit(): void {
    editField = null;
    editDraft = "";
    mode = "settings";
  }

  function nudgeSetting(dir: 1 | -1): void {
    const key = getSettingItems()[settingsFocus]?.key;
    if (!key) return;
    switch (key) {
      case "uiLang":
        cycleUiLang(dir);
        break;
      case "lang":
        cycleLang(dir);
        break;
      case "asrEngine":
        requestAsrEngine(ASR_ENGINES[
          (ASR_ENGINES.indexOf(args.asrEngine) + dir + ASR_ENGINES.length) %
            ASR_ENGINES.length
        ]!);
        break;
      case "spkEngine":
        {
          const choices: Array<"off" | SpkEngine> = ["off", ...SPK_ENGINES];
          const current: "off" | SpkEngine = args.noSpk
            ? "off"
            : args.spkEngine;
          const next = choices[
            (choices.indexOf(current) + dir + choices.length) % choices.length
          ]!;
          if (next === "off") disableSpkEngine();
          else requestSpkEngine(next);
        }
        break;
      case "spkThr":
        nudgeThreshold(dir);
        break;
      case "aiEn":
        toggleAi();
        break;
      case "aiTranslate":
        cycleAiTranslate(dir);
        break;
      case "aiProvider": {
        args.ai = cycleAiProvider(args.ai, dir);
        notify(t("settings.provider.applied", {
          name: aiProviderLabel(args.ai),
          model: args.ai.model || "—",
        }));
        persist();
        break;
      }
      case "source":
        cycleSource(dir);
        break;
      case "recDir":
        cycleRecordDir(dir);
        break;
      case "record":
        toggleRecord();
        break;
      case "share":
        toggleShare();
        break;
      case "sharePort":
        nudgeSharePort(dir);
        break;
      case "vadPreset":
        cycleVadPresetSetting(dir);
        break;
      case "vadThr":
        nudgeVadThreshold(dir);
        break;
      case "vadMinSp":
        nudgeVadMinSpeech(dir);
        break;
      case "vadSil":
        nudgeVadMinSilence(dir);
        break;
      case "vadMax":
        nudgeVadMaxSpeech(dir);
        break;
      case "vadWin":
        cycleVadWindow(dir);
        break;
      case "aiBase":
      case "aiKey":
      case "aiModel":
      case "shareHost":
        beginEdit(key);
        break;
    }
  }

  function applyAsrEngine(engine: AsrEngine): void {
    const adaptLowLatency =
      matchVadPreset(args.vad, args.asrEngine) === "lowLatency";
    args.asrEngine = engine;
    if (adaptLowLatency) args.vad = lowLatencyVad(engine);
    persist();
    notify(t("settings.asrEngine.applied", {
      name: asrEngineLabel(engine),
    }));
    dirty = true;
  }

  function applySpkEngine(engine: SpkEngine): void {
    const prev = args.spkEngine;
    args.spkEngine = engine;
    args.noSpk = false;
    // When user has not customized threshold, move to the new model default
    if (
      Math.abs(args.spkThreshold - defaultSpkThreshold(prev)) < 0.001 ||
      args.spkThreshold === defaultSpkThreshold(prev)
    ) {
      args.spkThreshold = defaultSpkThreshold(engine);
    }
    persist();
    notify(`${t("settings.spkEngine.applied", {
      name: spkEngineLabel(engine),
    })} · ${t("settings.spkEngine.restartHint")}`);
    dirty = true;
  }

  function requestAsrEngine(engine: AsrEngine): void {
    if (engine === args.asrEngine) return;
    if (modelDownload) {
      notify(t("settings.asrEngine.downloadRunning", { name: modelDownload.name }));
      return;
    }
    const ready = checkModels(modelOverridesFromSettings(), {
      requireSpk: false,
      asrEngine: engine,
    }).ok;
    if (ready) {
      applyAsrEngine(engine);
      return;
    }
    const name = asrEngineLabel(engine);
    showToast("warn", t("settings.asrEngine.downloadTitle", { name }),
      t("settings.asrEngine.downloadAsk", {
        name,
        size: asrEngineSize(engine),
      }), {
        confirm: true,
        onCancel: () => {},
        onConfirm: () => startAsrModelDownload(engine, name, false),
        onBackground: () => startAsrModelDownload(engine, name, true),
      });
  }

  function requestSpkEngine(engine: SpkEngine): void {
    if (engine === args.spkEngine && !args.noSpk) return;
    if (modelDownload) {
      notify(t("settings.asrEngine.downloadRunning", { name: modelDownload.name }));
      return;
    }
    const ready = checkModels(modelOverridesFromSettings(), {
      requireSpk: true,
      asrEngine: args.asrEngine,
      spkEngine: engine,
    }).ok;
    if (ready) {
      applySpkEngine(engine);
      return;
    }
    const info = spkModelInfo(engine);
    const name = spkEngineLabel(engine);
    showToast(
      "warn",
      t("settings.spkEngine.downloadTitle", { name }),
      t("settings.spkEngine.downloadAsk", {
        name,
        size: info.approx,
      }),
      {
        confirm: true,
        onCancel: () => {},
        onConfirm: () => startSpkModelDownload(engine, name, false),
        onBackground: () => startSpkModelDownload(engine, name, true),
      },
    );
  }

  function disableSpkEngine(): void {
    if (args.noSpk) return;
    args.noSpk = true;
    persist();
    notify(`${t("settings.spkEngine.applied", {
      name: t("common.off"),
    })} · ${t("settings.spkEngine.restartHint")}`);
    dirty = true;
  }

  function progressBarText(percent: number): string {
    const width = 24;
    const value = Math.max(0, Math.min(100, percent));
    const filled = Math.round((value / 100) * width);
    return `${"█".repeat(filled)}${"░".repeat(width - filled)}  ${value}%`;
  }

  function startAsrModelDownload(
    engine: AsrEngine,
    name: string,
    background: boolean,
  ): void {
    modelDownload = {
      kind: "asr",
      engine,
      name,
      percent: 0,
      stage: "downloading",
      background,
    };
    if (background) {
      toast = null;
      mode = "normal";
      focusPanel = "transcript";
      status = t("settings.asrEngine.backgroundStarted", { name });
    } else {
      showToast(
        "info",
        t("settings.asrEngine.downloading", { name }),
        progressBarText(0),
        { blocking: true },
      );
    }
    dirty = true;
    paint({ urgent: true });

    void downloadAsrModel(engine, {
      onProgress: (percent) => {
        if (!modelDownload || modelDownload.kind !== "asr" || modelDownload.engine !== engine) return;
        modelDownload.percent = Math.max(0, Math.min(100, percent));
        if (!modelDownload.background && toast?.blocking) {
          toast.body = progressBarText(modelDownload.percent);
        }
        dirty = true;
      },
      onExtract: () => {
        if (!modelDownload || modelDownload.kind !== "asr" || modelDownload.engine !== engine) return;
        modelDownload.percent = 100;
        modelDownload.stage = "extracting";
        if (!modelDownload.background && toast?.blocking) {
          toast.body = t("settings.asrEngine.extracting");
        }
        dirty = true;
      },
      onRetry: () => {
        if (!modelDownload || modelDownload.kind !== "asr" || modelDownload.engine !== engine) return;
        modelDownload.percent = 0;
        modelDownload.stage = "downloading";
        if (!modelDownload.background && toast?.blocking) {
          toast.body = progressBarText(0);
        }
        dirty = true;
      },
    }).then(() => {
      modelDownload = null;
      toast = null;
      applyAsrEngine(engine);
    }).catch((error) => {
      modelDownload = null;
      toast = null;
      showToast("error", t("settings.asrEngine.downloadFailed", { name }), String(error));
    });
  }

  function startSpkModelDownload(
    engine: SpkEngine,
    name: string,
    background: boolean,
  ): void {
    modelDownload = {
      kind: "spk",
      engine,
      name,
      percent: 0,
      stage: "downloading",
      background,
    };
    if (background) {
      toast = null;
      mode = "normal";
      focusPanel = "transcript";
      status = t("settings.spkEngine.backgroundStarted", { name });
    } else {
      showToast(
        "info",
        t("settings.spkEngine.downloading", { name }),
        progressBarText(0),
        { blocking: true },
      );
    }
    dirty = true;
    paint({ urgent: true });

    void downloadSpkModel(engine, {
      quiet: true,
      onProgress: (percent) => {
        if (!modelDownload || modelDownload.kind !== "spk" || modelDownload.engine !== engine) return;
        modelDownload.percent = Math.max(0, Math.min(100, percent));
        if (!modelDownload.background && toast?.blocking) {
          toast.body = progressBarText(modelDownload.percent);
        }
        dirty = true;
      },
      onRetry: () => {
        if (!modelDownload || modelDownload.kind !== "spk" || modelDownload.engine !== engine) return;
        modelDownload.percent = 0;
        modelDownload.stage = "downloading";
        if (!modelDownload.background && toast?.blocking) {
          toast.body = progressBarText(0);
        }
        dirty = true;
      },
    }).then(() => {
      modelDownload = null;
      toast = null;
      applySpkEngine(engine);
    }).catch((error) => {
      modelDownload = null;
      toast = null;
      showToast("error", t("settings.spkEngine.downloadFailed", { name }), String(error));
    });
  }

  function toggleOrEditSetting(): void {
    const key = getSettingItems()[settingsFocus]?.key;
    if (!key) return;
    switch (key) {
      case "aiEn":
        toggleAi();
        break;
      case "aiTranslate":
        cycleAiTranslate(1);
        break;
      case "vadPreset":
        cycleVadPresetSetting(1);
        break;
      case "aiProvider": {
        args.ai = cycleAiProvider(args.ai, 1);
        notify(t("settings.provider.applied", {
          name: aiProviderLabel(args.ai),
          model: args.ai.model || "—",
        }));
        persist();
        break;
      }
      case "record":
        toggleRecord();
        break;
      case "share":
        toggleShare();
        break;
      case "aiBase":
      case "aiKey":
      case "aiModel":
      case "recDir":
      case "shareHost":
      case "sharePort":
        beginEdit(key);
        break;
      default:
        nudgeSetting(1);
    }
  }

  // ── speakers actions ───────────────────────────────────

  function addManualSpeaker(): void {
    const id = `manual_${nextManualId++}`;
    const n = speakers.size + 1;
    const color = SPK_COLORS[(n - 1) % SPK_COLORS.length]!;
    speakers.set(id, {
      id,
      detectedLabel: id,
      displayName: t("common.aliasN", { n: nextManualId - 1 }),
      color,
      segmentCount: 0,
      isActive: false,
      manual: true,
    });
    const list = speakerList();
    speakerSel = list.findIndex((s) => s.id === id);
    if (speakerSel < 0) speakerSel = 0;
    mode = "speaker-list";
    focusPanel = "speakers";
    notify(t("status.speakerAdded"));
  }

  function beginRenameSession(): void {
    if (!sessionDir) {
      notify(t("resume.status.renameFail"), "error");
      return;
    }
    // Edit alias only — id stays auto-generated and hidden
    sessionRenameDraft = sessionName || "";
    mode = "session-rename";
    status = "";
  }

  function commitRenameSession(): void {
    if (!sessionDir) {
      mode = "normal";
      sessionRenameDraft = "";
      return;
    }
    const next = sessionRenameDraft.trim();
    if (!next) {
      notify(t("resume.status.renameEmpty"), "warn");
      mode = "normal";
      sessionRenameDraft = "";
      return;
    }
    const meta = renameSession(sessionDir, next);
    if (meta) {
      sessionName = meta.name;
      // Alias update is silent chrome — no toast for the new default name itself
      notify(t("resume.status.renamed", { name: meta.name }));
      opts.onSessionRenamed?.(meta.name);
    } else {
      notify(t("resume.status.renameFail"), "error");
    }
    mode = "normal";
    sessionRenameDraft = "";
  }

  function cancelRenameSession(): void {
    sessionRenameDraft = "";
    mode = "normal";
  }

  function beginRenameSpeaker(): void {
    const list = speakerList();
    const sp = list[speakerSel];
    if (!sp) return;
    renameDraft = sp.displayName;
    mode = "speaker-rename";
    status = "";
  }

  function commitRenameSpeaker(): void {
    const list = speakerList();
    const sp = list[speakerSel];
    if (sp && renameDraft.trim()) {
      const name = renameDraft.trim();
      sp.displayName = name;
      if (sp.manual) sp.alias = sp.displayName;
      // Auto speakers (spk_N): promote / update global voiceprint roster
      const m = /^spk_(\d+)$/.exec(sp.id);
      if (m && opts.onSpeakerRenamed) {
        opts.onSpeakerRenamed(parseInt(m[1]!, 10), name);
        notify(t("status.speakerSavedGlobal", { name }));
      } else {
        notify(t("status.renamed", { name: sp.displayName }));
      }
    } else if (sp && !renameDraft.trim()) {
      notify(t("resume.status.renameEmpty"), "warn");
    }
    renameDraft = "";
    mode = "speaker-list";
  }

  function cancelRenameSpeaker(): void {
    renameDraft = "";
    mode = "speaker-list";
  }

  function deleteSpeaker(): void {
    const list = speakerList();
    const sp = list[speakerSel];
    if (!sp) return;
    if (!sp.manual) {
      notify(t("status.cannotDeleteAuto"), "warn");
      return;
    }
    if (sp.segmentCount > 0) {
      notify(t("status.cannotDeleteBound"), "warn");
      return;
    }
    speakers.delete(sp.id);
    speakerSel = Math.max(0, Math.min(speakerSel, speakers.size - 1));
    notify(t("status.deletedAlias"));
  }

  function beginMergeSpeaker(): void {
    const list = speakerList();
    if (list.length < 2) {
      notify(t("status.mergeNeedTwo"), "warn");
      return;
    }
    mergeSelected = new Set();
    mergeConfirm = false;
    mode = "speaker-merge";
    focusPanel = "speakers";
    status = t("status.mergeHint");
  }

  function toggleMergeMark(): void {
    const list = speakerList();
    const sp = list[speakerSel];
    if (!sp) return;
    if (mergeSelected.has(sp.id)) mergeSelected.delete(sp.id);
    else mergeSelected.add(sp.id);
    status = t("status.mergeHint");
  }

  function requestMergeExit(): void {
    if (mergeSelected.size === 0) {
      discardMerge();
      return;
    }
    if (mergeSelected.size < 2) {
      notify(t("status.mergeNeedTwo"), "warn");
      return;
    }
    mergeConfirm = true;
    // Confirm save in top-right toast (y / n)
    showToast(
      "warn",
      t("footer.merge"),
      t("status.mergeSaveAsk", { n: mergeSelected.size }),
      { confirm: true },
    );
  }

  function discardMerge(): void {
    mergeSelected = new Set();
    mergeConfirm = false;
    mode = "speaker-list";
    notify(t("status.mergeDiscarded"), "warn");
  }

  /**
   * Multi-select merge: first marked speaker is the keep target;
   * all other marked speakers are merged into it.
   */
  function saveMerge(): void {
    const list = speakerList();
    const ordered = list.filter((s) => mergeSelected.has(s.id));
    if (ordered.length < 2) {
      notify(t("status.mergeNeedTwo"), "warn");
      mergeConfirm = false;
      return;
    }
    const target = ordered[0]!;
    const sources = ordered.slice(1);
    let segs = 0;
    for (const source of sources) {
      for (const seg of segments) {
        if (seg.speakerId === source.id) {
          seg.speakerId = target.id;
          segs += 1;
        }
      }
      target.segmentCount += source.segmentCount;
      if (source.isActive) markActiveSpeaker(target.id);
      speakers.delete(source.id);
      if (opts.sessionDir) {
        try {
          persistSpeakerMergeToSession(opts.sessionDir, source.id, target.id);
        } catch {
          /* ignore */
        }
      }
    }
    mergeSelected = new Set();
    mergeConfirm = false;
    mode = "speaker-list";
    const nextList = speakerList();
    const ti = nextList.findIndex((s) => s.id === target.id);
    speakerSel = ti >= 0 ? ti : 0;
    notify(t("status.mergeDone", {
      n: ordered.length,
      to: target.displayName,
      segs,
    }));
  }

  function persistSpeakerMergeToSession(
    dir: string,
    fromId: string,
    toId: string,
  ): void {
    const fromSpk = parseSpkNum(fromId);
    const toSpk = parseSpkNum(toId);
    if (fromSpk == null || toSpk == null) return;
    const tf = path.join(dir, "transcript.jsonl");
    if (!fs.existsSync(tf)) return;
    const lines = fs.readFileSync(tf, "utf8").split("\n");
    let dirty = false;
    const out = lines.map((line) => {
      if (!line.trim()) return line;
      try {
        const row = JSON.parse(line) as {
          spk?: number | null;
          speakerId?: string | null;
        };
        let ch = false;
        if (row.spk === fromSpk) {
          row.spk = toSpk;
          ch = true;
        }
        if (row.speakerId === fromId || row.speakerId === `spk_${fromSpk}`) {
          row.speakerId = toId;
          ch = true;
        }
        if (ch) {
          dirty = true;
          return JSON.stringify(row);
        }
      } catch {
        /* keep line */
      }
      return line;
    });
    if (dirty) fs.writeFileSync(tf, out.join("\n"), "utf8");

    // speakers.json: remove source, keep target
    const sf = path.join(dir, "speakers.json");
    if (fs.existsSync(sf)) {
      try {
        const arr = JSON.parse(fs.readFileSync(sf, "utf8")) as Array<{
          id?: string;
          spk?: number | null;
          displayName?: string;
        }>;
        const filtered = arr.filter(
          (s) => s.id !== fromId && s.spk !== fromSpk,
        );
        fs.writeFileSync(sf, JSON.stringify(filtered, null, 2) + "\n", "utf8");
      } catch {
        /* ignore */
      }
    }
  }

  function parseSpkNum(id: string): number | null {
    const m = /^spk_(\d+)$/.exec(id);
    return m ? parseInt(m[1]!, 10) : null;
  }

  function assignLastSegmentToSpeaker(index1based: number): void {
    const list = speakerList();
    const sp = list[index1based - 1];
    if (!sp) {
      notify(t("status.noSpeakerN", { n: index1based }), "warn");
      return;
    }
    const last = segments[segments.length - 1];
    if (!last) {
      notify(t("status.noSegment"), "warn");
      return;
    }
    if (last.speakerId) {
      const old = speakers.get(last.speakerId);
      if (old) old.segmentCount = Math.max(0, old.segmentCount - 1);
    }
    last.speakerId = sp.id;
    sp.segmentCount += 1;
    notify(t("status.assigned", { name: sp.displayName }));
  }

  function markActiveSpeaker(id: string | null): void {
    for (const s of speakers.values()) s.isActive = false;
    if (id) {
      const sp = speakers.get(id);
      if (sp) sp.isActive = true;
    }
  }

  // ── input ──────────────────────────────────────────────

  /** True for a single printable grapheme (ASCII space+, CJK, etc.). */
  function isPrintableKey(key: string): boolean {
    if (!key || key.startsWith("\x1b")) return false;
    if (key === "\x7f" || key === "\b" || key === "\t") return false;
    // One code point, not a control char
    const cp = key.codePointAt(0);
    if (cp == null || cp < 0x20) return false;
    // Reject if more than one code point (shouldn't happen from feeder)
    return [...key].length === 1;
  }

  function onKey(key: string): void {
    if (closed) return;

    // Toast: confirm (y), background (b), cancel (n), or any-key dismiss; Ctrl+C still quits
    if (toast) {
      if (key === "\x03" || key === "\x04") {
        opts.onQuit();
        return;
      }
      if (toast.confirm) {
        if ((key === "b" || key === "B") && toast.onBackground) {
          const action = toast.onBackground;
          toast = null;
          action();
          dirty = true;
          return;
        }
        if (key === "y" || key === "Y" || key === "\r" || key === "\n") {
          const action = toast.onConfirm;
          toast = null;
          if (action) action();
          else saveMerge();
          dirty = true;
          return;
        }
        if (key === "n" || key === "N" || key === "\x1b") {
          const action = toast.onCancel;
          toast = null;
          if (action) action();
          else discardMerge();
          dirty = true;
          return;
        }
        return; // wait for y/b/n
      }
      if (toast.blocking) return;
      dismissToast();
      return;
    }

    // settings text edit — exclusive; swallow CSI / shortcuts
    if (mode === "settings-edit") {
      if (key === "\x1b") {
        cancelEdit();
        dirty = true;
        return;
      }
      if (key.startsWith("\x1b")) return; // arrows etc.
      if (key === "\r" || key === "\n") {
        commitEdit();
        dirty = true;
        return;
      }
      if (key === "\x15") {
        editDraft = "";
        dirty = true;
        return;
      }
      if (key === "\x7f" || key === "\b" || key === "\x08") {
        editDraft = editDraft.slice(0, -1);
        dirty = true;
        return;
      }
      if (key === "\t") return;
      if (isPrintableKey(key)) {
        if (editDraft.length < 200) editDraft += key;
        dirty = true;
      }
      return;
    }

    // speaker rename modal — exclusive input
    if (mode === "speaker-rename") {
      if (key === "\x03" || key === "\x04") {
        opts.onQuit();
        return;
      }
      if (key === "\x1b") {
        cancelRenameSpeaker();
        dirty = true;
        return;
      }
      if (key.startsWith("\x1b")) return;
      if (key === "\r" || key === "\n") {
        commitRenameSpeaker();
        dirty = true;
        return;
      }
      if (key === "\x7f" || key === "\b" || key === "\x08") {
        renameDraft = renameDraft.slice(0, -1);
        dirty = true;
        return;
      }
      if (key === "\t") return;
      if (isPrintableKey(key)) {
        if (renameDraft.length < 80) renameDraft += key;
        dirty = true;
      }
      return;
    }

    // session name rename modal — exclusive input
    if (mode === "session-rename") {
      if (key === "\x03" || key === "\x04") {
        opts.onQuit();
        return;
      }
      if (key === "\x1b") {
        cancelRenameSession();
        dirty = true;
        return;
      }
      if (key.startsWith("\x1b")) return;
      if (key === "\r" || key === "\n") {
        commitRenameSession();
        dirty = true;
        return;
      }
      if (key === "\x7f" || key === "\b" || key === "\x08") {
        sessionRenameDraft = sessionRenameDraft.slice(0, -1);
        dirty = true;
        return;
      }
      if (key === "\t") return;
      if (isPrintableKey(key)) {
        if (sessionRenameDraft.length < 80) sessionRenameDraft += key;
        dirty = true;
      }
      return;
    }

    // quit — not while text editing (handled above)
    if (key === "q" || key === "Q" || key === "\x03" || key === "\x04") {
      if (mode === "settings") {
        // q still quits from settings per original behavior
        opts.onQuit();
        return;
      }
      opts.onQuit();
      return;
    }

    // settings mode
    if (mode === "settings") {
      if (key === "\x1b" || key === "s" || key === "S") {
        mode = "normal";
        flushSaveSettings(() => snapshotFromArgs(args));
        dirty = true;
        return;
      }
      if (key === "\x1b[A" || key === "k") {
        settingsFocus =
          (settingsFocus + getSettingItems().length - 1) % getSettingItems().length;
        dirty = true;
        return;
      }
      if (key === "\x1b[B" || key === "j") {
        settingsFocus = (settingsFocus + 1) % getSettingItems().length;
        dirty = true;
        return;
      }
      if (key === "\x1b[C" || key === "l") {
        nudgeSetting(1);
        dirty = true;
        return;
      }
      if (key === "\x1b[D" || key === "h") {
        nudgeSetting(-1);
        dirty = true;
        return;
      }
      if (key === " " || key === "\r") {
        toggleOrEditSetting();
        dirty = true;
        return;
      }
      return;
    }

    // speaker merge: multi-select in speaker panel only
    // (save confirm is handled by toast.confirm above)
    if (mode === "speaker-merge") {
      if (key === "\x1b") {
        requestMergeExit();
        dirty = true;
        return;
      }
      if (key === "\x1b[A" || key === "k") {
        const n = speakerList().length;
        if (n) speakerSel = (speakerSel + n - 1) % n;
        dirty = true;
        return;
      }
      if (key === "\x1b[B" || key === "j") {
        const n = speakerList().length;
        if (n) speakerSel = (speakerSel + 1) % n;
        dirty = true;
        return;
      }
      if (key === " ") {
        toggleMergeMark();
        dirty = true;
        return;
      }
      // stay in speaker panel — block tab/other shortcuts
      return;
    }

    // speaker list focus
    if (mode === "speaker-list") {
      if (key === "\t") {
        focusPanel = "transcript";
        mode = "normal";
        dirty = true;
        return;
      }
      if (key === "\x1b") {
        mode = "normal";
        focusPanel = "transcript";
        dirty = true;
        return;
      }
      if (key === "\x1b[A" || key === "k") {
        const n = speakerList().length;
        if (n) speakerSel = (speakerSel + n - 1) % n;
        dirty = true;
        return;
      }
      if (key === "\x1b[B" || key === "j") {
        const n = speakerList().length;
        if (n) speakerSel = (speakerSel + 1) % n;
        dirty = true;
        return;
      }
      if (key === "\r") {
        beginRenameSpeaker();
        dirty = true;
        return;
      }
      if (key === "m" || key === "M") {
        beginMergeSpeaker();
        dirty = true;
        return;
      }
      if (key === "a" || key === "A") {
        addManualSpeaker();
        dirty = true;
        return;
      }
      if (key === "\x1b[3~" || key === "\x7f") {
        deleteSpeaker();
        dirty = true;
        return;
      }
      if (key >= "1" && key <= "9") {
        assignLastSegmentToSpeaker(parseInt(key, 10));
        dirty = true;
        return;
      }
      // fall through for global keys like p/s/h/r
    }

    // main / global keys
    if (key === "\t") {
      if (focusPanel === "transcript") {
        focusPanel = "speakers";
        mode = "speaker-list";
      } else {
        focusPanel = "transcript";
        mode = "normal";
      }
      dirty = true;
      return;
    }
    if (key === "p" || key === "P") {
      args.paused.value = !args.paused.value;
      status = args.paused.value ? t("status.pausedHint") : t("status.listening");
      dirty = true;
      return;
    }
    if (key === " ") {
      if (mode === "normal") {
        args.paused.value = !args.paused.value;
        status = args.paused.value ? t("status.pausedHint") : t("status.listening");
        dirty = true;
      }
      return;
    }
    if (key === "s" || key === "S") {
      mode = "settings";
      dirty = true;
      return;
    }
    if (key === "e" || key === "E") {
      beginRenameSession();
      dirty = true;
      return;
    }
    if (key === "h" || key === "H") {
      toggleShare();
      dirty = true;
      return;
    }
    if (key === "r" || key === "R") {
      toggleRecord();
      dirty = true;
      return;
    }
    if (key === "c" || key === "C") {
      segments.length = 0;
      livePartial = null;
      for (const s of speakers.values()) {
        s.segmentCount = 0;
        s.isActive = false;
      }
      scroll = 0;
      dirty = true;
      return;
    }
    if (key === "a" || key === "A") {
      addManualSpeaker();
      dirty = true;
      return;
    }
    if (key === "g") {
      scroll = 0;
      dirty = true;
      paint({ urgent: true });
      return;
    }
    // Mouse wheel / click (SGR: ESC[<btn;x;yM  or …m for release)
    if (key.startsWith("\x1b[<") && /[Mm]$/.test(key)) {
      handleMouseSgr(key);
      return;
    }
    if (key === "\x1b[A" && mode === "normal") {
      scrollTranscript(1);
      return;
    }
    if (key === "\x1b[B" && mode === "normal") {
      scrollTranscript(-1);
      return;
    }
    if (key === "\x1b[5~") {
      scrollTranscript(Math.max(3, Math.floor(rows() / 2)));
      return;
    }
    if (key === "\x1b[6~") {
      scrollTranscript(-Math.max(3, Math.floor(rows() / 2)));
      return;
    }
    if (key >= "1" && key <= "9" && mode === "normal") {
      assignLastSegmentToSpeaker(parseInt(key, 10));
      dirty = true;
      return;
    }
  }

  /** scroll>0 = look at older lines; 0 = stick to live bottom. */
  function scrollTranscript(deltaLines: number): void {
    if (mode !== "normal" && mode !== "speaker-list") return;
    // Prefer scrolling transcript when focused there or in default normal mode
    if (mode === "speaker-list" && focusPanel === "speakers") {
      const n = speakerList().length;
      if (!n) return;
      if (deltaLines > 0) speakerSel = Math.max(0, speakerSel - 1);
      else if (deltaLines < 0) speakerSel = Math.min(n - 1, speakerSel + 1);
      dirty = true;
      paint({ urgent: true });
      return;
    }
    scroll = Math.max(0, scroll + deltaLines);
    dirty = true;
    paint({ urgent: true });
  }

  /**
   * SGR mouse: ESC[<b;x;yM (press) / m (release).
   * Wheel up = 64 (+ mods 4/8/16…), wheel down = 65 (+ mods).
   */
  function handleMouseSgr(seq: string): void {
    const m = seq.match(/^\x1b\[<(\d+);(\d+);(\d+)([Mm])$/);
    if (!m) return;
    if (m[4] !== "M") return; // press only
    const btn = parseInt(m[1]!, 10);
    // Wheel events set bit 6 (value 64); bit 0 distinguishes up(0)/down(1)
    if ((btn & 0x40) === 0) return;
    const steps = 3;
    if ((btn & 0x1) === 0) scrollTranscript(steps); // up → older
    else scrollTranscript(-steps); // down → newer / live
  }

  // key reader — UTF-8 safe (CJK 不乱码)
  const keyFeeder = createKeyFeeder(onKey);
  const feedKeys = keyFeeder.feed;

  function restoreTerminal(): void {
    try {
      keyFeeder.reset();
      stdin.removeListener("data", feedKeys);
      if (stdin.isTTY) stdin.setRawMode?.(false);
      stdin.pause();
    } catch {
      /* ignore */
    }
    try {
      stdout.removeListener("resize", onResize);
    } catch {
      /* ignore */
    }
    try {
      stdout.write(MOUSE_OFF + SHOW_CUR + ALT_OFF + RESET);
    } catch {
      /* ignore */
    }
  }

  function fatalShutdown(err: unknown): void {
    try {
      restoreTerminal();
    } catch {
      /* ignore */
    }
    console.error(err);
    process.exit(1);
  }

  // enter alt screen / raw mode
  if (stdin.isTTY) {
    try {
      stdin.setRawMode?.(true);
    } catch {
      /* ignore */
    }
    stdin.resume();
    stdin.on("data", feedKeys);
  }
  stdout.write(ALT_ON + HIDE_CUR + MOUSE_ON + CLEAR);

  process.on("exit", restoreTerminal);
  process.on("SIGINT", () => {
    // raw mode: also handled via \x03; keep as safety
  });
  process.on("uncaughtException", fatalShutdown);
  process.on("unhandledRejection", fatalShutdown);

  const raf = setInterval(() => {
    pulse += 1;
    // clear isActive after a while for older final segments
    if (pulse % 4 === 0) {
      const last = segments[segments.length - 1];
      if (
        last &&
        last.isActive &&
        !last.pending &&
        !last.isDraft &&
        Date.now() - last.wall.getTime() > 4000
      ) {
        last.isActive = false;
        markActiveSpeaker(null);
        dirty = true;
      }
    }
    // Only repaint when something actually needs animation or is dirty.
    // (Old pulse%2 forced ~4fps full paints → merge flicker.)
    const needAnim =
      dirty ||
      aiBusy ||
      !!livePartial ||
      !!toast ||
      segments.some((s) => s.pending || s.isDraft);
    if (needAnim) paint();
  }, 160);

  paint({ urgent: true });

  const handle: TuiHandle = {
    emit(seg: Segment) {
      // ── partial: refresh single live row (never history / file / assign) ──
      if (isPartialSegment(seg)) {
        const text = (seg.text || "").trim();
        if (!text) {
          livePartial = null;
        } else {
          livePartial = {
            text,
            start: seg.start,
            wall: seg.wall,
            spk: seg.spk,
          };
        }
        paint(); // throttled — recognizing status updates often
        return;
      }

      // Final (or legacy omit kind) clears live row then updates history
      livePartial = null;

      const main = displayText(seg);
      const rawAsr = (seg.text || "").trim();
      // Prefer stable id from pipeline for ASR→AI update
      const id = seg.id || `seg_${++segSeq}`;
      const existing = segments.find((s) => s.id === id);
      const sid = ensureSpeaker(seg.spk);

      if (existing) {
        // Update in place (ASR grow / AI finished)
        const wasPending = !!existing.pending;
        const prevText = existing.originalText;
        const nextText = main || rawAsr || existing.originalText;
        const textGrew =
          !!nextText &&
          !!prevText &&
          nextText !== prevText &&
          nextText.length >= prevText.length;
        // Keep showing previous source until we have a real replacement
        if (nextText) existing.originalText = nextText;

        // Translation policy (sticky — flashing was caused by clears on pending/commit):
        // - non-empty translation always wins
        // - only drop when draft source *grew* (merge still open, old tr stale)
        // - pending:true / commit without translation → keep previous tr
        if (seg.translation?.trim()) {
          const tr = seg.translation.trim();
          if (tr !== existing.originalText) existing.translatedText = tr;
        } else if (seg.draft && textGrew && !seg.pending) {
          existing.translatedText = undefined;
        }
        // else: keep existing.translatedText
        // Always stamp end time when we have it (including AI finalize)
        if (seg.end != null && Number.isFinite(seg.end)) {
          existing.endedAtMs = seg.end;
        }
        if (sid) {
          if (existing.speakerId !== sid) existing.speakerId = sid;
          markActiveSpeaker(sid);
        }
        // Draft merge: soft state, no AI spinner. AI pending: short hold spinner.
        if (seg.draft) {
          existing.isDraft = true;
          existing.isFinal = false;
          // Don't force pending spinner during merge growth
          if (!seg.pending) existing.pending = false;
        }
        if (seg.pending) {
          existing.pending = true;
          existing.isFinal = false;
          existing.isDraft = false;
          if (!pendingHold.has(id)) {
            pendingHold.set(id, Date.now() + AI_BUSY_MIN_MS);
          }
        } else if (wasPending) {
          const holdUntil = pendingHold.get(id) ?? 0;
          const wait = Math.max(0, holdUntil - Date.now());
          const finish = () => {
            const row = segments.find((s) => s.id === id);
            if (!row) return;
            row.pending = false;
            row.isFinal = !row.isDraft;
            pendingHold.delete(id);
            paint();
          };
          if (wait > 0) {
            existing.pending = true;
            existing.isFinal = false;
            setTimeout(finish, wait);
          } else {
            existing.pending = false;
            existing.isFinal = !existing.isDraft;
            pendingHold.delete(id);
          }
          if (sid) {
            const sp = speakers.get(sid);
            if (sp) sp.segmentCount += 1;
          }
        } else if (!seg.draft) {
          existing.pending = false;
          existing.isDraft = false;
          existing.isFinal = true;
        }
        existing.isActive = true;
        for (const s of segments) {
          if (s.id !== id) s.isActive = false;
        }
      } else {
        if (sid && !seg.pending && !seg.draft) {
          const sp = speakers.get(sid)!;
          sp.segmentCount += 1;
        }
        for (const s of segments) s.isActive = false;
        if (sid) markActiveSpeaker(sid);
        else markActiveSpeaker(null);

        if (seg.pending) {
          pendingHold.set(id, Date.now() + AI_BUSY_MIN_MS);
        }

        const ts: TranscriptSegment = {
          id,
          speakerId: sid,
          startedAtMs: seg.start,
          endedAtMs:
            seg.end != null && Number.isFinite(seg.end) ? seg.end : undefined,
          originalText: main || rawAsr,
          translatedText:
            seg.translation &&
            seg.translation.trim() !== (main || rawAsr)
              ? seg.translation.trim()
              : undefined,
          isFinal: !seg.pending && !seg.draft,
          isActive: true,
          pending: !!seg.pending,
          isDraft: !!seg.draft,
          wall: seg.wall,
        };
        segments.push(ts);
        if (segments.length > 500) segments.splice(0, segments.length - 400);
      }

      // Append-only file: only committed turns (not growing drafts / AI-pending)
      if (out && !seg.pending && !seg.draft) {
        const spkLabel =
          sid && speakers.get(sid)
            ? speakers.get(sid)!.displayName
            : seg.spk != null
              ? t("plain.speaker", { n: seg.spk })
              : t("common.dash");
        let line = `[${fmtClock(seg.wall)} ${fmtRange(seg.start, seg.end)}] ${spkLabel}  ${main || rawAsr}`;
        if (seg.translation) line += ` | ${seg.translation}`;
        if (seg.corrected && seg.corrected !== seg.text) {
          line += `  (ASR: ${seg.text})`;
        }
        out.write(line + "\n");
      }
      // Draft/merge: throttled paint; commit/AI: slightly more responsive
      paint(seg.draft ? undefined : { urgent: true });
    },
    setStatus(msg: string) {
      // Continuous / ambient → message bar; one-shot tips → center toast
      if (isProgressStatus(msg)) {
        status = msg;
        paint();
      } else {
        notify(msg);
      }
    },
    setDevice(name: string) {
      deviceName = name;
      paint();
    },
    setAiBusy(busy: boolean) {
      if (busy) {
        aiBusy = true;
        aiBusyHoldUntil = Date.now() + AI_BUSY_MIN_MS;
        paint();
        return;
      }
      const wait = Math.max(0, aiBusyHoldUntil - Date.now());
      if (wait > 0) {
        setTimeout(() => {
          if (Date.now() >= aiBusyHoldUntil) {
            aiBusy = false;
            paint();
          }
        }, wait + 10);
      } else {
        aiBusy = false;
        paint();
      }
    },
    close() {
      if (closed) return;
      closed = true;
      clearInterval(raf);
      if (paintTimer) {
        clearTimeout(paintTimer);
        paintTimer = null;
      }
      clearToastTimer();
      try {
        keyFeeder.reset();
      } catch {
        /* ignore */
      }
      try {
        flushSaveSettings(() => snapshotFromArgs(args));
      } catch {
        /* ignore */
      }
      try {
        process.removeListener("exit", restoreTerminal);
        process.removeListener("uncaughtException", fatalShutdown);
        process.removeListener("unhandledRejection", fatalShutdown);
      } catch {
        /* ignore */
      }
      restoreTerminal();
      try {
        out?.end();
      } catch {
        /* ignore */
      }
      resolveClosed();
    },
    waitClosed: () => closedPromise,
  };

  function onResize() {
    prevBuf = null;
    paint({ urgent: true });
  }
  stdout.on("resize", onResize);

  return handle;
}
