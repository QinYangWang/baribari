/**
 * Plain-text emitter + status (used with --no-tui).
 * Full-screen UI lives in tui.ts.
 */

import fs from "node:fs";
import type { Segment } from "./types.js";
import { displayText } from "./types.js";
import { localeTag, t } from "./i18n/index.js";

const SPK_COLORS = [
  "\x1b[38;2;94;234;212m",
  "\x1b[38;2;251;191;36m",
  "\x1b[38;2;244;114;182m",
  "\x1b[38;2;129;140;248m",
  "\x1b[38;2;74;222;128m",
  "\x1b[38;2;248;113;113m",
  "\x1b[38;2;56;189;248m",
  "\x1b[38;2;192;132;252m",
];
const RESET = "\x1b[0m";
const DIM = "\x1b[2m";
const BLUE = "\x1b[38;2;147;197;253m";

function colorFor(spk: number | null): string {
  if (spk == null) return "";
  return SPK_COLORS[(spk - 1) % SPK_COLORS.length] ?? "";
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString(localeTag(), { hour12: false });
}

function fmtSec(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function createEmitter(outputPath?: string): {
  emit: (seg: Segment) => void;
  close: () => void;
} {
  let out: fs.WriteStream | null = null;
  if (outputPath) {
    out = fs.createWriteStream(outputPath, { flags: "a", encoding: "utf8" });
  }

  return {
    emit(seg: Segment) {
      const spkLabel =
        seg.spk != null
          ? t("plain.speaker", { n: seg.spk })
          : t("common.dash");
      const c = colorFor(seg.spk);
      const main = displayText(seg);
      const line =
        `${DIM}[${fmtTime(seg.wall)} ${fmtSec(seg.start)}-${fmtSec(seg.end)}]${RESET} ` +
        `${c}${spkLabel}${RESET}  ${main}`;
      console.log(line);
      if (seg.translation) {
        console.log(`${DIM}           ↳${RESET} ${BLUE}${seg.translation}${RESET}`);
      }

      if (out) {
        let plain =
          `[${fmtTime(seg.wall)} ${fmtSec(seg.start)}-${fmtSec(seg.end)}] ${spkLabel}  ${main}`;
        if (seg.translation) plain += ` | ${seg.translation}`;
        if (seg.corrected && seg.corrected !== seg.text) {
          plain += `  (ASR: ${seg.text})`;
        }
        out.write(plain + "\n");
      }
    },
    close() {
      out?.end();
    },
  };
}

export function onStatus(msg: string): void {
  console.error(`${DIM}• ${msg}${RESET}`);
}
