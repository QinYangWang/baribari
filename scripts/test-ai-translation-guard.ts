import assert from "node:assert/strict";
import { enhanceSegment } from "../src/ai.js";
import type { AiConfig, Segment } from "../src/types.js";

const originalFetch = globalThis.fetch;
const cfg: AiConfig = {
  enabled: true,
  correct: true,
  translateTo: "zh",
  baseUrl: "https://example.invalid/v1",
  apiKey: "test",
  model: "test",
};

function segment(text: string): Segment {
  return { start: 0, end: 1, wall: new Date(0), spk: 1, text };
}

async function respond(payload: object): Promise<Segment> {
  globalThis.fetch = async () => new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify(payload) } }],
  }), { status: 200, headers: { "content-type": "application/json" } });
  return enhanceSegment(segment("これは日本語の原文です。"), cfg);
}

try {
  const misplaced = await respond({
    corrected: "这是中文译文。",
    translation: "",
  });
  assert.equal(misplaced.text, "これは日本語の原文です。");
  assert.equal(misplaced.corrected, undefined);
  assert.equal(misplaced.translation, "这是中文译文。");

  const valid = await respond({
    corrected: "これは日本語の原文です。",
    translation: "这是中文译文。",
  });
  assert.equal(valid.text, "これは日本語の原文です。");
  assert.equal(valid.corrected, undefined);
  assert.equal(valid.translation, "这是中文译文。");

  globalThis.fetch = async () => new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify({
      corrected: "This is a translated sentence.",
      translation: "",
    }) } }],
  }), { status: 200, headers: { "content-type": "application/json" } });
  const sameScript = await enhanceSegment(segment("This is the source sentence."), {
    ...cfg,
    translateTo: "fr",
  });
  assert.equal(sameScript.text, "This is the source sentence.");
  assert.equal(sameScript.corrected, undefined);

  console.log("AI translation guard: ok");
} finally {
  globalThis.fetch = originalFetch;
}
