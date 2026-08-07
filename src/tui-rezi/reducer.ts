import type { UiAction } from "./actions.js";
import { decideLayout, liveFocusOrder } from "./layout.js";
import type {
  FocusRegion,
  LiveUiState,
  SettingsCategoryId,
  TranscriptRow,
} from "./types.js";

export function createInitialState(opts: {
  sessionName: string;
  sessionId: string;
  startedAtMs?: number;
  cols?: number;
  rows?: number;
  config: LiveUiState["config"];
  asrModels?: LiveUiState["asrModels"];
}): LiveUiState {
  const cols = opts.cols ?? 120;
  const rows = opts.rows ?? 40;
  const layout = decideLayout(cols, rows);
  return {
    screen: "live",
    layoutMode: layout.mode,
    cols,
    rows,
    sessionName: opts.sessionName || "",
    sessionId: opts.sessionId || "",
    startedAtMs: opts.startedAtMs ?? Date.now(),
    statusMessage: "",
    listening: true,
    recognizing: false,
    aiBusy: false,
    elapsedSec: 0,
    focus: "transcript",
    speakers: [],
    selectedSpeakerId: null,
    segments: [],
    selectedSegmentId: null,
    livePartial: null,
    followLive: true,
    unseenLiveCount: 0,
    transcriptScrollOffset: 0,
    inspectorMode: "meeting",
    settingsCategory: "meeting",
    settingsFocusKey: null,
    settingsEditKey: null,
    settingsEditDraft: "",
    advancedVadOpen: false,
    speakersPanelOpen: false,
    meetingNameEdit: null,
    notice: null,
    confirm: null,
    modelDownload: null,
    config: opts.config,
    asrModels: opts.asrModels ?? [],
    pulse: 0,
  };
}

function clampIndex(i: number, n: number): number {
  if (n <= 0) return 0;
  return Math.max(0, Math.min(n - 1, i));
}

function segmentIndex(state: LiveUiState, id: string | null): number {
  if (!id) return -1;
  return state.segments.findIndex((s) => s.id === id);
}

function applySegment(state: LiveUiState, row: TranscriptRow): LiveUiState {
  const idx = state.segments.findIndex((s) => s.id === row.id);
  let segments: TranscriptRow[];
  if (idx >= 0) {
    segments = state.segments.slice();
    segments[idx] = { ...segments[idx]!, ...row, id: row.id };
  } else {
    segments = [...state.segments, row];
    if (segments.length > 500) segments = segments.slice(segments.length - 400);
  }
  // mark others inactive when this is active
  if (row.isActive) {
    segments = segments.map((s) =>
      s.id === row.id ? s : { ...s, isActive: false },
    );
  }

  let followLive = state.followLive;
  let unseenLiveCount = state.unseenLiveCount;
  let selectedSegmentId = state.selectedSegmentId;
  let inspectorMode = state.inspectorMode;

  if (state.followLive) {
    selectedSegmentId = row.id;
    unseenLiveCount = 0;
  } else if (idx < 0) {
    // new content while scrolled away
    unseenLiveCount += 1;
  }

  if (selectedSegmentId === row.id) {
    inspectorMode = "segment";
  }

  return {
    ...state,
    segments,
    livePartial: null,
    followLive,
    unseenLiveCount,
    selectedSegmentId,
    inspectorMode,
  };
}

const SETTINGS_CATEGORY_ORDER: SettingsCategoryId[] = [
  "meeting",
  "speech",
  "ai",
  "recording",
  "advanced",
];

export function reduce(state: LiveUiState, action: UiAction): LiveUiState {
  switch (action.type) {
    case "TICK": {
      const elapsedSec = Math.max(
        0,
        Math.floor((action.nowMs - state.startedAtMs) / 1000),
      );
      let notice = state.notice;
      if (
        notice &&
        notice.autoDismissMs != null &&
        action.nowMs - notice.createdAtMs >= notice.autoDismissMs
      ) {
        notice = null;
      }
      return {
        ...state,
        elapsedSec,
        pulse: state.pulse + 1,
        notice,
        config: {
          ...state.config,
          // paused is owned by engine args; elapsed still advances for session clock
        },
      };
    }

    case "RESIZE": {
      const layout = decideLayout(action.cols, action.rows);
      return {
        ...state,
        cols: action.cols,
        rows: action.rows,
        layoutMode: action.layoutMode || layout.mode,
      };
    }

    case "SET_STATUS":
      return {
        ...state,
        statusMessage: action.message,
        recognizing: action.recognizing ?? state.recognizing,
      };

    case "SET_DEVICE":
      return {
        ...state,
        config: { ...state.config, deviceName: action.name },
      };

    case "SET_AI_BUSY":
      return { ...state, aiBusy: action.busy };

    case "SET_CONFIG":
      return { ...state, config: { ...state.config, ...action.config } };

    case "SET_ASR_MODELS":
      return { ...state, asrModels: action.models };

    case "UPSERT_SPEAKER": {
      const speakers = state.speakers.slice();
      const i = speakers.findIndex((s) => s.id === action.speaker.id);
      if (i >= 0) speakers[i] = action.speaker;
      else speakers.push(action.speaker);
      return { ...state, speakers };
    }

    case "SET_SPEAKERS":
      return { ...state, speakers: action.speakers };

    case "SELECT_SPEAKER":
      return {
        ...state,
        selectedSpeakerId: action.id,
        inspectorMode: action.id ? "speaker" : state.inspectorMode,
        focus: action.id ? "speakers" : state.focus,
      };

    case "APPLY_SEGMENT":
      return applySegment(state, action.segment);

    case "SET_LIVE_PARTIAL":
      return {
        ...state,
        livePartial: action.partial,
        recognizing: !!action.partial,
      };

    case "CLEAR_SEGMENTS":
      return {
        ...state,
        segments: [],
        selectedSegmentId: null,
        livePartial: null,
        followLive: true,
        unseenLiveCount: 0,
        inspectorMode: "meeting",
      };

    case "SELECT_SEGMENT": {
      const id = action.id;
      return {
        ...state,
        selectedSegmentId: id,
        followLive: id != null && id === state.segments[state.segments.length - 1]?.id,
        unseenLiveCount:
          id != null && id === state.segments[state.segments.length - 1]?.id
            ? 0
            : state.unseenLiveCount,
        inspectorMode: id ? "segment" : "meeting",
        focus: "transcript",
      };
    }

    case "MOVE_SEGMENT_SEL": {
      if (!state.segments.length) return state;
      const cur = segmentIndex(state, state.selectedSegmentId);
      const next = clampIndex(
        (cur < 0 ? state.segments.length - 1 : cur) + action.delta,
        state.segments.length,
      );
      const id = state.segments[next]!.id;
      const lastId = state.segments[state.segments.length - 1]!.id;
      const atLive = id === lastId;
      return {
        ...state,
        selectedSegmentId: id,
        followLive: atLive,
        unseenLiveCount: atLive ? 0 : state.unseenLiveCount,
        inspectorMode: "segment",
        focus: "transcript",
      };
    }

    case "MOVE_SPEAKER_SEL": {
      if (!state.speakers.length) return state;
      const cur = state.speakers.findIndex((s) => s.id === state.selectedSpeakerId);
      const next = clampIndex(
        (cur < 0 ? 0 : cur) + action.delta,
        state.speakers.length,
      );
      return {
        ...state,
        selectedSpeakerId: state.speakers[next]!.id,
        inspectorMode: "speaker",
        focus: "speakers",
      };
    }

    case "SET_FOLLOW_LIVE":
      return {
        ...state,
        followLive: action.follow,
        unseenLiveCount: action.follow ? 0 : state.unseenLiveCount,
        selectedSegmentId: action.follow
          ? state.segments[state.segments.length - 1]?.id ?? null
          : state.selectedSegmentId,
      };

    case "RETURN_TO_LIVE": {
      const last = state.segments[state.segments.length - 1];
      return {
        ...state,
        followLive: true,
        unseenLiveCount: 0,
        transcriptScrollOffset: 0,
        selectedSegmentId: last?.id ?? null,
        inspectorMode: last ? "segment" : "meeting",
        focus: "transcript",
      };
    }

    case "SCROLL_TRANSCRIPT": {
      // Scrolling away from live detaches follow
      const delta = action.delta;
      if (delta === 0) return state;
      if (delta < 0) {
        // scroll up → older
        return {
          ...state,
          followLive: false,
          transcriptScrollOffset: state.transcriptScrollOffset + Math.abs(delta),
        };
      }
      // scroll down toward live
      const nextOff = Math.max(0, state.transcriptScrollOffset - delta);
      const backToLive = nextOff === 0;
      return {
        ...state,
        transcriptScrollOffset: nextOff,
        followLive: backToLive ? true : state.followLive,
        unseenLiveCount: backToLive ? 0 : state.unseenLiveCount,
        selectedSegmentId: backToLive
          ? state.segments[state.segments.length - 1]?.id ?? state.selectedSegmentId
          : state.selectedSegmentId,
      };
    }

    case "SET_FOCUS":
      return { ...state, focus: action.focus };

    case "CYCLE_FOCUS": {
      if (state.screen === "settings") {
        const order: FocusRegion[] = ["settings-nav", "settings-form"];
        const i = order.indexOf(state.focus as FocusRegion);
        const next =
          order[
            ((i < 0 ? 0 : i) + action.delta + order.length * 10) % order.length
          ]!;
        return { ...state, focus: next };
      }
      const order = liveFocusOrder(
        state.layoutMode,
        state.speakersPanelOpen,
      ) as FocusRegion[];
      const i = order.indexOf(state.focus);
      const next =
        order[
          ((i < 0 ? 0 : i) + action.delta + order.length * 10) % order.length
        ]!;
      return { ...state, focus: next };
    }

    case "OPEN_SCREEN":
      return {
        ...state,
        screen: action.screen,
        focus:
          action.screen === "settings"
            ? "settings-nav"
            : action.screen === "speakers-panel"
              ? "speakers"
              : "transcript",
        speakersPanelOpen: action.screen === "speakers-panel",
      };

    case "CLOSE_OVERLAY": {
      if (state.confirm) return { ...state, confirm: null, focus: "transcript" };
      if (state.meetingNameEdit) {
        return {
          ...state,
          meetingNameEdit: null,
          focus: state.meetingNameEdit.returnFocus,
        };
      }
      if (state.settingsEditKey) {
        return {
          ...state,
          settingsEditKey: null,
          settingsEditDraft: "",
          focus: "settings-form",
        };
      }
      if (state.screen === "settings") {
        return { ...state, screen: "live", focus: "transcript" };
      }
      if (state.speakersPanelOpen || state.screen === "speakers-panel") {
        return {
          ...state,
          screen: "live",
          speakersPanelOpen: false,
          focus: "transcript",
        };
      }
      if (state.notice && state.notice.autoDismissMs == null) {
        return { ...state, notice: null };
      }
      return state;
    }

    case "OPEN_SETTINGS":
      return {
        ...state,
        screen: "settings",
        settingsCategory: action.category ?? state.settingsCategory,
        focus: "settings-nav",
        settingsEditKey: null,
        settingsEditDraft: "",
      };

    case "SET_SETTINGS_CATEGORY":
      return {
        ...state,
        settingsCategory: action.category,
        settingsFocusKey: null,
        settingsEditKey: null,
        settingsEditDraft: "",
        focus: "settings-form",
      };

    case "SET_SETTINGS_FOCUS":
      return {
        ...state,
        settingsFocusKey: action.key,
        focus: "settings-form",
      };

    case "MOVE_SETTINGS_FOCUS": {
      // Controller supplies ordered keys via SET; pure fallback cycles categories
      const cats = SETTINGS_CATEGORY_ORDER;
      const i = cats.indexOf(state.settingsCategory);
      if (state.focus === "settings-nav") {
        const next =
          cats[((i < 0 ? 0 : i) + action.delta + cats.length * 10) % cats.length]!;
        return {
          ...state,
          settingsCategory: next,
          settingsFocusKey: null,
        };
      }
      return state;
    }

    case "BEGIN_SETTINGS_EDIT":
      return {
        ...state,
        settingsEditKey: action.key,
        settingsEditDraft: action.draft,
        focus: "settings-form",
      };

    case "UPDATE_SETTINGS_EDIT":
      return { ...state, settingsEditDraft: action.draft };

    case "CANCEL_SETTINGS_EDIT":
      return {
        ...state,
        settingsEditKey: null,
        settingsEditDraft: "",
        focus: "settings-form",
      };

    case "COMMIT_SETTINGS_EDIT":
      return {
        ...state,
        settingsEditKey: null,
        settingsEditDraft: "",
        focus: "settings-form",
      };

    case "TOGGLE_ADVANCED_VAD":
      return { ...state, advancedVadOpen: !state.advancedVadOpen };

    case "OPEN_SPEAKERS_PANEL":
      return {
        ...state,
        screen: "speakers-panel",
        speakersPanelOpen: true,
        focus: "speakers",
      };

    case "CLOSE_SPEAKERS_PANEL":
      return {
        ...state,
        screen: "live",
        speakersPanelOpen: false,
        focus: "transcript",
      };

    case "BEGIN_MEETING_NAME_EDIT":
      return {
        ...state,
        meetingNameEdit: {
          draft: state.sessionName,
          error: null,
          returnFocus: action.returnFocus,
        },
        focus: "header-name",
      };

    case "UPDATE_MEETING_NAME_DRAFT":
      if (!state.meetingNameEdit) return state;
      return {
        ...state,
        meetingNameEdit: {
          ...state.meetingNameEdit,
          draft: action.draft,
          error: null,
        },
      };

    case "SET_MEETING_NAME_ERROR":
      if (!state.meetingNameEdit) return state;
      return {
        ...state,
        meetingNameEdit: {
          ...state.meetingNameEdit,
          error: action.error,
        },
      };

    case "CANCEL_MEETING_NAME_EDIT": {
      if (!state.meetingNameEdit) return state;
      const ret = state.meetingNameEdit.returnFocus;
      return {
        ...state,
        meetingNameEdit: null,
        focus: ret,
      };
    }

    case "COMMIT_MEETING_NAME_EDIT": {
      if (!state.meetingNameEdit) return state;
      const ret = state.meetingNameEdit.returnFocus;
      return {
        ...state,
        sessionName: action.name,
        meetingNameEdit: null,
        focus: ret,
      };
    }

    case "SET_SESSION_NAME":
      return { ...state, sessionName: action.name };

    case "SHOW_NOTICE":
      return { ...state, notice: action.notice };

    case "DISMISS_NOTICE":
      return { ...state, notice: null };

    case "SHOW_CONFIRM":
      return { ...state, confirm: action.confirm, focus: "overlay" };

    case "DISMISS_CONFIRM":
      return { ...state, confirm: null, focus: "transcript" };

    case "SET_MODEL_DOWNLOAD":
      return { ...state, modelDownload: action.download };

    case "INGEST_ENGINE_SEGMENT":
      // Handled in controller (needs speaker ensure); identity here.
      return state;

    default:
      return state;
  }
}

/** Validate and commit meeting name edit. Returns next state + whether to persist. */
export function tryCommitMeetingName(
  state: LiveUiState,
  emptyError: string,
): { state: LiveUiState; committed: string | null } {
  if (!state.meetingNameEdit) return { state, committed: null };
  const next = state.meetingNameEdit.draft.trim();
  if (!next) {
    return {
      state: reduce(state, { type: "SET_MEETING_NAME_ERROR", error: emptyError }),
      committed: null,
    };
  }
  return {
    state: reduce(state, { type: "COMMIT_MEETING_NAME_EDIT", name: next }),
    committed: next,
  };
}

/** Ordered settings field keys for arrow navigation within a category. */
export function moveFocusInKeys(
  keys: readonly string[],
  current: string | null,
  delta: number,
): string | null {
  if (!keys.length) return null;
  const i = current ? keys.indexOf(current) : -1;
  const base = i < 0 ? (delta > 0 ? -1 : 0) : i;
  const next = clampIndex(base + delta, keys.length);
  return keys[next] ?? null;
}
