/**
 * LAN session viewer (peer side) — no ASR, just receive host segments.
 * CLI: npm start -- --join http://192.168.x.x:8787
 */

import { WebSocket } from "ws";
import type { Segment } from "./types.js";
import { t } from "./i18n/index.js";

export interface JoinHandle {
  close: () => void;
}

function normalizeJoinUrl(input: string): { http: string; ws: string } {
  let u = input.trim();
  if (!/^https?:\/\//i.test(u) && !/^wss?:\/\//i.test(u)) {
    u = `http://${u}`;
  }
  const url = new URL(u);
  if (url.protocol === "ws:" || url.protocol === "wss:") {
    const httpProto = url.protocol === "wss:" ? "https:" : "http:";
    return {
      http: `${httpProto}//${url.host}/`,
      ws: `${url.protocol}//${url.host}/ws`,
    };
  }
  const wsProto = url.protocol === "https:" ? "wss:" : "ws:";
  return {
    http: `${url.protocol}//${url.host}/`,
    ws: `${wsProto}//${url.host}/ws`,
  };
}

function wireToSegment(w: {
  start: number;
  end: number;
  wallIso?: string;
  spk: number | null;
  text: string;
  corrected?: string;
  translation?: string;
}): Segment {
  return {
    start: w.start,
    end: w.end,
    wall: w.wallIso ? new Date(w.wallIso) : new Date(),
    wallIso: w.wallIso,
    spk: w.spk,
    text: w.text,
    corrected: w.corrected,
    translation: w.translation,
  };
}

/**
 * Connect to host share server; invoke onSegment for live + history items.
 */
export function joinShareSession(
  joinUrl: string,
  handlers: {
    onSegment: (seg: Segment) => void;
    onStatus?: (msg: string) => void;
    onClose?: () => void;
  },
): JoinHandle {
  const { ws: wsUrl, http } = normalizeJoinUrl(joinUrl);
  let closed = false;
  let ws: WebSocket | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let attempt = 0;

  const connect = () => {
    if (closed) return;
    handlers.onStatus?.(t("status.shareConnecting", { url: http }));
    ws = new WebSocket(wsUrl);
    ws.on("open", () => {
      attempt = 0;
      handlers.onStatus?.(t("status.shareJoined", { url: http }));
    });
    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(String(data)) as {
          type: string;
          segment?: Parameters<typeof wireToSegment>[0];
          segments?: Array<Parameters<typeof wireToSegment>[0]>;
        };
        if (msg.type === "segment" && msg.segment) {
          handlers.onSegment(wireToSegment(msg.segment));
        } else if (msg.type === "history" && Array.isArray(msg.segments)) {
          for (const s of msg.segments) handlers.onSegment(wireToSegment(s));
        }
      } catch {
        /* ignore */
      }
    });
    ws.on("close", () => {
      if (closed) {
        handlers.onClose?.();
        return;
      }
      attempt += 1;
      const wait = Math.min(8000, 800 * attempt);
      handlers.onStatus?.(
        t("status.shareReconnecting", { sec: (wait / 1000).toFixed(1) }),
      );
      retry = setTimeout(connect, wait);
    });
    ws.on("error", () => {
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
    });
  };

  connect();

  return {
    close() {
      closed = true;
      if (retry) clearTimeout(retry);
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
      handlers.onClose?.();
    },
  };
}
