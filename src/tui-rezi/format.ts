import { localeTag } from "../i18n/index.js";

export function fmtClock(ms: number): string {
  return new Date(ms).toLocaleTimeString(localeTag(), { hour12: false });
}

export function fmtDur(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

export function fmtRange(a: number, b?: number): string {
  if (b == null) return `${fmtDur(a)}–…`;
  return `${fmtDur(a)}–${fmtDur(b)}`;
}

export function maskApiKey(key: string, unsetLabel: string): string {
  if (!key) return unsetLabel;
  if (key.length <= 6) return "*".repeat(key.length);
  return key.slice(0, 3) + "*".repeat(Math.min(20, key.length - 3));
}
