import { ui, type VNode } from "@rezi-ui/core";
import { t } from "../../i18n/index.js";
import { decideLayout } from "../layout.js";
import type { LiveUiState } from "../types.js";
import { renderActionsBar, type ActionId } from "./actions-bar.js";
import { renderInspector } from "./inspector.js";
import { renderSpeakerList } from "./speakers.js";
import { renderTranscriptList } from "./transcript.js";
import { col } from "../colors.js";
import { renderAppHeader } from "./app-header.js";

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
  const header = renderAppHeader(state, "live", handlers);
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
    body = ui.row({ gap: 0, flex: 1, px: 1 }, [
      ui.box({
        border: "single",
        borderStyle: { fg: col.border },
        width: 32,
        p: 1,
      }, [renderSpeakerList(state, handlers.onSelectSpeaker, true)]),
      ui.box({
        border: "single",
        borderStyle: { fg: col.border },
        flex: 1,
        p: 1,
      }, [
        renderTranscriptList(state, handlers.onSelectSegment),
      ]),
      ui.box({
        border: "single",
        borderStyle: { fg: col.border },
        width: 38,
        p: 1,
      }, [renderInspector(state)]),
    ]);
  } else if (layout.mode === "medium") {
    body = ui.row({ gap: 0, flex: 1, px: 1 }, [
      ui.box({ border: "single", borderStyle: { fg: col.border }, flex: 1, p: 1 }, [
        renderTranscriptList(state, handlers.onSelectSegment),
      ]),
      ui.box({ border: "single", borderStyle: { fg: col.border }, width: 34, p: 1 }, [
        renderInspector(state),
      ]),
    ]);
  } else {
    body = ui.column({ gap: 0, flex: 1, px: 1 }, [
      ui.box({ border: "single", borderStyle: { fg: col.border }, flex: 1, p: 1 }, [
        renderTranscriptList(state, handlers.onSelectSegment),
      ]),
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
