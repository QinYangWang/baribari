/**
 * OpenAI-compatible chat API for ASR correction + translation.
 * Works with OpenAI, Azure OpenAI-compatible gateways, Ollama (/v1), DeepSeek, etc.
 */

import type { AiConfig, Segment, TranslateLang } from "./types.js";
import { t } from "./i18n/index.js";

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

export function aiActive(cfg: AiConfig): boolean {
  if (!cfg.enabled) return false;
  if (!cfg.correct && !cfg.translateTo) return false;
  return Boolean(resolveApiKey(cfg) && cfg.baseUrl && cfg.model);
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

  if (cfg.correct && corr) {
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

  const notifyBusy = () => {
    onBusy?.(pendingCount > 0 || pumping);
  };

  const pump = async () => {
    if (pumping || closed) return;
    pumping = true;
    notifyBusy();
    while (q.length && !closed) {
      const seg = q.shift()!;
      const cfg = getCfg();
      if (!aiActive(cfg)) {
        seg.pending = false;
        pendingCount = Math.max(0, pendingCount - 1);
        onEnhanced(seg);
        notifyBusy();
        continue;
      }
      abort = new AbortController();
      try {
        await enhanceSegment(seg, cfg, abort.signal);
        seg.pending = false;
        pendingCount = Math.max(0, pendingCount - 1);
        if (!closed) onEnhanced(seg);
      } catch (e) {
        if (!closed) {
          onError?.(e instanceof Error ? e.message : String(e));
          seg.pending = false;
          pendingCount = Math.max(0, pendingCount - 1);
          onEnhanced(seg); // still show raw
        }
      }
      abort = null;
      notifyBusy();
    }
    pumping = false;
    notifyBusy();
  };

  return {
    push(seg) {
      if (closed) return;
      if (!seg.id) seg.id = `seg_${Date.now()}_${++seq}`;
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
      notifyBusy();
      try {
        abort?.abort();
      } catch {
        /* ignore */
      }
    },
  };
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
