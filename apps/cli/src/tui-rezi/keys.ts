import type { UiAction, EffectIntent } from "./actions.js";
import type { LiveUiState } from "./types.js";
import { tryCommitMeetingName } from "./reducer.js";

export interface KeyMapResult {
  actions: UiAction[];
  effects: EffectIntent[];
}

function empty(): KeyMapResult {
  return { actions: [], effects: [] };
}

function acts(...actions: UiAction[]): KeyMapResult {
  return { actions, effects: [] };
}

function eff(...effects: EffectIntent[]): KeyMapResult {
  return { actions: [], effects };
}

function both(actions: UiAction[], effects: EffectIntent[]): KeyMapResult {
  return { actions, effects };
}

/** Map a logical key name to UI actions/effects (no terminal I/O). */
export function mapKey(
  state: LiveUiState,
  key: string,
  opts?: { emptyNameError?: string; settingsKeys?: readonly string[] },
): KeyMapResult {
  const emptyNameError = opts?.emptyNameError ?? "";

  // Confirm dialog traps input
  if (state.confirm) {
    if (key === "ctrl+c" || key === "ctrl+d") {
      return eff({ type: "quit" });
    }
    if (key === "y" || key === "enter") {
      return both(
        [{ type: "DISMISS_CONFIRM" }],
        [
          {
            type: "confirm-accepted",
            confirmId: state.confirm.id,
            kind: state.confirm.kind,
          },
        ],
      );
    }
    if (key === "n" || key === "escape") {
      return both(
        [{ type: "DISMISS_CONFIRM" }],
        [
          {
            type: "confirm-cancelled",
            confirmId: state.confirm.id,
            kind: state.confirm.kind,
          },
        ],
      );
    }
    if ((key === "b" || key === "B") && state.confirm.backgroundLabel) {
      return both(
        [{ type: "DISMISS_CONFIRM" }],
        [
          {
            type: "confirm-background",
            confirmId: state.confirm.id,
            kind: state.confirm.kind,
          },
        ],
      );
    }
    return empty();
  }

  // Meeting name edit — swallow single-letter globals
  if (state.meetingNameEdit) {
    if (key === "ctrl+c" || key === "ctrl+d") return eff({ type: "quit" });
    if (key === "escape") return acts({ type: "CANCEL_MEETING_NAME_EDIT" });
    if (key === "enter") {
      const { state: next, committed } = tryCommitMeetingName(
        state,
        emptyNameError,
      );
      if (!committed) {
        // error already in next via SET_MEETING_NAME_ERROR path — apply via actions
        return acts({
          type: "SET_MEETING_NAME_ERROR",
          error: emptyNameError,
        });
      }
      return both(
        [{ type: "COMMIT_MEETING_NAME_EDIT", name: committed }],
        [{ type: "rename-session", name: committed }],
      );
    }
    if (key === "backspace") {
      const d = state.meetingNameEdit.draft;
      return acts({
        type: "UPDATE_MEETING_NAME_DRAFT",
        draft: d.slice(0, -1),
      });
    }
    if (key === "ctrl+u") {
      return acts({ type: "UPDATE_MEETING_NAME_DRAFT", draft: "" });
    }
    if (key.length === 1 && key >= " ") {
      const d = state.meetingNameEdit.draft;
      if (d.length >= 80) return empty();
      return acts({
        type: "UPDATE_MEETING_NAME_DRAFT",
        draft: d + key,
      });
    }
    return empty();
  }

  // Settings text edit
  if (state.settingsEditKey) {
    if (key === "escape") return acts({ type: "CANCEL_SETTINGS_EDIT" });
    if (key === "enter") {
      return both(
        [{ type: "COMMIT_SETTINGS_EDIT" }],
        [
          {
            type: "commit-setting-edit",
            key: state.settingsEditKey,
            value: state.settingsEditDraft,
          },
        ],
      );
    }
    if (key === "backspace") {
      return acts({
        type: "UPDATE_SETTINGS_EDIT",
        draft: state.settingsEditDraft.slice(0, -1),
      });
    }
    if (key === "ctrl+u") {
      return acts({ type: "UPDATE_SETTINGS_EDIT", draft: "" });
    }
    if (key.length === 1 && key >= " ") {
      if (state.settingsEditDraft.length >= 200) return empty();
      return acts({
        type: "UPDATE_SETTINGS_EDIT",
        draft: state.settingsEditDraft + key,
      });
    }
    return empty();
  }

  if (key === "ctrl+c" || key === "ctrl+d") {
    return requestQuit(state);
  }

  if (state.screen === "settings") {
    return mapSettingsKey(state, key, opts?.settingsKeys);
  }

  if (state.screen === "speakers-panel") {
    if (key === "escape") return acts({ type: "CLOSE_SPEAKERS_PANEL" });
    if (key === "tab") return acts({ type: "CYCLE_FOCUS", delta: 1 });
    if (key === "shift+tab") return acts({ type: "CYCLE_FOCUS", delta: -1 });
    if (key === "up" || key === "k") {
      return acts({ type: "MOVE_SPEAKER_SEL", delta: -1 });
    }
    if (key === "down" || key === "j") {
      return acts({ type: "MOVE_SPEAKER_SEL", delta: 1 });
    }
  }

  // Live screen globals (only when not editing text)
  if (key === "tab") return acts({ type: "CYCLE_FOCUS", delta: 1 });
  if (key === "shift+tab") return acts({ type: "CYCLE_FOCUS", delta: -1 });
  if (key === "escape") return acts({ type: "CLOSE_OVERLAY" });

  if (key === "q") return requestQuit(state);

  if (key === "s") return acts({ type: "OPEN_SETTINGS" });

  if (key === "p" || key === "space") {
    if (state.focus === "actions" || state.focus === "transcript" || key === "p") {
      return eff({ type: "toggle-pause" });
    }
  }

  if (key === "h") return eff({ type: "toggle-share" });
  if (key === "r") return eff({ type: "toggle-record" });

  if (key === "c") {
    if (state.segments.length || state.livePartial) {
      return acts({
        type: "SHOW_CONFIRM",
        confirm: {
          id: `clear-${Date.now()}`,
          kind: "clear",
          title: "clear",
          body: "clear",
          confirmLabel: "y",
          cancelLabel: "n",
        },
      });
    }
    return acts({ type: "CLEAR_SEGMENTS" });
  }

  if (key === "e") {
    return acts({
      type: "BEGIN_MEETING_NAME_EDIT",
      returnFocus: state.focus,
    });
  }

  if (key === "g" || key === "G") {
    return acts({ type: "RETURN_TO_LIVE" });
  }

  if (state.focus === "transcript" || state.focus === "inspector") {
    if (key === "up" || key === "k") {
      return acts({ type: "MOVE_SEGMENT_SEL", delta: -1 });
    }
    if (key === "down" || key === "j") {
      return acts({ type: "MOVE_SEGMENT_SEL", delta: 1 });
    }
    if (key === "pageup") {
      return acts({ type: "SCROLL_TRANSCRIPT", delta: -10 });
    }
    if (key === "pagedown") {
      return acts({ type: "SCROLL_TRANSCRIPT", delta: 10 });
    }
  }

  if (state.focus === "speakers") {
    if (key === "up" || key === "k") {
      return acts({ type: "MOVE_SPEAKER_SEL", delta: -1 });
    }
    if (key === "down" || key === "j") {
      return acts({ type: "MOVE_SPEAKER_SEL", delta: 1 });
    }
  }

  if (key === "m" && (state.layoutMode === "medium" || state.layoutMode === "narrow" || state.layoutMode === "tiny")) {
    return acts({ type: "OPEN_SPEAKERS_PANEL" });
  }

  if (key >= "1" && key <= "9") {
    return eff({ type: "assign-speaker", speakerIndex1: parseInt(key, 10) });
  }

  return empty();
}

function requestQuit(state: LiveUiState): KeyMapResult {
  const hasContent =
    state.segments.length > 0 ||
    !!state.livePartial ||
    state.config.recording;
  if (hasContent) {
    return acts({
      type: "SHOW_CONFIRM",
      confirm: {
        id: `quit-${Date.now()}`,
        kind: "quit",
        title: "quit",
        body: "quit",
        confirmLabel: "y",
        cancelLabel: "n",
      },
    });
  }
  return eff({ type: "quit" });
}

function mapSettingsKey(
  state: LiveUiState,
  key: string,
  settingsKeys?: readonly string[],
): KeyMapResult {
  if (key === "escape" || key === "s") {
    return acts({ type: "CLOSE_OVERLAY" });
  }
  if (key === "tab") return acts({ type: "CYCLE_FOCUS", delta: 1 });
  if (key === "shift+tab") return acts({ type: "CYCLE_FOCUS", delta: -1 });

  if (state.focus === "settings-nav") {
    if (key === "up" || key === "k") {
      return acts({ type: "MOVE_SETTINGS_FOCUS", delta: -1 });
    }
    if (key === "down" || key === "j") {
      return acts({ type: "MOVE_SETTINGS_FOCUS", delta: 1 });
    }
    if (key === "enter" || key === "right" || key === "l") {
      return acts({ type: "SET_FOCUS", focus: "settings-form" });
    }
    return empty();
  }

  // settings-form
  if (key === "up" || key === "k") {
    if (!settingsKeys?.length) return acts({ type: "MOVE_SETTINGS_FOCUS", delta: -1 });
    const keys = settingsKeys;
    const i = state.settingsFocusKey ? keys.indexOf(state.settingsFocusKey) : 0;
    const next = keys[Math.max(0, (i < 0 ? 0 : i) - 1)] ?? null;
    return acts({ type: "SET_SETTINGS_FOCUS", key: next });
  }
  if (key === "down" || key === "j") {
    if (!settingsKeys?.length) return acts({ type: "MOVE_SETTINGS_FOCUS", delta: 1 });
    const keys = settingsKeys;
    const i = state.settingsFocusKey ? keys.indexOf(state.settingsFocusKey) : -1;
    const next = keys[Math.min(keys.length - 1, (i < 0 ? -1 : i) + 1)] ?? null;
    return acts({ type: "SET_SETTINGS_FOCUS", key: next });
  }
  if (key === "left" || key === "h") {
    if (state.settingsFocusKey) {
      return eff({ type: "nudge-setting", key: state.settingsFocusKey, dir: -1 });
    }
    return acts({ type: "SET_FOCUS", focus: "settings-nav" });
  }
  if (key === "right" || key === "l") {
    if (state.settingsFocusKey) {
      return eff({ type: "nudge-setting", key: state.settingsFocusKey, dir: 1 });
    }
    return empty();
  }
  if (key === "enter" || key === "space") {
    if (state.settingsFocusKey) {
      return eff({ type: "activate-setting", key: state.settingsFocusKey });
    }
    return empty();
  }
  return empty();
}

/** Normalize raw terminal / Rezi key events into logical key names. */
export function normalizeKeyName(raw: string): string {
  if (!raw) return "";
  if (raw === "\x03") return "ctrl+c";
  if (raw === "\x04") return "ctrl+d";
  if (raw === "\x15") return "ctrl+u";
  if (raw === "\t") return "tab";
  if (raw === "\r" || raw === "\n") return "enter";
  if (raw === "\x7f" || raw === "\b") return "backspace";
  if (raw === "\x1b") return "escape";
  if (raw === " ") return "space";
  if (raw === "\x1b[A") return "up";
  if (raw === "\x1b[B") return "down";
  if (raw === "\x1b[C") return "right";
  if (raw === "\x1b[D") return "left";
  if (raw === "\x1b[5~") return "pageup";
  if (raw === "\x1b[6~") return "pagedown";
  if (raw === "\x1b[Z") return "shift+tab";
  // Rezi-style names
  const lower = raw.toLowerCase();
  if (
    lower === "up" ||
    lower === "down" ||
    lower === "left" ||
    lower === "right" ||
    lower === "enter" ||
    lower === "escape" ||
    lower === "tab" ||
    lower === "backspace" ||
    lower === "space" ||
    lower === "pageup" ||
    lower === "pagedown"
  ) {
    return lower;
  }
  if (raw.length === 1) return raw;
  return lower;
}
