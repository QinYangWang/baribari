/**
 * Global fixed-attendee speaker roster (voiceprint + display name).
 * Stored under ~/.config/baribari/speakers/roster.json
 *
 * Used to seed SherpaSpeakerTracker so the same people match across meetings.
 */

import fs from "node:fs";
import path from "node:path";
import { configDir, ensureConfigDir } from "./paths.js";

export const SPEAKER_ROSTER_VERSION = 1;
/** Soft cap — keeps roster small and matching fast. */
export const MAX_GLOBAL_SPEAKERS = 48;

export interface GlobalSpeaker {
  /** Stable id, e.g. gs_m5abc_x1 */
  id: string;
  displayName: string;
  /** L2-normalized embedding (CAM++ dim, typically 192). */
  embedding: number[];
  /** Enrollment / update weight (EMA count). */
  count: number;
  createdAt: string;
  updatedAt: string;
}

export interface SpeakerRoster {
  version: number;
  speakers: GlobalSpeaker[];
}

export function speakersDir(): string {
  return path.join(configDir(), "speakers");
}

export function speakerRosterPath(): string {
  return path.join(speakersDir(), "roster.json");
}

export function ensureSpeakersDir(): string {
  ensureConfigDir();
  const dir = speakersDir();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function emptyRoster(): SpeakerRoster {
  return { version: SPEAKER_ROSTER_VERSION, speakers: [] };
}

export function loadSpeakerRoster(): SpeakerRoster {
  const f = speakerRosterPath();
  if (!fs.existsSync(f)) return emptyRoster();
  try {
    const raw = JSON.parse(fs.readFileSync(f, "utf8")) as SpeakerRoster;
    if (!raw || !Array.isArray(raw.speakers)) return emptyRoster();
    const speakers = raw.speakers
      .filter(
        (s) =>
          s &&
          typeof s.id === "string" &&
          typeof s.displayName === "string" &&
          Array.isArray(s.embedding) &&
          s.embedding.length > 8,
      )
      .map((s) => ({
        id: s.id,
        displayName: String(s.displayName).trim() || s.id,
        embedding: s.embedding.map((x) => Number(x) || 0),
        count: Math.max(1, Number(s.count) || 1),
        createdAt: s.createdAt || new Date().toISOString(),
        updatedAt: s.updatedAt || s.createdAt || new Date().toISOString(),
      }));
    return { version: SPEAKER_ROSTER_VERSION, speakers };
  } catch {
    return emptyRoster();
  }
}

export function saveSpeakerRoster(roster: SpeakerRoster): void {
  ensureSpeakersDir();
  const speakers = roster.speakers.slice(0, MAX_GLOBAL_SPEAKERS);
  const out: SpeakerRoster = {
    version: SPEAKER_ROSTER_VERSION,
    speakers,
  };
  fs.writeFileSync(
    speakerRosterPath(),
    JSON.stringify(out, null, 2) + "\n",
    "utf8",
  );
}

function generateGlobalSpeakerId(): string {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return `gs_${t}_${r}`;
}

/**
 * Upsert by id, or by displayName (case-insensitive) if id missing.
 * Replaces embedding when provided.
 */
export function upsertGlobalSpeaker(input: {
  id?: string;
  displayName: string;
  embedding: number[] | Float32Array;
  count?: number;
}): GlobalSpeaker {
  const name = input.displayName.trim();
  if (!name) throw new Error("displayName required");
  const emb = Array.from(input.embedding);
  if (emb.length < 8) throw new Error("embedding too short");

  const roster = loadSpeakerRoster();
  const now = new Date().toISOString();
  let hit =
    (input.id && roster.speakers.find((s) => s.id === input.id)) ||
    roster.speakers.find(
      (s) => s.displayName.toLowerCase() === name.toLowerCase(),
    );

  if (hit) {
    hit.displayName = name;
    hit.embedding = emb;
    hit.count = Math.max(1, input.count ?? hit.count + 1);
    hit.updatedAt = now;
  } else {
    if (roster.speakers.length >= MAX_GLOBAL_SPEAKERS) {
      // drop oldest by updatedAt
      roster.speakers.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
      roster.speakers.shift();
    }
    hit = {
      id: input.id || generateGlobalSpeakerId(),
      displayName: name,
      embedding: emb,
      count: Math.max(1, input.count ?? 1),
      createdAt: now,
      updatedAt: now,
    };
    roster.speakers.push(hit);
  }
  saveSpeakerRoster(roster);
  return hit;
}

/** Rename only (keep embedding). */
export function renameGlobalSpeaker(
  id: string,
  displayName: string,
): GlobalSpeaker | null {
  const name = displayName.trim();
  if (!name) return null;
  const roster = loadSpeakerRoster();
  const hit = roster.speakers.find((s) => s.id === id);
  if (!hit) return null;
  hit.displayName = name;
  hit.updatedAt = new Date().toISOString();
  saveSpeakerRoster(roster);
  return hit;
}

export function removeGlobalSpeaker(id: string): boolean {
  const roster = loadSpeakerRoster();
  const n = roster.speakers.length;
  roster.speakers = roster.speakers.filter((s) => s.id !== id);
  if (roster.speakers.length === n) return false;
  saveSpeakerRoster(roster);
  return true;
}

/** Merge tracker-exported centroids back into roster (by global id). */
export function mergeGlobalSpeakerUpdates(
  updates: Array<{
    id: string;
    displayName: string;
    embedding: number[] | Float32Array;
    count: number;
  }>,
): void {
  if (!updates.length) return;
  const roster = loadSpeakerRoster();
  const now = new Date().toISOString();
  let dirty = false;
  for (const u of updates) {
    const hit = roster.speakers.find((s) => s.id === u.id);
    if (!hit) continue;
    hit.displayName = u.displayName.trim() || hit.displayName;
    hit.embedding = Array.from(u.embedding);
    hit.count = Math.max(hit.count, u.count);
    hit.updatedAt = now;
    dirty = true;
  }
  if (dirty) saveSpeakerRoster(roster);
}
