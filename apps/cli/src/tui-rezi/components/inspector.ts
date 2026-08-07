import { ui, type VNode } from "@rezi-ui/core";
import { t } from "../../i18n/index.js";
import { fmtDur, fmtRange } from "../format.js";
import type { LiveUiState } from "../types.js";
import { col } from "../colors.js";

function line(
  value: string,
  tone: "ok" | "warn" | "info" | "muted" = "muted",
): VNode {
  const fg = tone === "ok"
    ? col.success
    : tone === "warn"
      ? col.warning
      : tone === "info"
        ? col.info
        : col.secondary;
  return ui.text(value, {
    style: { fg },
    wrap: true,
    textOverflow: "ellipsis",
  });
}

function section(
  icon: string,
  title: string,
  children: VNode[],
  tone = col.accent,
): VNode {
  return ui.box(
    {
      border: "none",
      borderBottom: true,
      borderStyle: { fg: col.borderSoft },
      pb: 1,
      mb: 1,
    },
    [
      ui.text(`${icon}  ${title}`, { style: { fg: tone, bold: true } }),
      ...children,
    ],
  );
}

export function renderInspector(state: LiveUiState): VNode {
  const c = state.config;
  const compact = state.layoutMode !== "wide" || state.rows < 28;
  const body: VNode[] = [
    ui.text(t("tui.sideTitle"), { style: { fg: col.accent, bold: true } }),
    ui.spacer({ size: 1 }),
  ];

  if (state.modelDownload) {
    const d = state.modelDownload;
    body.push(
      section(
        "⇩",
        t("tui.modelDownload"),
        [
          line(d.name, "warn"),
          line(
            d.stage === "extracting"
              ? t("tui.extracting")
              : t("tui.downloading"),
          ),
          ui.progress(Math.max(0, Math.min(1, d.percent / 100)), {
            showPercent: true,
            variant: "bar",
            dsTone: "warning",
          }),
          d.background
            ? line(t("rezi.live.backgroundDownload"), "info")
            : line(t("rezi.live.foregroundDownload")),
        ],
        col.warning,
      ),
    );
  }

  body.push(
    section("≋", t("rezi.status.audio"), [
      line(`● ${sourceLabel(c.source)}`, "ok"),
      line(c.deviceName || t("common.dash")),
    ], col.info),
    section("▣", t("rezi.status.recognition"), [
      line(`${c.lang} · ${asrLabel(c.asrEngine)}`),
      line(
        `VAD ${t(`settings.vadPreset.${c.vadPresetId}`)} · ${c.vadSilence.toFixed(2)}s`,
      ),
    ]),
  );

  if (compact) {
    body.push(
      section("◈", t("rezi.status.services"), [
        line(
          `AI ${c.aiEnabled ? `● ${t("rezi.status.enabled")}` : `○ ${t("common.off")}`}`,
          c.aiEnabled ? "ok" : "muted",
        ),
        line(
          `${t("footer.record")} ${c.recording ? `● ${t("tui.recording")}` : `○ ${t("tui.notRecording")}`}`,
          c.recording ? "ok" : "muted",
        ),
        line(
          `${t("footer.share")} ${c.shareEnabled ? `● ${shareAddress(c.shareHost, c.sharePort)}` : `○ ${t("tui.shareOff")}`}`,
          c.shareEnabled ? "ok" : "muted",
        ),
        line(`${t("tui.duration")} · ${fmtDur(state.elapsedSec)}`),
      ]),
    );
  } else {
    body.push(
      section("✧", "AI", [
        line(
          c.aiEnabled
            ? `● ${c.aiHasKey ? t("rezi.status.enabled") : t("common.openMissingKey")}`
            : `○ ${t("common.off")}`,
          c.aiEnabled && c.aiHasKey ? "ok" : c.aiEnabled ? "warn" : "muted",
        ),
        state.aiBusy
          ? line(t("status.aiProcessing"), "ok")
          : line(t("rezi.status.idle")),
      ], col.success),
      section("◎", t("footer.record"), [
        line(
          c.recording
            ? `● ${t("tui.recording")}`
            : `○ ${t("tui.notRecording")}`,
          c.recording ? "ok" : "muted",
        ),
      ]),
      section("⌯", t("footer.share"), [
        line(
          c.shareEnabled
            ? `● ${shareAddress(c.shareHost, c.sharePort)}`
            : `○ ${t("tui.shareOff")}`,
          c.shareEnabled ? "ok" : "muted",
        ),
      ], col.info),
      section(
        "◷",
        t("tui.duration"),
        [line(fmtDur(state.elapsedSec))],
        col.blue,
      ),
    );
  }

  const context = renderSelectionContext(state);
  if (context) body.push(context);

  if (state.notice) {
    const tone = state.notice.kind === "error"
      ? col.error
      : state.notice.kind === "warn"
        ? col.warning
        : state.notice.kind === "success"
          ? col.success
          : col.info;
    body.push(section("!", state.notice.title, [line(state.notice.body)], tone));
  } else if (state.statusMessage) {
    body.push(line(state.statusMessage));
  }

  return ui.column({ gap: 0, flex: 1 }, body);
}

function renderSelectionContext(state: LiveUiState): VNode | null {
  if (state.inspectorMode === "segment" && state.selectedSegmentId) {
    const seg = state.segments.find(
      (item) => item.id === state.selectedSegmentId,
    );
    if (!seg) return null;
    const speaker = state.speakers.find((item) => item.id === seg.speakerId);
    return section("▤", t("rezi.inspector.segment"), [
      line(
        `${speaker?.displayName || t("common.unknownSpeaker")} · ${fmtRange(seg.startedAtMs, seg.endedAtMs)}`,
      ),
      line(
        seg.isFinal
          ? `✓ ${t("rezi.inspector.final")}`
          : `◌ ${t("rezi.inspector.draft")}`,
        seg.isFinal ? "ok" : "warn",
      ),
    ]);
  }
  if (state.inspectorMode === "speaker" && state.selectedSpeakerId) {
    const speaker = state.speakers.find(
      (item) => item.id === state.selectedSpeakerId,
    );
    if (!speaker) return null;
    return section("♙", t("rezi.inspector.speaker"), [
      line(speaker.displayName),
      line(t("tui.segs", { n: speaker.segmentCount })),
    ]);
  }
  return null;
}

function sourceLabel(source: string): string {
  if (source === "loopback") return t("source.loopback");
  if (source === "both") return t("source.both");
  return t("source.mic");
}

function asrLabel(engine: string): string {
  if (engine === "funasr-nano") return "Fun-ASR-Nano";
  if (engine === "reazonspeech-ja") {
    return t("settings.asrEngine.reazonSpeechName");
  }
  return "SenseVoice";
}

function shareAddress(host: string, port: number): string {
  const displayHost = host === "0.0.0.0" ? t("rezi.status.lan") : host;
  return `${displayHost}:${port}`;
}
