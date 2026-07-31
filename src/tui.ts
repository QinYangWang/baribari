/**
 * Full-screen TUI for live meeting transcription.
 * Three-column layout: speakers | transcript | side status.
 * No heavy deps — ANSI alt-screen + raw keyboard + screen-buffer diff.
 */

import fs from "node:fs";
import os from "node:os";
import type { AudioSource, Lang, Segment, TranscribeArgs } from "./types.js";
import { displayText } from "./types.js";
import {
  defaultRecordDir,
  flushSaveSettings,
  normalizeRecordDir,
  scheduleSaveSettings,
  snapshotFromArgs,
} from "./settings.js";
import {
  aiActive,
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
  wall: Date;
}

export interface TuiHandle {
  emit: (seg: Segment) => void;
  setStatus: (msg: string) => void;
  setDevice: (name: string) => void;
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
function langLabelOf(lang: string): string {
  const key = `lang.${lang}` as const;
  const v = t(key);
  return v === key ? lang : v;
}

// ── text width helpers ───────────────────────────────────

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

/** East-Asian-aware display width (ANSI ignored). */
export function dw(s: string): number {
  let w = 0;
  for (const ch of stripAnsi(s)) {
    const c = ch.codePointAt(0)!;
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
        (c >= 0x1f300 && c <= 0x1f9ff))
    ) {
      w += 2;
    } else {
      w += 1;
    }
  }
  return w;
}

function truncateDisplay(text: string, maxWidth: number): string {
  if (dw(text) <= maxWidth) return text;
  if (maxWidth <= 1) return "…".slice(0, maxWidth);
  let out = "";
  let w = 0;
  for (const ch of text) {
    const cw = dw(ch);
    if (w + cw > maxWidth - 1) break;
    out += ch;
    w += cw;
  }
  return out + "…";
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
): void {
  const row = buf[y];
  if (!row || x < 0 || x >= row.length || y < 0) return;
  const cw = dw(ch);
  if (cw <= 0) return;
  // clear previous wide-char tail if overwriting mid-cell
  if (row[x]?.continuation && x > 0) {
    row[x - 1] = emptyCell();
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
  if (cw === 2 && x + 1 < row.length) {
    // clear if next was start of wide char
    if (row[x + 1] && !row[x + 1]!.continuation && dw(row[x + 1]!.char) === 2) {
      /* ok */
    }
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
  const limit = maxW != null ? x + maxW : Infinity;
  for (const ch of text) {
    const cw = dw(ch);
    if (cx + cw > limit) break;
    if (cx >= (buf[0]?.length ?? 0)) break;
    putChar(buf, cx, y, ch, style);
    cx += cw;
  }
  return cx - x;
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
      out += `${ESC}[${y + 1};${x + 1}H`;
      let cx = x;
      let openHref: string | undefined;
      while (cx < end && cx < W) {
        const c = nrow[cx]!;
        if (c.continuation) {
          cx++;
          continue;
        }
        const href = c.href;
        if (href !== openHref) {
          if (openHref) out += `${ESC}]8;;${ESC}\\`; // close previous link
          if (href) out += `${ESC}]8;;${href}${ESC}\\`; // open link
          openHref = href;
        }
        const sg = sgr(c);
        if (sg !== lastSgr) {
          out += sg;
          lastSgr = sg;
        }
        out += c.char;
        cx += dw(c.char) || 1;
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
    leftW = Math.min(28, Math.max(22, Math.floor(W * 0.16)));
    rightW = Math.min(34, Math.max(26, Math.floor(W * 0.22)));
  } else if (W >= MEDIUM_MIN) {
    mode = "medium";
    leftW = Math.min(26, Math.max(20, Math.floor(W * 0.2)));
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
  opts: { onQuit: () => void },
): TuiHandle {
  if (args.uiLang) setUiLang(args.uiLang);
  const segments: TranscriptSegment[] = [];
  const speakers = new Map<string, Speaker>();
  let nextManualId = 1;
  let segSeq = 0;

  let status = t("status.starting");
  let deviceName = "—";
  let scroll = 0;
  let dirty = true;
  let closed = false;
  let pulse = 0;
  const startedAt = Date.now();
  let recordStartedAt: number | null = null;

  let mode: UiMode = "normal";
  let focusPanel: "transcript" | "speakers" | "side" = "transcript";
  let speakerSel = 0;
  let speakerScroll = 0;
  let renameDraft = "";

  let settingsFocus = 0;
  let settingsScroll = 0;
  let editDraft = "";
  let editField: string | null = null;

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
    if (!speakers.has(id)) {
      const color = SPK_COLORS[(spk - 1) % SPK_COLORS.length]!;
      speakers.set(id, {
        id,
        detectedLabel: `speaker_${spk}`,
        displayName: t("common.speakerN", { n: spk }),
        color,
        segmentCount: 0,
        isActive: false,
        manual: false,
      });
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
    | "lang"
    | "spkThr"
    | "aiEn"
    | "aiTranslate"
    | "aiBase"
    | "aiKey"
    | "aiModel"
    | "source"
    | "recDir"
    | "record"
    | "share"
    | "sharePort"
    | "shareHost"
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
      key: "lang",
      label: t("settings.items.lang.label"),
      help: t("settings.items.lang.help"),
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
      : `${pulse % 2 === 0 ? "●" : "○"} ${t("tui.listening")}`;
    const aiOn = args.ai.enabled;
    const sharePart = args.share.enabled
      ? `${t("tui.share")} :${args.share.port}`
      : t("tui.shareOff");
    const elapsed = fmtDur((Date.now() - startedAt) / 1000);
    const spkN = speakers.size;
    const segN = segments.length;

    const parts: { t: string; fg: RGB; bold?: boolean }[] = [
      { t: t("tui.brand"), fg: C.accent, bold: true },
      { t: " ", fg: C.muted },
      { t: listen, fg: listenFg, bold: true },
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
    ];

    let x = r.x + 1;
    const maxX = r.x + r.w - 1;
    for (const p of parts) {
      if (x >= maxX) break;
      const tw = putText(buf, x, r.y, p.t, { fg: p.fg, bold: p.bold, bg: C.panelBg }, maxX - x);
      x += tw;
    }
  }

  function isIdleStatus(msg: string): boolean {
    const st = msg.trim();
    if (!st) return true;
    if (st === t("status.listening") || st === t("tui.listening")) return true;
    if (st === t("status.starting")) return true;
    return false;
  }

  function statusSeverity(msg: string): "ok" | "warn" | "err" | "info" {
    const lower = msg.toLowerCase();
    if (/失败|错误|error|缺|无key|退出|fail|invalid|无效/.test(lower)) return "err";
    if (/暂无|警告|warn|重连|切换|暂停|pause|…|请/.test(lower)) return "warn";
    if (/已开|成功|共享已|开始|保存|监听设备|ai 已|✓|on ·|saved|enabled/.test(lower)) {
      return "ok";
    }
    return "info";
  }

  function renderMessageBar(buf: Cell[][], layout: Layout): void {
    const r = layout.messageBar;
    if (!r) return;
    const st = status.trim();
    if (!st || isIdleStatus(st)) return;

    const sev = statusSeverity(st);
    const borderFg =
      sev === "err" ? C.err : sev === "warn" ? C.warn : sev === "ok" ? C.ok : C.panelBorder;
    const icon = sev === "err" ? "!" : sev === "warn" ? "…" : sev === "ok" ? "✓" : "·";
    const textFg =
      sev === "err" ? C.err : sev === "warn" ? C.warn : sev === "ok" ? C.ok : C.title;

    drawBox(buf, r, undefined, borderFg);
    const innerW = Math.max(1, r.w - 4);
    const line = truncateDisplay(`${icon} ${st}`, innerW);
    putText(buf, r.x + 2, r.y + 1, line, { fg: textFg, bold: sev !== "info" });
  }

  function renderSpeakerList(buf: Cell[][], layout: Layout): void {
    const r = layout.speakerList;
    if (!r) return;
    const focused =
      focusPanel === "speakers" &&
      (mode === "speaker-list" || mode === "speaker-rename");
    drawBox(buf, r, t("tui.speakersTitle"), focused ? C.accent : C.border, C.cyan);
    const innerX = r.x + 1;
    const innerW = r.w - 2;
    let y = r.y + 1;

    putText(buf, innerX, y++, truncateDisplay(t("tui.speakersHint1"), innerW), {
      fg: C.dim,
      dim: true,
    });
    putText(buf, innerX, y++, truncateDisplay(t("tui.speakersHint2"), innerW), {
      fg: C.dim,
      dim: true,
    });
    y++;

    const list = speakerList();
    const visible = Math.max(1, r.y + r.h - 2 - y - 1);
    ensureSpeakerVisible(visible);
    const slice = list.slice(speakerScroll, speakerScroll + visible);

    if (list.length === 0) {
      putText(buf, innerX, y, truncateDisplay(t("tui.noSpeakers"), innerW), {
        fg: C.muted,
        dim: true,
      });
    } else {
      for (let i = 0; i < slice.length; i++) {
        const sp = slice[i]!;
        const idx = speakerScroll + i;
        const sel = focused && idx === speakerSel;
        const dot = sp.isActive ? "●" : "○";
        const name =
          mode === "speaker-rename" && sel
            ? renameDraft + "▌"
            : sp.displayName;
        const line = `${dot} ${name}`;
        const style: Partial<Cell> = {
          fg: sel ? C.white : sp.color,
          bold: sel || sp.isActive,
          bg: sel ? C.selectBg : undefined,
        };
        if (sel) fillRect(buf, { x: innerX, y, w: innerW, h: 1 }, { bg: C.selectBg });
        putText(buf, innerX, y, truncateDisplay(line, innerW - 2), style);
        putText(buf, innerX + innerW - 2, y, "✎", {
          fg: C.dim,
          bg: sel ? C.selectBg : undefined,
        });
        y++;
      }
    }

    // + add alias hint
    const addY = r.y + r.h - 2;
    if (addY > y) {
      putText(
        buf,
        innerX,
        addY,
        truncateDisplay(t("tui.addAlias"), innerW),
        { fg: C.dim, dim: true },
      );
    }

    // scrollbar
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
    const name = sp?.displayName || t("common.unknownSpeaker");
    const color = sp?.color || C.muted;
    const time = fmtRange(seg.startedAtMs, seg.endedAtMs);
    const head = `● ${name}  ${time}`;
    lines.push({
      text: head,
      style: {
        fg: seg.isActive ? color : color,
        bold: true,
        dim: !seg.isActive && seg.isFinal,
      },
    });

    const indent = 2;
    const textW = Math.max(4, innerW - indent);
    const body = wrapDisplay(seg.originalText || "…", textW);
    for (const wl of body) {
      lines.push({
        text: " ".repeat(indent) + wl,
        style: {
          fg: seg.isActive ? C.title : C.muted,
          dim: !seg.isActive,
        },
      });
    }
    if (seg.translatedText) {
      const tw = wrapDisplay(seg.translatedText, textW);
      for (const wl of tw) {
        lines.push({
          text: " ".repeat(indent) + wl,
          style: { fg: C.translate, dim: true },
        });
      }
    }
    lines.push({ text: "", style: {} });
    return lines;
  }

  function renderTranscript(buf: Cell[][], layout: Layout): void {
    const r = layout.transcript;
    const focused = focusPanel === "transcript" && (mode === "normal" || mode === "speaker-list");
    drawBox(
      buf,
      r,
      t("tui.transcriptTitle"),
      focused && mode === "normal" ? C.accent : C.border,
      C.cyan,
    );
    const innerX = r.x + 2;
    const innerW = r.w - 4;
    const innerY = r.y + 1;
    const innerH = r.h - 2;

    if (segments.length === 0) {
      const h1 = t("tui.waiting1");
      const h2 = t("tui.waiting2");
      const cy = innerY + Math.floor(innerH / 2) - 1;
      putText(
        buf,
        innerX + Math.max(0, Math.floor((innerW - dw(h1)) / 2)),
        cy,
        h1,
        { fg: C.muted, dim: true },
      );
      putText(
        buf,
        innerX + Math.max(0, Math.floor((innerW - dw(h2)) / 2)),
        cy + 2,
        h2,
        { fg: C.dim, dim: true },
      );
      return;
    }

    // build visual rows for all segments (bounded)
    const maxKeep = 200;
    const segs = segments.length > maxKeep ? segments.slice(-maxKeep) : segments;
    const visual: {
      text: string;
      style: Partial<Cell>;
      active?: boolean;
    }[] = [];
    for (const seg of segs) {
      const ls = segmentVisualLines(seg, innerW);
      for (const l of ls) {
        visual.push({ ...l, active: seg.isActive });
      }
    }

    const maxScroll = Math.max(0, visual.length - innerH);
    if (scroll > maxScroll) scroll = maxScroll;
    const stickBottom = scroll === 0;
    const start = stickBottom
      ? Math.max(0, visual.length - innerH)
      : Math.max(0, visual.length - innerH - scroll);
    const slice = visual.slice(start, start + innerH);

    for (let i = 0; i < slice.length; i++) {
      const row = slice[i]!;
      const y = innerY + i;
      if (row.active) {
        // left accent bar + soft bg
        fillRect(
          buf,
          { x: r.x + 1, y, w: r.w - 2, h: 1 },
          { bg: C.activeBg },
        );
        putChar(buf, r.x + 1, y, "▌", { fg: C.accent, bg: C.activeBg });
        putText(buf, innerX, y, truncateDisplay(row.text, innerW), {
          ...row.style,
          bg: C.activeBg,
        });
      } else {
        putText(buf, innerX, y, truncateDisplay(row.text, innerW), row.style);
      }
    }

    if (maxScroll > 0 && scroll > 0) {
      putText(
        buf,
        r.x + r.w - 8,
        r.y,
        ` ↑${scroll} `,
        { fg: C.warn },
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
    const k = padDisplay(key, 8);
    putText(buf, x, y, k, { fg: C.dim });
    putText(buf, x + 9, y, truncateDisplay(val, w - 9), { fg: valFg });
  }

  function renderSidePanel(buf: Cell[][], layout: Layout): void {
    const r = layout.sidePanel;
    if (!r) return;
    drawBox(buf, r, t("tui.sideTitle"), C.border, C.cyan);
    const x = r.x + 2;
    const w = r.w - 4;
    let y = r.y + 2;

    // 7.1 设备与音频
    putText(buf, x, y++, t("tui.deviceAudio"), { fg: C.cyan, bold: true });
    kv(buf, x, y++, w, t("tui.source"), sourceDetail(args.source), C.accent);
    kv(buf, x, y++, w, t("tui.device"), deviceName || t("common.dash"), C.muted);
    // volume placeholder (no real meter in pipeline)
    const volBar = "━━━━━━━";
    kv(buf, x, y++, w, t("tui.volume"), `${volBar} ${t("common.dash")}`, C.muted);
    kv(buf, x, y++, w, t("tui.mute"), t("tui.unmuted"), C.ok);
    y++;

    // 7.2 录音设置
    putText(buf, x, y++, t("tui.recSettings"), { fg: C.cyan, bold: true });
    const recOn = Boolean(args.record);
    if (recOn && recordStartedAt == null) recordStartedAt = Date.now();
    if (!recOn) recordStartedAt = null;
    kv(buf, x, y++, w, t("tui.recState"), recOn ? t("tui.recording") : t("tui.notRecording"), recOn ? C.err : C.muted);
    kv(buf, x, y++, w, t("tui.format"), "WAV", C.muted);
    kv(
      buf,
      x,
      y++,
      w,
      t("tui.savePath"),
      args.recordDir || defaultRecordDir(),
      C.muted,
    );
    const recDur =
      recOn && recordStartedAt
        ? fmtDur((Date.now() - recordStartedAt) / 1000)
        : "00:00";
    kv(buf, x, y++, w, t("tui.duration"), recDur, C.muted);
    const fileName = args.record
      ? truncateDisplay(args.record.split(/[/\\]/).pop() || args.record, w - 9)
      : t("common.dash");
    kv(buf, x, y++, w, t("tui.file"), fileName, C.muted);
    y++;

    // 7.3 网络共享
    if (y < r.y + r.h - 2) {
      putText(buf, x, y++, t("tui.netShare"), { fg: C.cyan, bold: true });
      kv(
        buf,
        x,
        y++,
        w,
        t("tui.state"),
        args.share.enabled ? t("tui.enabled") : t("tui.disabled"),
        args.share.enabled ? C.ok : C.muted,
      );
      kv(buf, x, y++, w, t("tui.port"), String(args.share.port), C.muted);
      kv(buf, x, y++, w, t("tui.address"), args.share.host || "0.0.0.0", C.muted);
      // Single URL row: display host:port, click opens http://host:port (OSC 8)
      const fullUrl = shareAccessUrl(args.share.port);
      const displayUrl = shareAccessHost(args.share.port);
      const label = padDisplay(t("tui.accessUrl"), 8);
      putText(buf, x, y, label, { fg: C.dim });
      putText(
        buf,
        x + 9,
        y,
        truncateDisplay(displayUrl, w - 9),
        {
          fg: args.share.enabled ? C.ok : C.dim,
          href: args.share.enabled ? fullUrl : undefined,
        },
      );
      y++;
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
    } else if (mode === "speaker-rename") {
      hints = [
        { k: "Enter", v: t("footer.confirm") },
        { k: "Esc", v: t("footer.cancel") },
      ];
    } else if (mode === "speaker-list") {
      hints = [
        { k: "↑↓", v: t("footer.select") },
        { k: "Enter", v: t("footer.rename") },
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
        const text = truncateDisplay(v.text, valMax);
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

  function paint(): void {
    if (closed) return;
    const W = cols();
    const H = rows();
    const showMsg = !isIdleStatus(status);
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
    if (layout.speakerList) renderSpeakerList(next, layout);
    renderTranscript(next, layout);
    if (layout.sidePanel) renderSidePanel(next, layout);
    if (layout.messageBar) renderMessageBar(next, layout);
    renderFooter(next, layout);

    if (mode === "settings" || mode === "settings-edit") {
      dimBackground(next);
      renderSettingsDialog(next, layout);
    }

    flushDiff(prevBuf, next, stdout);
    prevBuf = next;
    dirty = false;
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
      status = t("status.switchSource", { name: sourceLabel(next) });
      persist();
    }
  }

  function toggleAi(): void {
    args.ai.enabled = !args.ai.enabled;
    if (args.ai.enabled && !args.ai.correct && !args.ai.translateTo) {
      args.ai.correct = true;
    }
    status = args.ai.enabled
      ? aiActive(args.ai)
        ? t("status.aiOn")
        : t("status.aiEnabled")
      : t("status.aiDisabled");
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
    status = t("status.aiTranslate", {
      lang: translateLangLabel(next),
    });
    persist();
  }

  function toggleShare(): void {
    args.share.enabled = !args.share.enabled;
    status = args.share.enabled
      ? t("status.shareOn", { port: args.share.port })
      : t("status.shareOff");
    persist();
  }

  function nudgeSharePort(dir: 1 | -1): void {
    args.share.port = Math.min(
      65535,
      Math.max(1024, args.share.port + dir),
    );
    if (!args.share.enabled) args.share.enabled = true;
    status = t("status.sharePort", { port: args.share.port });
    persist();
  }

  function nudgeVadThreshold(dir: 1 | -1): void {
    args.vad.threshold = round2(
      Math.min(0.95, Math.max(0.05, args.vad.threshold + dir * 0.05)),
    );
    status = t("status.vadThreshold", { v: args.vad.threshold.toFixed(2) });
    persist();
  }

  function nudgeVadMinSpeech(dir: 1 | -1): void {
    args.vad.minSpeechDuration = round2(
      Math.min(5, Math.max(0.1, args.vad.minSpeechDuration + dir * 0.05)),
    );
    status = t("status.minSpeech", { v: args.vad.minSpeechDuration.toFixed(2) });
    persist();
  }

  function nudgeVadMinSilence(dir: 1 | -1): void {
    args.vad.minSilenceDuration = round2(
      Math.min(5, Math.max(0.1, args.vad.minSilenceDuration + dir * 0.05)),
    );
    status = t("status.silenceSplit", { v: args.vad.minSilenceDuration.toFixed(2) });
    persist();
  }

  function nudgeVadMaxSpeech(dir: 1 | -1): void {
    args.vad.maxSpeechDuration = Math.min(
      120,
      Math.max(2, args.vad.maxSpeechDuration + dir),
    );
    status = t("status.maxSpeech", { v: args.vad.maxSpeechDuration });
    persist();
  }

  const VAD_WINDOWS = [256, 512, 768, 1024];
  function cycleVadWindow(dir: 1 | -1): void {
    let i = VAD_WINDOWS.indexOf(args.vad.windowSize);
    if (i < 0) i = 1;
    i = (i + dir + VAD_WINDOWS.length) % VAD_WINDOWS.length;
    args.vad.windowSize = VAD_WINDOWS[i]!;
    status = t("status.vadWindow", { v: args.vad.windowSize });
    persist();
  }

  function toggleRecord(): void {
    if (args.record) {
      args.record = undefined;
      status = t("status.stopRecord");
    } else {
      const stamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-")
        .slice(0, 19);
      const dir = (args.recordDir || defaultRecordDir()).replace(/[/\\]+$/, "");
      args.record = `${dir}/meeting-${stamp}`;
      status = t("status.startRecord", { path: args.record });
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
    status = t("status.recordDir", { path: args.recordDir });
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
          status = t("status.baseUrlInvalid");
        } else {
          args.ai.baseUrl = n;
          status = t("status.baseUrlSaved");
          persist();
        }
        break;
      }
      case "aiKey":
        args.ai.apiKey = v;
        status = v ? t("status.apiKeySaved") : t("status.apiKeyCleared");
        persist();
        break;
      case "aiModel":
        if (v) {
          args.ai.model = v;
          status = t("status.modelSet", { model: v });
          persist();
        }
        break;
      case "recDir":
        args.recordDir = normalizeRecordDir(v || defaultRecordDir());
        status = t("status.recordDir", { path: args.recordDir });
        persist();
        break;
      case "shareHost":
        args.share.host = v || "0.0.0.0";
        status = t("status.shareHost", { host: args.share.host });
        persist();
        break;
      case "sharePort": {
        const p = parseInt(v, 10);
        if (Number.isFinite(p) && p >= 1024 && p <= 65535) {
          args.share.port = p;
          status = t("status.sharePort", { port: p });
          persist();
        } else {
          status = t("status.portInvalid");
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
      case "spkThr":
        nudgeThreshold(dir);
        break;
      case "aiEn":
        toggleAi();
        break;
      case "aiTranslate":
        cycleAiTranslate(dir);
        break;
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
    status = t("status.speakerAdded");
  }

  function beginRenameSpeaker(): void {
    const list = speakerList();
    const sp = list[speakerSel];
    if (!sp) return;
    renameDraft = sp.displayName;
    mode = "speaker-rename";
  }

  function commitRenameSpeaker(): void {
    const list = speakerList();
    const sp = list[speakerSel];
    if (sp && renameDraft.trim()) {
      sp.displayName = renameDraft.trim();
      if (sp.manual) sp.alias = sp.displayName;
      status = t("status.renamed", { name: sp.displayName });
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
      status = t("status.cannotDeleteAuto");
      return;
    }
    if (sp.segmentCount > 0) {
      status = t("status.cannotDeleteBound");
      return;
    }
    speakers.delete(sp.id);
    speakerSel = Math.max(0, Math.min(speakerSel, speakers.size - 1));
    status = t("status.deletedAlias");
  }

  function assignLastSegmentToSpeaker(index1based: number): void {
    const list = speakerList();
    const sp = list[index1based - 1];
    if (!sp) {
      status = t("status.noSpeakerN", { n: index1based });
      return;
    }
    const last = segments[segments.length - 1];
    if (!last) {
      status = t("status.noSegment");
      return;
    }
    if (last.speakerId) {
      const old = speakers.get(last.speakerId);
      if (old) old.segmentCount = Math.max(0, old.segmentCount - 1);
    }
    last.speakerId = sp.id;
    sp.segmentCount += 1;
    status = t("status.assigned", { name: sp.displayName });
  }

  function markActiveSpeaker(id: string | null): void {
    for (const s of speakers.values()) s.isActive = false;
    if (id) {
      const sp = speakers.get(id);
      if (sp) sp.isActive = true;
    }
  }

  // ── input ──────────────────────────────────────────────

  function onKey(key: string): void {
    if (closed) return;

    // settings text edit
    if (mode === "settings-edit") {
      if (key === "\x1b") {
        cancelEdit();
        dirty = true;
        return;
      }
      if (key === "\r" || key === "\n") {
        commitEdit();
        dirty = true;
        return;
      }
      if (key === "\x15") {
        // Ctrl+U
        editDraft = "";
        dirty = true;
        return;
      }
      if (key === "\x7f" || key === "\b" || key === "\x08") {
        editDraft = editDraft.slice(0, -1);
        dirty = true;
        return;
      }
      if (key.length === 1 && key >= " ") {
        if (editDraft.length < 200) editDraft += key;
        dirty = true;
      }
      return;
    }

    // speaker rename
    if (mode === "speaker-rename") {
      if (key === "\x1b") {
        cancelRenameSpeaker();
        dirty = true;
        return;
      }
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
      if (key.length === 1 && key >= " ") {
        if (renameDraft.length < 40) renameDraft += key;
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
      return;
    }
    if (key === "\x1b[A" && mode === "normal") {
      scroll += 1;
      dirty = true;
      return;
    }
    if (key === "\x1b[B" && mode === "normal") {
      scroll = Math.max(0, scroll - 1);
      dirty = true;
      return;
    }
    if (key === "\x1b[5~") {
      scroll += Math.max(3, Math.floor(rows() / 2));
      dirty = true;
      return;
    }
    if (key === "\x1b[6~") {
      scroll = Math.max(0, scroll - Math.max(3, Math.floor(rows() / 2)));
      dirty = true;
      return;
    }
    if (key >= "1" && key <= "9" && mode === "normal") {
      assignLastSegmentToSpeaker(parseInt(key, 10));
      dirty = true;
      return;
    }
  }

  // key reader
  let keyBuf = "";
  let keyTimer: NodeJS.Timeout | null = null;

  function feedKeys(chunk: Buffer | string): void {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, "utf8");
    for (let i = 0; i < buf.length; i++) {
      const b = buf[i]!;
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
        if (
          keyBuf.length >= 3 &&
          (keyBuf.startsWith("\x1b[") || keyBuf.startsWith("\x1bO"))
        ) {
          if (/[A-Za-z~]$/.test(keyBuf)) {
            if (keyTimer) clearTimeout(keyTimer);
            onKey(keyBuf);
            keyBuf = "";
          }
        } else if (keyBuf.length > 8) {
          if (keyTimer) clearTimeout(keyTimer);
          onKey(keyBuf);
          keyBuf = "";
        }
        continue;
      }

      if (b === 0x03 || b === 0x04) {
        onKey(ch);
        continue;
      }
      // Ctrl+U
      if (b === 0x15) {
        onKey(ch);
        continue;
      }
      if (b === 0x7f || b === 0x08) {
        onKey(ch);
        continue;
      }
      if (b >= 0x20 || b === 0x0d || b === 0x0a || b === 0x09) {
        if (b >= 0x80) {
          const rest = buf.slice(i).toString("utf8");
          for (const c of rest) onKey(c);
          break;
        }
        onKey(ch);
      }
    }
  }

  function restoreTerminal(): void {
    try {
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
      stdout.write(SHOW_CUR + ALT_OFF + RESET);
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
  stdout.write(ALT_ON + HIDE_CUR + CLEAR);

  process.on("exit", restoreTerminal);
  process.on("SIGINT", () => {
    // raw mode: also handled via \x03; keep as safety
  });
  process.on("uncaughtException", fatalShutdown);
  process.on("unhandledRejection", fatalShutdown);

  const raf = setInterval(() => {
    pulse += 1;
    // clear isActive after a while for older segments
    if (pulse % 4 === 0) {
      const last = segments[segments.length - 1];
      if (last && last.isActive && Date.now() - last.wall.getTime() > 4000) {
        last.isActive = false;
        markActiveSpeaker(null);
        dirty = true;
      }
    }
    if (dirty || pulse % 2 === 0) paint();
  }, 500);

  paint();

  const handle: TuiHandle = {
    emit(seg: Segment) {
      const main = displayText(seg);
      const sid = ensureSpeaker(seg.spk);
      if (sid) {
        const sp = speakers.get(sid)!;
        sp.segmentCount += 1;
      }
      // deactivate previous
      for (const s of segments) s.isActive = false;
      markActiveSpeaker(sid);

      const ts: TranscriptSegment = {
        id: `seg_${++segSeq}`,
        speakerId: sid,
        startedAtMs: seg.start,
        endedAtMs: seg.end,
        originalText: main,
        translatedText: seg.translation,
        isFinal: true,
        isActive: true,
        wall: seg.wall,
      };
      segments.push(ts);
      if (segments.length > 500) segments.splice(0, segments.length - 400);
      dirty = true;

      if (out) {
        const spkLabel =
          sid && speakers.get(sid)
            ? speakers.get(sid)!.displayName
            : seg.spk != null
              ? t("plain.speaker", { n: seg.spk })
              : t("common.dash");
        let line = `[${fmtClock(seg.wall)} ${fmtRange(seg.start, seg.end)}] ${spkLabel}  ${main}`;
        if (seg.translation) line += ` | ${seg.translation}`;
        if (seg.corrected && seg.corrected !== seg.text) {
          line += `  (ASR: ${seg.text})`;
        }
        out.write(line + "\n");
      }
      paint();
    },
    setStatus(msg: string) {
      status = msg;
      dirty = true;
      paint();
    },
    setDevice(name: string) {
      deviceName = name;
      dirty = true;
      paint();
    },
    close() {
      if (closed) return;
      closed = true;
      clearInterval(raf);
      if (keyTimer) clearTimeout(keyTimer);
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
    dirty = true;
    prevBuf = null;
    paint();
  }
  stdout.on("resize", onResize);

  return handle;
}
