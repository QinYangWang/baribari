/**
 * Session resume TUI — browse transcript, timeline seek/play, continue, share, AI.
 *
 * Keys (must match footer + onKey):
 *   ↑↓ / j k     prev/next segment (snaps playhead)
 *   ←→           seek ±2s
 *   Space / p    play/pause
 *   c            continue live capture (not demo)
 *   t / T        translate one / all missing
 *   m            summary (transcript) / merge (speaker panel)
 *   merge mode   all ○ · Space → mark · Esc ask save (y/n)
 *   Tab          focus speakers ↔ transcript (wide layout)
 *   s            settings (←→ change values; Esc/s close)
 *   e            edit session name
 *   h            LAN share toggle
 *   q            quit
 */

import type { ChildProcess } from "node:child_process";
import fs from "node:fs";
import {
  detectPlayerBackend,
  startAudioPlayback,
  stopAllAudioPlayback,
  type PlayHandle,
} from "./audio-play.js";
import type { SessionData, SessionSegment } from "./session.js";
import {
  canContinueSession,
  consolidateSessionAudio,
  listSessionAudioClips,
  loadSessionSummary,
  renameSession,
  resolveAudioAtTime,
  mergeSessionSpeakers,
  renameSessionSpeaker,
  rewriteSessionTranscript,
  saveSessionSummary,
  segmentDisplay,
  sessionAudioDuration,
} from "./session.js";
import type { AiConfig, Segment, TranslateLang } from "./types.js";
import {
  aiConfigured,
  enhanceSegment,
  summarizeMeeting,
  translateLangLabel,
  translateMissingSegments,
  TRANSLATE_OPTIONS,
} from "./ai.js";
import { loadSettings, mergeAi, saveSettings } from "./settings.js";
import {
  startShareServer,
  type ShareServer,
} from "./share-server.js";
import {
  getUiLang,
  setUiLang,
  t,
  UI_LANGS,
  uiLangLabel,
  type UiLang,
} from "./i18n/index.js";
import { createKeyFeeder } from "./key-input.js";

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
  err: "\x1b[38;2;248;113;113m",
};

const SPK = [
  "\x1b[38;2;94;234;212m",
  "\x1b[38;2;251;191;36m",
  "\x1b[38;2;244;114;182m",
  "\x1b[38;2;129;140;248m",
  "\x1b[38;2;74;222;128m",
];

export type ResumeAction =
  | { type: "quit" }
  | { type: "continue"; sessionId: string };

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

function dw(s: string): number {
  let w = 0;
  for (const ch of stripAnsi(s)) {
    const c = ch.codePointAt(0)!;
    if (
      c === 0x200b ||
      c === 0x200c ||
      c === 0x200d ||
      (c >= 0x0300 && c <= 0x036f)
    ) {
      continue;
    }
    if (
      c >= 0x1100 &&
      (c <= 0x115f ||
        (c >= 0x2e80 && c <= 0xa4cf) ||
        (c >= 0xac00 && c <= 0xd7a3) ||
        (c >= 0xf900 && c <= 0xfaff) ||
        (c >= 0xfe10 && c <= 0xfe19) ||
        (c >= 0xfe30 && c <= 0xfe6f) ||
        (c >= 0xff00 && c <= 0xff60) ||
        (c >= 0xffe0 && c <= 0xffe6) ||
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

function trunc(s: string, max: number): string {
  if (max <= 0) return "";
  if (dw(s) <= max) return s;
  if (max === 1) return "…";
  let out = "";
  let w = 0;
  for (const ch of s) {
    const cw = dw(ch);
    if (w + cw > max - 1) break;
    out += ch;
    w += cw;
  }
  return (out || "") + "…";
}

/** Prefer keeping both head and tail of long ids (model names). */
function truncMiddle(s: string, max: number): string {
  if (max <= 0) return "";
  if (dw(s) <= max) return s;
  if (max <= 3) return trunc(s, max);
  const ell = "…";
  const budget = max - dw(ell);
  const headBudget = Math.max(1, Math.ceil(budget * 0.55));
  const tailBudget = Math.max(1, budget - headBudget);
  let head = "";
  let hw = 0;
  for (const ch of s) {
    const cw = dw(ch);
    if (hw + cw > headBudget) break;
    head += ch;
    hw += cw;
  }
  let tail = "";
  let tw = 0;
  for (let i = s.length - 1; i >= 0; i--) {
    const ch = s[i]!;
    const cw = dw(ch);
    if (tw + cw > tailBudget) break;
    tail = ch + tail;
    tw += cw;
  }
  // avoid overlap if string short relative to budgets
  if (head.length + tail.length >= s.length) return s;
  return head + ell + tail;
}

/** Force exact display width n (ANSI-aware). Always safe for table columns. */
function pad(s: string, n: number): string {
  if (n <= 0) return "";
  const plain = stripAnsi(s);
  const d = dw(plain);
  if (d > n) return trunc(plain, n);
  // Prefer keeping color when content already fits; pad with spaces after codes
  if (d === n) {
    // If colored string's visual width matches, keep it; else fall back to plain
    return dw(s) === n ? s : plain;
  }
  // Append padding after the full (possibly colored) string
  return s + " ".repeat(n - d);
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

function wrap(text: string, width: number): string[] {
  if (width < 1) return [""];
  if (width < 4) return [trunc(text, width)];
  const out: string[] = [];
  let line = "";
  let lw = 0;
  for (const ch of text) {
    const cw = dw(ch);
    if (cw > width) continue;
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

function progressBarPlain(t: number, total: number, width: number): string {
  if (width < 1) return "";
  if (total <= 0) total = 1;
  const ratio = Math.min(1, Math.max(0, t / total));
  const fill = Math.min(width, Math.max(0, Math.round(ratio * width)));
  return "█".repeat(fill) + "░".repeat(width - fill);
}

/** `k label` — one space between key and caption. */
function kcap(key: string, label: string): string {
  return `${FG.key}${BOLD}${key}${RESET} ${FG.muted}${label}${RESET}`;
}

export async function runResumeTui(data: SessionData): Promise<ResumeAction> {
  const stdout = process.stdout;
  const stdin = process.stdin;

  if (!stdout.isTTY) {
    console.log(data.meta.name || data.meta.id);
    for (const s of data.segments) {
      const sp =
        data.speakers.find((x) => x.spk === s.spk)?.displayName ||
        (s.spk != null ? `Speaker ${s.spk}` : "—");
      console.log(
        `[${fmtDur(s.start)}–${fmtDur(s.end)}] ${sp}  ${segmentDisplay(s)}`,
      );
      if (s.translation) console.log(`  → ${s.translation}`);
    }
    const sum = loadSessionSummary(data.meta.path);
    if (sum) {
      console.log("\n--- summary ---\n" + sum);
    }
    return { type: "quit" };
  }

  // Merge multi-part wavs when possible for simpler playback
  if (data.meta.path && data.meta.path !== "(builtin)") {
    try {
      consolidateSessionAudio(data.meta.path);
    } catch {
      /* ignore */
    }
  }
  const audioDir =
    data.meta.path && data.meta.path !== "(builtin)" ? data.meta.path : "";
  const audioClips = audioDir ? listSessionAudioClips(audioDir) : [];
  const hasAudio = audioClips.length > 0;
  const audioTotal = audioDir ? sessionAudioDuration(audioDir) : 0;

  const total = Math.max(
    data.meta.durationSec || 0,
    audioTotal,
    ...data.segments.map((s) => s.end || 0),
    1,
  );
  const continuable = canContinueSession(data.meta.id);

  /** Mutable copy of segments (AI translate updates in place). */
  const segments = data.segments;
  let summaryText =
    data.meta.summary || loadSessionSummary(data.meta.path) || "";

  let aiCfg: AiConfig = mergeAi(loadSettings().ai);
  let focusSeg = Math.max(0, segments.length - 1);
  /** Free playhead on meeting timeline (seconds). */
  let cursor = segments.length
    ? segments[Math.max(0, segments.length - 1)]!.end || 0
    : 0;
  let playing = false;
  let player: ChildProcess | null = null;
  let playHandle: PlayHandle | null = null;
  let playTimer: ReturnType<typeof setInterval> | null = null;
  /** Monotonic id: ignore stale timer/onExit after stop or restart. */
  let playGen = 0;
  /** Avoid spamming fallback toast on every seek/chain. */
  let warnedFfmpegFallback = false;
  let closed = false;
  let lastW = 0;
  let lastH = 0;
  let statusHint = "";
  let renaming = false;
  let renameDraft = "";
  /** Multi-select merge (speaker panel only). */
  let mergeMode = false;
  let mergeSelected = new Set<number>(); // 1-based spk
  let mergeConfirm = false;
  /** Wide layout: left speaker column focus. */
  let focusPanel: "transcript" | "speakers" = "transcript";
  let speakerSel = 0;
  let speakerScroll = 0;
  /** Rename speaker (modal; exclusive input). */
  let renamingSpeaker = false;
  let speakerRenameDraft = "";
  let busy = false;
  let showSettings = false;
  // 0 uiLang · 1 translateTo · 2 model · 3 api status
  let settingsFocus = 0;
  const SETTINGS_COUNT = 4;
  let showSummary = false;
  let shareServer: ShareServer | null = null;
  /** Modal dialog (errors / important notices). confirm → center y/n for merge. */
  let alertDlg: {
    kind: "error" | "warn" | "info";
    title: string;
    body: string;
    /** Optional raw / technical detail shown in an inner box. */
    detail?: string;
    /** Merge save confirm: y saves / n·Esc discards. */
    confirm?: boolean;
  } | null = null;
  let alertTimer: ReturnType<typeof setTimeout> | null = null;

  const cols = () => stdout.columns || 80;
  const rows = () => stdout.rows || 24;

  function speakerName(s: SessionSegment): string {
    return (
      data.speakers.find((x) => x.spk === s.spk)?.displayName ||
      (s.spk != null ? `Speaker ${s.spk}` : "—")
    );
  }

  interface SpkRow {
    spk: number;
    name: string;
    count: number;
  }

  function listSpeakers(): SpkRow[] {
    const map = new Map<number, SpkRow>();
    for (const sp of data.speakers) {
      if (sp.spk == null) continue;
      map.set(sp.spk, {
        spk: sp.spk,
        name: sp.displayName || `Speaker ${sp.spk}`,
        count: 0,
      });
    }
    for (const s of segments) {
      if (s.spk == null) continue;
      const cur = map.get(s.spk);
      if (cur) cur.count += 1;
      else {
        map.set(s.spk, {
          spk: s.spk,
          name: speakerName(s),
          count: 1,
        });
      }
    }
    return [...map.values()].sort((a, b) => a.spk - b.spk);
  }

  function jumpToSpeaker(spk: number) {
    const idx = segments.findIndex((s) => s.spk === spk);
    if (idx < 0) return;
    focusSeg = idx;
    const seg = segments[idx]!;
    cursor = seg.start;
    showSummary = false;
  }

  interface SegRange {
    si: number;
    start: number;
    end: number;
  }

  function buildVisual(bodyW: number): {
    rows: string[];
    rowSeg: number[];
    ranges: SegRange[];
  } {
    const rows: string[] = [];
    const rowSeg: number[] = [];
    const ranges: SegRange[] = [];

    if (!segments.length) {
      rows.push("");
      rowSeg.push(-1);
      rows.push(
        pad(
          `${FG.muted}${DIM}${t("resume.emptySession")}${RESET}`,
          bodyW,
        ),
      );
      rowSeg.push(-1);
      return { rows, rowSeg, ranges };
    }

    segments.forEach((s, si) => {
      const start = rows.length;
      const col = s.spk != null ? SPK[(s.spk - 1) % SPK.length]! : FG.muted;
      const sp = speakerName(s);
      const time = `${fmtDur(s.start)}–${fmtDur(s.end)}`;
      rows.push(
        pad(
          `${col}○ ${sp}${RESET}  ${DIM}${FG.muted}${time}${RESET}`,
          bodyW,
        ),
      );
      rowSeg.push(si);

      const text = segmentDisplay(s);
      for (const wl of wrap(text, Math.max(4, bodyW - 2))) {
        rows.push(pad(`  ${FG.muted}${wl}${RESET}`, bodyW));
        rowSeg.push(si);
      }
      if (s.translation) {
        for (const wl of wrap(s.translation, Math.max(4, bodyW - 2))) {
          rows.push(pad(`  ${DIM}${FG.tr}${wl}${RESET}`, bodyW));
          rowSeg.push(si);
        }
      }
      rows.push("");
      rowSeg.push(-1);
      ranges.push({ si, start, end: rows.length });
    });
    return { rows, rowSeg, ranges };
  }

  /** Bottom border with embedded actions: ╰── Save(Y/Enter) ─ Cancel(N/Esc) ─╯ */
  function bottomBorderWithActions(inner: number, borderC: string): string {
    const save = t("footer.btnSave");
    const cancel = t("footer.btnCancel");
    // Visible width of right-side action segment (must match colored layout)
    //   " " + save + " ─ " + cancel + " ─"
    const chunkW = 1 + dw(save) + 3 + dw(cancel) + 2;
    const dashL = Math.max(1, inner - chunkW);
    // All border glyphs use borderC (accent purple); only labels use ok/muted
    const colored =
      `${borderC}${"─".repeat(dashL)} ${RESET}` +
      `${FG.ok}${BOLD}${save}${RESET}` +
      `${borderC} ─ ${RESET}` +
      `${FG.muted}${cancel}${RESET}` +
      `${borderC} ─${RESET}`;
    return `${borderC}╰${RESET}${colored}${borderC}╯${RESET}`;
  }

  function renderRenameOverlay(W: number, _H: number): string[] {
    const boxW = Math.min(56, Math.max(40, W - 6));
    const inner = boxW - 2;
    const contentW = Math.max(8, inner - 2);
    const rows: string[] = [];
    const borderC = FG.accent;
    const line = (content: string) =>
      `${borderC}│${RESET}${pad(content, inner)}${borderC}│${RESET}`;
    const isSpk = renamingSpeaker;
    const draft = isSpk ? speakerRenameDraft : renameDraft;
    const title = isSpk ? t("footer.rename") : t("resume.renameTitle");
    const field = trunc(draft, Math.max(4, contentW - 1)) + "▌";
    rows.push(`${borderC}╭${"─".repeat(inner)}╮${RESET}`);
    rows.push(line(` ${FG.accent}${BOLD}${title}${RESET}`));
    rows.push(line(""));
    rows.push(line(` ${FG.title}${field}${RESET}`));
    rows.push(line(""));
    // Save/Cancel sit on the bottom border (same as Merge confirm)
    rows.push(bottomBorderWithActions(inner, borderC));
    return rows;
  }

  function renderSettingsOverlay(W: number, _H: number): string[] {
    // Wide enough for long model ids like google/gemma-4-26b-a4b-it
    const boxW = Math.min(Math.max(56, Math.floor(W * 0.72)), W - 4);
    const inner = boxW - 2;
    const ui = getUiLang();
    const items: Array<{ label: string; value: string; middle?: boolean }> = [
      {
        label: t("settings.items.uiLang.label"),
        value: `${uiLangLabel(ui)} (${ui})`,
      },
      {
        label: t("resume.settingsAiTarget"),
        value: aiCfg.translateTo
          ? `${aiCfg.translateTo} (${translateLangLabel(aiCfg.translateTo)})`
          : t("resume.off"),
      },
      {
        label: t("resume.settingsAiModel"),
        value: aiCfg.model || "—",
        middle: true,
      },
      {
        label: t("resume.settingsApi"),
        value: aiConfigured(aiCfg)
          ? `${FG.ok}${t("resume.settingsApiOk")}${RESET}`
          : `${FG.err}${t("resume.settingsApiMissing")}${RESET}`,
      },
    ];
    // Fixed label column so values start on one left-aligned edge
    const labelCol = Math.min(
      16,
      Math.max(8, ...items.map((it) => dw(it.label))),
    );
    // "▸ " + label + "  " + value
    const valueMax = Math.max(8, inner - 1 - 1 - labelCol - 2);

    const rows: string[] = [];
    rows.push(`${FG.border}╭${"─".repeat(inner)}╮${RESET}`);
    rows.push(
      `${FG.border}│${RESET}${BOLD}${pad(` ${t("resume.settingsTitle")}`, inner)}${RESET}${FG.border}│${RESET}`,
    );
    rows.push(`${FG.border}│${RESET}${pad("", inner)}${FG.border}│${RESET}`);
    items.forEach((it, i) => {
      const focus = settingsFocus === i;
      const mark = focus ? `${FG.accent}▸${RESET}` : " ";
      const labPlain = pad(it.label, labelCol);
      const lab = focus
        ? `${BOLD}${labPlain}${RESET}`
        : `${FG.muted}${labPlain}${RESET}`;
      const plain = stripAnsi(it.value);
      let val: string;
      if (dw(plain) <= valueMax) {
        val = it.value;
      } else if (it.middle) {
        val = truncMiddle(plain, valueMax);
      } else {
        val = trunc(plain, valueMax);
      }
      const content = `${mark} ${lab}  ${val}`;
      rows.push(
        `${FG.border}│${RESET}${pad(content, inner)}${FG.border}│${RESET}`,
      );
    });
    rows.push(`${FG.border}│${RESET}${pad("", inner)}${FG.border}│${RESET}`);
    rows.push(
      `${FG.border}│${RESET}${pad(
        `${DIM}${FG.muted}${t("resume.settingsKeys")}${RESET}`,
        inner,
      )}${FG.border}│${RESET}`,
    );
    rows.push(`${FG.border}╰${"─".repeat(inner)}╯${RESET}`);
    return rows;
  }

  /** Clean up raw API / exception text for the detail box. */
  function prettyDetail(raw: string): string {
    let s = raw.replace(/\r\n/g, "\n").trim();
    // Prefer JSON body after "AI HTTP 429: {...}"
    const httpM = s.match(/^AI HTTP (\d+):\s*([\s\S]*)$/i);
    if (httpM) {
      const code = httpM[1]!;
      let rest = (httpM[2] || "").trim();
      try {
        const j = JSON.parse(rest) as unknown;
        rest = JSON.stringify(j, null, 2);
      } catch {
        // try extract message field from messy JSON
        const msgM = rest.match(/"message"\s*:\s*"((?:\\.|[^"\\])*)"/);
        if (msgM) {
          rest = msgM[1]!.replace(/\\n/g, "\n").replace(/\\"/g, '"');
        }
      }
      s = `HTTP ${code}\n${rest}`;
    } else {
      try {
        const j = JSON.parse(s) as unknown;
        s = JSON.stringify(j, null, 2);
      } catch {
        /* keep as-is */
      }
    }
    // collapse huge single-line blobs a bit for wrap
    if (!s.includes("\n") && s.length > 200) {
      s = s.replace(/([,;}])/g, "$1\n");
    }
    if (s.length > 600) s = s.slice(0, 600) + "…";
    return s;
  }

  /** Human-friendly title/body + optional raw detail (429 etc.). */
  function formatError(err: unknown): {
    title: string;
    body: string;
    detail?: string;
  } {
    const raw = err instanceof Error ? err.message : String(err);
    const lower = raw.toLowerCase();
    const detail = prettyDetail(raw);

    if (
      /\b429\b/.test(raw) ||
      lower.includes("rate limit") ||
      lower.includes("too many requests") ||
      lower.includes("quota")
    ) {
      return {
        title: t("resume.alert.rateTitle"),
        body: t("resume.alert.rateBody"),
        detail,
      };
    }
    if (
      /\b401\b/.test(raw) ||
      lower.includes("unauthorized") ||
      lower.includes("invalid api")
    ) {
      return {
        title: t("resume.alert.authTitle"),
        body: t("resume.alert.authBody"),
        detail,
      };
    }
    if (/\b403\b/.test(raw) || lower.includes("forbidden")) {
      return {
        title: t("resume.alert.forbidTitle"),
        body: t("resume.alert.forbidBody"),
        detail,
      };
    }
    if (
      /\b5\d\d\b/.test(raw) ||
      lower.includes("server error") ||
      lower.includes("internal")
    ) {
      return {
        title: t("resume.alert.serverTitle"),
        body: t("resume.alert.serverBody"),
        detail,
      };
    }
    if (
      lower.includes("fetch failed") ||
      lower.includes("econnrefused") ||
      lower.includes("enotfound") ||
      lower.includes("network") ||
      lower.includes("timeout")
    ) {
      return {
        title: t("resume.alert.netTitle"),
        body: t("resume.alert.netBody"),
        detail,
      };
    }
    // Match both localized and English AI helper messages
    if (
      raw.includes(t("resume.ai.notConfigured")) ||
      raw.includes(t("resume.ai.noTranslateLang")) ||
      raw.includes("AI 未配置") ||
      raw.includes("not configured") ||
      raw.includes("翻译目标")
    ) {
      return { title: t("resume.alert.cfgTitle"), body: raw };
    }
    if (
      raw.includes(t("resume.ai.noSummaryText")) ||
      raw.includes("没有可总结") ||
      raw.includes("No transcript")
    ) {
      return { title: t("resume.alert.hint"), body: raw };
    }
    return {
      title: t("resume.alert.errTitle"),
      body: t("resume.alert.errBody"),
      detail,
    };
  }

  function renderAlertOverlay(W: number, _H: number): string[] {
    if (!alertDlg) return [];
    const confirm = Boolean(alertDlg.confirm);
    // Confirm uses same chrome as session-name dialog; notices are slightly smaller
    const boxW = confirm
      ? Math.min(56, Math.max(40, W - 6))
      : Math.min(48, Math.max(36, W - 8));
    const inner = boxW - 2;
    const contentW = Math.max(8, inner - 2);
    const kind = alertDlg.kind;
    const accent =
      kind === "error" ? FG.err : kind === "warn" ? FG.warn : FG.cyan;
    const icon = kind === "error" ? "✕" : kind === "warn" ? "!" : "i";
    // Confirm title matches rename modal (accent, no icon); notice keeps icon
    const titleLine = confirm
      ? `${FG.accent}${BOLD}${alertDlg.title}${RESET}`
      : `${accent}${BOLD}${icon}  ${alertDlg.title}${RESET}`;
    const bodyLines = alertDlg.body
      .split(/\n/)
      .flatMap((ln) => wrap(ln, contentW));
    const maxBody = confirm ? 6 : 8;
    const shown = bodyLines.slice(0, maxBody);
    if (bodyLines.length > maxBody) {
      shown.push(trunc(bodyLines[maxBody] || "…", contentW));
    }

    const rows: string[] = [];
    const borderC = confirm
      ? FG.accent
      : kind === "error"
        ? FG.err
        : FG.border;
    const line = (content: string) =>
      `${borderC}│${RESET}${pad(content, inner)}${borderC}│${RESET}`;

    rows.push(`${borderC}╭${"─".repeat(inner)}╮${RESET}`);
    rows.push(line(` ${titleLine}`));
    rows.push(line(""));
    for (const wl of shown) {
      rows.push(line(` ${FG.title}${wl}${RESET}`));
    }

    // Nested detail box for raw error summary (non-confirm only)
    const detail = (alertDlg.detail || "").trim();
    if (detail && !confirm) {
      rows.push(line(""));
      const nestInner = Math.max(10, inner - 4);
      const nestContentW = Math.max(6, nestInner - 2);
      const dLines = detail
        .split(/\n/)
        .flatMap((ln) => wrap(ln || " ", nestContentW));
      const maxD = 6;
      const dShown = dLines.slice(0, maxD);
      if (dLines.length > maxD) {
        dShown[maxD - 1] = trunc(
          (dShown[maxD - 1] || "") + "…",
          nestContentW,
        );
      }
      const nestTop = `${FG.muted}┌${"─".repeat(nestInner)}┐${RESET}`;
      const nestBot = `${FG.muted}└${"─".repeat(nestInner)}┘${RESET}`;
      const nestHdr = pad(
        ` ${DIM}${FG.muted}${t("resume.rawError")}${RESET}`,
        nestInner,
      );
      rows.push(line(` ${nestTop}`));
      rows.push(
        line(` ${FG.muted}│${RESET}${nestHdr}${FG.muted}│${RESET}`),
      );
      for (const dl of dShown) {
        const cell = pad(` ${DIM}${FG.muted}${dl}${RESET}`, nestInner);
        rows.push(
          line(` ${FG.muted}│${RESET}${cell}${FG.muted}│${RESET}`),
        );
      }
      rows.push(line(` ${nestBot}`));
    }

    if (confirm) {
      rows.push(line(""));
      // Actions embedded in bottom border (same as session rename)
      rows.push(bottomBorderWithActions(inner, borderC));
    } else {
      rows.push(line(""));
      rows.push(
        line(` ${DIM}${FG.muted}${t("resume.autoDismissHint")}${RESET}`),
      );
      rows.push(`${borderC}╰${"─".repeat(inner)}╯${RESET}`);
    }
    return rows;
  }

  function clearAlertTimer() {
    if (alertTimer) {
      clearTimeout(alertTimer);
      alertTimer = null;
    }
  }

  function showAlert(
    kind: "error" | "warn" | "info",
    title: string,
    body: string,
    detail?: string,
    opts?: { confirm?: boolean },
  ) {
    clearAlertTimer();
    alertDlg = { kind, title, body, detail, confirm: opts?.confirm };
    if (!opts?.confirm) statusHint = "";
    paint();
    // Notices auto-close in 3s; confirm waits for y/n
    if (!opts?.confirm) {
      const snap = alertDlg;
      alertTimer = setTimeout(() => {
        if (alertDlg === snap) dismissAlert();
      }, 3000);
      alertTimer.unref?.();
    }
  }

  function showError(err: unknown) {
    const { title, body, detail } = formatError(err);
    showAlert("error", title, body, detail);
  }

  function dismissAlert() {
    if (!alertDlg) return;
    clearAlertTimer();
    alertDlg = null;
    paint();
  }

  function paint() {
    if (closed) return;
    const W = cols();
    const H = rows();
    if (W < 48 || H < 12) {
      stdout.write(CLEAR + HIDE + t("resume.termTooSmall"));
      return;
    }
    if (W !== lastW || H !== lastH) {
      lastW = W;
      lastH = H;
      stdout.write(CLEAR + HIDE);
    }

    const inner = W - 2;
    const headerLines = 5;
    const footerLines = 3;
    const bodyH = Math.max(3, H - headerLines - footerLines);

    // Left speaker column when wide enough (CJK-friendly).
    // Summary view uses full width — dual-col + long markdown wraps and corrupts the frame.
    const showSpkCol = W >= 72 && !showSummary;
    const spkInnerW = showSpkCol
      ? Math.min(28, Math.max(20, Math.floor(W * 0.18)))
      : 0;
    // Content inset from borders: 1 col padding each side of each pane
    const padX = 1;
    // with spk: │ spkInnerW │ padX + bodyW + padX │  → spkInnerW + bodyW + 2*padX + 1 = inner
    const bodyW = showSpkCol
      ? Math.max(10, inner - spkInnerW - 1 - 2 * padX)
      : Math.max(10, inner - 2 * padX);
    const spkContentW = showSpkCol ? Math.max(6, spkInnerW - 2 * padX) : 0;

    if (segments.length) {
      focusSeg = Math.min(segments.length - 1, Math.max(0, focusSeg));
    } else {
      focusSeg = 0;
    }

    const spkList = listSpeakers();
    if (spkList.length) {
      speakerSel = Math.min(spkList.length - 1, Math.max(0, speakerSel));
    } else {
      speakerSel = 0;
      if (focusPanel === "speakers") focusPanel = "transcript";
    }

    const { rows: visual, rowSeg, ranges } = buildVisual(bodyW);
    const viewStart = viewStartForFocus(ranges, bodyH, visual.length);

    // Keep focus in sync with playhead when scrubbing/playing (transcript focus)
    const at = segments.findIndex(
      (s) => s.start <= cursor && cursor < (s.end || s.start + 0.01),
    );
    if (at >= 0 && !showSummary && focusPanel === "transcript") {
      focusSeg = at;
      const spk = segments[at]?.spk;
      if (spk != null) {
        const si = spkList.findIndex((x) => x.spk === spk);
        if (si >= 0) speakerSel = si;
      }
    }

    const progressT = cursor;
    const ts = `${fmtDur(progressT)} / ${fmtDur(total)}`;
    const nSeg = segments.length;
    const playTag = playing ? "▶" : hasAudio ? "❚❚" : "·";
    const posLabel =
      nSeg <= 1 ? playTag : `${playTag} ${focusSeg + 1}/${nSeg}`;
    const sideBudget = 1 + dw(posLabel) + 2 + 2 + dw(ts);
    const barW = Math.max(8, inner - sideBudget);
    const barPlain = progressBarPlain(progressT, total, barW);
    const fillN = (barPlain.match(/█/g) || []).length;
    const barColored =
      `${FG.accent}${"█".repeat(fillN)}${RESET}` +
      `${FG.border}${"░".repeat(barW - fillN)}${RESET}`;
    const posColored =
      focusSeg <= 0
        ? `${FG.muted}${posLabel}${RESET}`
        : focusSeg >= nSeg - 1
          ? `${FG.ok}${posLabel}${RESET}`
          : `${FG.accent}${posLabel}${RESET}`;
    const plainProg = ` ${posLabel}  ${barPlain}  ${ts}`;
    const coloredProg = ` ${posColored}  ${barColored}  ${FG.muted}${ts}${RESET}`;
    const progLine =
      dw(plainProg) <= inner
        ? coloredProg + " ".repeat(Math.max(0, inner - dw(plainProg)))
        : pad(plainProg, inner);

    const hotSeg = segments.length ? focusSeg : -1;
    const slice: string[] = [];
    for (let i = 0; i < bodyH; i++) {
      const idx = viewStart + i;
      let row = visual[idx];
      if (row == null) {
        slice.push(pad("", bodyW));
        continue;
      }
      if (hotSeg >= 0 && rowSeg[idx] === hotSeg) {
        const s = segments[hotSeg]!;
        const sp = speakerName(s);
        const time = `${fmtDur(s.start)}–${fmtDur(s.end)}`;
        const plain = stripAnsi(row);
        if (
          plain.trimStart().startsWith("○") ||
          plain.trimStart().startsWith("●")
        ) {
          row = pad(
            `${FG.accent}${BOLD}● ${sp}${RESET}  ${DIM}${FG.muted}${time}${RESET}`,
            bodyW,
          );
        } else if (plain.startsWith("  ")) {
          const text = plain.trim();
          const isTr = Boolean(
            s.translation && text && s.translation.includes(text.slice(0, 6)),
          );
          row = pad(
            isTr
              ? `  ${DIM}${FG.tr}${text}${RESET}`
              : `  ${FG.title}${text}${RESET}`,
            bodyW,
          );
        }
      }
      slice.push(pad(row, bodyW));
    }

    let bodyLines = slice;
    if (showSummary && summaryText) {
      // Full-width summary (speaker col hidden). Wrap markdown safely; pad every row.
      const sumW = Math.max(8, bodyW - 2);
      const raw = summaryText.replace(/\r/g, "").replace(/\t/g, "  ");
      const sumRows: string[] = [];
      sumRows.push(
        pad(`${FG.accent}${BOLD}${t("resume.summaryTitle")}${RESET}`, bodyW),
      );
      sumRows.push(pad("", bodyW));
      for (const para of raw.split("\n")) {
        const line = para.length ? para : " ";
        for (const wl of wrap(line, sumW)) {
          sumRows.push(pad(`${FG.cyan}${wl}${RESET}`, bodyW));
        }
      }
      // scrollable summary: keep last page if longer than body
      const page = sumRows.length > bodyH ? sumRows.slice(0, bodyH) : sumRows;
      bodyLines = page.map((r) => pad(r, bodyW));
      while (bodyLines.length < bodyH) bodyLines.push(pad("", bodyW));
    }

    // Build left speaker column (inset padX from borders / divider)
    const spkLines: string[] = [];
    const cell = (content: string, width: number) =>
      " ".repeat(padX) + pad(content, width) + " ".repeat(padX);
    if (showSpkCol) {
      const spkFocus = focusPanel === "speakers";
      const cw = spkContentW;
      const hintParts = [
        t("tui.speakersHint1"),
        ...t("tui.speakersHint2").split(/\r?\n/).filter(Boolean),
      ];
      const title = `${spkFocus ? FG.accent + BOLD : FG.muted}${t("tui.speakersTitle")}${RESET}`;
      spkLines.push(cell(title, cw));
      for (const h of hintParts) {
        for (const wl of wrap(h, cw)) {
          spkLines.push(cell(`${DIM}${FG.muted}${wl}${RESET}`, cw));
        }
      }
      spkLines.push(cell("", cw));
      const listTop = spkLines.length;
      const visible = Math.max(1, bodyH - listTop);
      if (speakerSel < speakerScroll) speakerScroll = speakerSel;
      if (speakerSel >= speakerScroll + visible) {
        speakerScroll = speakerSel - visible + 1;
      }
      speakerScroll = Math.max(
        0,
        Math.min(speakerScroll, Math.max(0, spkList.length - visible)),
      );
      const sliceSp = spkList.slice(speakerScroll, speakerScroll + visible);
      if (!spkList.length) {
        spkLines.push(
          cell(`${DIM}${FG.muted}${t("tui.noSpeakers")}${RESET}`, cw),
        );
      } else {
        for (let i = 0; i < sliceSp.length; i++) {
          const sp = sliceSp[i]!;
          const idx = speakerScroll + i;
          const sel = spkFocus && idx === speakerSel;
          const hot =
            !mergeMode &&
            segments[focusSeg]?.spk === sp.spk &&
            focusPanel === "transcript";
          const marked = mergeMode && mergeSelected.has(sp.spk);
          const col = SPK[(sp.spk - 1) % SPK.length] || FG.muted;
          // Merge: all white ○; Space toggles →
          const mark = mergeMode
            ? marked
              ? "→"
              : "○"
            : sel || hot
              ? "●"
              : "○";
          const name = trunc(sp.name, Math.max(4, cw - 6));
          const cnt = !mergeMode && sp.count > 0 ? ` ${sp.count}` : "";
          const line = `${mark} ${name}${cnt}`;
          const colored = mergeMode
            ? marked
              ? `${FG.warn}${BOLD}${line}${RESET}`
              : sel
                ? `${FG.accent}${BOLD}${line}${RESET}`
                : `${FG.title}${line}${RESET}`
            : sel
              ? `${FG.accent}${BOLD}${line}${RESET}`
              : `${col}${line}${RESET}`;
          spkLines.push(cell(colored, cw));
        }
      }
      while (spkLines.length < bodyH) spkLines.push(cell("", cw));
    }

    const lines: string[] = [];
    lines.push(`${FG.border}╭${"─".repeat(inner)}╮${RESET}`);
    // Title = session alias only (id is internal, not shown in chrome)
    const titleCore = `◆ ${data.meta.name || t("resume.renameTitle")}`;
    const headInner = Math.max(8, inner - 2 * padX);
    const title = trunc(titleCore, headInner);
    lines.push(
      `${FG.border}│${RESET}${" ".repeat(padX)}${BOLD}${FG.accent}${pad(title, headInner)}${RESET}${" ".repeat(padX)}${FG.border}│${RESET}`,
    );
    lines.push(`${FG.border}├${"─".repeat(inner)}┤${RESET}`);
    // rebuild progress for inset width
    const progInner = headInner;
    const sideBudget2 = 1 + dw(posLabel) + 2 + 2 + dw(ts);
    const barW2 = Math.max(8, progInner - sideBudget2);
    const barPlain2 = progressBarPlain(progressT, total, barW2);
    const fillN2 = (barPlain2.match(/█/g) || []).length;
    const barColored2 =
      `${FG.accent}${"█".repeat(fillN2)}${RESET}` +
      `${FG.border}${"░".repeat(barW2 - fillN2)}${RESET}`;
    const plainProg2 = ` ${posLabel}  ${barPlain2}  ${ts}`;
    const coloredProg2 = ` ${posColored}  ${barColored2}  ${FG.muted}${ts}${RESET}`;
    const progPadded =
      dw(plainProg2) <= progInner
        ? coloredProg2 +
          " ".repeat(Math.max(0, progInner - dw(plainProg2)))
        : pad(plainProg2, progInner);
    lines.push(
      `${FG.border}│${RESET}${" ".repeat(padX)}${progPadded}${" ".repeat(padX)}${FG.border}│${RESET}`,
    );
    lines.push(`${FG.border}├${"─".repeat(inner)}┤${RESET}`);

    for (let i = 0; i < bodyH; i++) {
      // Re-pad every cell so nothing can exceed its column (prevents terminal wrap bleed)
      const tr = pad(bodyLines[i] ?? "", bodyW);
      if (showSpkCol) {
        const left = pad(spkLines[i] ?? "", spkInnerW);
        const mid = focusPanel === "speakers" ? FG.accent : FG.border;
        // │ spkInnerW │ padX + bodyW + padX │
        lines.push(
          `${FG.border}│${RESET}${left}${mid}│${RESET}${" ".repeat(padX)}${tr}${" ".repeat(padX)}${FG.border}│${RESET}`,
        );
      } else {
        lines.push(
          `${FG.border}│${RESET}${" ".repeat(padX)}${tr}${" ".repeat(padX)}${FG.border}│${RESET}`,
        );
      }
    }

    lines.push(`${FG.border}├${"─".repeat(inner)}┤${RESET}`);
    // Single footer row — must match onKey() handlers exactly
    const contKey = continuable
      ? kcap("c", t("resume.footer.continue"))
      : `${DIM}${FG.muted}c ${t("resume.footer.na")}${RESET}`;
    const shareKey = shareServer
      ? kcap("h", t("resume.footer.shareStop"))
      : kcap("h", t("resume.footer.share"));
    const footer = renaming || renamingSpeaker
      ? `${FG.accent}${BOLD}${renamingSpeaker ? t("footer.rename") : t("resume.renameTitle")}${RESET}  ${DIM}${FG.muted}${t("resume.renameHint")}${RESET}`
      : mergeMode
        ? [
            kcap("↑↓", t("footer.select")),
            kcap("Space", t("footer.mergeSpace")),
            kcap("Esc", t("footer.close")),
            `${FG.warn}${t("resume.status.mergeHint")}${RESET}`,
          ].join("  ")
        : [
            kcap("↑↓", t("resume.footer.nav")),
            kcap("Tab", t("footer.switch")),
            kcap("←→", t("resume.footer.seek")),
            kcap("Space", t("resume.footer.play")),
            contKey,
            kcap("t", t("resume.footer.translate")),
            kcap("T", t("resume.footer.translateAll")),
            kcap("m", t("resume.footer.summary")),
            kcap("s", t("resume.footer.settings")),
            kcap("e", t("resume.footer.editName")),
            shareKey,
            kcap("q", t("resume.footer.quit")),
          ].join("  ") +
          (statusHint ? `  ${FG.warn}${statusHint}${RESET}` : "") +
          (busy ? `  ${FG.accent}…${RESET}` : "") +
          (hasAudio && audioClips.length > 1
            ? `  ${FG.muted}${audioClips.length} clips${RESET}`
            : !hasAudio
              ? `  ${FG.muted}no audio${RESET}`
              : "");
    const footerW = Math.max(10, inner - 2 * padX);
    lines.push(
      `${FG.border}│${RESET}${" ".repeat(padX)}${pad(footer, footerW)}${" ".repeat(padX)}${FG.border}│${RESET}`,
    );
    lines.push(`${FG.border}╰${"─".repeat(inner)}╯${RESET}`);

    let out = HOME + HIDE;
    for (let i = 0; i < H; i++) {
      out += lines[i] ?? " ".repeat(W);
      if (i < H - 1) out += "\n";
    }

    // Modal layers (rename / settings / alert) — rename takes exclusive input
    if ((renaming || renamingSpeaker) && !alertDlg) {
      const overlay = renderRenameOverlay(W, H);
      const boxH = overlay.length;
      const boxW = Math.min(56, Math.max(40, W - 6));
      const top = Math.max(1, Math.floor((H - boxH) / 2));
      const left = Math.max(2, Math.floor((W - boxW) / 2));
      for (let i = 0; i < overlay.length; i++) {
        out += `${ESC}[${top + i + 1};${left + 1}H${overlay[i]}`;
      }
    } else if (showSettings && !alertDlg) {
      const overlay = renderSettingsOverlay(W, H);
      const boxH = overlay.length;
      const boxW = Math.min(Math.max(56, Math.floor(W * 0.72)), W - 4);
      const top = Math.max(1, Math.floor((H - boxH) / 2));
      const left = Math.max(2, Math.floor((W - boxW) / 2));
      for (let i = 0; i < overlay.length; i++) {
        out += `${ESC}[${top + i + 1};${left + 1}H${overlay[i]}`;
      }
    }

    if (alertDlg) {
      const overlay = renderAlertOverlay(W, H);
      const boxH = overlay.length;
      const boxW = Math.min(58, Math.max(40, W - 6));
      const top = Math.max(1, Math.floor((H - boxH) / 2));
      const left = Math.max(2, Math.floor((W - boxW) / 2));
      for (let i = 0; i < overlay.length; i++) {
        out += `${ESC}[${top + i + 1};${left + 1}H${overlay[i]}`;
      }
    }

    stdout.write(out);
  }

  function viewStartForFocus(
    ranges: SegRange[],
    bodyH: number,
    totalRows: number,
  ): number {
    const maxStart = Math.max(0, totalRows - bodyH);
    if (!ranges.length) return 0;
    const fi = Math.min(ranges.length - 1, Math.max(0, focusSeg));
    const r = ranges[fi]!;
    let vs = r.end - bodyH;
    if (r.end - r.start > bodyH) vs = r.start;
    return Math.min(maxStart, Math.max(0, vs));
  }

  /** One-shot user notice as modal popup (replaces footer flash). */
  function flash(msg: string, _ms = 2000) {
    const lower = msg.toLowerCase();
    const kind: "error" | "warn" | "info" =
      /fail|error|错误|失败|无法|不能|invalid|missing/i.test(lower)
        ? "error"
        : /warn|取消|放弃|demo|请|need|cannot|无法/i.test(lower)
          ? "warn"
          : "info";
    const title =
      kind === "error"
        ? t("resume.alert.errTitle")
        : kind === "warn"
          ? t("resume.alert.hint")
          : t("resume.alert.hint");
    showAlert(kind, title, msg);
  }

  /** Translate only the focused (highlighted) segment. */
  async function runTranslateCurrent() {
    if (busy) return;
    if (!aiConfigured(aiCfg)) {
      showAlert(
        "warn",
        t("resume.alert.aiMissingTitle"),
        t("resume.alert.aiMissingBody"),
      );
      return;
    }
    if (!aiCfg.translateTo) {
      showAlert(
        "warn",
        t("resume.alert.noLangTitle"),
        t("resume.alert.noLangBody"),
      );
      return;
    }
    const s = segments[focusSeg];
    if (!s) {
      showAlert("info", t("resume.alert.hint"), t("resume.alert.noFocus"));
      return;
    }
    if ((s.translation || "").trim()) {
      showAlert(
        "info",
        t("resume.alert.alreadyTitle"),
        t("resume.alert.alreadyBody"),
      );
      return;
    }
    const raw = segmentDisplay(s);
    if (!raw) {
      showAlert("info", t("resume.alert.hint"), t("resume.alert.noText"));
      return;
    }
    busy = true;
    // progress stays non-blocking (modal would trap keys during AI work)
    statusHint = t("resume.status.translatingOne");
    paint();
    try {
      const workCfg: AiConfig = {
        ...aiCfg,
        enabled: true,
        correct: false,
        translateTo: aiCfg.translateTo,
      };
      const seg: Segment = {
        start: s.start,
        end: s.end,
        wall: new Date(s.wallIso),
        spk: s.spk,
        text: raw,
      };
      await enhanceSegment(seg, workCfg);
      if (seg.translation?.trim()) {
        s.translation = seg.translation.trim();
        if (!data.meta.builtin && data.meta.path) {
          rewriteSessionTranscript(data.meta.path, segments);
        }
        flash(t("resume.status.translatedOne"));
      } else {
        showAlert(
          "warn",
          t("resume.alert.emptyTransTitle"),
          t("resume.alert.emptyTransBody"),
        );
      }
    } catch (e) {
      showError(e);
    } finally {
      busy = false;
      paint();
    }
  }

  /** Translate all segments still missing translation. */
  async function runTranslateAll() {
    if (busy) return;
    if (!aiConfigured(aiCfg)) {
      showAlert(
        "warn",
        t("resume.alert.aiMissingTitle"),
        t("resume.alert.aiMissingBody"),
      );
      return;
    }
    if (!aiCfg.translateTo) {
      showAlert(
        "warn",
        t("resume.alert.noLangTitle"),
        t("resume.alert.noLangBody"),
      );
      return;
    }
    busy = true;
    statusHint = t("resume.status.translatingAll");
    paint();
    try {
      const n = await translateMissingSegments(
        segments,
        aiCfg,
        (done, totalN) => {
          statusHint = t("resume.status.translateProgress", {
            done,
            total: totalN,
          });
          paint();
        },
      );
      if (!data.meta.builtin && data.meta.path) {
        rewriteSessionTranscript(data.meta.path, segments);
      }
      if (n > 0) flash(t("resume.status.translatedAll", { n }));
      else
        showAlert(
          "info",
          t("resume.alert.noNeedTitle"),
          t("resume.alert.noNeedBody"),
        );
    } catch (e) {
      showError(e);
    } finally {
      busy = false;
      paint();
    }
  }

  async function toggleShare() {
    if (busy) return;
    if (shareServer) {
      try {
        shareServer.close();
      } catch {
        /* ignore */
      }
      shareServer = null;
      flash(t("resume.status.shareStopped"));
      return;
    }
    const port = loadSettings().share?.port || 8787;
    busy = true;
    statusHint = t("resume.status.shareStarting");
    paint();
    try {
      shareServer = await startShareServer(port, {
        title: data.meta.name || data.meta.id,
      });
      for (const s of segments) {
        shareServer.broadcast({
          id: s.id,
          start: s.start,
          end: s.end,
          wall: new Date(s.wallIso),
          wallIso: s.wallIso,
          spk: s.spk,
          text: s.text,
          corrected: s.corrected,
          translation: s.translation,
        });
      }
      const url = shareServer.urls[0] || `http://127.0.0.1:${port}/`;
      const urlsText = shareServer.urls.length
        ? shareServer.urls.join("\n")
        : url;
      showAlert(
        "info",
        t("resume.alert.shareOnTitle"),
        t("resume.alert.shareOnBody", { urls: urlsText }),
      );
    } catch (e) {
      shareServer = null;
      showError(e);
    } finally {
      busy = false;
      paint();
    }
  }

  async function runSummary() {
    if (busy) return;
    if (!aiConfigured(aiCfg)) {
      showAlert(
        "warn",
        t("resume.alert.aiMissingTitle"),
        t("resume.alert.aiMissingBody"),
      );
      return;
    }
    // toggle view if already have summary and press m again without force
    if (summaryText && showSummary) {
      showSummary = false;
      paint();
      return;
    }
    if (summaryText && !showSummary) {
      showSummary = true;
      focusPanel = "transcript"; // summary is full-width; leave speaker focus
      paint();
      return;
    }
    busy = true;
    statusHint = t("resume.status.summarizing");
    showSummary = false;
    paint();
    try {
      const lines = segments.map((s) => ({
        speaker: speakerName(s),
        text: segmentDisplay(s),
        translation: s.translation,
      }));
      const sum = await summarizeMeeting(lines, aiCfg, {
        lang: aiCfg.translateTo || data.meta.lang || undefined,
      });
      summaryText = sum;
      if (!data.meta.builtin && data.meta.path) {
        saveSessionSummary(data.meta.path, sum);
        data.meta.summary = sum;
      }
      showSummary = true;
      focusPanel = "transcript";
      flash(t("resume.status.summaryDone"));
    } catch (e) {
      showError(e);
    } finally {
      busy = false;
      paint();
    }
  }

  function cycleTranslate(dir: 1 | -1) {
    const i = Math.max(0, TRANSLATE_OPTIONS.indexOf(aiCfg.translateTo));
    const n = (i + dir + TRANSLATE_OPTIONS.length) % TRANSLATE_OPTIONS.length;
    aiCfg = {
      ...aiCfg,
      translateTo: TRANSLATE_OPTIONS[n] as TranslateLang,
      enabled: true,
    };
    persistAi();
    paint();
  }

  function cycleUiLang(dir: 1 | -1) {
    const cur = getUiLang();
    const i = Math.max(0, UI_LANGS.indexOf(cur));
    const next = UI_LANGS[(i + dir + UI_LANGS.length) % UI_LANGS.length] as UiLang;
    setUiLang(next);
    const prev = loadSettings();
    saveSettings({ ...prev, uiLang: next });
    paint();
  }

  function persistAi() {
    const prev = loadSettings();
    saveSettings({
      ai: {
        ...prev.ai,
        enabled: aiCfg.enabled,
        correct: aiCfg.correct,
        translateTo: aiCfg.translateTo,
        baseUrl: aiCfg.baseUrl,
        model: aiCfg.model,
        apiKey: aiCfg.apiKey,
      },
    });
  }

  let resolveAction!: (a: ResumeAction) => void;
  const done = new Promise<ResumeAction>((r) => {
    resolveAction = r;
  });

  function stopAudio() {
    playGen += 1;
    if (playTimer) {
      clearInterval(playTimer);
      playTimer = null;
    }
    try {
      stopAllAudioPlayback();
    } catch {
      /* ignore */
    }
    if (playHandle) {
      try {
        playHandle.stop();
      } catch {
        /* ignore */
      }
      playHandle = null;
    }
    player = null;
    playing = false;
  }

  function startSyntheticPlay(sec: number) {
    const gen = playGen;
    playing = true;
    const t0 = Date.now();
    const base = sec;
    playTimer = setInterval(() => {
      if (gen !== playGen) return;
      cursor = Math.min(total, base + (Date.now() - t0) / 1000);
      if (cursor >= total - 0.05) {
        stopAudio();
        return;
      }
      const idx = segments.findIndex(
        (s) => s.start <= cursor && cursor < (s.end || s.start + 0.01),
      );
      if (idx >= 0) focusSeg = idx;
      paint();
    }, 200);
  }

  function tryPlayFrom(sec: number) {
    stopAudio();
    const gen = playGen;
    if (!hasAudio || !audioDir) {
      startSyntheticPlay(sec);
      return;
    }
    const hit = resolveAudioAtTime(audioDir, sec);
    if (!hit) return;

    const clipEnd = hit.clip.startSec + hit.clip.durationSec;
    const remain = Math.max(0.05, clipEnd - sec);
    const backend = detectPlayerBackend();
    if (backend === "none") {
      flash(t("resume.status.playerMissing"));
      startSyntheticPlay(sec);
      paint();
      return;
    }
    if (backend === "ffmpeg+os" && !warnedFfmpegFallback) {
      warnedFfmpegFallback = true;
      flash(t("resume.status.playerFfmpegFallback"));
    }

    const t0 = Date.now();
    const base = sec;
    playing = true;

    /** Only the active generation may chain to the next clip. */
    const chainOrStop = () => {
      if (gen !== playGen || closed) return;
      playHandle = null;
      player = null;
      if (playing && cursor < total - 0.1) {
        // Advance slightly past clip boundary to resolve next file
        const at = Math.max(cursor, clipEnd + 0.01);
        const next = resolveAudioAtTime(audioDir, at);
        if (next && next.path !== hit.path) {
          cursor = at;
          tryPlayFrom(at);
          return;
        }
      }
      playing = false;
      if (playTimer) {
        clearInterval(playTimer);
        playTimer = null;
      }
      paint();
    };

    playHandle = startAudioPlayback(
      {
        path: hit.path,
        offsetSec: Math.max(0, hit.offsetSec),
        durationSec: remain + 0.05,
      },
      {
        onExit: () => {
          if (gen !== playGen) return;
          chainOrStop();
        },
      },
    );
    if (!playHandle) {
      flash(t("resume.status.playerMissing"));
      startSyntheticPlay(sec);
      paint();
      return;
    }
    player = playHandle.proc;

    // Cursor only — do NOT restart playback here (avoids double with onExit).
    playTimer = setInterval(() => {
      if (gen !== playGen) return;
      cursor = Math.min(total, base + (Date.now() - t0) / 1000);
      if (cursor >= total - 0.05) {
        stopAudio();
        return;
      }
      const idx = segments.findIndex(
        (s) => s.start <= cursor && cursor < (s.end || s.start + 0.01),
      );
      if (idx >= 0) focusSeg = idx;
      paint();
    }, 200);
  }

  function seek(delta: number) {
    const was = playing;
    stopAudio();
    cursor = Math.min(total, Math.max(0, cursor + delta));
    const idx = segments.findIndex(
      (s) => s.start <= cursor && cursor < (s.end || s.start + 0.01),
    );
    if (idx >= 0) focusSeg = idx;
    else if (segments.length) {
      // nearest
      let best = 0;
      let bestD = Infinity;
      segments.forEach((s, i) => {
        const d = Math.abs(s.start - cursor);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      focusSeg = best;
    }
    if (was) tryPlayFrom(cursor);
    paint();
  }

  function togglePlay() {
    if (playing) {
      stopAudio();
      paint();
      return;
    }
    tryPlayFrom(cursor);
    paint();
  }

  function finish(action: ResumeAction) {
    if (closed) return;
    closed = true;
    stopAudio();
    clearAlertTimer();
    try {
      keyFeeder.reset();
    } catch {
      /* ignore */
    }
    // stop in-TUI share when leaving
    if (shareServer) {
      try {
        shareServer.close();
      } catch {
        /* ignore */
      }
      shareServer = null;
    }
    try {
      stdin.removeListener("data", feed);
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
      stdout.write(SHOW + ALT_OFF + RESET);
    } catch {
      /* ignore */
    }
    resolveAction(action);
  }

  function beginRename() {
    if (data.meta.builtin) {
      showAlert("warn", t("resume.renameTitle"), t("resume.status.renameDemo"));
      return;
    }
    if (!data.meta.path || data.meta.path === "(builtin)") {
      showAlert("error", t("resume.renameTitle"), t("resume.status.renameFail"));
      return;
    }
    renaming = true;
    renameDraft = data.meta.name || "";
    showSettings = false;
    showSummary = false;
    mergeMode = false;
    mergeSelected = new Set();
    mergeConfirm = false;
    statusHint = "";
    paint();
  }

  function commitRename() {
    const next = renameDraft.trim();
    renaming = false;
    renameDraft = "";
    if (!next) {
      showAlert("warn", t("resume.renameTitle"), t("resume.status.renameEmpty"));
      return;
    }
    const meta = renameSession(data.meta.path, next);
    if (meta) {
      data.meta.name = meta.name;
      showAlert(
        "info",
        t("resume.renameTitle"),
        t("resume.status.renamed", { name: meta.name }),
      );
    } else {
      showAlert("error", t("resume.renameTitle"), t("resume.status.renameFail"));
    }
  }

  function cancelRename() {
    renaming = false;
    renameDraft = "";
    statusHint = "";
    paint();
  }

  function beginRenameSpeaker() {
    if (data.meta.builtin) {
      showAlert("warn", t("footer.rename"), t("resume.status.mergeDemo"));
      return;
    }
    const list = listSpeakers();
    const sp = list[speakerSel];
    if (!sp) {
      flash(t("resume.status.mergeNeedSpk"));
      return;
    }
    renamingSpeaker = true;
    speakerRenameDraft = sp.name || "";
    showSettings = false;
    showSummary = false;
    mergeMode = false;
    mergeSelected = new Set();
    mergeConfirm = false;
    statusHint = "";
    paint();
  }

  function commitRenameSpeaker() {
    const list = listSpeakers();
    const sp = list[speakerSel];
    const next = speakerRenameDraft.trim();
    renamingSpeaker = false;
    speakerRenameDraft = "";
    if (!sp) {
      paint();
      return;
    }
    if (!next) {
      showAlert("warn", t("footer.rename"), t("resume.status.renameEmpty"));
      return;
    }
    const ok = renameSessionSpeaker(data, sp.spk, next);
    if (ok) {
      showAlert(
        "info",
        t("footer.rename"),
        t("resume.status.renamed", { name: next }),
      );
    } else {
      showAlert("error", t("footer.rename"), t("resume.status.renameFail"));
    }
  }

  function cancelRenameSpeaker() {
    renamingSpeaker = false;
    speakerRenameDraft = "";
    statusHint = "";
    paint();
  }

  function beginMerge() {
    if (data.meta.builtin) {
      flash(t("resume.status.mergeDemo"));
      return;
    }
    // Merge only works in the speaker panel
    if (focusPanel !== "speakers" || (cols() || 80) < 72) {
      flash(t("resume.status.mergeNeedPanel"));
      return;
    }
    const list = listSpeakers();
    if (list.length < 2) {
      flash(t("resume.status.mergeNeedSpk"));
      return;
    }
    mergeMode = true;
    mergeSelected = new Set();
    mergeConfirm = false;
    showSummary = false;
    showSettings = false;
    statusHint = t("resume.status.mergeHint");
    paint();
  }

  function toggleMergeMark() {
    const list = listSpeakers();
    const sp = list[speakerSel];
    if (!sp) return;
    if (mergeSelected.has(sp.spk)) mergeSelected.delete(sp.spk);
    else mergeSelected.add(sp.spk);
    statusHint = t("resume.status.mergeHint");
    paint();
  }

  function requestMergeExit() {
    if (mergeSelected.size === 0) {
      discardMerge();
      return;
    }
    if (mergeSelected.size < 2) {
      flash(t("resume.status.mergeSame"));
      return;
    }
    mergeConfirm = true;
    statusHint = "";
    // Center modal confirm (y / n)
    showAlert(
      "warn",
      t("footer.merge"),
      t("resume.status.mergeSaveAsk", { n: mergeSelected.size }),
      undefined,
      { confirm: true },
    );
  }

  function discardMerge() {
    mergeMode = false;
    mergeSelected = new Set();
    mergeConfirm = false;
    flash(t("resume.status.mergeDiscarded"));
    paint();
  }

  /** First selected (list order) is keep target; rest merge into it. */
  function saveMerge() {
    const list = listSpeakers();
    const ordered = list.filter((s) => mergeSelected.has(s.spk));
    if (ordered.length < 2) {
      statusHint = t("resume.status.mergeSame");
      mergeConfirm = false;
      paint();
      return;
    }
    const target = ordered[0]!;
    const sources = ordered.slice(1);
    let segs = 0;
    for (const src of sources) {
      const n = mergeSessionSpeakers(data, src.spk, target.spk);
      if (n > 0) segs += n;
    }
    mergeMode = false;
    mergeSelected = new Set();
    mergeConfirm = false;
    // re-sync selection to target
    const next = listSpeakers();
    const ti = next.findIndex((s) => s.spk === target.spk);
    speakerSel = ti >= 0 ? ti : 0;
    showAlert(
      "info",
      t("footer.merge"),
      t("resume.status.mergeDone", {
        n: ordered.length,
        to: target.name,
        segs,
      }),
    );
  }

  function onKey(key: string) {
    // Modal alert takes priority
    if (alertDlg) {
      if (key === "\x03") {
        finish({ type: "quit" });
        return;
      }
      // Merge save confirm (center): y / n
      if (alertDlg.confirm) {
        if (key === "y" || key === "Y" || key === "\r" || key === "\n") {
          alertDlg = null;
          saveMerge();
          return;
        }
        if (key === "n" || key === "N" || key === "\x1b") {
          alertDlg = null;
          discardMerge();
          return;
        }
        return;
      }
      dismissAlert();
      return;
    }

    // Session / speaker rename: exclusive modal — swallow ALL keys
    if (renaming || renamingSpeaker) {
      if (key === "\x1b") {
        if (renamingSpeaker) cancelRenameSpeaker();
        else cancelRename();
        return;
      }
      if (key.startsWith("\x1b")) return; // CSI / arrows
      if (key === "\r" || key === "\n") {
        if (renamingSpeaker) commitRenameSpeaker();
        else commitRename();
        return;
      }
      if (key === "\x03") {
        finish({ type: "quit" });
        return;
      }
      if (key === "\x7f" || key === "\b" || key === "\x08") {
        if (renamingSpeaker) {
          speakerRenameDraft = speakerRenameDraft.slice(0, -1);
        } else {
          renameDraft = renameDraft.slice(0, -1);
        }
        paint();
        return;
      }
      if (key === "\t") return;
      // Accept CJK / any non-control grapheme (not only ASCII printable)
      if (key && !key.startsWith("\x1b") && key !== "\x7f" && key >= " ") {
        if (renamingSpeaker) {
          if ([...speakerRenameDraft].length < 80) speakerRenameDraft += key;
        } else if ([...renameDraft].length < 80) {
          renameDraft += key;
        }
        paint();
      }
      return;
    }

    // Speaker multi-select merge (speaker panel only)
    // save confirm is handled by alertDlg.confirm above
    if (mergeMode) {
      if (key === "\x1b") {
        requestMergeExit();
        return;
      }
      if (key === "\x03") {
        finish({ type: "quit" });
        return;
      }
      // Stay locked on speaker panel while merging
      if (key === "\x1b[A" || key === "k") {
        moveSpeakerSel(-1);
        return;
      }
      if (key === "\x1b[B" || key === "j") {
        moveSpeakerSel(1);
        return;
      }
      if (key === " ") {
        toggleMergeMark();
        return;
      }
      // block Tab / play / other shortcuts
      return;
    }

    if (busy && key !== "q" && key !== "Q" && key !== "\x03") {
      return;
    }

    if (showSettings) {
      if (key === "\x1b" || key === "s" || key === "S") {
        showSettings = false;
        paint();
        return;
      }
      if (key === "\x1b[A" || key === "k") {
        settingsFocus =
          (settingsFocus + SETTINGS_COUNT - 1) % SETTINGS_COUNT;
        paint();
        return;
      }
      if (key === "\x1b[B" || key === "j") {
        settingsFocus = (settingsFocus + 1) % SETTINGS_COUNT;
        paint();
        return;
      }
      if (key === "\x1b[C" || key === "l") {
        if (settingsFocus === 0) cycleUiLang(1);
        else if (settingsFocus === 1) cycleTranslate(1);
        paint();
        return;
      }
      if (key === "\x1b[D" || key === "h") {
        if (settingsFocus === 0) cycleUiLang(-1);
        else if (settingsFocus === 1) cycleTranslate(-1);
        paint();
        return;
      }
      return;
    }

    if (key === "q" || key === "Q" || key === "\x03") {
      finish({ type: "quit" });
      return;
    }
    if (key === "c" || key === "C") {
      if (!continuable) {
        flash(t("resume.status.demoNoContinue"));
        return;
      }
      finish({ type: "continue", sessionId: data.meta.id });
      return;
    }
    if (key === "h" || key === "H") {
      void toggleShare();
      return;
    }
    if (key === "s" || key === "S") {
      showSettings = true;
      showSummary = false;
      // reload ai from disk
      aiCfg = mergeAi(loadSettings().ai);
      paint();
      return;
    }
    if (key === "e" || key === "E") {
      beginRename();
      return;
    }
    if (key === "t") {
      void runTranslateCurrent();
      return;
    }
    if (key === "T") {
      void runTranslateAll();
      return;
    }
    if (key === "m" || key === "M") {
      // m in speaker panel = merge; m in transcript = summary
      if (focusPanel === "speakers") {
        beginMerge();
      } else {
        void runSummary();
      }
      return;
    }
    if (key === "\t") {
      if (listSpeakers().length && (cols() || 80) >= 72) {
        focusPanel = focusPanel === "speakers" ? "transcript" : "speakers";
        // sync speaker sel from current segment
        if (focusPanel === "speakers") {
          const spk = segments[focusSeg]?.spk;
          if (spk != null) {
            const list = listSpeakers();
            const si = list.findIndex((x) => x.spk === spk);
            if (si >= 0) speakerSel = si;
          }
        }
        paint();
      }
      return;
    }
    if (key === " " || key === "p") {
      togglePlay();
      return;
    }
    // Seek on timeline (does not conflict with settings — settings returns early)
    if (key === "\x1b[C") {
      seek(2);
      return;
    }
    if (key === "\x1b[D") {
      seek(-2);
      return;
    }
    if (key === "\x1b[A" || key === "k") {
      if (focusPanel === "speakers") moveSpeakerSel(-1);
      else moveFocus(-1);
      return;
    }
    if (key === "\x1b[B" || key === "j") {
      if (focusPanel === "speakers") moveSpeakerSel(1);
      else moveFocus(1);
      return;
    }
    // Enter on speaker list → rename speaker (modal)
    if (
      (key === "\r" || key === "\n") &&
      focusPanel === "speakers"
    ) {
      beginRenameSpeaker();
      return;
    }
  }

  function moveSpeakerSel(delta: number) {
    const list = listSpeakers();
    if (!list.length) return;
    speakerSel = (speakerSel + delta + list.length) % list.length;
    const sp = list[speakerSel];
    if (sp) jumpToSpeaker(sp.spk);
    paint();
  }

  function moveFocus(delta: number) {
    if (!segments.length) return;
    const wasPlaying = playing;
    stopAudio();
    focusSeg = Math.min(
      segments.length - 1,
      Math.max(0, focusSeg + delta),
    );
    const seg = segments[focusSeg];
    if (seg) cursor = seg.start;
    showSummary = false;
    if (wasPlaying) tryPlayFrom(cursor);
    paint();
  }

  const keyFeeder = createKeyFeeder(onKey);
  const feed = keyFeeder.feed;

  function onResize() {
    lastW = 0;
    lastH = 0;
    paint();
  }

  if (stdin.isTTY) {
    try {
      stdin.setRawMode?.(true);
    } catch {
      /* ignore */
    }
    stdin.resume();
    stdin.on("data", feed);
  }
  stdout.on("resize", onResize);
  stdout.write(ALT_ON + HIDE + CLEAR);
  paint();

  process.on("SIGINT", () => finish({ type: "quit" }));
  return done;
}
