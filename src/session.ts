/**
 * Meeting session persistence.
 *
 *   ~/.config/baribari/sessions/<id>/
 *     meta.json
 *     transcript.jsonl
 *     audio.wav          (optional, when recording enabled)
 */

import fs from "node:fs";
import path from "node:path";
import { configDir, ensureConfigDir } from "./paths.js";
import type { Segment } from "./types.js";
import { displayText } from "./types.js";

export const DEMO_SESSION_ID = "demo";

export interface SessionSpeaker {
  id: string;
  displayName: string;
  /** 1-based ASR speaker index when known */
  spk?: number | null;
}

export interface SessionSegment {
  id: string;
  start: number;
  end: number;
  wallIso: string;
  spk: number | null;
  speakerId?: string | null;
  text: string;
  corrected?: string;
  translation?: string;
}

export interface SessionMeta {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  endedAt?: string;
  durationSec: number;
  segmentCount: number;
  speakerCount: number;
  hasAudio: boolean;
  path: string;
  /** Built-in demo (not under user sessions dir as only source). */
  builtin?: boolean;
  source?: string;
  lang?: string;
  /** AI meeting summary (markdown), also written to summary.md */
  summary?: string;
  summaryAt?: string;
}

export interface SessionData {
  meta: SessionMeta;
  speakers: SessionSpeaker[];
  segments: SessionSegment[];
  audioPath?: string;
}

function sessionsRoot(): string {
  const dir = path.join(configDir(), "sessions");
  fs.mkdirSync(dir, { recursive: true });
  return path.resolve(dir);
}

/** Reject path traversal / absolute paths in session ids. */
export function isSafeSessionId(id: string): boolean {
  if (!id || typeof id !== "string") return false;
  if (id === DEMO_SESSION_ID || id === "demo") return true;
  // opencode-style tokens + simple names; no slashes, dots-only, or ..
  if (id.includes("..") || id.includes("/") || id.includes("\\")) return false;
  if (path.isAbsolute(id)) return false;
  if (id === "." || id === "..") return false;
  // allow ses_* and other simple folder names
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id);
}

/** Resolve id → absolute dir only if inside sessions root. */
function resolveSessionDir(id: string): string | null {
  if (!isSafeSessionId(id)) return null;
  const root = sessionsRoot();
  const dir = path.resolve(root, id === "demo" ? DEMO_SESSION_ID : id);
  const rel = path.relative(root, dir);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return dir;
}

/** Short id similar to opencode-style session tokens. */
export function generateSessionId(): string {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return `ses_${t}_${r}`;
}

export function defaultSessionName(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `Meeting ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function sessionDir(id: string): string {
  const dir = resolveSessionDir(id);
  if (!dir) {
    throw new Error(`Invalid session id: ${id}`);
  }
  return dir;
}

/** Rename a session (updates meta.json name). Returns updated meta or null. */
export function renameSession(
  dirOrId: string,
  name: string,
): SessionMeta | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  // Reject control chars / path separators that would break display
  const safe = trimmed
    .replace(/[\r\n\t]/g, " ")
    .replace(/[\\/]/g, "-")
    .slice(0, 120);
  if (!safe) return null;
  let dir = dirOrId;
  if (!fs.existsSync(path.join(dir, "meta.json"))) {
    try {
      dir = sessionDir(dirOrId);
    } catch {
      return null;
    }
  }
  if (!fs.existsSync(dir) || !isPathInsideSessions(dir)) return null;
  const meta = readMetaFile(dir);
  if (!meta || meta.builtin) return null;
  meta.name = safe;
  meta.updatedAt = new Date().toISOString();
  writeMeta(dir, meta);
  return meta;
}

export function createSession(opts?: {
  name?: string;
  source?: string;
  lang?: string;
}): { id: string; dir: string; meta: SessionMeta } {
  ensureConfigDir();
  const id = generateSessionId();
  const dir = sessionDir(id);
  fs.mkdirSync(dir, { recursive: true });
  const now = new Date().toISOString();
  const meta: SessionMeta = {
    id,
    name: opts?.name || defaultSessionName(),
    createdAt: now,
    updatedAt: now,
    durationSec: 0,
    segmentCount: 0,
    speakerCount: 0,
    hasAudio: false,
    path: dir,
    source: opts?.source,
    lang: opts?.lang,
  };
  writeMeta(dir, meta);
  fs.writeFileSync(path.join(dir, "transcript.jsonl"), "", "utf8");
  fs.writeFileSync(
    path.join(dir, "speakers.json"),
    "[]\n",
    "utf8",
  );
  return { id, dir, meta };
}

function writeMeta(dir: string, meta: SessionMeta): void {
  const out = { ...meta, path: dir };
  fs.writeFileSync(
    path.join(dir, "meta.json"),
    JSON.stringify(out, null, 2) + "\n",
    "utf8",
  );
}

function readMetaFile(dir: string): SessionMeta | null {
  const f = path.join(dir, "meta.json");
  if (!fs.existsSync(f)) return null;
  try {
    const m = JSON.parse(fs.readFileSync(f, "utf8")) as SessionMeta;
    m.path = dir;
    m.hasAudio = fs.existsSync(path.join(dir, "audio.wav"));
    return m;
  } catch {
    return null;
  }
}

export function appendSessionSegment(
  dir: string,
  seg: Segment,
  speakers?: SessionSpeaker[],
): void {
  // Sessions store finals only (partials are live-UI ephemera)
  if (seg.kind === "partial") return;
  // upsert by id: if AI finalize rewrites same id, replace last matching line
  const end =
    seg.end != null && Number.isFinite(seg.end) ? seg.end : seg.start;
  const row: SessionSegment = {
    id: seg.id || `seg_${Date.now()}`,
    start: seg.start,
    end,
    wallIso: seg.wallIso || seg.wall.toISOString(),
    spk: seg.spk,
    text: seg.text,
    corrected: seg.corrected,
    translation: seg.translation,
  };
  const tf = path.join(dir, "transcript.jsonl");
  let lines: string[] = [];
  if (fs.existsSync(tf)) {
    lines = fs.readFileSync(tf, "utf8").split("\n").filter(Boolean);
  }
  let replaced = false;
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const prev = JSON.parse(lines[i]!) as SessionSegment;
      if (prev.id === row.id) {
        lines[i] = JSON.stringify(row);
        replaced = true;
        break;
      }
    } catch {
      /* ignore */
    }
  }
  if (!replaced) lines.push(JSON.stringify(row));
  fs.writeFileSync(tf, lines.map((l) => l + "\n").join(""), "utf8");

  // merge speakers
  const sf = path.join(dir, "speakers.json");
  let merged: SessionSpeaker[] = [];
  try {
    if (fs.existsSync(sf)) {
      merged = JSON.parse(fs.readFileSync(sf, "utf8")) as SessionSpeaker[];
    }
  } catch {
    merged = [];
  }
  if (speakers?.length) {
    for (const sp of speakers) {
      if (!merged.some((m) => m.id === sp.id || (sp.spk != null && m.spk === sp.spk))) {
        merged.push(sp);
      }
    }
  } else if (seg.spk != null) {
    const id = `spk_${seg.spk}`;
    if (!merged.some((m) => m.spk === seg.spk)) {
      merged.push({
        id,
        displayName: `Speaker ${seg.spk}`,
        spk: seg.spk,
      });
    }
  }
  fs.writeFileSync(sf, JSON.stringify(merged, null, 2) + "\n", "utf8");

  const meta = readMetaFile(dir);
  if (meta) {
    meta.updatedAt = new Date().toISOString();
    meta.segmentCount = lines.length;
    meta.durationSec = Math.max(meta.durationSec, seg.end || 0);
    meta.speakerCount = merged.length;
    meta.hasAudio = fs.existsSync(path.join(dir, "audio.wav"));
    writeMeta(dir, meta);
  }
}

export function finalizeSession(
  dir: string,
  extra?: Partial<SessionMeta>,
): SessionMeta | null {
  const meta = readMetaFile(dir);
  if (!meta) return null;
  Object.assign(meta, extra);
  meta.endedAt = meta.endedAt || new Date().toISOString();
  meta.updatedAt = new Date().toISOString();
  meta.hasAudio = fs.existsSync(path.join(dir, "audio.wav"));
  // recount segments
  try {
    const lines = fs
      .readFileSync(path.join(dir, "transcript.jsonl"), "utf8")
      .split("\n")
      .filter(Boolean);
    meta.segmentCount = lines.length;
    let maxEnd = 0;
    for (const line of lines) {
      try {
        const s = JSON.parse(line) as SessionSegment;
        if (s.end > maxEnd) maxEnd = s.end;
      } catch {
        /* ignore */
      }
    }
    meta.durationSec = Math.max(meta.durationSec, maxEnd);
  } catch {
    /* ignore */
  }
  try {
    const sp = JSON.parse(
      fs.readFileSync(path.join(dir, "speakers.json"), "utf8"),
    ) as SessionSpeaker[];
    meta.speakerCount = sp.length;
  } catch {
    /* ignore */
  }
  writeMeta(dir, meta);
  return meta;
}

export function listSessions(): SessionMeta[] {
  ensureConfigDir();
  const root = sessionsRoot();
  const out: SessionMeta[] = [];

  // Always surface demo first as virtual session
  out.push(getDemoSessionMeta());

  if (!fs.existsSync(root)) return out;
  for (const name of fs.readdirSync(root)) {
    if (name === DEMO_SESSION_ID) continue;
    const dir = path.join(root, name);
    if (!fs.statSync(dir).isDirectory()) continue;
    const m = readMetaFile(dir);
    if (m) out.push(m);
  }
  out.sort((a, b) => {
    if (a.builtin && !b.builtin) return -1;
    if (!a.builtin && b.builtin) return 1;
    return (b.updatedAt || "").localeCompare(a.updatedAt || "");
  });
  return out;
}

export function loadSession(idOrPath: string): SessionData | null {
  if (idOrPath === DEMO_SESSION_ID || idOrPath === "demo") {
    return buildDemoSession();
  }
  // Never accept arbitrary filesystem paths — only session ids under sessions/
  let dir: string | null = null;
  if (isSafeSessionId(idOrPath)) {
    dir = resolveSessionDir(idOrPath);
  }
  // prefix / exact name match among known sessions only
  if (!dir || !fs.existsSync(dir)) {
    const all = listSessions().filter((s) => !s.builtin);
    const hit = all.find(
      (s) =>
        s.id === idOrPath ||
        s.id.startsWith(idOrPath) ||
        s.name === idOrPath,
    );
    if (hit && hit.path && isPathInsideSessions(hit.path)) {
      dir = hit.path;
    } else {
      dir = null;
    }
  }
  if (!dir || !fs.existsSync(dir) || !isPathInsideSessions(dir)) return null;
  const meta = readMetaFile(dir);
  if (!meta) return null;

  const segments: SessionSegment[] = [];
  const tf = path.join(dir, "transcript.jsonl");
  if (fs.existsSync(tf)) {
    for (const line of fs.readFileSync(tf, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        segments.push(JSON.parse(line) as SessionSegment);
      } catch {
        /* ignore */
      }
    }
  }
  let speakers: SessionSpeaker[] = [];
  const sf = path.join(dir, "speakers.json");
  if (fs.existsSync(sf)) {
    try {
      speakers = JSON.parse(fs.readFileSync(sf, "utf8")) as SessionSpeaker[];
    } catch {
      /* ignore */
    }
  }
  // derive speakers from segments if missing
  if (!speakers.length) {
    const map = new Map<number, SessionSpeaker>();
    for (const s of segments) {
      if (s.spk != null && !map.has(s.spk)) {
        map.set(s.spk, {
          id: `spk_${s.spk}`,
          displayName: `Speaker ${s.spk}`,
          spk: s.spk,
        });
      }
    }
    speakers = [...map.values()];
  }
  const audioPath = path.join(dir, "audio.wav");
  return {
    meta,
    speakers,
    segments,
    audioPath: fs.existsSync(audioPath) ? audioPath : undefined,
  };
}

function isPathInsideSessions(dir: string): boolean {
  const root = sessionsRoot();
  const resolved = path.resolve(dir);
  const rel = path.relative(root, resolved);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

export type DeleteSessionResult =
  | { ok: true; id: string; path: string }
  | {
      ok: false;
      reason:
        | "demo"
        | "not_found"
        | "ambiguous"
        | "need_exact"
        | "invalid";
      matches?: SessionMeta[];
    };

/**
 * Resolve a user-supplied session id for deletion.
 * - exact id preferred
 * - prefix only if unique and opts.allowPrefix
 */
export function resolveSessionForDelete(
  id: string,
  opts?: { allowPrefix?: boolean },
): DeleteSessionResult {
  if (id === DEMO_SESSION_ID || id === "demo") {
    return { ok: false, reason: "demo" };
  }
  if (!id || id.includes("..") || id.includes("/") || id.includes("\\")) {
    return { ok: false, reason: "invalid" };
  }
  const all = listSessions().filter((s) => !s.builtin);
  const exact = all.find((s) => s.id === id);
  if (exact && isPathInsideSessions(exact.path)) {
    return { ok: true, id: exact.id, path: exact.path };
  }
  const prefixed = all.filter((s) => s.id.startsWith(id));
  if (prefixed.length > 1) {
    return { ok: false, reason: "ambiguous", matches: prefixed };
  }
  if (prefixed.length === 1 && opts?.allowPrefix) {
    const hit = prefixed[0]!;
    if (!isPathInsideSessions(hit.path)) {
      return { ok: false, reason: "invalid" };
    }
    return { ok: true, id: hit.id, path: hit.path };
  }
  if (prefixed.length === 1 && !opts?.allowPrefix) {
    return {
      ok: false,
      reason: "need_exact",
      matches: prefixed,
    };
  }
  return { ok: false, reason: "not_found" };
}

export function deleteSession(
  id: string,
  opts?: { allowPrefix?: boolean },
): DeleteSessionResult {
  const resolved = resolveSessionForDelete(id, opts);
  if (!resolved.ok) return resolved;
  if (!isPathInsideSessions(resolved.path)) {
    return { ok: false, reason: "invalid" };
  }
  fs.rmSync(resolved.path, { recursive: true, force: true });
  return resolved;
}

export function sessionAudioPath(dir: string): string {
  return path.join(dir, "audio.wav");
}

/** One continuous audio clip on the session timeline. */
export interface AudioClip {
  path: string;
  /** Start on meeting timeline (seconds). */
  startSec: number;
  durationSec: number;
}

/**
 * List audio pieces for a session in timeline order.
 * Supports:
 *   - audio.wav (primary / appended continuum)
 *   - audio-part-<ts>.wav (legacy rotated parts, chronological by mtime/name)
 */
export function listSessionAudioClips(dir: string): AudioClip[] {
  if (!dir || !fs.existsSync(dir) || dir === "(builtin)") return [];
  const files: string[] = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.toLowerCase().endsWith(".wav")) continue;
    if (name === "audio.wav" || /^audio-part-\d+\.wav$/i.test(name)) {
      files.push(path.join(dir, name));
    }
  }
  if (!files.length) return [];

  // Order: numbered parts by timestamp ascending, then audio.wav last
  // (when continuing we used to rotate old → part, new → audio.wav)
  files.sort((a, b) => {
    const an = path.basename(a);
    const bn = path.basename(b);
    const ap = /^audio-part-(\d+)\.wav$/i.exec(an);
    const bp = /^audio-part-(\d+)\.wav$/i.exec(bn);
    if (ap && bp) return Number(ap[1]) - Number(bp[1]);
    if (ap && !bp) return -1;
    if (!ap && bp) return 1;
    return an.localeCompare(bn);
  });

  const clips: AudioClip[] = [];
  let t = 0;
  for (const f of files) {
    const dur = wavDurationSec(f);
    if (dur <= 0) continue;
    clips.push({ path: f, startSec: t, durationSec: dur });
    t += dur;
  }
  return clips;
}

/** Total audio duration across all clips. */
export function sessionAudioDuration(dir: string): number {
  return listSessionAudioClips(dir).reduce((s, c) => s + c.durationSec, 0);
}

/**
 * Map meeting time → { file, offsetInFile }.
 * Returns null if no audio at that time.
 */
export function resolveAudioAtTime(
  dir: string,
  timeSec: number,
): { path: string; offsetSec: number; clip: AudioClip } | null {
  const clips = listSessionAudioClips(dir);
  if (!clips.length) return null;
  const t = Math.max(0, timeSec);
  for (const c of clips) {
    if (t >= c.startSec && t < c.startSec + c.durationSec - 1e-6) {
      return {
        path: c.path,
        offsetSec: t - c.startSec,
        clip: c,
      };
    }
  }
  // clamp to last sample
  const last = clips[clips.length - 1]!;
  if (t >= last.startSec) {
    return {
      path: last.path,
      offsetSec: Math.min(last.durationSec - 0.05, t - last.startSec),
      clip: last,
    };
  }
  return {
    path: clips[0]!.path,
    offsetSec: 0,
    clip: clips[0]!,
  };
}

/**
 * Merge audio-part-*.wav + audio.wav into a single audio.wav (in timeline order).
 * Safe no-op if only one file or none. Returns path of merged file or undefined.
 */
export function consolidateSessionAudio(dir: string): string | undefined {
  const clips = listSessionAudioClips(dir);
  if (!clips.length) return undefined;
  if (clips.length === 1 && path.basename(clips[0]!.path) === "audio.wav") {
    return clips[0]!.path;
  }
  // Prefer Node buffer merge via raw PCM read (simple 16-bit mono/stereo WAV)
  try {
    const parts: Buffer[] = [];
    let sampleRate = 0;
    let channels = 0;
    let bitDepth = 0;
    for (const c of clips) {
      const w = readWavPcm(c.path);
      if (!w) continue;
      if (!sampleRate) {
        sampleRate = w.sampleRate;
        channels = w.channels;
        bitDepth = w.bitDepth;
      }
      if (
        w.sampleRate !== sampleRate ||
        w.channels !== channels ||
        w.bitDepth !== bitDepth
      ) {
        // incompatible — leave files as multi-clip
        return undefined;
      }
      parts.push(w.pcm);
    }
    if (!parts.length || !sampleRate) return undefined;
    const pcm = Buffer.concat(parts);
    const outPath = sessionAudioPath(dir);
    writeWavPcm(outPath, pcm, sampleRate, channels, bitDepth);
    // remove part files after successful merge
    for (const c of clips) {
      if (path.basename(c.path) !== "audio.wav") {
        try {
          fs.unlinkSync(c.path);
        } catch {
          /* ignore */
        }
      }
    }
    return outPath;
  } catch {
    return undefined;
  }
}

interface WavPcm {
  pcm: Buffer;
  sampleRate: number;
  channels: number;
  bitDepth: number;
}

function wavDurationSec(file: string): number {
  const w = readWavPcm(file);
  if (!w || !w.sampleRate || !w.channels || !w.bitDepth) return 0;
  const bytesPerSec = (w.sampleRate * w.channels * w.bitDepth) / 8;
  return bytesPerSec > 0 ? w.pcm.length / bytesPerSec : 0;
}

/** Minimal WAV reader (PCM only). */
function readWavPcm(file: string): WavPcm | null {
  try {
    const buf = fs.readFileSync(file);
    if (buf.length < 44) return null;
    if (buf.toString("ascii", 0, 4) !== "RIFF") return null;
    if (buf.toString("ascii", 8, 12) !== "WAVE") return null;
    let offset = 12;
    let sampleRate = 0;
    let channels = 0;
    let bitDepth = 0;
    let data: Buffer | null = null;
    while (offset + 8 <= buf.length) {
      const id = buf.toString("ascii", offset, offset + 4);
      const size = buf.readUInt32LE(offset + 4);
      const start = offset + 8;
      if (id === "fmt ") {
        channels = buf.readUInt16LE(start + 2);
        sampleRate = buf.readUInt32LE(start + 4);
        bitDepth = buf.readUInt16LE(start + 14);
      } else if (id === "data") {
        data = buf.subarray(start, start + size);
        break;
      }
      offset = start + size + (size % 2);
    }
    if (!data || !sampleRate) return null;
    return { pcm: Buffer.from(data), sampleRate, channels, bitDepth };
  } catch {
    return null;
  }
}

function writeWavPcm(
  file: string,
  pcm: Buffer,
  sampleRate: number,
  channels: number,
  bitDepth: number,
): void {
  const blockAlign = (channels * bitDepth) / 8;
  const byteRate = sampleRate * blockAlign;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitDepth, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  fs.writeFileSync(file, Buffer.concat([header, pcm]));
}

function getDemoSessionMeta(): SessionMeta {
  return {
    id: DEMO_SESSION_ID,
    name: "Demo meeting (built-in)",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    durationSec: 18,
    segmentCount: 5,
    speakerCount: 3,
    hasAudio: false,
    path: "(builtin)",
    builtin: true,
    source: "demo",
    lang: "zh",
  };
}

/** Prefabricated session for `baribari resume demo`. */
export function buildDemoSession(): SessionData {
  const base = Date.parse("2024-06-01T10:00:00.000Z");
  const samples: Array<{
    spk: number;
    text: string;
    translation?: string;
    start: number;
    dur: number;
  }> = [
    {
      spk: 1,
      text: "大家好，我们开始今天的产品评审。",
      translation: "Hello everyone, let's start today's product review.",
      start: 0.5,
      dur: 2.4,
    },
    {
      spk: 2,
      text: "好的，我先同步一下上周的进度：登录流程已经上线。",
      translation: "Sure — last week the login flow shipped.",
      start: 3.5,
      dur: 3.1,
    },
    {
      spk: 1,
      text: "不错。语音转写这块呢？延迟有压下来吗？",
      translation: "Nice. How about speech transcription latency?",
      start: 7.2,
      dur: 2.2,
    },
    {
      spk: 3,
      text: "端到端大概 400ms，VAD 切段还在调阈值。",
      translation: "About 400ms end-to-end; still tuning VAD.",
      start: 10.0,
      dur: 2.8,
    },
    {
      spk: 2,
      text: "阈值我建议先 0.55，误切太多会影响说话人聚类。",
      translation: "I'd start the threshold at 0.55.",
      start: 13.5,
      dur: 3.0,
    },
  ];
  const segments: SessionSegment[] = samples.map((s, i) => ({
    id: `demo_${i + 1}`,
    start: s.start,
    end: s.start + s.dur,
    wallIso: new Date(base + s.start * 1000).toISOString(),
    spk: s.spk,
    speakerId: `spk_${s.spk}`,
    text: s.text,
    translation: s.translation,
  }));
  const speakers: SessionSpeaker[] = [
    { id: "spk_1", displayName: "Speaker 1", spk: 1 },
    { id: "spk_2", displayName: "Speaker 2", spk: 2 },
    { id: "spk_3", displayName: "Speaker 3", spk: 3 },
  ];
  return {
    meta: getDemoSessionMeta(),
    speakers,
    segments,
  };
}

export interface SessionWriter {
  id: string;
  dir: string;
  meta: SessionMeta;
  recordPath: string;
  /** Seconds already on the timeline (0 for new sessions). */
  timeOffset: number;
  continuing: boolean;
  onSegment: (seg: Segment, speakers?: SessionSpeaker[]) => void;
  setSpeakers: (speakers: SessionSpeaker[]) => void;
  close: () => SessionMeta | null;
}

function makeWriter(
  id: string,
  dir: string,
  meta: SessionMeta,
  timeOffset: number,
  continuing: boolean,
): SessionWriter {
  const recordPath = sessionAudioPath(dir);
  return {
    id,
    dir,
    meta,
    recordPath,
    timeOffset,
    continuing,
    onSegment(seg, speakers) {
      // Finals only — ignore AI-pending and live partials
      if (seg.pending || seg.kind === "partial") return;
      const shifted: Segment = {
        ...seg,
        kind: "final",
        start: (seg.start || 0) + timeOffset,
        end: (seg.end || 0) + timeOffset,
      };
      appendSessionSegment(dir, shifted, speakers);
    },
    setSpeakers(speakers) {
      fs.writeFileSync(
        path.join(dir, "speakers.json"),
        JSON.stringify(speakers, null, 2) + "\n",
        "utf8",
      );
      const m = readMetaFile(dir);
      if (m) {
        m.speakerCount = speakers.length;
        m.updatedAt = new Date().toISOString();
        writeMeta(dir, m);
      }
    },
    close() {
      return finalizeSession(dir);
    },
  };
}

/** Live session writer attached to a new meeting. */
export function createSessionWriter(opts?: {
  name?: string;
  source?: string;
  lang?: string;
}): SessionWriter {
  const { id, dir, meta } = createSession(opts);
  return makeWriter(id, dir, meta, 0, false);
}

/**
 * Re-open an existing session to append more transcript / audio.
 * Timeline offset = previous duration so new ASR times continue the meeting clock.
 * Returns null for missing / demo sessions.
 */
export function openSessionWriter(
  idOrPath: string,
  opts?: { source?: string; lang?: string },
): SessionWriter | null {
  if (idOrPath === DEMO_SESSION_ID || idOrPath === "demo") return null;
  const data = loadSession(idOrPath);
  if (!data || data.meta.builtin) return null;
  const dir = data.meta.path;
  if (!fs.existsSync(dir) || !isPathInsideSessions(dir)) return null;
  // refresh duration from disk before offsetting
  const finalized = finalizeSession(dir, {
    source: opts?.source ?? data.meta.source,
    lang: opts?.lang ?? data.meta.lang,
  });
  const meta = finalized || data.meta;
  // clear endedAt so session is "live" again
  if (meta.endedAt) {
    delete meta.endedAt;
    meta.updatedAt = new Date().toISOString();
    writeMeta(dir, meta);
  }
  // Prefer a single continuous audio.wav: merge any legacy parts first.
  consolidateSessionAudio(dir);
  // Timeline offset from transcript duration (not only audio length)
  let timeOffset = Math.max(0, meta.durationSec || 0);
  const audioDur = sessionAudioDuration(dir);
  // Keep clock monotonic vs existing audio
  timeOffset = Math.max(timeOffset, audioDur);
  meta.durationSec = Math.max(meta.durationSec, timeOffset);
  meta.hasAudio = fs.existsSync(sessionAudioPath(dir)) || listSessionAudioClips(dir).length > 0;
  writeMeta(dir, meta);
  // Recording appends into audio.wav (transcribe flushWav merges PCM).
  return makeWriter(meta.id, dir, meta, timeOffset, true);
}

/** Whether this session can be continued (not demo, on disk). */
export function canContinueSession(id: string): boolean {
  if (!id || id === DEMO_SESSION_ID || id === "demo") return false;
  const data = loadSession(id);
  return Boolean(data && !data.meta.builtin && fs.existsSync(data.meta.path));
}

export function formatSessionRow(m: SessionMeta): string {
  const dur = formatDur(m.durationSec);
  const audio = m.hasAudio ? "audio" : "text";
  const when = (m.updatedAt || m.createdAt || "").replace("T", " ").slice(0, 16);
  const id = m.id.length > 18 ? m.id.slice(0, 16) + "…" : m.id;
  return `${id.padEnd(20)}  ${when.padEnd(18)}  ${String(m.segmentCount).padStart(4)} segs  ${dur.padStart(8)}  ${audio.padEnd(5)}  ${m.name}`;
}

function formatDur(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

export function segmentDisplay(s: SessionSegment): string {
  return (s.corrected || s.text || "").trim();
}

/** Persist AI summary into meta + summary.md under the session dir. */
export function saveSessionSummary(dir: string, summary: string): void {
  const text = summary.trim();
  if (!text || !fs.existsSync(dir)) return;
  fs.writeFileSync(path.join(dir, "summary.md"), text + "\n", "utf8");
  const meta = readMetaFile(dir);
  if (meta) {
    meta.summary = text;
    meta.summaryAt = new Date().toISOString();
    meta.updatedAt = meta.summaryAt;
    writeMeta(dir, meta);
  }
}

export function loadSessionSummary(dir: string): string | undefined {
  const f = path.join(dir, "summary.md");
  if (fs.existsSync(f)) {
    try {
      return fs.readFileSync(f, "utf8").trim();
    } catch {
      /* ignore */
    }
  }
  const meta = readMetaFile(dir);
  return meta?.summary?.trim() || undefined;
}

/** Rewrite transcript.jsonl from in-memory segments (e.g. after batch translate). */
export function rewriteSessionTranscript(
  dir: string,
  segments: SessionSegment[],
): void {
  const tf = path.join(dir, "transcript.jsonl");
  const body = segments.map((s) => JSON.stringify(s) + "\n").join("");
  fs.writeFileSync(tf, body, "utf8");
  const meta = readMetaFile(dir);
  if (meta) {
    meta.segmentCount = segments.length;
    meta.updatedAt = new Date().toISOString();
    let maxEnd = 0;
    for (const s of segments) {
      if (s.end > maxEnd) maxEnd = s.end;
    }
    meta.durationSec = Math.max(meta.durationSec, maxEnd);
    writeMeta(dir, meta);
  }
}

/** Rename a speaker display name in session (speakers.json). */
export function renameSessionSpeaker(
  data: SessionData,
  spk: number,
  displayName: string,
): boolean {
  const name = displayName.trim();
  if (!name || !Number.isFinite(spk)) return false;
  let hit = data.speakers.find((x) => x.spk === spk || x.id === `spk_${spk}`);
  if (!hit) {
    hit = { id: `spk_${spk}`, displayName: name, spk };
    data.speakers.push(hit);
  } else {
    hit.displayName = name;
  }
  data.meta.speakerCount = data.speakers.length;
  data.meta.updatedAt = new Date().toISOString();
  if (!data.meta.builtin && data.meta.path && data.meta.path !== "(builtin)") {
    const dir = data.meta.path;
    try {
      fs.writeFileSync(
        path.join(dir, "speakers.json"),
        JSON.stringify(data.speakers, null, 2) + "\n",
        "utf8",
      );
    } catch {
      return false;
    }
    const meta = readMetaFile(dir);
    if (meta) {
      meta.speakerCount = data.speakers.length;
      meta.updatedAt = data.meta.updatedAt;
      writeMeta(dir, meta);
    }
  }
  return true;
}

/**
 * Merge speaker `fromSpk` into `toSpk` in memory + on disk.
 * Returns number of segments reassigned, or -1 on invalid input.
 */
export function mergeSessionSpeakers(
  data: SessionData,
  fromSpk: number,
  toSpk: number,
): number {
  if (fromSpk === toSpk) return -1;
  if (!Number.isFinite(fromSpk) || !Number.isFinite(toSpk)) return -1;

  let n = 0;
  for (const s of data.segments) {
    if (s.spk === fromSpk) {
      s.spk = toSpk;
      s.speakerId = `spk_${toSpk}`;
      n += 1;
    } else if (s.speakerId === `spk_${fromSpk}`) {
      s.speakerId = `spk_${toSpk}`;
      if (s.spk === fromSpk) s.spk = toSpk;
      n += 1;
    }
  }

  // Keep target speaker entry; drop source
  const to =
    data.speakers.find((x) => x.spk === toSpk || x.id === `spk_${toSpk}`) ||
    null;
  data.speakers = data.speakers.filter(
    (x) => x.spk !== fromSpk && x.id !== `spk_${fromSpk}`,
  );
  if (!to && !data.speakers.some((x) => x.spk === toSpk)) {
    data.speakers.push({
      id: `spk_${toSpk}`,
      displayName: `Speaker ${toSpk}`,
      spk: toSpk,
    });
  }

  data.meta.speakerCount = data.speakers.length;
  data.meta.updatedAt = new Date().toISOString();

  if (!data.meta.builtin && data.meta.path && data.meta.path !== "(builtin)") {
    const dir = data.meta.path;
    rewriteSessionTranscript(dir, data.segments);
    try {
      fs.writeFileSync(
        path.join(dir, "speakers.json"),
        JSON.stringify(data.speakers, null, 2) + "\n",
        "utf8",
      );
    } catch {
      /* ignore */
    }
    const meta = readMetaFile(dir);
    if (meta) {
      meta.speakerCount = data.speakers.length;
      meta.updatedAt = data.meta.updatedAt;
      writeMeta(dir, meta);
    }
  }

  return n;
}

// re-export helper used by callers
export { displayText };
