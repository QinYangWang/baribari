/**
 * OpenAI-compatible chat API for ASR correction + translation.
 * Works with OpenAI, Azure OpenAI-compatible gateways, Ollama (/v1), DeepSeek, etc.
 */

import type { AiConfig, Segment, TranslateLang } from "./types.js";
import {
  AI_PROVIDER_PRESETS,
  matchAiProvider,
  type AiProviderPreset,
} from "./types.js";
import { t } from "./i18n/index.js";

export { AI_PROVIDER_PRESETS, matchAiProvider };
export type { AiProviderPreset };

/** Cycle built-in provider presets; applies baseUrl + default model. */
export function cycleAiProvider(
  cfg: AiConfig,
  dir: 1 | -1,
): AiConfig {
  const cur = matchAiProvider(cfg.baseUrl);
  const list = AI_PROVIDER_PRESETS;
  const i = Math.max(0, list.findIndex((p) => p.id === cur.id));
  const next = list[(i + dir + list.length) % list.length]!;
  if (next.id === "custom") {
    // Keep current URL/model — user edits manually
    return { ...cfg, enabled: true };
  }
  return {
    ...cfg,
    enabled: true,
    baseUrl: next.baseUrl.replace(/\/+$/, ""),
    model: next.model || cfg.model,
  };
}

export function aiProviderLabel(cfg: AiConfig): string {
  const p = matchAiProvider(cfg.baseUrl);
  const key = `settings.provider.${p.id}`;
  const label = t(key);
  return label === key ? p.name : label;
}

const LANG_NAME: Record<string, string> = {
  zh: "Simplified Chinese",
  en: "English",
  ja: "Japanese",
  ko: "Korean",
  yue: "Cantonese",
  fr: "French",
  de: "German",
  es: "Spanish",
  ru: "Russian",
  pt: "Portuguese",
  vi: "Vietnamese",
  th: "Thai",
  id: "Indonesian",
};

export function resolveApiKey(cfg: AiConfig): string {
  return (
    cfg.apiKey?.trim() ||
    process.env.BARIBARI_AI_KEY?.trim() ||
    process.env.OPENAI_API_KEY?.trim() ||
    ""
  );
}

/** Has API key + endpoint + model (for batch translate / summary). */
export function aiConfigured(cfg: AiConfig): boolean {
  return Boolean(resolveApiKey(cfg) && cfg.baseUrl?.trim() && cfg.model?.trim());
}

export function aiActive(cfg: AiConfig): boolean {
  if (!cfg.enabled) return false;
  if (!cfg.correct && !cfg.translateTo) return false;
  return aiConfigured(cfg);
}

function systemPrompt(cfg: AiConfig): string {
  const parts: string[] = [
    "You post-process real-time speech recognition (ASR) output from meetings.",
    "Return ONLY valid JSON, no markdown fences.",
    "Never put translated text into the corrected field.",
    "corrected and translation must be different fields with different roles.",
  ];
  if (cfg.correct) {
    parts.push(
      'Field "corrected": fix ASR errors (homophones, punctuation, casing). Keep the SAME language as the input. Keep meaning and speaker intent. Do not invent content. Do not translate.',
    );
  } else {
    parts.push('Field "corrected": always return an empty string.');
  }
  if (cfg.translateTo) {
    const name = LANG_NAME[cfg.translateTo] || cfg.translateTo;
    parts.push(
      `Field "translation": translate the meaning into ${name} only. Do not copy ASR text unless the source is already ${name}.`,
    );
  } else {
    parts.push('Field "translation": always return an empty string.');
  }
  parts.push(
    'Schema: {"corrected":"string","translation":"string"}. Use empty string for unused fields.',
  );
  return parts.join(" ");
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

async function chatJson(
  cfg: AiConfig,
  messages: ChatMessage[],
  signal?: AbortSignal,
): Promise<{ corrected?: string; translation?: string }> {
  const key = resolveApiKey(cfg);
  const base = cfg.baseUrl.replace(/\/+$/, "");
  const url = `${base}/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      temperature: 0.2,
      messages,
      response_format: { type: "json_object" },
    }),
    signal,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`AI HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content ?? "{}";
  const parsed = parseModelJson(content);
  if (parsed) return parsed;
  // Non-JSON: do not guess — avoid treating translation as correction
  return { corrected: "", translation: "" };
}

function parseModelJson(
  content: string,
): { corrected?: string; translation?: string } | null {
  const raw = content.trim();
  if (!raw) return null;
  const tryParse = (s: string) => {
    try {
      return JSON.parse(s) as { corrected?: string; translation?: string };
    } catch {
      return null;
    }
  };
  let obj = tryParse(raw);
  if (obj) return obj;
  // strip markdown fences
  const fenced = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  obj = tryParse(fenced);
  if (obj) return obj;
  // extract first {...}
  const m = raw.match(/\{[\s\S]*\}/);
  if (m) obj = tryParse(m[0]);
  return obj;
}

function hasKana(text: string): boolean {
  return /[\u3040-\u30ff]/u.test(text);
}

function hasHan(text: string): boolean {
  return /\p{Script=Han}/u.test(text);
}

function hasHangul(text: string): boolean {
  return /\p{Script=Hangul}/u.test(text);
}

function hasLatin(text: string): boolean {
  return /\p{Script=Latin}/u.test(text);
}

function hasCyrillic(text: string): boolean {
  return /\p{Script=Cyrillic}/u.test(text);
}

function hasThai(text: string): boolean {
  return /\p{Script=Thai}/u.test(text);
}

/**
 * Catch a common schema failure: the provider writes the requested translation
 * into `corrected`. Only use strong script evidence so legitimate corrections
 * in the source language are never discarded on a guess.
 */
export function correctedLooksLikeTranslation(
  raw: string,
  corrected: string,
  target: TranslateLang,
): boolean {
  if (!target || !corrected || corrected === raw) return false;
  if (target === "zh" || target === "yue") {
    return hasKana(raw) && !hasKana(corrected) && hasHan(corrected);
  }
  if (target === "ja") {
    return !hasKana(raw) && !hasHan(raw) && (hasKana(corrected) || hasHan(corrected));
  }
  if (target === "ko") {
    return !hasHangul(raw) && hasHangul(corrected);
  }
  if (target === "ru") {
    return !hasCyrillic(raw) && hasCyrillic(corrected);
  }
  if (target === "th") {
    return !hasThai(raw) && hasThai(corrected);
  }
  if (["en", "fr", "de", "es", "pt", "vi", "id"].includes(target)) {
    return (hasKana(raw) || hasHan(raw) || hasHangul(raw)) && hasLatin(corrected) &&
      !hasKana(corrected) && !hasHangul(corrected);
  }
  return false;
}

/**
 * Enhance one segment. Mutates and returns the same object.
 * No-op when AI disabled / no key / empty text.
 */
export async function enhanceSegment(
  seg: Segment,
  cfg: AiConfig,
  signal?: AbortSignal,
): Promise<Segment> {
  if (!aiActive(cfg)) return seg;
  const raw = (seg.text || "").trim();
  if (!raw) return seg;

  const user = JSON.stringify({
    text: raw,
    speaker: seg.spk,
    needCorrect: cfg.correct,
    translateTo: cfg.translateTo || null,
  });

  try {
    const out = await chatJson(
      cfg,
      [
        { role: "system", content: systemPrompt(cfg) },
        { role: "user", content: user },
      ],
      signal,
    );
    applyAiOutput(seg, cfg, raw, out);
  } catch (e) {
    // leave raw text; caller may surface status
    throw e;
  }
  return seg;
}

/** Apply model output with guards so translation never overwrites source text. */
function applyAiOutput(
  seg: Segment,
  cfg: AiConfig,
  raw: string,
  out: { corrected?: string; translation?: string },
): void {
  let corr = (out.corrected || "").trim();
  let tr = (out.translation || "").trim();

  if (cfg.translateTo && corr && correctedLooksLikeTranslation(raw, corr, cfg.translateTo)) {
    if (!tr) tr = corr;
    corr = "";
  }

  // Translate-only: model sometimes fills corrected instead of translation
  if (cfg.translateTo && !tr && corr && corr !== raw && !cfg.correct) {
    tr = corr;
    corr = "";
  }

  // corrected must stay source-language; if it equals translation, drop it
  if (corr && tr && corr === tr && corr !== raw) {
    corr = "";
  }

  // identical to raw is useless noise
  if (corr && corr === raw) corr = "";

  // While translation is enabled, keep the source line byte-for-byte stable.
  // A provider can violate the JSON schema in ways that are impossible to
  // distinguish for same-script language pairs (for example en → fr).
  if (cfg.correct && corr && (!cfg.translateTo || tr)) {
    seg.corrected = corr;
  } else {
    delete seg.corrected;
  }

  if (cfg.translateTo && tr) {
    // skip if translation is just a copy of source when target differs (best-effort)
    seg.translation = tr;
  } else {
    delete seg.translation;
  }
}

/** Async queue: process segments serially without blocking capture. */
export function createAiPipeline(
  getCfg: () => AiConfig,
  onEnhanced: (seg: Segment) => void,
  onError?: (msg: string) => void,
  onBusy?: (busy: boolean) => void,
): {
  push: (seg: Segment) => void;
  close: () => void;
} {
  const q: Segment[] = [];
  let pumping = false;
  let closed = false;
  let abort: AbortController | null = null;
  let seq = 0;
  let pendingCount = 0;
  /** Generation per segment id — stale enhance results are dropped. */
  const genById = new Map<string, number>();
  let activeId: string | null = null;
  let activeGen = 0;

  const notifyBusy = () => {
    onBusy?.(pendingCount > 0 || pumping);
  };

  const pump = async () => {
    if (pumping || closed) return;
    pumping = true;
    notifyBusy();
    while (q.length && !closed) {
      const seg = q.shift()!;
      const id = seg.id || "";
      const gen = id ? (genById.get(id) ?? 0) : 0;
      // Superseded while queued (turn reopened with longer text)
      if (id && genById.get(id) !== gen) {
        pendingCount = Math.max(0, pendingCount - 1);
        notifyBusy();
        continue;
      }
      const cfg = getCfg();
      if (!aiActive(cfg)) {
        seg.pending = false;
        pendingCount = Math.max(0, pendingCount - 1);
        onEnhanced(seg);
        notifyBusy();
        continue;
      }
      abort = new AbortController();
      activeId = id || null;
      activeGen = gen;
      try {
        await enhanceSegment(seg, cfg, abort.signal);
        seg.pending = false;
        pendingCount = Math.max(0, pendingCount - 1);
        // Drop if a newer revision of the same turn was queued
        if (
          !closed &&
          (!id || genById.get(id) === gen)
        ) {
          onEnhanced(seg);
        }
      } catch (e) {
        if (!closed) {
          const aborted =
            (e instanceof Error && e.name === "AbortError") ||
            (typeof e === "object" &&
              e &&
              "name" in e &&
              (e as { name: string }).name === "AbortError");
          if (!aborted) {
            onError?.(e instanceof Error ? e.message : String(e));
          }
          seg.pending = false;
          pendingCount = Math.max(0, pendingCount - 1);
          if (!aborted && (!id || genById.get(id) === gen)) {
            onEnhanced(seg); // still show raw
          }
        }
      }
      abort = null;
      activeId = null;
      notifyBusy();
    }
    pumping = false;
    notifyBusy();
  };

  return {
    push(seg) {
      if (closed) return;
      if (!seg.id) seg.id = `seg_${Date.now()}_${++seq}`;
      const id = seg.id;

      // Same turn re-committed with more text: drop older queued jobs
      const prev = q.filter((s) => s.id === id);
      if (prev.length) {
        for (let i = q.length - 1; i >= 0; i--) {
          if (q[i]!.id === id) {
            q.splice(i, 1);
            pendingCount = Math.max(0, pendingCount - 1);
          }
        }
      }
      // Abort in-flight enhance for this id (turn grew after early commit)
      if (activeId === id && abort) {
        try {
          abort.abort();
        } catch {
          /* ignore */
        }
      }
      genById.set(id, (genById.get(id) ?? 0) + 1);

      // bound queue
      if (q.length > 40) {
        const dropped = q.splice(0, q.length - 30);
        pendingCount = Math.max(0, pendingCount - dropped.length);
      }

      const cfg = getCfg();
      if (aiActive(cfg)) {
        // Immediate provisional row so UI can show loading
        seg.pending = true;
        pendingCount += 1;
        onEnhanced({ ...seg, pending: true });
        notifyBusy();
      }
      q.push(seg);
      void pump();
    },
    close() {
      closed = true;
      q.length = 0;
      pendingCount = 0;
      pumping = false;
      genById.clear();
      notifyBusy();
      try {
        abort?.abort();
      } catch {
        /* ignore */
      }
    },
  };
}

/**
 * Translate segments that lack translation, using cfg.translateTo.
 * Mutates segments in place; returns count translated.
 */
export async function translateMissingSegments(
  segments: Array<{
    text: string;
    corrected?: string;
    translation?: string;
    spk?: number | null;
  }>,
  cfg: AiConfig,
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<number> {
  if (!aiConfigured(cfg) || !cfg.translateTo) {
    throw new Error(
      cfg.translateTo
        ? t("resume.ai.notConfigured")
        : t("resume.ai.noTranslateLang"),
    );
  }
  const workCfg: AiConfig = {
    ...cfg,
    enabled: true,
    correct: false,
    translateTo: cfg.translateTo,
  };
  const pending = segments
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => !(s.translation || "").trim() && (s.corrected || s.text || "").trim());
  let done = 0;
  for (const { s } of pending) {
    if (signal?.aborted) break;
    const seg: Segment = {
      start: 0,
      end: 0,
      wall: new Date(),
      spk: s.spk ?? null,
      text: (s.corrected || s.text || "").trim(),
    };
    await enhanceSegment(seg, workCfg, signal);
    if (seg.translation?.trim()) {
      s.translation = seg.translation.trim();
      done += 1;
    }
    onProgress?.(done, pending.length);
  }
  return done;
}

/** Meeting notes / summary from transcript lines. */
export async function summarizeMeeting(
  lines: Array<{ speaker?: string; text: string; translation?: string }>,
  cfg: AiConfig,
  opts?: { lang?: string; signal?: AbortSignal },
): Promise<string> {
  if (!aiConfigured(cfg)) {
    throw new Error(t("resume.ai.notConfigured"));
  }
  const langName =
    opts?.lang && LANG_NAME[opts.lang]
      ? LANG_NAME[opts.lang]
      : cfg.translateTo
        ? LANG_NAME[cfg.translateTo] || cfg.translateTo
        : "the same language as the majority of the transcript";

  const body = lines
    .map((l, i) => {
      const sp = l.speaker ? `[${l.speaker}] ` : "";
      const t0 = (l.text || "").trim();
      const tr = (l.translation || "").trim();
      return `${i + 1}. ${sp}${t0}${tr ? ` ‖ ${tr}` : ""}`;
    })
    .filter((l) => l.replace(/^\d+\.\s*/, "").trim())
    .join("\n");

  if (!body.trim()) throw new Error(t("resume.ai.noSummaryText"));

  // truncate very long meetings
  const clipped = body.length > 12000 ? body.slice(0, 12000) + "\n…" : body;

  const key = resolveApiKey(cfg);
  const base = cfg.baseUrl.replace(/\/+$/, "");
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content:
            `You are a meeting secretary. Write a clear structured summary in ${langName}. ` +
            "Use markdown with sections: 概述/Overview, 要点/Key points, 决议与待办/Decisions & action items, 风险/ Risks (if any). " +
            "Be faithful to the transcript; do not invent attendees or facts.",
        },
        {
          role: "user",
          content: `Meeting transcript:\n${clipped}`,
        },
      ],
    }),
    signal: opts?.signal,
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`AI HTTP ${res.status}: ${errBody.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = (data.choices?.[0]?.message?.content || "").trim();
  if (!content) throw new Error(t("resume.ai.emptySummary"));
  return content;
}

export function translateLangLabel(lang: TranslateLang): string {
  if (!lang) return t("common.off");
  return LANG_NAME[lang] || lang;
}

export const TRANSLATE_OPTIONS: TranslateLang[] = [
  "",
  "zh",
  "en",
  "ja",
  "ko",
  "yue",
  "fr",
  "de",
  "es",
  "ru",
  "vi",
];
