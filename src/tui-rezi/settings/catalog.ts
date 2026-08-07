import { t } from "../../i18n/index.js";
import type { SettingsCategoryId } from "../types.js";

export type SettingFieldKind =
  | "cycle"
  | "toggle"
  | "text"
  | "number"
  | "action"
  | "info";

export interface SettingField {
  key: string;
  category: SettingsCategoryId;
  kind: SettingFieldKind;
  /** i18n label key under settings.items.* or rezi.settings.* */
  labelKey: string;
  helpKey: string;
  /** Hide until Advanced VAD disclosure is open. */
  advancedVad?: boolean;
}

export interface SettingsCategory {
  id: SettingsCategoryId;
  labelKey: string;
  helpKey: string;
}

export const SETTINGS_CATEGORIES: SettingsCategory[] = [
  {
    id: "meeting",
    labelKey: "rezi.settings.cat.meeting",
    helpKey: "rezi.settings.cat.meetingHelp",
  },
  {
    id: "speech",
    labelKey: "rezi.settings.cat.speech",
    helpKey: "rezi.settings.cat.speechHelp",
  },
  {
    id: "ai",
    labelKey: "rezi.settings.cat.ai",
    helpKey: "rezi.settings.cat.aiHelp",
  },
  {
    id: "recording",
    labelKey: "rezi.settings.cat.recording",
    helpKey: "rezi.settings.cat.recordingHelp",
  },
  {
    id: "advanced",
    labelKey: "rezi.settings.cat.advanced",
    helpKey: "rezi.settings.cat.advancedHelp",
  },
];

export const SETTING_FIELDS: SettingField[] = [
  // Meeting
  {
    key: "uiLang",
    category: "meeting",
    kind: "cycle",
    labelKey: "settings.items.uiLang.label",
    helpKey: "settings.items.uiLang.help",
  },
  {
    key: "source",
    category: "meeting",
    kind: "cycle",
    labelKey: "settings.items.source.label",
    helpKey: "settings.items.source.help",
  },
  {
    key: "sessionName",
    category: "meeting",
    kind: "text",
    labelKey: "rezi.settings.sessionName",
    helpKey: "rezi.settings.sessionNameHelp",
  },

  // Speech recognition
  {
    key: "asrEngine",
    category: "speech",
    kind: "cycle",
    labelKey: "settings.items.asrEngine.label",
    helpKey: "settings.items.asrEngine.help",
  },
  {
    key: "lang",
    category: "speech",
    kind: "cycle",
    labelKey: "settings.items.lang.label",
    helpKey: "settings.items.lang.help",
  },
  {
    key: "spkEngine",
    category: "speech",
    kind: "cycle",
    labelKey: "settings.items.spkEngine.label",
    helpKey: "settings.items.spkEngine.help",
  },
  {
    key: "spkThr",
    category: "speech",
    kind: "number",
    labelKey: "settings.items.spkThr.label",
    helpKey: "settings.items.spkThr.help",
  },
  {
    key: "vadPreset",
    category: "speech",
    kind: "cycle",
    labelKey: "settings.items.vadPreset.label",
    helpKey: "settings.items.vadPreset.help",
  },
  {
    key: "vadSil",
    category: "speech",
    kind: "number",
    labelKey: "settings.items.vadSil.label",
    helpKey: "settings.items.vadSil.help",
  },
  {
    key: "vadMax",
    category: "speech",
    kind: "number",
    labelKey: "settings.items.vadMax.label",
    helpKey: "settings.items.vadMax.help",
  },
  {
    key: "advancedVad",
    category: "speech",
    kind: "action",
    labelKey: "rezi.settings.advancedVad",
    helpKey: "rezi.settings.advancedVadHelp",
  },
  {
    key: "vadThr",
    category: "speech",
    kind: "number",
    labelKey: "settings.items.vadThr.label",
    helpKey: "settings.items.vadThr.help",
    advancedVad: true,
  },
  {
    key: "vadMinSp",
    category: "speech",
    kind: "number",
    labelKey: "settings.items.vadMinSp.label",
    helpKey: "settings.items.vadMinSp.help",
    advancedVad: true,
  },
  {
    key: "vadWin",
    category: "speech",
    kind: "number",
    labelKey: "settings.items.vadWin.label",
    helpKey: "settings.items.vadWin.help",
    advancedVad: true,
  },

  // AI
  {
    key: "aiEn",
    category: "ai",
    kind: "toggle",
    labelKey: "settings.items.aiEn.label",
    helpKey: "settings.items.aiEn.help",
  },
  {
    key: "aiTranslate",
    category: "ai",
    kind: "cycle",
    labelKey: "settings.items.aiTranslate.label",
    helpKey: "settings.items.aiTranslate.help",
  },
  {
    key: "aiProvider",
    category: "ai",
    kind: "cycle",
    labelKey: "settings.items.aiProvider.label",
    helpKey: "settings.items.aiProvider.help",
  },
  {
    key: "aiBase",
    category: "ai",
    kind: "text",
    labelKey: "settings.items.aiBase.label",
    helpKey: "settings.items.aiBase.help",
  },
  {
    key: "aiKey",
    category: "ai",
    kind: "text",
    labelKey: "settings.items.aiKey.label",
    helpKey: "settings.items.aiKey.help",
  },
  {
    key: "aiModel",
    category: "ai",
    kind: "text",
    labelKey: "settings.items.aiModel.label",
    helpKey: "settings.items.aiModel.help",
  },

  // Recording and sharing
  {
    key: "record",
    category: "recording",
    kind: "toggle",
    labelKey: "settings.items.record.label",
    helpKey: "settings.items.record.help",
  },
  {
    key: "recDir",
    category: "recording",
    kind: "text",
    labelKey: "settings.items.recDir.label",
    helpKey: "settings.items.recDir.help",
  },
  {
    key: "share",
    category: "recording",
    kind: "toggle",
    labelKey: "settings.items.share.label",
    helpKey: "settings.items.share.help",
  },
  {
    key: "sharePort",
    category: "recording",
    kind: "number",
    labelKey: "settings.items.sharePort.label",
    helpKey: "settings.items.sharePort.help",
  },
  {
    key: "shareHost",
    category: "recording",
    kind: "text",
    labelKey: "settings.items.shareHost.label",
    helpKey: "settings.items.shareHost.help",
  },

  // Advanced
  {
    key: "spkThrAdv",
    category: "advanced",
    kind: "number",
    labelKey: "settings.items.spkThr.label",
    helpKey: "settings.items.spkThr.help",
  },
];

export function fieldsForCategory(
  category: SettingsCategoryId,
  advancedVadOpen: boolean,
): SettingField[] {
  return SETTING_FIELDS.filter((f) => {
    if (f.category !== category) return false;
    if (f.advancedVad && !advancedVadOpen) return false;
    return true;
  });
}

export function fieldKeysForCategory(
  category: SettingsCategoryId,
  advancedVadOpen: boolean,
): string[] {
  return fieldsForCategory(category, advancedVadOpen).map((f) => f.key);
}

export function categoryLabel(id: SettingsCategoryId): string {
  const cat = SETTINGS_CATEGORIES.find((c) => c.id === id);
  return cat ? t(cat.labelKey) : id;
}

export function categoryHelp(id: SettingsCategoryId): string {
  const cat = SETTINGS_CATEGORIES.find((c) => c.id === id);
  return cat ? t(cat.helpKey) : "";
}
