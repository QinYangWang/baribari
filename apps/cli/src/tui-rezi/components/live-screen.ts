import { ui, type VNode } from "@rezi-ui/core";
import { t } from "../../i18n/index.js";
import { decideLayout } from "../layout.js";
import { fmtDur } from "../format.js";
import type { LiveUiState } from "../types.js";
import { renderActionsBar, type ActionId } from "./actions-bar.js";
import { renderInspector } from "./inspector.js";
import { renderSpeakerList } from "./speakers.js";
import { renderTranscriptList } from "./transcript.js";
import { col } from "../colors.js";

export interface LiveScreenHandlers {
  onSelectSegment: (id: string) => void;
  onSelectSpeaker: (id: string) => void;
  onAction: (id: ActionId) => void;
  onMeetingNameInput: (value: string) => void;
  onMeetingNameSubmit: () => void;
  onMeetingNameCancel: () => void;
  onBeginMeetingNameEdit: () => void;
}

export function renderLiveScreen(
  state: LiveUiState,
  handlers: LiveScreenHandlers,
): VNode {
  const layout = decideLayout(state.cols, state.rows);
  const header = renderHeader(state, handlers);
  const actions = renderActionsBar(state, handlers.onAction);

  if (layout.tooSmall) {
    return ui.page({
      header,
      body: ui.column({ gap: 1, p: 1 }, [
        ui.text(t("status.termTooSmall"), { style: { fg: col.warning, bold: true } }),
        ui.text(
          t("status.termCurrent", { w: state.cols, h: state.rows }),
          { style: { fg: col.muted } },
        ),
        renderTranscriptList(state, handlers.onSelectSegment),
      ]),
      footer: actions,
      gap: 0,
      p: 0,
    });
  }

  let body: VNode;
  if (layout.mode === "wide") {
    body = ui.row({ gap: 2, flex: 1, p: 1 }, [
      renderSpeakerList(state, handlers.onSelectSpeaker, true),
      ui.box({ border: "none", flex: 1 }, [
        renderTranscriptList(state, handlers.onSelectSegment),
      ]),
      renderInspector(state),
    ]);
  } else if (layout.mode === "medium") {
    body = ui.row({ gap: 2, flex: 1, p: 1 }, [
      ui.box({ border: "none", flex: 1 }, [
        renderTranscriptList(state, handlers.onSelectSegment),
      ]),
      renderInspector(state),
    ]);
  } else {
    body = ui.column({ gap: 0, flex: 1, p: 1 }, [
      renderTranscriptList(state, handlers.onSelectSegment),
    ]);
  }

  return ui.page({
    header,
    body,
    footer: actions,
    gap: 0,
    p: 0,
  });
}

function renderHeader(
  state: LiveUiState,
  handlers: LiveScreenHandlers,
): VNode {
  const paused = state.config.paused;
  const listenLabel = paused
    ? `❚❚ ${t("tui.paused")}`
    : state.recognizing
      ? `● ${t("tui.recognizing")}`
      : `● ${t("tui.listening")}`;
  const listenFg = paused ? col.warning : col.success;
  const elapsed = fmtDur(state.elapsedSec);

  const nameEditing = !!state.meetingNameEdit;
  const nameValue = nameEditing
    ? state.meetingNameEdit!.draft
    : state.sessionName || t("rezi.live.untitled");

  const left: VNode[] = [
    ui.text(t("rezi.brand"), {
      style: { fg: col.accent, bold: true },
    }),
    ui.text("  ", { style: { fg: col.muted } }),
  ];

  if (nameEditing) {
    left.push(
      ui.input({
        id: "meeting-name-input",
        value: nameValue,
        accessibleLabel: t("rezi.live.meetingName"),
        placeholder: t("rezi.live.meetingName"),
        onInput: (v) => handlers.onMeetingNameInput(v),
        dsSize: "sm",
      }),
    );
    if (state.meetingNameEdit?.error) {
      left.push(
        ui.text(` ${state.meetingNameEdit.error}`, {
          style: { fg: col.error },
        }),
      );
    }
  } else {
    left.push(
      ui.button({
        id: "meeting-name",
        label: nameValue,
        accessibleLabel: t("rezi.live.meetingName"),
        dsVariant: "ghost",
        dsSize: "sm",
        onPress: () => handlers.onBeginMeetingNameEdit(),
      }),
    );
  }

  const right: VNode[] = [
    ui.text(listenLabel, { style: { fg: listenFg, bold: true } }),
    ui.text(`  ${elapsed}`, { style: { fg: col.muted } }),
  ];

  return ui.row({
    id: "live-header",
    justify: "between",
    px: 1,
    py: 0,
    gap: 1,
  }, [
    ui.row({ gap: 0 }, left),
    ui.row({ gap: 0 }, right),
  ]);
}
