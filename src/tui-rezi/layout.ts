import {
  LayoutMode,
  MEDIUM_MIN,
  NARROW_MIN,
  TINY_MIN_H,
  TINY_MIN_W,
  WIDE_MIN,
} from "./types.js";

export interface LayoutDecision {
  mode: LayoutMode;
  showSpeakers: boolean;
  showInspector: boolean;
  speakersAsPanel: boolean;
  inspectorAsPanel: boolean;
  /** Terminal is usable for basic listening/transcript/actions. */
  usable: boolean;
  tooSmall: boolean;
}

export function decideLayout(cols: number, rows: number): LayoutDecision {
  const c = Math.max(0, cols | 0);
  const r = Math.max(0, rows | 0);
  const tooSmall = c < TINY_MIN_W || r < TINY_MIN_H;

  if (c >= WIDE_MIN && r >= 18) {
    return {
      mode: "wide",
      showSpeakers: true,
      showInspector: true,
      speakersAsPanel: false,
      inspectorAsPanel: false,
      usable: true,
      tooSmall: false,
    };
  }
  if (c >= MEDIUM_MIN && r >= 16) {
    return {
      mode: "medium",
      showSpeakers: false,
      showInspector: true,
      speakersAsPanel: true,
      inspectorAsPanel: false,
      usable: true,
      tooSmall: false,
    };
  }
  if (c >= NARROW_MIN && r >= 14) {
    return {
      mode: "narrow",
      showSpeakers: false,
      showInspector: false,
      speakersAsPanel: true,
      inspectorAsPanel: true,
      usable: true,
      tooSmall: false,
    };
  }
  // tiny: keep basic listening / transcript / actions
  return {
    mode: "tiny",
    showSpeakers: false,
    showInspector: false,
    speakersAsPanel: true,
    inspectorAsPanel: true,
    usable: !tooSmall,
    tooSmall,
  };
}

export function layoutModeFor(cols: number, rows: number): LayoutMode {
  return decideLayout(cols, rows).mode;
}

/** Major focus regions for Tab cycling on the live screen. */
export function liveFocusOrder(mode: LayoutMode, speakersOpen: boolean): string[] {
  if (mode === "wide") {
    return ["header-name", "speakers", "transcript", "inspector", "actions"];
  }
  if (mode === "medium") {
    return speakersOpen
      ? ["header-name", "speakers", "transcript", "inspector", "actions"]
      : ["header-name", "transcript", "inspector", "actions"];
  }
  // narrow / tiny
  return speakersOpen
    ? ["header-name", "speakers", "transcript", "actions"]
    : ["header-name", "transcript", "actions"];
}
