/**
 * Rezi live TUI controller — adapts engine callbacks to pure UI state.
 * Owns no ASR/audio/model filesystem logic beyond calling existing helpers.
 */

import fs from "node:fs";
import { ui, type VNode } from "@rezi-ui/core";
import { createNodeApp, type NodeApp } from "@rezi-ui/node";
import {
  aiProviderLabel,
  cycleAiProvider,
  TRANSLATE_OPTIONS,
  translateLangLabel,
} from "../ai.js";
import { t, setUiLang, getUiLang, UI_LANGS, type UiLang } from "../i18n/index.js";
import { checkModels } from "../paths.js";
import { renameSession } from "../session.js";
import {
  defaultRecordDir,
  flushSaveSettings,
  modelOverridesFromSettings,
  normalizeRecordDir,
  scheduleSaveSettings,
  snapshotFromArgs,
} from "../settings.js";
import { downloadAsrModel, downloadSpkModel } from "../setup.js";
import { spkModelInfo } from "../speaker-models.js";
import {
  cycleVadPreset,
  displayText,
  isPartialSegment,
  SPK_ENGINES,
  defaultSpkThreshold,
  type AsrEngine,
  type AudioSource,
  type Lang,
  type Segment,
  type SpkEngine,
  type TranscribeArgs,
} from "../types.js";
import type { TuiHandle } from "../tui.js";
import type { EffectIntent, UiAction } from "./actions.js";
import { buildAsrModelCards, snapshotConfig } from "./config-snapshot.js";
import { renderLiveScreen } from "./components/live-screen.js";
import {
  formatSettingValue,
  renderSettingsScreen,
} from "./components/settings-screen.js";
import { renderSpeakerList } from "./components/speakers.js";
import { renderConfirmModal } from "./components/confirm-modal.js";
import { mapKey, normalizeKeyName } from "./keys.js";
import { layoutModeFor } from "./layout.js";
import {
  createInitialState,
  reduce,
} from "./reducer.js";
import {
  bumpSpeakerCount,
  ensureSpeakerFromSeg,
  mapFinalSegment,
  mapPartial,
} from "./segment-map.js";
import { fieldKeysForCategory } from "./settings/catalog.js";
import { baribariTheme } from "./theme.js";
import type { LiveUiState, TranscriptRow } from "./types.js";
import { col } from "./colors.js";

const LANGS: Lang[] = ["auto", "zh", "en", "ja", "ko", "yue"];
const ASR_ENGINES: AsrEngine[] = [
  "sensevoice",
  "funasr-nano",
  "reazonspeech-ja",
];
const SOURCES: AudioSource[] = ["mic", "loopback", "both"];

export interface ReziTuiOpts {
  onQuit: () => void;
  sessionDir?: string;
  sessionName?: string;
  sessionId?: string;
  onSessionRenamed?: (name: string) => void;
  resolveSpeakerName?: (spk: number) => string | undefined;
  onSpeakerRenamed?: (spk: number, name: string) => void;
}

export async function createReziTui(
  args: TranscribeArgs,
  opts: ReziTuiOpts,
): Promise<TuiHandle> {
  if (args.uiLang) setUiLang(args.uiLang);

  let deviceName = "—";
  let segSeq = 0;
  let closed = false;
  let out: fs.WriteStream | null = null;
  if (args.output) {
    out = fs.createWriteStream(args.output, { flags: "a", encoding: "utf8" });
  }

  let resolveClosed!: () => void;
  const closedPromise = new Promise<void>((r) => {
    resolveClosed = r;
  });

  let state = createInitialState({
    sessionName: (opts.sessionName || "").trim(),
    sessionId: opts.sessionId || "",
    cols: process.stdout.columns || 120,
    rows: process.stdout.rows || 40,
    config: snapshotConfig(args, deviceName),
    asrModels: buildAsrModelCards(args),
  });
  state = {
    ...state,
    statusMessage: t("status.listening"),
  };

  let app: NodeApp<LiveUiState> | null = null;
  let tickTimer: ReturnType<typeof setInterval> | null = null;
  let pendingConfirmKind: string | null = null;

  function dispatch(action: UiAction): void {
    state = reduce(state, action);
    try {
      app?.update(state);
    } catch {
      /* app not ready */
    }
  }

  function refreshConfig(): void {
    dispatch({
      type: "SET_CONFIG",
      config: snapshotConfig(args, deviceName),
    });
    dispatch({ type: "SET_ASR_MODELS", models: buildAsrModelCards(args) });
  }

  function persist(): void {
    scheduleSaveSettings(() => snapshotFromArgs(args));
  }

  function notify(
    title: string,
    body = "",
    kind: "info" | "warn" | "error" | "success" = "info",
    sticky = false,
  ): void {
    dispatch({
      type: "SHOW_NOTICE",
      notice: {
        id: `n-${Date.now()}`,
        kind,
        title,
        body,
        autoDismissMs:
          sticky || kind === "error" || kind === "warn" ? null : 3200,
        createdAtMs: Date.now(),
      },
    });
  }

  function runEffects(effects: EffectIntent[]): void {
    for (const e of effects) {
      switch (e.type) {
        case "quit":
          opts.onQuit();
          break;
        case "persist-settings":
          persist();
          break;
        case "toggle-pause":
          args.paused.value = !args.paused.value;
          dispatch({
            type: "SET_STATUS",
            message: args.paused.value
              ? t("status.pausedHint")
              : t("status.listening"),
          });
          refreshConfig();
          break;
        case "toggle-share":
          args.share.enabled = !args.share.enabled;
          notify(
            args.share.enabled
              ? t("status.shareOn", { port: args.share.port })
              : t("status.shareOff"),
          );
          persist();
          refreshConfig();
          break;
        case "toggle-record":
          toggleRecord();
          break;
        case "rename-session":
          commitRename(e.name);
          break;
        case "nudge-setting":
          nudgeSetting(e.key, e.dir);
          break;
        case "activate-setting":
          activateSetting(e.key);
          break;
        case "commit-setting-edit":
          commitSettingEdit(e.key, e.value);
          break;
        case "confirm-accepted":
          handleConfirm(e.kind, "accept");
          break;
        case "confirm-cancelled":
          handleConfirm(e.kind, "cancel");
          break;
        case "confirm-background":
          handleConfirm(e.kind, "background");
          break;
        case "assign-speaker":
          assignSpeaker(e.speakerIndex1);
          break;
        case "clear-transcript":
          dispatch({ type: "CLEAR_SEGMENTS" });
          break;
      }
    }
  }

  function handleConfirm(
    kind: string,
    choice: "accept" | "cancel" | "background",
  ): void {
    if (kind === "quit" && choice === "accept") {
      opts.onQuit();
      return;
    }
    if (kind === "clear" && choice === "accept") {
      dispatch({ type: "CLEAR_SEGMENTS" });
      return;
    }
    if (kind === "model-download") {
      // pending download params stored on notice body via pendingConfirmKind
      void pendingConfirmKind;
    }
  }

  function commitRename(name: string): void {
    if (!opts.sessionDir) {
      notify(t("resume.status.renameFail"), "", "error");
      return;
    }
    const meta = renameSession(opts.sessionDir, name);
    if (meta) {
      dispatch({ type: "SET_SESSION_NAME", name: meta.name });
      notify(t("resume.status.renamed", { name: meta.name }), "", "success");
      opts.onSessionRenamed?.(meta.name);
    } else {
      notify(t("resume.status.renameFail"), "", "error");
    }
  }

  function toggleRecord(): void {
    if (args.record) {
      args.record = undefined;
      notify(t("status.stopRecord"));
    } else {
      const dir = args.recordDir || defaultRecordDir();
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      args.record = `${dir.replace(/\/$/, "")}/meeting-${stamp}`;
      notify(t("status.startRecord"));
    }
    refreshConfig();
  }

  function cycle<T>(list: readonly T[], cur: T, dir: 1 | -1): T {
    const i = list.indexOf(cur);
    const base = i < 0 ? 0 : i;
    return list[(base + dir + list.length * 10) % list.length]!;
  }

  function nudgeSetting(key: string, dir: 1 | -1): void {
    switch (key) {
      case "uiLang": {
        const cur = (args.uiLang || getUiLang()) as UiLang;
        const next = cycle(UI_LANGS, cur, dir);
        args.uiLang = next;
        setUiLang(next);
        break;
      }
      case "lang":
        args.lang = cycle(LANGS, args.lang, dir);
        break;
      case "asrEngine":
        requestAsrEngine(cycle(ASR_ENGINES, args.asrEngine, dir));
        break;
      case "spkEngine": {
        if (dir < 0 && !args.noSpk && SPK_ENGINES[0] === args.spkEngine) {
          args.noSpk = true;
        } else if (args.noSpk && dir > 0) {
          args.noSpk = false;
        } else if (!args.noSpk) {
          const next = cycle(SPK_ENGINES, args.spkEngine, dir);
          requestSpkEngine(next);
        }
        break;
      }
      case "spkThr":
      case "spkThrAdv":
        args.spkThreshold = Math.max(
          0.2,
          Math.min(0.95, +(args.spkThreshold + dir * 0.05).toFixed(2)),
        );
        break;
      case "aiEn":
        args.ai.enabled = !args.ai.enabled;
        break;
      case "aiTranslate": {
        const i = TRANSLATE_OPTIONS.indexOf(args.ai.translateTo);
        const next =
          TRANSLATE_OPTIONS[
            ((i < 0 ? 0 : i) + dir + TRANSLATE_OPTIONS.length * 10) %
              TRANSLATE_OPTIONS.length
          ]!;
        args.ai.translateTo = next;
        notify(t("status.aiTranslate", { lang: translateLangLabel(next) }));
        break;
      }
      case "aiProvider":
        args.ai = cycleAiProvider(args.ai, dir);
        notify(
          t("settings.provider.applied", {
            name: aiProviderLabel(args.ai),
            model: args.ai.model || "—",
          }),
        );
        break;
      case "source":
        args.source = cycle(SOURCES, args.source, dir);
        notify(t("status.switchSource", { source: args.source }));
        break;
      case "record":
        toggleRecord();
        return;
      case "share":
        args.share.enabled = !args.share.enabled;
        break;
      case "sharePort":
        args.share.port = Math.max(
          1,
          Math.min(65535, args.share.port + dir),
        );
        break;
      case "vadPreset": {
        const next = cycleVadPreset(args.vad, dir, args.asrEngine);
        args.vad = next.vad;
        notify(
          t("settings.vadPreset.applied", {
            name: t(`settings.vadPreset.${next.id}`),
          }),
        );
        break;
      }
      case "vadThr":
        args.vad.threshold = clamp(args.vad.threshold + dir * 0.05, 0.05, 0.95);
        break;
      case "vadMinSp":
        args.vad.minSpeechDuration = clamp(
          args.vad.minSpeechDuration + dir * 0.05,
          0.1,
          2,
        );
        break;
      case "vadSil":
        args.vad.minSilenceDuration = clamp(
          args.vad.minSilenceDuration + dir * 0.05,
          0.1,
          2,
        );
        break;
      case "vadMax":
        args.vad.maxSpeechDuration = clamp(
          args.vad.maxSpeechDuration + dir * 1,
          5,
          60,
        );
        break;
      case "vadWin":
        args.vad.windowSize = dir > 0 ? 1024 : 512;
        break;
      case "advancedVad":
        dispatch({ type: "TOGGLE_ADVANCED_VAD" });
        return;
      default:
        break;
    }
    persist();
    refreshConfig();
  }

  function clamp(n: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, +n.toFixed(2)));
  }

  function activateSetting(key: string): void {
    if (key === "advancedVad") {
      dispatch({ type: "TOGGLE_ADVANCED_VAD" });
      return;
    }
    if (
      key === "aiBase" ||
      key === "aiKey" ||
      key === "aiModel" ||
      key === "recDir" ||
      key === "shareHost" ||
      key === "sharePort" ||
      key === "sessionName"
    ) {
      let draft = "";
      if (key === "aiBase") draft = args.ai.baseUrl || "";
      else if (key === "aiKey") draft = args.ai.apiKey || "";
      else if (key === "aiModel") draft = args.ai.model || "";
      else if (key === "recDir") draft = args.recordDir || defaultRecordDir();
      else if (key === "shareHost") draft = args.share.host || "0.0.0.0";
      else if (key === "sharePort") draft = String(args.share.port);
      else if (key === "sessionName") draft = state.sessionName;
      dispatch({ type: "BEGIN_SETTINGS_EDIT", key, draft });
      return;
    }
    if (key === "aiEn" || key === "record" || key === "share") {
      nudgeSetting(key, 1);
      return;
    }
    nudgeSetting(key, 1);
  }

  function commitSettingEdit(key: string, value: string): void {
    const v = value.trim();
    if (key === "aiBase") {
      try {
        const u = new URL(v);
        if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error();
        args.ai.baseUrl = v.replace(/\/+$/, "");
        notify(t("status.baseUrlSaved"));
      } catch {
        notify(t("status.baseUrlInvalid"), "", "error");
      }
    } else if (key === "aiKey") {
      args.ai.apiKey = v;
      notify(v ? t("status.apiKeySaved") : t("status.apiKeyCleared"));
    } else if (key === "aiModel") {
      args.ai.model = v;
      notify(t("status.modelSet", { model: v || "—" }));
    } else if (key === "recDir") {
      args.recordDir = normalizeRecordDir(v || defaultRecordDir());
      notify(t("status.recordDir", { dir: args.recordDir }));
    } else if (key === "shareHost") {
      args.share.host = v || "0.0.0.0";
      notify(t("status.shareHost", { host: args.share.host }));
    } else if (key === "sharePort") {
      const n = parseInt(v, 10);
      if (!Number.isFinite(n) || n < 1 || n > 65535) {
        notify(t("status.portInvalid"), "", "error");
      } else {
        args.share.port = n;
        notify(t("status.sharePort", { port: n }));
      }
    } else if (key === "sessionName") {
      if (!v) {
        notify(t("resume.status.renameEmpty"), "", "warn");
      } else {
        commitRename(v);
      }
    }
    persist();
    refreshConfig();
  }

  function requestAsrEngine(engine: AsrEngine): void {
    const st = checkModels(modelOverridesFromSettings(), {
      requireSpk: false,
      asrEngine: engine,
    });
    if (!st.ok) {
      const name =
        engine === "funasr-nano"
          ? "Fun-ASR-Nano"
          : engine === "reazonspeech-ja"
            ? t("settings.asrEngine.reazonSpeechName")
            : "SenseVoice";
      pendingConfirmKind = `asr:${engine}`;
      dispatch({
        type: "SHOW_CONFIRM",
        confirm: {
          id: `dl-asr-${engine}`,
          kind: "model-download",
          title: t("settings.asrEngine.downloadTitle"),
          body: t("settings.asrEngine.downloadAsk", { name }),
          confirmLabel: t("footer.downloadHere"),
          cancelLabel: t("footer.btnCancel"),
          backgroundLabel: t("footer.downloadBackground"),
        },
      });
      // store engine on modelDownload placeholder
      dispatch({
        type: "SET_MODEL_DOWNLOAD",
        download: {
          kind: "asr",
          engine,
          name,
          percent: 0,
          stage: "downloading",
          background: false,
        },
      });
      return;
    }
    applyAsrEngine(engine);
  }

  function applyAsrEngine(engine: AsrEngine): void {
    args.asrEngine = engine;
    persist();
    refreshConfig();
    notify(t("settings.asrEngine.applied", { name: engine }), "", "success");
  }

  function requestSpkEngine(engine: SpkEngine): void {
    const info = spkModelInfo(engine);
    const st = checkModels(modelOverridesFromSettings(), {
      requireSpk: true,
      asrEngine: args.asrEngine,
      spkEngine: engine,
    });
    if (!st.ok) {
      pendingConfirmKind = `spk:${engine}`;
      dispatch({
        type: "SHOW_CONFIRM",
        confirm: {
          id: `dl-spk-${engine}`,
          kind: "model-download",
          title: t("settings.spkEngine.downloadTitle"),
          body: t("settings.spkEngine.downloadAsk", {
            name: info.name,
            size: info.approx,
          }),
          confirmLabel: t("footer.downloadHere"),
          cancelLabel: t("footer.btnCancel"),
          backgroundLabel: t("footer.downloadBackground"),
        },
      });
      dispatch({
        type: "SET_MODEL_DOWNLOAD",
        download: {
          kind: "spk",
          engine,
          name: info.name,
          percent: 0,
          stage: "downloading",
          background: false,
        },
      });
      return;
    }
    args.spkEngine = engine;
    args.noSpk = false;
    if (!args.spkThreshold) args.spkThreshold = defaultSpkThreshold(engine);
    persist();
    refreshConfig();
    notify(
      `${t("settings.spkEngine.applied", { name: info.name })} · ${t("settings.spkEngine.restartHint")}`,
    );
  }

  // Wire confirm accept for model download
  const origHandleConfirm = handleConfirm;
  function handleConfirmWrapped(
    kind: string,
    choice: "accept" | "cancel" | "background",
  ): void {
    if (kind === "model-download" && state.modelDownload) {
      const d = state.modelDownload;
      if (choice === "cancel") {
        dispatch({ type: "SET_MODEL_DOWNLOAD", download: null });
        return;
      }
      const bg = choice === "background";
      if (d.kind === "asr") {
        startAsrDownload(d.engine as AsrEngine, d.name, bg);
      } else {
        startSpkDownload(d.engine as SpkEngine, d.name, bg);
      }
      return;
    }
    origHandleConfirm(kind, choice);
  }

  // Replace runEffects confirm branch by monkey-patching — cleaner to inline:
  void handleConfirmWrapped;

  function startAsrDownload(
    engine: AsrEngine,
    name: string,
    background: boolean,
  ): void {
    dispatch({
      type: "SET_MODEL_DOWNLOAD",
      download: {
        kind: "asr",
        engine,
        name,
        percent: 0,
        stage: "downloading",
        background,
      },
    });
    if (background) {
      dispatch({ type: "DISMISS_CONFIRM" });
      dispatch({
        type: "SET_STATUS",
        message: t("settings.asrEngine.backgroundStarted", { name }),
      });
    }
    void downloadAsrModel(engine, {
      onProgress: (percent) => {
        dispatch({
          type: "SET_MODEL_DOWNLOAD",
          download: {
            kind: "asr",
            engine,
            name,
            percent,
            stage: "downloading",
            background,
          },
        });
      },
      onExtract: () => {
        dispatch({
          type: "SET_MODEL_DOWNLOAD",
          download: {
            kind: "asr",
            engine,
            name,
            percent: 100,
            stage: "extracting",
            background,
          },
        });
      },
    })
      .then(() => {
        dispatch({ type: "SET_MODEL_DOWNLOAD", download: null });
        applyAsrEngine(engine);
      })
      .catch((err) => {
        dispatch({ type: "SET_MODEL_DOWNLOAD", download: null });
        notify(
          t("settings.asrEngine.downloadFailed", { name }),
          String(err),
          "error",
          true,
        );
      });
  }

  function startSpkDownload(
    engine: SpkEngine,
    name: string,
    background: boolean,
  ): void {
    dispatch({
      type: "SET_MODEL_DOWNLOAD",
      download: {
        kind: "spk",
        engine,
        name,
        percent: 0,
        stage: "downloading",
        background,
      },
    });
    void downloadSpkModel(engine, {
      quiet: true,
      onProgress: (percent) => {
        dispatch({
          type: "SET_MODEL_DOWNLOAD",
          download: {
            kind: "spk",
            engine,
            name,
            percent,
            stage: "downloading",
            background,
          },
        });
      },
    })
      .then(() => {
        dispatch({ type: "SET_MODEL_DOWNLOAD", download: null });
        args.spkEngine = engine;
        args.noSpk = false;
        persist();
        refreshConfig();
        notify(t("settings.spkEngine.applied", { name }));
      })
      .catch((err) => {
        dispatch({ type: "SET_MODEL_DOWNLOAD", download: null });
        notify(
          t("settings.spkEngine.downloadFailed", { name }),
          String(err),
          "error",
          true,
        );
      });
  }

  function assignSpeaker(index1: number): void {
    const sp = state.speakers[index1 - 1];
    if (!sp) {
      notify(t("status.noSpeakerN", { n: index1 }), "", "warn");
      return;
    }
    const last = state.segments[state.segments.length - 1];
    if (!last) {
      notify(t("status.noSegment"), "", "warn");
      return;
    }
    const updated: TranscriptRow = { ...last, speakerId: sp.id };
    const speakers = state.speakers.map((s) => {
      let count = s.segmentCount;
      if (last.speakerId && s.id === last.speakerId) {
        count = Math.max(0, count - 1);
      }
      if (s.id === sp.id) count += 1;
      return { ...s, segmentCount: count };
    });
    dispatch({ type: "SET_SPEAKERS", speakers });
    dispatch({ type: "APPLY_SEGMENT", segment: updated });
    notify(t("status.assigned", { name: sp.displayName }));
  }

  function applyKey(logical: string): void {
    const keys = fieldKeysForCategory(
      state.settingsCategory,
      state.advancedVadOpen,
    );
    const result = mapKey(state, logical, {
      emptyNameError: t("resume.status.renameEmpty"),
      settingsKeys: keys,
    });
    // Fix confirm handling for model download
    for (const a of result.actions) {
      if (a.type === "SHOW_CONFIRM" && a.confirm.kind === "clear") {
        a.confirm.title = t("footer.clear");
        a.confirm.body = t("rezi.confirm.clearBody");
        a.confirm.confirmLabel = t("footer.confirm");
        a.confirm.cancelLabel = t("footer.cancel");
      }
      if (a.type === "SHOW_CONFIRM" && a.confirm.kind === "quit") {
        a.confirm.title = t("footer.quit");
        a.confirm.body = t("rezi.confirm.quitBody");
        a.confirm.confirmLabel = t("footer.confirm");
        a.confirm.cancelLabel = t("footer.cancel");
      }
      dispatch(a);
    }
    for (const e of result.effects) {
      if (
        e.type === "confirm-accepted" ||
        e.type === "confirm-cancelled" ||
        e.type === "confirm-background"
      ) {
        const choice =
          e.type === "confirm-accepted"
            ? "accept"
            : e.type === "confirm-background"
              ? "background"
              : "cancel";
        handleConfirmWrapped(e.kind, choice);
      } else {
        runEffects([e]);
      }
    }
  }

  function view(s: LiveUiState): VNode {
    const base = renderScreen(s);
    if (!s.confirm) return base;
    return ui.layers([base, renderConfirmModal(s.confirm, (choice) => {
      if (choice === "accept") applyKey("enter");
      else if (choice === "background") applyKey("b");
      else applyKey("escape");
    })]);
  }

  function renderScreen(s: LiveUiState): VNode {
    if (s.screen === "settings") {
      return renderSettingsScreen(
        s,
        {
          onSelectCategory: (id) =>
            dispatch({ type: "SET_SETTINGS_CATEGORY", category: id }),
          onSelectField: (key) =>
            dispatch({ type: "SET_SETTINGS_FOCUS", key }),
          onNudge: (key, dir) => nudgeSetting(key, dir),
          onActivate: (key) => activateSetting(key),
          onSelectAsrModel: (engine) => requestAsrEngine(engine),
          onEditInput: (value) =>
            dispatch({ type: "UPDATE_SETTINGS_EDIT", draft: value }),
          onClose: () => {
            flushSaveSettings(() => snapshotFromArgs(args));
            dispatch({ type: "CLOSE_OVERLAY" });
          },
        },
        (key) => formatSettingValue(s, key),
      );
    }

    if (s.screen === "speakers-panel") {
      return ui.page({
        header: ui.row({ px: 1 }, [
          ui.text(t("tui.speakersTitle"), {
            style: { fg: col.accent, bold: true },
          }),
          ui.button({
            id: "spk-panel-close",
            label: t("footer.close"),
            dsVariant: "ghost",
            dsSize: "sm",
            onPress: () => dispatch({ type: "CLOSE_SPEAKERS_PANEL" }),
          }),
        ]),
        body: renderSpeakerList(
          s,
          (id) => dispatch({ type: "SELECT_SPEAKER", id }),
          false,
        ),
        gap: 0,
        p: 1,
      });
    }

    return renderLiveScreen(s, {
      onSelectSegment: (id) => {
        if (id === "__return_live__") {
          dispatch({ type: "RETURN_TO_LIVE" });
          return;
        }
        dispatch({ type: "SELECT_SEGMENT", id });
      },
      onSelectSpeaker: (id) => dispatch({ type: "SELECT_SPEAKER", id }),
      onAction: (id) => {
        if (id === "pause") runEffects([{ type: "toggle-pause" }]);
        else if (id === "settings") dispatch({ type: "OPEN_SETTINGS" });
        else if (id === "share") runEffects([{ type: "toggle-share" }]);
        else if (id === "record") runEffects([{ type: "toggle-record" }]);
        else if (id === "clear") applyKey("c");
        else if (id === "speakers") dispatch({ type: "OPEN_SPEAKERS_PANEL" });
        else if (id === "return-live") dispatch({ type: "RETURN_TO_LIVE" });
        else if (id === "quit") applyKey("q");
      },
      onMeetingNameInput: (value) =>
        dispatch({ type: "UPDATE_MEETING_NAME_DRAFT", draft: value }),
      onMeetingNameSubmit: () => applyKey("enter"),
      onMeetingNameCancel: () =>
        dispatch({ type: "CANCEL_MEETING_NAME_EDIT" }),
      onBeginMeetingNameEdit: () =>
        dispatch({
          type: "BEGIN_MEETING_NAME_EDIT",
          returnFocus: s.focus,
        }),
    });
  }

  try {
    app = createNodeApp<LiveUiState>({
      initialState: state,
      theme: baribariTheme,
      config: {
        fpsCap: 30,
        executionMode: "inline" as const,
      },
    });
    app.view(view);
    app.keys({
      "ctrl+c": () => applyKey("ctrl+c"),
      "ctrl+d": () => applyKey("ctrl+d"),
      "ctrl+u": () => applyKey("ctrl+u"),
      q: () => {
        if (!state.meetingNameEdit && !state.settingsEditKey) applyKey("q");
      },
      s: () => {
        if (!state.meetingNameEdit && !state.settingsEditKey) applyKey("s");
      },
      p: () => {
        if (!state.meetingNameEdit && !state.settingsEditKey) applyKey("p");
      },
      h: () => {
        if (!state.meetingNameEdit && !state.settingsEditKey) applyKey("h");
      },
      r: () => {
        if (!state.meetingNameEdit && !state.settingsEditKey) applyKey("r");
      },
      c: () => {
        if (!state.meetingNameEdit && !state.settingsEditKey) applyKey("c");
      },
      e: () => {
        if (!state.meetingNameEdit && !state.settingsEditKey) applyKey("e");
      },
      g: () => {
        if (!state.meetingNameEdit && !state.settingsEditKey) applyKey("g");
      },
      m: () => {
        if (!state.meetingNameEdit && !state.settingsEditKey) applyKey("m");
      },
      j: () => applyKey("j"),
      k: () => applyKey("k"),
      l: () => applyKey("l"),
      y: () => applyKey("y"),
      n: () => applyKey("n"),
      b: () => applyKey("b"),
      "1": () => applyKey("1"),
      "2": () => applyKey("2"),
      "3": () => applyKey("3"),
      "4": () => applyKey("4"),
      "5": () => applyKey("5"),
      "6": () => applyKey("6"),
      "7": () => applyKey("7"),
      "8": () => applyKey("8"),
      "9": () => applyKey("9"),
      space: () => {
        if (!state.meetingNameEdit && !state.settingsEditKey) applyKey("space");
      },
      escape: () => applyKey("escape"),
      tab: () => applyKey("tab"),
      "shift+tab": () => applyKey("shift+tab"),
      up: () => applyKey("up"),
      down: () => applyKey("down"),
      left: () => applyKey("left"),
      right: () => applyKey("right"),
      enter: () => applyKey("enter"),
      backspace: () => applyKey("backspace"),
      pageup: () => applyKey("pageup"),
      pagedown: () => applyKey("pagedown"),
    });

    app.onEvent((ev) => {
      // Resize
      if (ev && typeof ev === "object" && "type" in ev) {
        const anyEv = ev as { type?: string; cols?: number; rows?: number; key?: string };
        if (anyEv.type === "resize" && anyEv.cols && anyEv.rows) {
          dispatch({
            type: "RESIZE",
            cols: anyEv.cols,
            rows: anyEv.rows,
            layoutMode: layoutModeFor(anyEv.cols, anyEv.rows),
          });
        }
        if (anyEv.type === "key" && anyEv.key) {
          const logical = normalizeKeyName(anyEv.key);
          // Digits for speaker assign
          if (
            logical.length === 1 &&
            logical >= "1" &&
            logical <= "9" &&
            !state.meetingNameEdit &&
            !state.settingsEditKey
          ) {
            applyKey(logical);
          }
        }
      }
    });

    // The CLI already owns signal handling and shutdown. Waiting for start()
    // makes native/backend failures observable by the factory so it can fall
    // back before a live handle is returned.
    await app.start();
  } catch (err) {
    try {
      app?.dispose();
    } catch {
      /* ignore cleanup failure while reporting startup failure */
    }
    console.error("[baribari] Rezi TUI failed to start:", err);
    throw err;
  }

  tickTimer = setInterval(() => {
    if (closed) return;
    dispatch({ type: "TICK", nowMs: Date.now() });
    // keep paused/recording flags in sync
    const snap = snapshotConfig(args, deviceName);
    if (
      snap.paused !== state.config.paused ||
      snap.recording !== state.config.recording ||
      snap.shareEnabled !== state.config.shareEnabled
    ) {
      dispatch({ type: "SET_CONFIG", config: snap });
    }
  }, 250);
  tickTimer.unref?.();

  const handle: TuiHandle = {
    emit(seg: Segment) {
      if (closed) return;
      if (isPartialSegment(seg)) {
        dispatch({ type: "SET_LIVE_PARTIAL", partial: mapPartial(seg) });
        return;
      }
      const { speakers, speakerId } = ensureSpeakerFromSeg(
        state.speakers,
        seg.spk,
        opts.resolveSpeakerName,
        (n) => t("common.speakerN", { n }),
      );
      if (speakers !== state.speakers) {
        dispatch({ type: "SET_SPEAKERS", speakers });
      }
      const existing = state.segments.find((s) => s.id === seg.id);
      const row = mapFinalSegment(
        seg,
        speakerId,
        existing,
        `seg_${++segSeq}`,
      );
      let nextSpeakers = speakers;
      if (!existing && !seg.pending && !seg.draft && speakerId) {
        nextSpeakers = bumpSpeakerCount(speakers, speakerId, speakerId);
        dispatch({ type: "SET_SPEAKERS", speakers: nextSpeakers });
      } else if (speakerId) {
        nextSpeakers = bumpSpeakerCount(speakers, null, speakerId);
        dispatch({ type: "SET_SPEAKERS", speakers: nextSpeakers });
      }
      dispatch({ type: "APPLY_SEGMENT", segment: row });

      if (out && !seg.pending && !seg.draft) {
        const spkLabel =
          speakerId &&
          nextSpeakers.find((s) => s.id === speakerId)?.displayName;
        const main = displayText(seg);
        const line = `[${new Date(seg.wall).toISOString()}] ${spkLabel || "—"}  ${main}${seg.translation ? ` | ${seg.translation}` : ""}`;
        out.write(line + "\n");
      }
    },
    setStatus(msg: string) {
      dispatch({ type: "SET_STATUS", message: msg });
    },
    setDevice(name: string) {
      deviceName = name;
      dispatch({ type: "SET_DEVICE", name });
    },
    setAiBusy(busy: boolean) {
      dispatch({ type: "SET_AI_BUSY", busy });
    },
    close() {
      if (closed) return;
      closed = true;
      if (tickTimer) clearInterval(tickTimer);
      try {
        flushSaveSettings(() => snapshotFromArgs(args));
      } catch {
        /* ignore */
      }
      const closingApp = app;
      void (async () => {
        if (closingApp) {
          try {
            await closingApp.stop();
          } catch {
            /* already stopped or backend cleanup failed */
          }
          try {
            closingApp.dispose();
          } catch {
            /* ignore */
          }
        }
        try {
          out?.end();
        } catch {
          /* ignore */
        }
        // Do not let the CLI print or exit until raw mode, mouse tracking and
        // the alternate screen have actually been restored.
        resolveClosed();
      })();
    },
    waitClosed: () => closedPromise,
  };

  return handle;
}
