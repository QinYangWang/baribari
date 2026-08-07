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
  return ui.column({ gap: 0, flex: 1, width: compact ? undefined : 28 }, [
    ui.text(`${t("rezi.live.speakersShort")} · ${items.length}`, {
      style: { fg: col.accent, bold: true },
    }),
    ui.spacer({ size: 1 }),
    items.length === 0
      ? ui.column({ gap: 0 }, [ui.spacer({ size: 1 }), ui.text(t("tui.noSpeakers"), { style: { fg: col.muted } })])
      : ui.virtualList<SpeakerView>({
          id: "speaker-list",
          items,
          itemHeight: 3,
          accessibleLabel: t("tui.speakersTitle"),
          onSelect: (sp) => onSelect(sp.id),
          renderItem: (sp, _i, focused) => {
            const selected =
              focused || state.selectedSpeakerId === sp.id;
            const marker = sp.isActive ? "●" : "○";
            return ui.box(
              {
                border: selected ? "single" : "none",
                borderStyle: { fg: selected ? col.accent : col.borderSoft },
                style: selected ? { bg: col.selectedBg } : undefined,
                px: 1,
              },
              [
                ui.text(`${marker}  ${sp.displayName}`, {
                  style: {
                    fg: speakerRgb(sp.colorIndex),
                    bold: sp.isActive || selected,
                  },
                  textOverflow: "ellipsis",
                }),
                ui.text(
                  `${t("tui.segs", { n: sp.segmentCount })}${sp.manual ? ` · ${t("rezi.live.named")}` : ""}`,
                  { style: { fg: col.muted } },
                ),
              ],
            );
          },
        }),
  ]);
}
