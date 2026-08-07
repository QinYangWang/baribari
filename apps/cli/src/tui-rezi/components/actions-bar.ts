import { ui, type VNode } from "@rezi-ui/core";
import { t } from "../../i18n/index.js";
import type { LiveUiState } from "../types.js";

export type ActionId =
  | "pause"
  | "settings"
  | "share"
  | "record"
  | "clear"
  | "speakers"
  | "return-live"
  | "quit";

export function renderActionsBar(
  state: LiveUiState,
  onAction: (id: ActionId) => void,
): VNode {
  const paused = state.config.paused;
  const showSpeakersBtn =
    state.layoutMode === "medium" ||
    state.layoutMode === "narrow" ||
    state.layoutMode === "tiny";

  const btns: VNode[] = [
    ui.button({
      id: "act-pause",
      label: `${paused ? "▶" : "❚❚"} ${t("footer.pause")} (p)`,
      dsVariant: paused ? "solid" : "soft",
      dsTone: paused ? "warning" : "default",
      dsSize: "sm",
      onPress: () => onAction("pause"),
    }),
    ui.button({
      id: "act-settings",
      label: `${t("footer.settings")} (s)`,
      dsVariant: "soft",
      dsSize: "sm",
      onPress: () => onAction("settings"),
    }),
    ui.button({
      id: "act-share",
      label: `${t("footer.share")} (h)`,
      dsVariant: state.config.shareEnabled ? "solid" : "soft",
      dsTone: state.config.shareEnabled ? "success" : "default",
      dsSize: "sm",
      onPress: () => onAction("share"),
    }),
    ui.button({
      id: "act-record",
      label: `${t("footer.record")} (r)`,
      dsVariant: state.config.recording ? "solid" : "soft",
      dsTone: state.config.recording ? "danger" : "default",
      dsSize: "sm",
      onPress: () => onAction("record"),
    }),
    ui.button({
      id: "act-clear",
      label: `${t("footer.clear")} (c)`,
      dsVariant: "ghost",
      dsSize: "sm",
      onPress: () => onAction("clear"),
    }),
  ];

  if (showSpeakersBtn) {
    btns.push(
      ui.button({
        id: "act-speakers",
        label: `${t("tui.speakersTitle")} (m)`,
        dsVariant: "soft",
        dsSize: "sm",
        onPress: () => onAction("speakers"),
      }),
    );
  }

  if (!state.followLive && state.unseenLiveCount > 0) {
    btns.push(
      ui.button({
        id: "act-live",
        label: t("rezi.live.returnLive", { n: state.unseenLiveCount }),
        dsVariant: "solid",
        dsTone: "primary",
        dsSize: "sm",
        onPress: () => onAction("return-live"),
      }),
    );
  }

  btns.push(
    ui.button({
      id: "act-quit",
      label: `${t("footer.quit")} (q)`,
      dsVariant: "ghost",
      dsTone: "danger",
      dsSize: "sm",
      onPress: () => onAction("quit"),
    }),
  );

  return ui.row({
    id: "actions-bar",
    gap: 1,
    px: 1,
    py: 0,
    wrap: true,
  }, btns);
}
