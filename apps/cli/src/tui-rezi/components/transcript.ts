import { ui, type VNode } from "@rezi-ui/core";
import { t } from "../../i18n/index.js";
import { fmtClock, fmtRange } from "../format.js";
import { speakerRgb } from "../theme.js";
import type { LivePartialView, LiveUiState, TranscriptRow } from "../types.js";
import { col } from "../colors.js";

export interface TranscriptItem {
  kind: "segment" | "partial" | "empty";
  id: string;
  row?: TranscriptRow;
  partial?: LivePartialView;
}

export function buildTranscriptItems(state: LiveUiState): TranscriptItem[] {
  const items: TranscriptItem[] = state.segments.map((row) => ({
    kind: "segment" as const,
    id: row.id,
    row,
  }));
  if (state.livePartial) {
    items.push({
      kind: "partial",
      id: "__live_partial__",
      partial: state.livePartial,
    });
  }
  if (!items.length) {
    items.push({ kind: "empty", id: "__empty__" });
  }
  return items;
}

function speakerLabel(state: LiveUiState, speakerId: string | null): string {
  if (!speakerId) return t("common.unknownSpeaker");
  const sp = state.speakers.find((s) => s.id === speakerId);
  return sp?.displayName || t("common.unknownSpeaker");
}

function speakerColorIndex(state: LiveUiState, speakerId: string | null): number {
  if (!speakerId) return 0;
  const sp = state.speakers.find((s) => s.id === speakerId);
  return sp?.colorIndex ?? 0;
}

export function renderTranscriptRow(
  state: LiveUiState,
  item: TranscriptItem,
  focused: boolean,
): VNode {
  if (item.kind === "empty") {
    return ui.column({ gap: 0, p: 1 }, [
      ui.text(t("tui.waiting1"), { style: { fg: col.muted } }),
      ui.text(t("tui.waiting2"), { style: { fg: col.muted } }),
    ]);
  }

  if (item.kind === "partial" && item.partial) {
    const p = item.partial;
    const selected = focused || state.selectedSegmentId === item.id;
    return ui.box(
      {
        border: "single",
        borderStyle: { fg: selected ? col.accent : col.border },
        style: selected ? { bg: col.selectedBg } : undefined,
        px: 1,
        py: 0,
        mb: 1,
      },
      [
        ui.text(
          `◉ ${t("tui.liveLine")}   ${fmtClock(p.wallMs)}   ${t("tui.recognizing")}`,
          { style: { fg: col.accent, bold: true } },
        ),
        ui.text(t("rezi.inspector.original"), { style: { fg: col.accent } }),
        ui.text(p.text, { style: { fg: col.secondary }, wrap: true }),
      ],
    );
  }

  const row = item.row!;
  const selected =
    focused ||
    state.selectedSegmentId === row.id ||
    (state.followLive &&
      state.segments[state.segments.length - 1]?.id === row.id &&
      !state.selectedSegmentId);
  const marker = row.isActive ? "●" : "○";
  const name = speakerLabel(state, row.speakerId);
  const color = speakerRgb(speakerColorIndex(state, row.speakerId));
  const time = `${fmtClock(row.wallMs)} ${fmtRange(row.startedAtMs, row.endedAtMs)}`;
  const stateLabel = row.pending
    ? t("status.aiProcessing")
    : row.isDraft
      ? t("rezi.inspector.draft")
      : t("rezi.inspector.final");

  const children: VNode[] = [
    ui.row({ gap: 1, justify: "between" }, [
      ui.text(`${marker}  ${name}`, {
        style: { fg: color, bold: true },
      }),
      ui.text(`${time}   ${row.isFinal ? "✓" : "◌"} ${stateLabel}`, {
        style: { fg: row.isFinal ? col.success : col.accent },
      }),
    ]),
    ui.text(t("rezi.inspector.original"), {
      style: { fg: col.accent },
    }),
    ui.text(row.originalText || "—", {
      style: { fg: col.primary },
      wrap: true,
    }),
  ];
  if (row.translatedText) {
    children.push(
      ui.text(t("rezi.live.aiTranslation"), {
        style: { fg: col.success },
      }),
      ui.text(row.translatedText, { style: { fg: col.primary }, wrap: true }),
      ui.text(`✓ ${t("rezi.live.translated")}`, {
        style: { fg: col.success },
      }),
    );
  } else if (row.pending) {
    children.push(
      ui.text(t("rezi.live.aiTranslation"), { style: { fg: col.success } }),
      ui.text(t("rezi.live.translating"), { style: { fg: col.accent } }),
      ui.text(`⋯ ${t("status.aiProcessing")}`, { style: { fg: col.muted } }),
    );
  }

  return ui.box(
    {
      border: "single",
      borderStyle: { fg: selected ? col.accent : col.border },
      style: selected ? { bg: col.selectedBg } : undefined,
      px: 1,
      py: 0,
      mb: 1,
    },
    children,
  );
}

export function renderTranscriptList(
  state: LiveUiState,
  onSelect: (id: string) => void,
): VNode {
  const items = buildTranscriptItems(state);
  const ensureIdx =
    state.followLive && items.length
      ? items.length - 1
      : Math.max(
          0,
          items.findIndex((i) => i.id === state.selectedSegmentId),
        );

  return ui.column({ gap: 0, flex: 1 }, [
    ui.row({ justify: "between", px: 1, pb: 0 }, [
      ui.text(t("tui.transcriptTitle"), {
        style: { fg: col.accent, bold: true },
      }),
      !state.followLive && state.unseenLiveCount > 0
        ? ui.button({
            id: "return-live",
            label: t("rezi.live.returnLive", { n: state.unseenLiveCount }),
            dsVariant: "soft",
            dsSize: "sm",
            onPress: () => onSelect("__return_live__"),
          })
        : ui.text(""),
    ]),
    ui.virtualList<TranscriptItem>({
      id: "transcript-list",
      items,
      estimateItemHeight: (item) => {
        if (item.kind === "empty") return 3;
        if (item.kind === "partial") return 3;
        const row = item.row!;
        if (row.translatedText || row.pending) return 8;
        return 5;
      },
      ensureVisibleIndex: ensureIdx >= 0 ? ensureIdx : undefined,
      ensureVisibleMode: state.followLive ? "sticky" : "always",
      accessibleLabel: t("tui.transcriptTitle"),
      selectionStyle: { bg: col.selectedBg },
      onSelect: (item) => {
        if (item.kind === "segment") onSelect(item.id);
      },
      renderItem: (item, _i, focused) => renderTranscriptRow(state, item, focused),
    }),
  ]);
}
