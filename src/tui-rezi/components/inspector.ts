import { ui, type VNode } from "@rezi-ui/core";
import { t } from "../../i18n/index.js";
import { fmtClock, fmtDur, fmtRange } from "../format.js";
import type { LiveUiState } from "../types.js";
import { col } from "../colors.js";

function kv(label: string, value: string, tone?: "ok" | "warn" | "muted"): VNode {
  const fg =
    tone === "ok"
      ? col.success
      : tone === "warn"
        ? col.warning
        : col.secondary;
  return ui.row({ gap: 1, justify: "between" }, [
    ui.text(label, { style: { fg: col.muted } }),
    ui.text(value, { style: { fg }, textOverflow: "ellipsis" }),
  ]);
}

export function renderInspector(state: LiveUiState): VNode {
  const title =
    state.inspectorMode === "segment"
      ? t("rezi.inspector.segment")
      : state.inspectorMode === "speaker"
        ? t("rezi.inspector.speaker")
        : t("rezi.inspector.meeting");

  const body: VNode[] = [];

  if (state.modelDownload) {
    const d = state.modelDownload;
    body.push(
      ui.column({ gap: 0, mb: 1 }, [
        ui.text(t("tui.modelDownload"), {
          style: { fg: col.warning, bold: true },
        }),
        kv(t("tui.downloadModel"), d.name),
        kv(
          t("tui.downloadStage"),
          d.stage === "extracting" ? t("tui.extracting") : t("tui.downloading"),
        ),
        kv(t("tui.downloadProgress"), `${Math.round(d.percent)}%`),
      ]),
    );
  }

  if (state.inspectorMode === "segment" && state.selectedSegmentId) {
    const seg = state.segments.find((s) => s.id === state.selectedSegmentId);
    if (seg) {
      const sp = state.speakers.find((s) => s.id === seg.speakerId);
      body.push(
        kv(t("rezi.inspector.time"), fmtClock(seg.wallMs)),
        kv(
          t("rezi.inspector.range"),
          fmtRange(seg.startedAtMs, seg.endedAtMs),
        ),
        kv(
          t("rezi.inspector.speakerName"),
          sp?.displayName || t("common.unknownSpeaker"),
        ),
        kv(
          t("rezi.inspector.state"),
          seg.pending
            ? t("status.aiProcessing")
            : seg.isDraft
              ? t("rezi.inspector.draft")
              : t("rezi.inspector.final"),
        ),
      );
      body.push(
        ui.spacer({ size: 1 }),
        ui.text(t("rezi.inspector.original"), {
          style: { fg: col.muted, bold: true },
        }),
        ui.text(seg.originalText || "—", {
          style: { fg: col.primary },
          wrap: true,
        }),
      );
      if (seg.translatedText) {
        body.push(
          ui.spacer({ size: 1 }),
          ui.text(t("rezi.inspector.translation"), {
            style: { fg: col.muted, bold: true },
          }),
          ui.text(seg.translatedText, {
            style: { fg: col.success },
            wrap: true,
          }),
        );
      }
    }
  } else if (state.inspectorMode === "speaker" && state.selectedSpeakerId) {
    const sp = state.speakers.find((s) => s.id === state.selectedSpeakerId);
    if (sp) {
      body.push(
        kv(t("rezi.inspector.speakerName"), sp.displayName),
        kv(t("tui.segs"), String(sp.segmentCount)),
        kv(
          t("rezi.inspector.state"),
          sp.isActive ? t("tui.listening") : t("common.dash"),
        ),
      );
    }
  } else {
    const c = state.config;
    const listen = c.paused
      ? t("tui.paused")
      : state.recognizing
        ? t("tui.recognizing")
        : t("tui.listening");
    body.push(
      kv(t("tui.device"), c.deviceName || t("common.dash")),
      kv(t("tui.source"), sourceLabel(c.source)),
      kv(t("tui.language"), c.lang),
      kv(t("settings.items.asrEngine.label"), asrLabel(c.asrEngine)),
      kv(
        t("tui.aiEnh"),
        c.aiEnabled
          ? c.aiHasKey
            ? t("common.on")
            : t("common.openMissingKey")
          : t("common.off"),
        c.aiEnabled ? (c.aiHasKey ? "ok" : "warn") : "muted",
      ),
      kv(
        t("tui.share"),
        c.shareEnabled ? `:${c.sharePort}` : t("tui.shareOff"),
        c.shareEnabled ? "ok" : "muted",
      ),
      kv(
        t("tui.recState"),
        c.recording ? t("tui.recording") : t("tui.notRecording"),
        c.recording ? "warn" : "muted",
      ),
      kv(t("tui.vadPreset"), t(`settings.vadPreset.${c.vadPresetId}`)),
      kv(t("tui.vadSilence"), `${c.vadSilence.toFixed(2)}s`),
      kv(t("tui.vadMaxSpeech"), `${c.vadMaxSpeech.toFixed(0)}s`),
      kv(t("tui.duration"), fmtDur(state.elapsedSec)),
      kv(t("rezi.inspector.listenState"), listen),
    );
    if (state.statusMessage) {
      body.push(
        ui.spacer({ size: 1 }),
        ui.text(state.statusMessage, {
          style: { fg: col.secondary },
          wrap: true,
        }),
      );
    }
  }

  if (state.notice) {
    const n = state.notice;
    const fg =
      n.kind === "error"
        ? col.error
        : n.kind === "warn"
          ? col.warning
          : n.kind === "success"
            ? col.success
            : col.info;
    body.push(
      ui.column({ gap: 0, mt: 1 }, [
        ui.text(n.title, { style: { fg, bold: true } }),
        ui.text(n.body, { style: { fg: col.secondary }, wrap: true }),
      ]),
    );
  }

  return ui.column({ gap: 0, width: 32, px: 1 }, [
    ui.text(title, { style: { fg: col.accent, bold: true } }),
    ui.spacer({ size: 1 }),
    ...body,
  ]);
}

function sourceLabel(s: string): string {
  if (s === "loopback") return t("source.loopback");
  if (s === "both") return t("source.both");
  return t("source.mic");
}

function asrLabel(engine: string): string {
  if (engine === "funasr-nano") return "Fun-ASR-Nano";
  if (engine === "reazonspeech-ja") return t("settings.asrEngine.reazonSpeechName");
  return "SenseVoice";
}
