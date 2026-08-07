/**
 * Live TUI entry — selects Rezi or legacy backend.
 * Default remains legacy until Rezi reaches full feature parity.
 */

import type { TranscribeArgs } from "./types.js";
import { createTui, type TuiHandle } from "./tui.js";
import {
  resolveTuiBackend,
  type TuiBackendId,
} from "./tui-rezi/select.js";
import type { ReziTuiOpts } from "./tui-rezi/controller.js";

export type { TuiHandle, TuiBackendId };

export interface CreateLiveTuiOpts extends ReziTuiOpts {
  /** Explicit backend; otherwise CLI/env/default resolution. */
  backend?: TuiBackendId | string | null;
}

export async function createLiveTui(
  args: TranscribeArgs,
  opts: CreateLiveTuiOpts,
): Promise<TuiHandle> {
  const backend = resolveTuiBackend({ cli: opts.backend ?? null });
  if (backend === "rezi") {
    try {
      const { createReziTui } = await import("./tui-rezi/controller.js");
      return await createReziTui(args, opts);
    } catch (err) {
      console.error(
        "[baribari] Rezi TUI unavailable, falling back to legacy:",
        err instanceof Error ? err.message : err,
      );
      return createTui(args, opts);
    }
  }
  return createTui(args, opts);
}
