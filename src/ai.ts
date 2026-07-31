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
  ];
  if (cfg.correct) {
    parts.push(
      'Field "corrected": fix ASR errors (homophones, punctuation, casing). Keep meaning and speaker intent. Keep original language. Do not invent content.',
    );
  }
  if (cfg.translateTo) {
    const name = LANG_NAME[cfg.translateTo] || cfg.translateTo;
    parts.push(
      `Field "translation": translate the corrected (or original) text into ${name}.`,
    );
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
  try {
    return JSON.parse(content) as {
      corrected?: string;
      translation?: string;
    };
  } catch {
    // model returned plain text — treat as correction only
    const t = content.trim();
    return { corrected: t, translation: "" };
  }
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
    if (cfg.correct && out.corrected?.trim()) {
      seg.corrected = out.corrected.trim();
    }
    if (cfg.translateTo && out.translation?.trim()) {
      seg.translation = out.translation.trim();
    }
  } catch (e) {
    // leave raw text; caller may surface status
    throw e;
  }
  return seg;
}

/** Async queue: process segments serially without blocking capture. */
export function createAiPipeline(
  getCfg: () => AiConfig,
  onEnhanced: (seg: Segment) => void,
  onError?: (msg: string) => void,
): {
  push: (seg: Segment) => void;
  close: () => void;
} {
  const q: Segment[] = [];
  let busy = false;
  let closed = false;
  let abort: AbortController | null = null;

  const pump = async () => {
    if (busy || closed) return;
    busy = true;
    while (q.length && !closed) {
      const seg = q.shift()!;
      const cfg = getCfg();
      if (!aiActive(cfg)) {
        onEnhanced(seg);
        continue;
      }
      abort = new AbortController();
      try {
        await enhanceSegment(seg, cfg, abort.signal);
        if (!closed) onEnhanced(seg);
      } catch (e) {
        if (!closed) {
          onError?.(e instanceof Error ? e.message : String(e));
          onEnhanced(seg); // still show raw
        }
      }
      abort = null;
    }
    busy = false;
  };

  return {
    push(seg) {
      if (closed) return;
      // bound queue
      if (q.length > 40) q.splice(0, q.length - 30);
      q.push(seg);
      void pump();
    },
    close() {
      closed = true;
      q.length = 0;
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
