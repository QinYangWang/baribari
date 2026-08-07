/** Lightweight npm update check. Failures are intentionally silent. */

const REGISTRY_URL = "https://registry.npmjs.org/baribari/latest";
const REQUEST_TIMEOUT_MS = 1800;

export interface UpdateInfo {
  current: string;
  latest: string;
  command: string;
}

function numericVersion(version: string): number[] | null {
  const core = version.trim().replace(/^v/i, "").split("-", 1)[0];
  if (!core || !/^\d+(?:\.\d+)*$/.test(core)) return null;
  return core.split(".").map(Number);
}

/** Compare stable semver-like numeric versions without another dependency. */
export function isNewerVersion(latest: string, current: string): boolean {
  const a = numericVersion(latest);
  const b = numericVersion(current);
  if (!a || !b) return false;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const delta = (a[i] ?? 0) - (b[i] ?? 0);
    if (delta !== 0) return delta > 0;
  }
  return false;
}

function disabled(): boolean {
  return Boolean(
    process.env.BARIBARI_NO_UPDATE_CHECK ||
      process.env.NO_UPDATE_NOTIFIER ||
      process.env.CI,
  );
}

/**
 * Check npm once when called during startup.
 * Returns null for offline, disabled, invalid, or up-to-date installations.
 */
export async function checkForUpdate(
  current: string,
): Promise<UpdateInfo | null> {
  if (disabled()) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  timer.unref?.();
  let latest: string | undefined;
  try {
    const response = await fetch(REGISTRY_URL, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { version?: unknown };
    latest = typeof body.version === "string" ? body.version : undefined;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
  if (!latest || !isNewerVersion(latest, current)) return null;
  return {
    current,
    latest,
    command: "npm install -g baribari@latest",
  };
}
