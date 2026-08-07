import { darkTheme, extendTheme, rgb, type ThemeDefinition } from "@rezi-ui/core";

/** baribari dark theme — spacing-first, violet accent. */
export const baribariTheme: ThemeDefinition = extendTheme(darkTheme, {
  colors: {
    accent: {
      primary: rgb(167, 139, 250),
      secondary: rgb(196, 181, 253),
      tertiary: rgb(124, 58, 237),
    },
    fg: {
      primary: rgb(250, 250, 250),
      secondary: rgb(161, 161, 170),
      muted: rgb(113, 113, 122),
      inverse: rgb(9, 9, 11),
    },
    bg: {
      base: rgb(9, 9, 11),
      elevated: rgb(24, 24, 27),
      overlay: rgb(24, 24, 27),
      subtle: rgb(39, 39, 42),
    },
    border: {
      subtle: rgb(39, 39, 42),
      default: rgb(63, 63, 70),
      strong: rgb(82, 82, 91),
    },
    selected: {
      bg: rgb(39, 32, 58),
      fg: rgb(250, 250, 250),
    },
    focus: {
      ring: rgb(167, 139, 250),
      bg: rgb(30, 27, 46),
    },
    success: rgb(52, 211, 153),
    warning: rgb(251, 191, 36),
    error: rgb(248, 113, 113),
    info: rgb(94, 234, 212),
  },
});

export const SPEAKER_RGB = [
  rgb(94, 234, 212),
  rgb(251, 191, 36),
  rgb(244, 114, 182),
  rgb(129, 140, 248),
  rgb(74, 222, 128),
  rgb(248, 113, 113),
  rgb(56, 189, 248),
  rgb(192, 132, 252),
] as const;

export function speakerRgb(index: number): number {
  const i = ((index % SPEAKER_RGB.length) + SPEAKER_RGB.length) % SPEAKER_RGB.length;
  return SPEAKER_RGB[i]!;
}
