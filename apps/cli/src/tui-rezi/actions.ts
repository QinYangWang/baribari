import type { Segment } from "../types.js";
import type {
  ConfirmView,
  FocusRegion,
  LayoutMode,
  LivePartialView,
  ModelDownloadView,
  NoticeView,
  ScreenId,
  SettingsCategoryId,
  SpeakerView,
  TranscriptRow,
  ConfigSnapshot,
  AsrModelCard,
} from "./types.js";

export type UiAction =
  | { type: "TICK"; nowMs: number }
  | { type: "RESIZE"; cols: number; rows: number; layoutMode: LayoutMode }
  | { type: "SET_STATUS"; message: string; recognizing?: boolean }
  | { type: "SET_DEVICE"; name: string }
  | { type: "SET_AI_BUSY"; busy: boolean }
  | { type: "SET_CONFIG"; config: Partial<ConfigSnapshot> }
  | { type: "SET_ASR_MODELS"; models: AsrModelCard[] }
  | { type: "UPSERT_SPEAKER"; speaker: SpeakerView }
  | { type: "SET_SPEAKERS"; speakers: SpeakerView[] }
  | { type: "SELECT_SPEAKER"; id: string | null }
  | { type: "APPLY_SEGMENT"; segment: TranscriptRow; replaceLive?: boolean }
  | { type: "SET_LIVE_PARTIAL"; partial: LivePartialView | null }
  | { type: "CLEAR_SEGMENTS" }
  | { type: "SELECT_SEGMENT"; id: string | null }
  | { type: "MOVE_SEGMENT_SEL"; delta: number }
  | { type: "MOVE_SPEAKER_SEL"; delta: number }
  | { type: "SET_FOLLOW_LIVE"; follow: boolean }
  | { type: "RETURN_TO_LIVE" }
  | { type: "SCROLL_TRANSCRIPT"; delta: number }
  | { type: "SET_FOCUS"; focus: FocusRegion }
  | { type: "CYCLE_FOCUS"; delta: number }
  | { type: "OPEN_SCREEN"; screen: ScreenId }
  | { type: "CLOSE_OVERLAY" }
  | { type: "OPEN_SETTINGS"; category?: SettingsCategoryId }
  | { type: "SET_SETTINGS_CATEGORY"; category: SettingsCategoryId }
  | { type: "SET_SETTINGS_FOCUS"; key: string | null }
  | { type: "MOVE_SETTINGS_FOCUS"; delta: number }
  | { type: "BEGIN_SETTINGS_EDIT"; key: string; draft: string }
  | { type: "UPDATE_SETTINGS_EDIT"; draft: string }
  | { type: "CANCEL_SETTINGS_EDIT" }
  | { type: "COMMIT_SETTINGS_EDIT" }
  | { type: "TOGGLE_ADVANCED_VAD" }
  | { type: "OPEN_SPEAKERS_PANEL" }
  | { type: "CLOSE_SPEAKERS_PANEL" }
  | { type: "BEGIN_MEETING_NAME_EDIT"; returnFocus: FocusRegion }
  | { type: "UPDATE_MEETING_NAME_DRAFT"; draft: string }
  | { type: "SET_MEETING_NAME_ERROR"; error: string | null }
  | { type: "CANCEL_MEETING_NAME_EDIT" }
  | { type: "COMMIT_MEETING_NAME_EDIT"; name: string }
  | { type: "SET_SESSION_NAME"; name: string }
  | { type: "SHOW_NOTICE"; notice: NoticeView }
  | { type: "DISMISS_NOTICE" }
  | { type: "SHOW_CONFIRM"; confirm: ConfirmView }
  | { type: "DISMISS_CONFIRM" }
  | { type: "SET_MODEL_DOWNLOAD"; download: ModelDownloadView | null }
  | { type: "INGEST_ENGINE_SEGMENT"; seg: Segment };

/** Side-effect intents produced alongside pure state updates. */
export type EffectIntent =
  | { type: "persist-settings" }
  | { type: "quit" }
  | { type: "toggle-pause" }
  | { type: "toggle-share" }
  | { type: "toggle-record" }
  | { type: "rename-session"; name: string }
  | { type: "nudge-setting"; key: string; dir: 1 | -1 }
  | { type: "activate-setting"; key: string }
  | { type: "commit-setting-edit"; key: string; value: string }
  | { type: "confirm-accepted"; confirmId: string; kind: string }
  | { type: "confirm-cancelled"; confirmId: string; kind: string }
  | { type: "confirm-background"; confirmId: string; kind: string }
  | { type: "assign-speaker"; speakerIndex1: number }
  | { type: "clear-transcript" };
