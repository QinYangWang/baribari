/**
 * Unit tests for Rezi TUI pure logic (no real terminal).
 */
import assert from "node:assert/strict";
import {
  createInitialState,
  decideLayout,
  mapKey,
  normalizeKeyName,
  parseTuiBackend,
  reduce,
  resolveTuiBackend,
  tryCommitMeetingName,
} from "../src/tui-rezi/index.js";
import type { ConfigSnapshot, LiveUiState } from "../src/tui-rezi/types.js";
import { moveFocusInKeys } from "../src/tui-rezi/reducer.js";

function baseConfig(over: Partial<ConfigSnapshot> = {}): ConfigSnapshot {
  return {
    lang: "auto",
    asrEngine: "sensevoice",
    uiLang: "en",
    source: "mic",
    noSpk: false,
    spkEngine: "campplus",
    spkThreshold: 0.55,
    recordDir: "./recordings",
    recording: false,
    paused: false,
    aiEnabled: false,
    aiCorrect: true,
    aiTranslateTo: "",
    aiBaseUrl: "",
    aiModel: "",
    aiHasKey: false,
    aiProviderLabel: "Custom",
    shareEnabled: false,
    sharePort: 8787,
    shareHost: "0.0.0.0",
    vadThreshold: 0.5,
    vadMinSpeech: 0.4,
    vadSilence: 0.6,
    vadMaxSpeech: 30,
    vadWindow: 512,
    vadPresetId: "balanced",
    deviceName: "mic",
    ...over,
  };
}

function fresh(over: Partial<LiveUiState> = {}): LiveUiState {
  return {
    ...createInitialState({
      sessionName: "Test meeting",
      sessionId: "s1",
      cols: 160,
      rows: 40,
      config: baseConfig(),
    }),
    ...over,
  };
}

function testLayout() {
  assert.equal(decideLayout(160, 40).mode, "wide");
  assert.equal(decideLayout(160, 40).showSpeakers, true);
  assert.equal(decideLayout(160, 40).showInspector, true);

  assert.equal(decideLayout(110, 30).mode, "medium");
  assert.equal(decideLayout(110, 30).showSpeakers, false);
  assert.equal(decideLayout(110, 30).speakersAsPanel, true);
  assert.equal(decideLayout(110, 30).showInspector, true);

  assert.equal(decideLayout(80, 24).mode, "narrow");
  assert.equal(decideLayout(80, 24).showInspector, false);
  assert.equal(decideLayout(80, 24).usable, true);

  const tiny = decideLayout(50, 16);
  assert.equal(tiny.mode, "tiny");
  assert.equal(tiny.usable, true);

  const blocked = decideLayout(20, 8);
  assert.equal(blocked.tooSmall, true);
  assert.equal(blocked.usable, false);
}

function testFollowLive() {
  let s = fresh({ followLive: true });
  s = reduce(s, {
    type: "APPLY_SEGMENT",
    segment: {
      id: "a",
      speakerId: null,
      startedAtMs: 0,
      originalText: "hello",
      isFinal: true,
      isActive: true,
      wallMs: Date.now(),
    },
  });
  assert.equal(s.selectedSegmentId, "a");
  assert.equal(s.unseenLiveCount, 0);

  s = reduce(s, { type: "SCROLL_TRANSCRIPT", delta: -3 });
  assert.equal(s.followLive, false);

  s = reduce(s, {
    type: "APPLY_SEGMENT",
    segment: {
      id: "b",
      speakerId: null,
      startedAtMs: 1,
      originalText: "world",
      isFinal: true,
      isActive: true,
      wallMs: Date.now(),
    },
  });
  assert.equal(s.followLive, false);
  assert.equal(s.unseenLiveCount, 1);
  assert.equal(s.selectedSegmentId, "a");

  s = reduce(s, { type: "RETURN_TO_LIVE" });
  assert.equal(s.followLive, true);
  assert.equal(s.unseenLiveCount, 0);
  assert.equal(s.selectedSegmentId, "b");
}

function testSelection() {
  let s = fresh();
  s = reduce(s, {
    type: "APPLY_SEGMENT",
    segment: {
      id: "1",
      speakerId: null,
      startedAtMs: 0,
      originalText: "a",
      isFinal: true,
      isActive: true,
      wallMs: 1,
    },
  });
  s = reduce(s, {
    type: "APPLY_SEGMENT",
    segment: {
      id: "2",
      speakerId: null,
      startedAtMs: 1,
      originalText: "b",
      isFinal: true,
      isActive: true,
      wallMs: 2,
    },
  });
  s = reduce(s, { type: "MOVE_SEGMENT_SEL", delta: -1 });
  assert.equal(s.selectedSegmentId, "1");
  assert.equal(s.followLive, false);
  s = reduce(s, { type: "MOVE_SEGMENT_SEL", delta: 1 });
  assert.equal(s.selectedSegmentId, "2");
  assert.equal(s.followLive, true);
}

function testMeetingNameEdit() {
  let s = fresh({ sessionName: "Old" });
  s = reduce(s, {
    type: "BEGIN_MEETING_NAME_EDIT",
    returnFocus: "transcript",
  });
  assert.ok(s.meetingNameEdit);
  assert.equal(s.meetingNameEdit!.draft, "Old");

  // cancel
  s = reduce(s, { type: "UPDATE_MEETING_NAME_DRAFT", draft: "Nope" });
  s = reduce(s, { type: "CANCEL_MEETING_NAME_EDIT" });
  assert.equal(s.meetingNameEdit, null);
  assert.equal(s.sessionName, "Old");
  assert.equal(s.focus, "transcript");

  // empty save
  s = reduce(s, {
    type: "BEGIN_MEETING_NAME_EDIT",
    returnFocus: "actions",
  });
  s = reduce(s, { type: "UPDATE_MEETING_NAME_DRAFT", draft: "   " });
  const empty = tryCommitMeetingName(s, "empty!");
  assert.equal(empty.committed, null);
  assert.equal(empty.state.meetingNameEdit?.error, "empty!");

  // good save
  s = reduce(s, { type: "UPDATE_MEETING_NAME_DRAFT", draft: " New name " });
  const ok = tryCommitMeetingName(s, "empty!");
  assert.equal(ok.committed, "New name");
  assert.equal(ok.state.sessionName, "New name");
  assert.equal(ok.state.meetingNameEdit, null);
  assert.equal(ok.state.focus, "actions");
}

function testKeyMapping() {
  assert.equal(normalizeKeyName("\x1b[A"), "up");
  assert.equal(normalizeKeyName("\x03"), "ctrl+c");
  assert.equal(normalizeKeyName(" "), "space");

  let s = fresh();
  let r = mapKey(s, "s");
  assert.ok(r.actions.some((a) => a.type === "OPEN_SETTINGS"));

  r = mapKey(s, "p");
  assert.ok(r.effects.some((e) => e.type === "toggle-pause"));

  // while editing name, single-letter globals must not fire
  s = reduce(s, {
    type: "BEGIN_MEETING_NAME_EDIT",
    returnFocus: "transcript",
  });
  r = mapKey(s, "q");
  assert.equal(r.effects.length, 0);
  assert.ok(r.actions.some((a) => a.type === "UPDATE_MEETING_NAME_DRAFT"));

  r = mapKey(s, "escape");
  assert.ok(r.actions.some((a) => a.type === "CANCEL_MEETING_NAME_EDIT"));

  // quit with content asks confirm
  s = fresh();
  s = reduce(s, {
    type: "APPLY_SEGMENT",
    segment: {
      id: "x",
      speakerId: null,
      startedAtMs: 0,
      originalText: "hi",
      isFinal: true,
      isActive: true,
      wallMs: 1,
    },
  });
  r = mapKey(s, "q");
  assert.ok(
    r.actions.some(
      (a) => a.type === "SHOW_CONFIRM" && a.confirm.kind === "quit",
    ),
  );
}

function testBackendSelect() {
  assert.equal(parseTuiBackend("rezi"), "rezi");
  assert.equal(parseTuiBackend("LEGACY"), "legacy");
  assert.equal(parseTuiBackend("nope"), null);
  assert.equal(resolveTuiBackend({ env: {} }), "legacy");
  assert.throws(
    () => resolveTuiBackend({ cli: "unknown", env: {} }),
    /Unsupported TUI backend/,
  );
  assert.equal(
    resolveTuiBackend({ cli: "rezi", env: { BARIBARI_TUI: "legacy" } }),
    "rezi",
  );
  assert.equal(
    resolveTuiBackend({ env: { BARIBARI_TUI: "rezi" } }),
    "rezi",
  );
}

function testSettingsFocusKeys() {
  const keys = ["a", "b", "c"];
  assert.equal(moveFocusInKeys(keys, null, 1), "a");
  assert.equal(moveFocusInKeys(keys, "a", 1), "b");
  assert.equal(moveFocusInKeys(keys, "c", 1), "c");
  assert.equal(moveFocusInKeys(keys, "b", -1), "a");
}

function main() {
  testLayout();
  testFollowLive();
  testSelection();
  testMeetingNameEdit();
  testKeyMapping();
  testBackendSelect();
  testSettingsFocusKeys();
  console.log("test-tui-rezi: ok");
}

main();
