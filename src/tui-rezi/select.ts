/**
 * Discoverable TUI backend selection.
 *
 * Resolution order:
 *   1. CLI `--tui-backend rezi|legacy`
 *   2. Env `BARIBARI_TUI=rezi|legacy`
 *   3. Default: `legacy` until Rezi reaches full parity
 *
 * Opt-in to Rezi with: `baribari --tui-backend rezi` or
 * `BARIBARI_TUI=rezi baribari`
 */

export type TuiBackendId = "rezi" | "legacy";

export const DEFAULT_TUI_BACKEND: TuiBackendId = "legacy";

export function parseTuiBackend(raw: unknown): TuiBackendId | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  if (v === "rezi" || v === "legacy") return v;
  return null;
}

export function resolveTuiBackend(opts?: {
  cli?: string | null;
  env?: NodeJS.ProcessEnv;
}): TuiBackendId {
  const env = opts?.env ?? process.env;
  const fromCli = parseTuiBackend(opts?.cli);
  if (fromCli) return fromCli;
  if (opts?.cli != null && String(opts.cli).trim()) {
    throw new Error(`Unsupported TUI backend: ${String(opts.cli)}`);
  }
  const fromEnv = parseTuiBackend(env.BARIBARI_TUI);
  if (fromEnv) return fromEnv;
  return DEFAULT_TUI_BACKEND;
}

export function tuiBackendHelp(): string {
  return "TUI backend: rezi (new) | legacy (default until parity)";
}
