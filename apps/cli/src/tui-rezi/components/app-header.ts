import { ui, type VNode } from "@rezi-ui/core";
import { t } from "../../i18n/index.js";
import { fmtDur } from "../format.js";
import type { LiveUiState } from "../types.js";
import { col } from "../colors.js";

export interface AppHeaderHandlers {
  onMeetingNameInput?: (value: string) => void;
  onBeginMeetingNameEdit?: () => void;
}

/** Shared product header. Keeps meeting identity and listening state stable between screens. */
export function renderAppHeader(
  state: LiveUiState,
  screen: "live" | "settings",
  handlers: AppHeaderHandlers = {},
): VNode {
  const paused = state.config.paused;
  const status = paused
    ? `○ ${t("tui.paused")}`
    : state.recognizing
      ? `◉ ${t("tui.recognizing")}`
      : `● ${t("tui.listening")}`;
  const statusColor = paused ? col.warning : col.success;
  const meetingName = state.sessionName || t("rezi.live.untitled");

  const identity: VNode[] = [
    ui.text(t("rezi.brand"), { style: { fg: col.accent, bold: true } }),
  ];
  if (screen === "settings") {
    identity.push(
      ui.text(` / ${t("tui.settingsTitle")}`, {
        style: { fg: col.secondary },
      }),
    );
  }

  const meeting = screen === "settings"
    ? ui.text(meetingName, { style: { fg: col.secondary } })
    : state.meetingNameEdit
    ? ui.input({
        id: "meeting-name-input",
        value: state.meetingNameEdit.draft,
        accessibleLabel: t("rezi.live.meetingName"),
        placeholder: t("rezi.live.meetingName"),
        onInput: (value) => handlers.onMeetingNameInput?.(value),
        dsSize: "sm",
      })
    : ui.button({
        id: "meeting-name",
        label: meetingName,
        accessibleLabel: t("rezi.live.editMeetingName"),
        dsVariant: "ghost",
        dsSize: "sm",
        onPress: () => handlers.onBeginMeetingNameEdit?.(),
      });

  const rows: VNode[] = [
    ui.row({ gap: 2, align: "center" }, [
      ui.row({ gap: 0, align: "center" }, identity),
      meeting,
      ui.text(status, { style: { fg: statusColor, bold: true } }),
      ui.text(`· ${fmtDur(state.elapsedSec)}`, {
        style: { fg: col.secondary },
      }),
    ]),
  ];
  if (state.meetingNameEdit?.error && screen === "live") {
    rows.push(ui.text(state.meetingNameEdit.error, { style: { fg: col.error } }));
  }

  return ui.box(
    {
      id: `${screen}-header`,
      border: "single",
      borderTop: false,
      borderLeft: false,
      borderRight: false,
      borderBottom: true,
      borderStyle: { fg: col.border },
      px: 1,
      py: 0,
    },
    rows,
  );
}
