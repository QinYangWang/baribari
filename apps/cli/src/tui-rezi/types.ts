import type { AsrEngine, AudioSource, Lang, SpkEngine, TranslateLang } from "../types.js";

export type LayoutMode = "wide" | "medium" | "narrow" | "tiny";

export type FocusRegion =
  | "header-name"
  | "speakers"
  | "transcript"
  | "inspector"
  | "actions"
  | "settings-nav"
  | "settings-form"
  | "overlay";

export type ScreenId = "live" | "settings" | "speakers-panel";

export type SettingsCategoryId =
  | "meeting"
  | "speech"
  | "ai"
  | "recording"
  | "advanced";

export type NoticeKind = "info" | "warn" | "error" | "success";

export type ConfirmKind = "clear" | "quit" | "model-download" | "generic";

export interface SpeakerView {
  id: string;
  displayName: string;
  colorIndex: number;
  segmentCount: number;
  isActive: boolean;
  manual: boolean;
  spkIndex: number | null;
}

export interface TranscriptRow {
  id: string;
  speakerId: string | null;
  startedAtMs: number;
  endedAtMs?: number;
  originalText: string;
  translatedText?: string;
  isFinal: boolean;
  isActive: boolean;
  pending?: boolean;
  isDraft?: boolean;
  wallMs: number;
}

export interface LivePartialView {
  text: string;
  start?: number;
  wallMs: number;
  spk: number | null;
}

export interface ModelDownloadView {
  kind: "asr" | "spk";
  engine: AsrEngine | SpkEngine;
  name: string;
  percent: number;
  stage: "downloading" | "extracting";
  background: boolean;
}

export interface NoticeView {
  id: string;
  kind: NoticeKind;
  title: string;
  body: string;
  /** Auto-dismiss after ms; null = sticky (errors / actionable). */
  autoDismissMs: number | null;
  createdAtMs: number;
}

export interface ConfirmView {
  id: string;
  kind: ConfirmKind;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  backgroundLabel?: string;
}

export interface MeetingNameEdit {
  draft: string;
  error: string | null;
  returnFocus: FocusRegion;
}

export interface ConfigSnapshot {
  lang: Lang;
  asrEngine: AsrEngine;
  uiLang: string;
  source: AudioSource;
  noSpk: boolean;
  spkEngine: SpkEngine;
  spkThreshold: number;
  recordDir: string;
  recording: boolean;
  paused: boolean;
  aiEnabled: boolean;
  aiCorrect: boolean;
  aiTranslateTo: TranslateLang;
  aiBaseUrl: string;
  aiModel: string;
  aiHasKey: boolean;
  aiProviderLabel: string;
  shareEnabled: boolean;
  sharePort: number;
  shareHost: string;
  vadThreshold: number;
  vadMinSpeech: number;
  vadSilence: number;
  vadMaxSpeech: number;
  vadWindow: number;
  vadPresetId: string;
  deviceName: string;
}

export interface AsrModelCard {
  engine: AsrEngine;
  label: string;
  size: string;
  installed: boolean;
  current: boolean;
}

export type InspectorMode = "meeting" | "segment" | "speaker";

export interface LiveUiState {
  screen: ScreenId;
  layoutMode: LayoutMode;
  cols: number;
  rows: number;
  sessionName: string;
  sessionId: string;
  startedAtMs: number;
  statusMessage: string;
  listening: boolean;
  recognizing: boolean;
  aiBusy: boolean;
  elapsedSec: number;
  focus: FocusRegion;
  speakers: SpeakerView[];
  selectedSpeakerId: string | null;
  segments: TranscriptRow[];
  selectedSegmentId: string | null;
  livePartial: LivePartialView | null;
  followLive: boolean;
  unseenLiveCount: number;
  transcriptScrollOffset: number;
  inspectorMode: InspectorMode;
  settingsCategory: SettingsCategoryId;
  settingsFocusKey: string | null;
  settingsEditKey: string | null;
  settingsEditDraft: string;
  advancedVadOpen: boolean;
  speakersPanelOpen: boolean;
  meetingNameEdit: MeetingNameEdit | null;
  notice: NoticeView | null;
  confirm: ConfirmView | null;
  modelDownload: ModelDownloadView | null;
  config: ConfigSnapshot;
  asrModels: AsrModelCard[];
  pulse: number;
}

export const WIDE_MIN = 140;
export const MEDIUM_MIN = 100;
export const NARROW_MIN = 72;
export const TINY_MIN_W = 40;
export const TINY_MIN_H = 12;

export const SPK_COLOR_COUNT = 8;
