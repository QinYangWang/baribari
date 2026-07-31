/**
 * Session resume TUI — browse transcript, continue recording, share, AI translate/summary.
 *
 * Footer:  ↑↓  上/下一条   c  继续   t  翻译   m  总结   s  设置   h  共享   q  退出
 * Focused segment is fully visible at bottom; progress follows that segment.
 */

import type { SessionData, SessionSegment } from "./session.js";
import {
  canContinueSession,
  loadSessionSummary,
  rewriteSessionTranscript,
  saveSessionSummary,
  segmentDisplay,
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

function pad(s: string, n: number): string {
  const d = dw(s);
  if (d === n) return s;
  if (d > n) return trunc(stripAnsi(s), n);
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
    const sum = loadSessionSummary(data.meta.path);
    if (sum) {
      console.log("\n--- summary ---\n" + sum);
    }
    return { type: "quit" };
  }

  const total = Math.max(
    data.meta.durationSec || 0,
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
  let closed = false;
  let lastW = 0;
  let lastH = 0;
  let statusHint = "";
  let busy = false;
  let showSettings = false;
  // 0 uiLang · 1 translateTo · 2 model · 3 api status
  let settingsFocus = 0;
  const SETTINGS_COUNT = 4;
  let showSummary = false;
  let shareServer: ShareServer | null = null;
  /** Modal dialog (errors / important notices). */
  let alertDlg: {
    kind: "error" | "warn" | "info";
    title: string;
    body: string;
    /** Optional raw / technical detail shown in an inner box. */
    detail?: string;
  } | null = null;

  const cols = () => stdout.columns || 80;
  const rows = () => stdout.rows || 24;

  function speakerName(s: SessionSegment): string {
    return (
      data.speakers.find((x) => x.spk === s.spk)?.displayName ||
      (s.spk != null ? `Speaker ${s.spk}` : "—")
    );
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
    const boxW = Math.min(58, Math.max(40, W - 6));
    const inner = boxW - 2;
    const contentW = Math.max(8, inner - 2);
    const kind = alertDlg.kind;
    const accent =
      kind === "error" ? FG.err : kind === "warn" ? FG.warn : FG.cyan;
    const icon = kind === "error" ? "✕" : kind === "warn" ? "!" : "i";
    const titleLine = `${accent}${BOLD}${icon}  ${alertDlg.title}${RESET}`;
    const bodyLines = alertDlg.body
      .split(/\n/)
      .flatMap((ln) => wrap(ln, contentW));
    const maxBody = 8;
    const shown = bodyLines.slice(0, maxBody);
    if (bodyLines.length > maxBody) {
      shown.push(trunc(bodyLines[maxBody] || "…", contentW));
    }

    const rows: string[] = [];
    const borderC = kind === "error" ? FG.err : FG.border;
    const line = (content: string) =>
      `${borderC}│${RESET}${pad(content, inner)}${borderC}│${RESET}`;

    rows.push(`${borderC}╭${"─".repeat(inner)}╮${RESET}`);
    rows.push(line(` ${titleLine}`));
    rows.push(line(""));
    for (const wl of shown) {
      rows.push(line(` ${FG.title}${wl}${RESET}`));
    }

    // Nested detail box for raw error summary
    const detail = (alertDlg.detail || "").trim();
    if (detail) {
      rows.push(line(""));
      const nestInner = Math.max(10, inner - 4); // space for " │…│ "
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
      const nestTop =
        `${FG.muted}┌${"─".repeat(nestInner)}┐${RESET}`;
      const nestBot =
        `${FG.muted}└${"─".repeat(nestInner)}┘${RESET}`;
      const nestHdr = pad(
        ` ${DIM}${FG.muted}${t("resume.rawError")}${RESET}`,
        nestInner,
      );
      rows.push(line(` ${nestTop}`));
      rows.push(
        line(
          ` ${FG.muted}│${RESET}${nestHdr}${FG.muted}│${RESET}`,
        ),
      );
      for (const dl of dShown) {
        const cell = pad(` ${DIM}${FG.muted}${dl}${RESET}`, nestInner);
        rows.push(
          line(` ${FG.muted}│${RESET}${cell}${FG.muted}│${RESET}`),
        );
      }
      rows.push(line(` ${nestBot}`));
    }

    rows.push(line(""));
    rows.push(
      line(` ${DIM}${FG.muted}${t("resume.dismissHint")}${RESET}`),
    );
    rows.push(`${borderC}╰${"─".repeat(inner)}╯${RESET}`);
    return rows;
  }

  function showAlert(
    kind: "error" | "warn" | "info",
    title: string,
    body: string,
    detail?: string,
  ) {
    alertDlg = { kind, title, body, detail };
    statusHint = "";
    paint();
  }

  function showError(err: unknown) {
    const { title, body, detail } = formatError(err);
    showAlert("error", title, body, detail);
  }

  function dismissAlert() {
    if (!alertDlg) return;
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
    const bodyW = Math.max(10, inner - 2);

    if (segments.length) {
      focusSeg = Math.min(segments.length - 1, Math.max(0, focusSeg));
    } else {
      focusSeg = 0;
    }

    const { rows: visual, rowSeg, ranges } = buildVisual(bodyW);
    const viewStart = viewStartForFocus(ranges, bodyH, visual.length);

    let progressT = 0;
    if (segments[focusSeg]) {
      const seg = segments[focusSeg]!;
      progressT = (seg.end > 0 ? seg.end : seg.start) || 0;
    }
    if (focusSeg >= segments.length - 1 && segments.length) {
      const last = segments[segments.length - 1]!;
      progressT = last.end || last.start;
    }

    const ts = `${fmtDur(progressT)} / ${fmtDur(total)}`;
    const nSeg = segments.length;
    const posLabel =
      nSeg <= 1
        ? "all"
        : focusSeg <= 0
          ? "start"
          : focusSeg >= nSeg - 1
            ? "end"
            : `${focusSeg + 1}/${nSeg}`;
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

    // Optional summary banner lines at top of body when showSummary
    let bodyLines = slice;
    if (showSummary && summaryText) {
      const sumRows = wrap(summaryText.replace(/\r/g, ""), bodyW - 2).map(
        (wl) => pad(`  ${FG.cyan}${wl}${RESET}`, bodyW),
      );
      const head = pad(`${FG.accent}${BOLD}${t("resume.summaryTitle")}${RESET}`, bodyW);
      bodyLines = [head, ...sumRows.slice(0, Math.max(1, bodyH - 2))];
      while (bodyLines.length < bodyH) bodyLines.push(pad("", bodyW));
    }

    const lines: string[] = [];
    lines.push(`${FG.border}╭${"─".repeat(inner)}╮${RESET}`);
    const titleCore = `◆ ${data.meta.name}`;
    const id = data.meta.id;
    const titleRoom = Math.max(8, inner - dw(id) - 1);
    const title = trunc(titleCore, titleRoom);
    const headPad = Math.max(0, inner - dw(title) - dw(id));
    lines.push(
      `${FG.border}│${RESET}${BOLD}${FG.accent}${title}${RESET}${" ".repeat(headPad)}${FG.muted}${id}${RESET}${FG.border}│${RESET}`,
    );
    lines.push(`${FG.border}├${"─".repeat(inner)}┤${RESET}`);
    lines.push(`${FG.border}│${RESET}${progLine}${FG.border}│${RESET}`);
    lines.push(`${FG.border}├${"─".repeat(inner)}┤${RESET}`);

    for (const row of bodyLines) {
      lines.push(`${FG.border}│${RESET} ${row} ${FG.border}│${RESET}`);
    }

    lines.push(`${FG.border}├${"─".repeat(inner)}┤${RESET}`);
    // Spaced key · label  ·  key · label
    const contKey = continuable
      ? kcap("c", t("resume.footer.continue"))
      : `${DIM}${FG.muted}c ${t("resume.footer.na")}${RESET}`;
    const shareKey = shareServer
      ? kcap("h", t("resume.footer.shareStop"))
      : kcap("h", t("resume.footer.share"));
    const keys =
      [
        kcap("↑↓", t("resume.footer.nav")),
        contKey,
        kcap("t", t("resume.footer.translate")),
        kcap("T", t("resume.footer.translateAll")),
        kcap("m", t("resume.footer.summary")),
        kcap("s", t("resume.footer.settings")),
        shareKey,
        kcap("q", t("resume.footer.quit")),
      ].join("  ") +
      (statusHint ? `  ${FG.warn}${statusHint}${RESET}` : "") +
      (busy ? `  ${FG.accent}…${RESET}` : "");
    lines.push(
      `${FG.border}│${RESET} ${pad(keys, bodyW)} ${FG.border}│${RESET}`,
    );
    lines.push(`${FG.border}╰${"─".repeat(inner)}╯${RESET}`);

    let out = HOME + HIDE;
    for (let i = 0; i < H; i++) {
      out += lines[i] ?? " ".repeat(W);
      if (i < H - 1) out += "\n";
    }

    if (showSettings && !alertDlg) {
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

  function flash(msg: string, ms = 2000) {
    statusHint = msg;
    paint();
    setTimeout(() => {
      if (statusHint === msg) statusHint = "";
      if (!closed) paint();
    }, ms);
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

  function finish(action: ResumeAction) {
    if (closed) return;
    closed = true;
    if (keyTimer) clearTimeout(keyTimer);
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

  function onKey(key: string) {
    // Modal alert takes priority — any key dismisses (except Ctrl+C still quits)
    if (alertDlg) {
      if (key === "\x03") {
        finish({ type: "quit" });
        return;
      }
      dismissAlert();
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
        statusHint = t("resume.status.demoNoContinue");
        paint();
        setTimeout(() => {
          statusHint = "";
          if (!closed) paint();
        }, 1500);
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
    if (key === "t") {
      void runTranslateCurrent();
      return;
    }
    if (key === "T") {
      void runTranslateAll();
      return;
    }
    if (key === "m" || key === "M") {
      void runSummary();
      return;
    }
    if (key === "\x1b[A" || key === "k") {
      moveFocus(-1);
      return;
    }
    if (key === "\x1b[B" || key === "j") {
      moveFocus(1);
      return;
    }
    if (key === "\x1b[5~") {
      moveFocus(-5);
      return;
    }
    if (key === "\x1b[6~") {
      moveFocus(5);
      return;
    }
    if (key === "g" || key === "\x1b[H" || key === "\x1b[1~") {
      focusSeg = 0;
      showSummary = false;
      paint();
      return;
    }
    if (key === "G" || key === "\x1b[F" || key === "\x1b[4~") {
      focusSeg = Math.max(0, segments.length - 1);
      showSummary = false;
      paint();
      return;
    }
  }

  function moveFocus(delta: number) {
    if (!segments.length) return;
    focusSeg = Math.min(
      segments.length - 1,
      Math.max(0, focusSeg + delta),
    );
    showSummary = false;
    paint();
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
