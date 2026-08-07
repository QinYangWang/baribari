import { rgb } from "@rezi-ui/core";

/** Packed RGB helpers for Rezi TextStyle (tokens are not accepted on style.fg). */
export const col = {
  accent: rgb(167, 139, 250),
  primary: rgb(250, 250, 250),
  secondary: rgb(161, 161, 170),
  muted: rgb(113, 113, 122),
  success: rgb(52, 211, 153),
  warning: rgb(251, 191, 36),
  error: rgb(248, 113, 113),
  info: rgb(94, 234, 212),
  selectedBg: rgb(39, 32, 58),
  panelBg: rgb(13, 13, 17),
  elevatedBg: rgb(20, 20, 25),
  border: rgb(63, 63, 70),
  borderSoft: rgb(39, 39, 42),
  blue: rgb(96, 165, 250),
} as const;
