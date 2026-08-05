/**
 * Global fixed-attendee speaker roster (voiceprint + display name).
 * Stored under ~/.config/baribari/speakers/roster.json
 *
 * Model-aware: embeddings are tagged with the extractor model id.
 * Never compare / seed embeddings from a different model or dimension.
 * Legacy v1 rosters (no model field) migrate safely as CAM++.
 */

import fs from "node:fs";
import path from "node:path";
import { configDir, ensureConfigDir } from "./paths.js";
import {
  isSpkEngine,
  LEGACY_SPK_ENGINE,
  spkEngineDefaults,
  type SpkEngine,
} from "./speaker-models.js";

export const SPEAKER_ROSTER_VERSION = 2;
/** Soft cap — keeps roster small and matching fast. */
export const MAX_GLOBAL_SPEAKERS = 48;

export interface GlobalSpeaker {
  /** Stable id, e.g. gs_m5abc_x1 */
  id: string;
  displayName: string;
  /**
   * Embedding model that produced these vectors.
   * Missing on disk → treated as CAM++ after migration.
   */
  model: SpkEngine;
  /** Primary L2-normalized embedding (first template). */
  embedding: number[];
  /** Representative template bank (includes primary). */
  embeddings: number[][];
  /** Enrollment / update weight. */
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

function normalizeTemplates(
  primary: number[] | undefined,
  extras: unknown,
  expectedDim: number,
  maxTemplates: number,
): number[][] {
  const out: number[][] = [];
  const push = (raw: unknown) => {
    if (!Array.isArray(raw) || raw.length < 8) return;
    if (expectedDim > 0 && raw.length !== expectedDim) return;
    out.push(raw.map((x) => Number(x) || 0));
  };
  if (Array.isArray(extras)) {
    for (const e of extras) push(e);
  }
  if (!out.length && primary) push(primary);
  return out.slice(0, maxTemplates);
}

function parseSpeaker(raw: unknown): GlobalSpeaker | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  if (typeof s.id !== "string" || typeof s.displayName !== "string") return null;

  const model: SpkEngine = isSpkEngine(s.model) ? s.model : LEGACY_SPK_ENGINE;
  const defaults = spkEngineDefaults(model);
  const templates = normalizeTemplates(
    Array.isArray(s.embedding) ? (s.embedding as number[]) : undefined,
    s.embeddings,
    defaults.dim,
    defaults.maxTemplates,
  );
  if (!templates.length) return null;

  return {
    id: s.id,
    displayName: String(s.displayName).trim() || s.id,
    model,
    embedding: templates[0]!,
    embeddings: templates,
    count: Math.max(1, Number(s.count) || 1),
    createdAt:
      typeof s.createdAt === "string" ? s.createdAt : new Date().toISOString(),
    updatedAt:
      typeof s.updatedAt === "string"
        ? s.updatedAt
        : typeof s.createdAt === "string"
          ? s.createdAt
          : new Date().toISOString(),
  };
}

/**
 * Load roster and migrate legacy v1 (no model) → CAM++.
 * Does not delete user data; writes migration back when version/model missing.
 */
export function loadSpeakerRoster(): SpeakerRoster {
  const f = speakerRosterPath();
  if (!fs.existsSync(f)) return emptyRoster();
  try {
    const raw = JSON.parse(fs.readFileSync(f, "utf8")) as Record<
      string,
      unknown
    >;
    if (!raw || !Array.isArray(raw.speakers)) return emptyRoster();
    const speakers: GlobalSpeaker[] = [];
    for (const item of raw.speakers) {
      const sp = parseSpeaker(item);
      if (sp) speakers.push(sp);
    }
    const version = Number(raw.version) || 1;
    const roster: SpeakerRoster = {
      version: SPEAKER_ROSTER_VERSION,
      speakers,
    };
    // Persist migration when legacy file lacked model/version 2
    const needsMigrate =
      version < SPEAKER_ROSTER_VERSION ||
      raw.speakers.some(
        (s) => s && typeof s === "object" && !isSpkEngine((s as { model?: unknown }).model),
      );
    if (needsMigrate && speakers.length) {
      try {
        saveSpeakerRoster(roster);
      } catch {
        /* ignore migrate write errors */
      }
    }
    return roster;
  } catch {
    return emptyRoster();
  }
}

/** Speakers whose embeddings match the active extractor model. */
export function speakersForModel(
  roster: SpeakerRoster,
  model: SpkEngine,
): GlobalSpeaker[] {
  const dim = spkEngineDefaults(model).dim;
  return roster.speakers.filter((s) => {
    if (s.model !== model) return false;
    if (dim > 0 && s.embedding.length !== dim) return false;
    return true;
  });
}

export function saveSpeakerRoster(roster: SpeakerRoster): void {
  ensureSpeakersDir();
  // Preserve all models; cap total entries
  let speakers = roster.speakers.slice();
  if (speakers.length > MAX_GLOBAL_SPEAKERS) {
    speakers = [...speakers]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, MAX_GLOBAL_SPEAKERS);
  }
  const out: SpeakerRoster = {
    version: SPEAKER_ROSTER_VERSION,
    speakers: speakers.map((s) => ({
      id: s.id,
      displayName: s.displayName,
      model: s.model,
      embedding: s.embedding,
      embeddings: s.embeddings?.length ? s.embeddings : [s.embedding],
      count: s.count,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    })),
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
 * Upsert by id, or by displayName (case-insensitive) within the same model.
 * Never overwrites a different model's templates.
 */
export function upsertGlobalSpeaker(input: {
  id?: string;
  displayName: string;
  embedding: number[] | Float32Array;
  embeddings?: Array<number[] | Float32Array>;
  count?: number;
  model: SpkEngine;
}): GlobalSpeaker {
  const name = input.displayName.trim();
  if (!name) throw new Error("displayName required");
  const model = input.model;
  const defaults = spkEngineDefaults(model);
  const templates = normalizeTemplates(
    Array.from(input.embedding),
    input.embeddings?.map((e) => Array.from(e)),
    defaults.dim,
    defaults.maxTemplates,
  );
  if (!templates.length) throw new Error("embedding too short or wrong dim");

  const roster = loadSpeakerRoster();
  const now = new Date().toISOString();
  let hit =
    (input.id &&
      roster.speakers.find((s) => s.id === input.id && s.model === model)) ||
    roster.speakers.find(
      (s) =>
        s.model === model &&
        s.displayName.toLowerCase() === name.toLowerCase(),
    );

  if (hit) {
    hit.displayName = name;
    hit.model = model;
    hit.embedding = templates[0]!;
    hit.embeddings = templates;
    hit.count = Math.max(1, input.count ?? hit.count + 1);
    hit.updatedAt = now;
  } else {
    if (roster.speakers.length >= MAX_GLOBAL_SPEAKERS) {
      roster.speakers.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
      roster.speakers.shift();
    }
    hit = {
      id: input.id || generateGlobalSpeakerId(),
      displayName: name,
      model,
      embedding: templates[0]!,
      embeddings: templates,
      count: Math.max(1, input.count ?? 1),
      createdAt: now,
      updatedAt: now,
    };
    roster.speakers.push(hit);
  }
  saveSpeakerRoster(roster);
  return hit;
}

/** Rename only (keep embeddings / model). */
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

/** Merge tracker-exported template banks back into roster (by global id + model). */
export function mergeGlobalSpeakerUpdates(
  updates: Array<{
    id: string;
    displayName: string;
    embedding: number[] | Float32Array;
    embeddings?: Array<number[] | Float32Array>;
    count: number;
    model: SpkEngine;
  }>,
): void {
  if (!updates.length) return;
  const roster = loadSpeakerRoster();
  const now = new Date().toISOString();
  let dirty = false;
  for (const u of updates) {
    const hit = roster.speakers.find(
      (s) => s.id === u.id && s.model === u.model,
    );
    if (!hit) continue;
    const defaults = spkEngineDefaults(u.model);
    const templates = normalizeTemplates(
      Array.from(u.embedding),
      u.embeddings?.map((e) => Array.from(e)),
      defaults.dim,
      defaults.maxTemplates,
    );
    if (!templates.length) continue;
    hit.displayName = u.displayName.trim() || hit.displayName;
    hit.embedding = templates[0]!;
    hit.embeddings = templates;
    hit.count = Math.max(hit.count, u.count);
    hit.updatedAt = now;
    dirty = true;
  }
  if (dirty) saveSpeakerRoster(roster);
}
