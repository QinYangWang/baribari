import { ui, type VNode } from "@rezi-ui/core";
import { t } from "../../i18n/index.js";
import type { AsrEngine } from "../../types.js";
import { maskApiKey } from "../format.js";
import {
  SETTINGS_CATEGORIES,
  categoryHelp,
  categoryLabel,
  fieldsForCategory,
  type SettingField,
} from "../settings/catalog.js";
import type { LiveUiState } from "../types.js";
import { col } from "../colors.js";

export interface SettingsHandlers {
  onSelectCategory: (id: LiveUiState["settingsCategory"]) => void;
  onSelectField: (key: string) => void;
  onNudge: (key: string, dir: 1 | -1) => void;
  onActivate: (key: string) => void;
  onSelectAsrModel: (engine: AsrEngine) => void;
  onEditInput: (value: string) => void;
  onClose: () => void;
}

export function renderSettingsScreen(
  state: LiveUiState,
  handlers: SettingsHandlers,
  valueText: (key: string) => string,
): VNode {
  const wide = state.cols >= 100;
  const fields = fieldsForCategory(
    state.settingsCategory,
    state.advancedVadOpen,
  );

  const nav = ui.column({ gap: 0, width: 22, px: 1 }, [
    ui.text(t("tui.settingsTitle"), {
      style: { fg: col.accent, bold: true },
    }),
    ui.spacer({ size: 1 }),
    ...SETTINGS_CATEGORIES.map((cat) => {
      const selected = state.settingsCategory === cat.id;
      return ui.button({
        id: `settings-cat-${cat.id}`,
        label: `${selected ? "› " : "  "}${categoryLabel(cat.id)}`,
        dsVariant: selected ? "soft" : "ghost",
        dsSize: "sm",
        onPress: () => handlers.onSelectCategory(cat.id),
      });
    }),
    ui.spacer({ size: 1 }),
    ui.button({
      id: "settings-close",
      label: `${t("footer.close")} (Esc)`,
      dsVariant: "ghost",
      dsSize: "sm",
      onPress: () => handlers.onClose(),
    }),
  ]);

  const form = ui.column({ gap: 1, flex: 1, px: 1 }, [
    ui.text(categoryLabel(state.settingsCategory), {
      style: { fg: col.primary, bold: true },
    }),
    ...renderSpeechModels(state, handlers),
    ...fields.map((field) => renderField(state, field, handlers, valueText)),
  ]);

  const help = ui.column({ gap: 1, width: 28, px: 1 }, [
    ui.text(t("rezi.settings.helpTitle"), {
      style: { fg: col.accent, bold: true },
    }),
    ui.text(categoryHelp(state.settingsCategory), {
      style: { fg: col.secondary },
      wrap: true,
    }),
    state.settingsFocusKey
      ? ui.text(fieldHelp(state.settingsFocusKey), {
          style: { fg: col.muted },
          wrap: true,
        })
      : ui.text(""),
  ]);

  const body = wide
    ? ui.row({ gap: 2, flex: 1, p: 1 }, [nav, form, help])
    : state.cols >= 72
      ? ui.row({ gap: 1, flex: 1, p: 1 }, [nav, form])
      : ui.column({ gap: 1, flex: 1, p: 1 }, [nav, form]);

  return ui.page({
    header: ui.row({ px: 1 }, [
      ui.text(t("tui.settingsTitle"), {
        style: { fg: col.accent, bold: true },
      }),
    ]),
    body,
    footer: ui.row({ px: 1 }, [
      ui.text(t("settings.keys"), { style: { fg: col.muted } }),
    ]),
    gap: 0,
    p: 0,
  });
}

function renderSpeechModels(
  state: LiveUiState,
  handlers: SettingsHandlers,
): VNode[] {
  if (state.settingsCategory !== "speech") return [];
  if (!state.asrModels.length) return [];
  return [
    ui.column({ gap: 0, mb: 1 }, [
      ui.text(t("rezi.settings.asrModels"), {
        style: { fg: col.secondary, bold: true },
      }),
      ...state.asrModels.map((m) => {
        const flags = [
          m.current ? t("rezi.settings.current") : "",
          m.installed
            ? t("rezi.settings.installed")
            : t("rezi.settings.notInstalled"),
        ]
          .filter(Boolean)
          .join(" · ");
        return ui.button({
          id: `settings-asr-${m.engine}`,
          label: `${m.current ? "● " : "○ "}${m.label}  (${m.size})  ${flags}`,
          dsVariant: m.current ? "soft" : "ghost",
          dsSize: "sm",
          onPress: () => handlers.onSelectAsrModel(m.engine),
        });
      }),
    ]),
  ];
}

function renderField(
  state: LiveUiState,
  field: SettingField,
  handlers: SettingsHandlers,
  valueText: (key: string) => string,
): VNode {
  const focused = state.settingsFocusKey === field.key;
  const editing = state.settingsEditKey === field.key;
  const label = t(field.labelKey);

  if (editing) {
    return ui.column({ gap: 0 }, [
      ui.text(label, { style: { fg: col.accent, bold: true } }),
      ui.input({
        id: `settings-edit-${field.key}`,
        value: state.settingsEditDraft,
        onInput: (v) => handlers.onEditInput(v),
        dsSize: "sm",
      }),
      ui.text(t("tui.editingHint"), { style: { fg: col.muted } }),
    ]);
  }

  const value = valueText(field.key);
  return ui.button({
    id: `settings-field-${field.key}`,
    label: `${focused ? "› " : "  "}${label}  ${value}`,
    dsVariant: focused ? "soft" : "ghost",
    dsSize: "sm",
    onPress: () => {
      handlers.onSelectField(field.key);
      handlers.onActivate(field.key);
    },
  });
}

function fieldHelp(key: string): string {
  const map: Record<string, string> = {
    uiLang: "settings.items.uiLang.help",
    asrEngine: "settings.items.asrEngine.help",
    lang: "settings.items.lang.help",
    spkEngine: "settings.items.spkEngine.help",
    spkThr: "settings.items.spkThr.help",
    spkThrAdv: "settings.items.spkThr.help",
    aiEn: "settings.items.aiEn.help",
    aiTranslate: "settings.items.aiTranslate.help",
    aiProvider: "settings.items.aiProvider.help",
    aiBase: "settings.items.aiBase.help",
    aiKey: "settings.items.aiKey.help",
    aiModel: "settings.items.aiModel.help",
    source: "settings.items.source.help",
    recDir: "settings.items.recDir.help",
    record: "settings.items.record.help",
    share: "settings.items.share.help",
    sharePort: "settings.items.sharePort.help",
    shareHost: "settings.items.shareHost.help",
    vadPreset: "settings.items.vadPreset.help",
    vadThr: "settings.items.vadThr.help",
    vadMinSp: "settings.items.vadMinSp.help",
    vadSil: "settings.items.vadSil.help",
    vadMax: "settings.items.vadMax.help",
    vadWin: "settings.items.vadWin.help",
    advancedVad: "rezi.settings.advancedVadHelp",
    sessionName: "rezi.settings.sessionNameHelp",
  };
  const k = map[key];
  return k ? t(k) : "";
}

export function formatSettingValue(
  state: LiveUiState,
  key: string,
): string {
  const c = state.config;
  switch (key) {
    case "uiLang":
      return c.uiLang;
    case "lang":
      return c.lang;
    case "asrEngine":
      if (c.asrEngine === "funasr-nano") return "Fun-ASR-Nano";
      if (c.asrEngine === "reazonspeech-ja") {
        return t("settings.asrEngine.reazonSpeechName");
      }
      return "SenseVoice";
    case "spkEngine":
      return c.noSpk ? t("common.off") : c.spkEngine;
    case "spkThr":
    case "spkThrAdv":
      return c.spkThreshold.toFixed(2);
    case "aiEn":
      return c.aiEnabled
        ? c.aiHasKey
          ? t("common.on")
          : t("common.openMissingKey")
        : t("common.off");
    case "aiTranslate":
      return c.aiTranslateTo || t("common.off");
    case "aiProvider":
      return c.aiProviderLabel;
    case "aiBase":
      return c.aiBaseUrl || t("common.empty");
    case "aiKey":
      return maskApiKey(c.aiHasKey ? "configured-key" : "", t("common.unset"));
    case "aiModel":
      return c.aiModel || t("common.empty");
    case "source":
      return c.source;
    case "recDir":
      return c.recordDir;
    case "record":
      return c.recording ? t("common.on") : t("common.off");
    case "share":
      return c.shareEnabled ? t("common.on") : t("common.off");
    case "sharePort":
      return String(c.sharePort);
    case "shareHost":
      return c.shareHost || "0.0.0.0";
    case "vadPreset":
      return t(`settings.vadPreset.${c.vadPresetId}`);
    case "vadThr":
      return c.vadThreshold.toFixed(2);
    case "vadMinSp":
      return `${c.vadMinSpeech.toFixed(2)}s`;
    case "vadSil":
      return `${c.vadSilence.toFixed(2)}s`;
    case "vadMax":
      return `${c.vadMaxSpeech.toFixed(0)}s`;
    case "vadWin":
      return String(c.vadWindow);
    case "advancedVad":
      return state.advancedVadOpen ? t("common.on") : t("common.off");
    case "sessionName":
      return state.sessionName || t("common.empty");
    default:
      return "";
  }
}
