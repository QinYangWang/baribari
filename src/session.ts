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
  if (id === DEMO_SESSION_ID) {
    return path.join(sessionsRoot(), DEMO_SESSION_ID);
  }
  return path.join(sessionsRoot(), id);
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
  // upsert by id: if AI finalize rewrites same id, replace last matching line
  const row: SessionSegment = {
    id: seg.id || `seg_${Date.now()}`,
    start: seg.start,
    end: seg.end,
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
  let dir = idOrPath;
  if (!path.isAbsolute(dir) && !fs.existsSync(dir)) {
    dir = sessionDir(idOrPath);
  }
  // allow prefix match
  if (!fs.existsSync(dir)) {
    const all = listSessions().filter((s) => !s.builtin);
    const hit = all.find(
      (s) => s.id === idOrPath || s.id.startsWith(idOrPath) || s.name === idOrPath,
    );
    if (hit) dir = hit.path;
  }
  if (!fs.existsSync(dir)) return null;
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

export function deleteSession(id: string): boolean {
  if (id === DEMO_SESSION_ID || id === "demo") return false;
  const dir = sessionDir(id);
  if (!fs.existsSync(dir)) {
    // prefix
    const hit = listSessions().find(
      (s) => !s.builtin && (s.id === id || s.id.startsWith(id)),
    );
    if (!hit) return false;
    fs.rmSync(hit.path, { recursive: true, force: true });
    return true;
  }
  fs.rmSync(dir, { recursive: true, force: true });
  return true;
}

export function sessionAudioPath(dir: string): string {
  return path.join(dir, "audio.wav");
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

/** Live session writer attached to a running meeting. */
export function createSessionWriter(opts?: {
  name?: string;
  source?: string;
  lang?: string;
}): {
  id: string;
  dir: string;
  meta: SessionMeta;
  recordPath: string;
  onSegment: (seg: Segment, speakers?: SessionSpeaker[]) => void;
  setSpeakers: (speakers: SessionSpeaker[]) => void;
  close: () => SessionMeta | null;
} {
  const { id, dir, meta } = createSession(opts);
  const recordPath = sessionAudioPath(dir);
  return {
    id,
    dir,
    meta,
    recordPath,
    onSegment(seg, speakers) {
      if (seg.pending) return;
      appendSessionSegment(dir, seg, speakers);
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

// re-export helper used by callers
export { displayText };
