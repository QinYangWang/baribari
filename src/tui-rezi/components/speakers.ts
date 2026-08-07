import { ui, type VNode } from "@rezi-ui/core";
import { t } from "../../i18n/index.js";
import { speakerRgb } from "../theme.js";
import type { LiveUiState, SpeakerView } from "../types.js";
import { col } from "../colors.js";

export function renderSpeakerList(
  state: LiveUiState,
  onSelect: (id: string) => void,
  compact = false,
): VNode {
  const items = state.speakers;
  return ui.column({ gap: 0, width: compact ? 22 : 28 }, [
    ui.text(t("tui.speakersTitle"), {
      style: { fg: col.accent, bold: true },
    }),
    ui.text(t("tui.people", { n: items.length }), {
      style: { fg: col.muted },
    }),
    items.length === 0
      ? ui.column({ gap: 0 }, [ui.spacer({ size: 1 }), ui.text(t("tui.noSpeakers"), { style: { fg: col.muted } })])
      : ui.virtualList<SpeakerView>({
          id: "speaker-list",
          items,
          itemHeight: 2,
          accessibleLabel: t("tui.speakersTitle"),
          onSelect: (sp) => onSelect(sp.id),
          renderItem: (sp, _i, focused) => {
            const selected =
              focused || state.selectedSpeakerId === sp.id;
            const marker = selected ? "› " : sp.isActive ? "● " : "  ";
            return ui.box(
              {
                border: "none",
                style: selected ? { bg: col.selectedBg } : undefined,
                px: 0,
              },
              [
                ui.text(`${marker}${sp.displayName}`, {
                  style: {
                    fg: speakerRgb(sp.colorIndex),
                    bold: sp.isActive || selected,
                  },
                  textOverflow: "ellipsis",
                }),
                ui.text(
                  t("tui.segs", { n: sp.segmentCount }),
                  { style: { fg: col.muted } },
                ),
              ],
            );
          },
        }),
  ]);
}
