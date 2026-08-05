/**
 * LAN session share — host side.
 * HTTP + WebSocket on a local port; peers open the page and receive live segments
 * without running ASR themselves.
 */

import http from "node:http";
import os from "node:os";
import { WebSocketServer, type WebSocket } from "ws";
import type { Segment } from "./types.js";
import { displayText } from "./types.js";
import { localeTag, t } from "./i18n/index.js";

export interface ShareServer {
  port: number;
  urls: string[];
  peerCount: () => number;
  broadcast: (seg: Segment) => void;
  close: () => void;
}

function lanIPv4(): string[] {
  const out: string[] = [];
  const ifs = os.networkInterfaces();
  for (const list of Object.values(ifs)) {
    if (!list) continue;
    for (const a of list) {
      if (a.family === "IPv4" && !a.internal) out.push(a.address);
    }
  }
  return out.length ? out : ["127.0.0.1"];
}

function escJs(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n");
}

function viewerHtml(title: string): string {
  const htmlLang = t("sharePage.htmlLang");
  const h1 = t("sharePage.title");
  const connecting = t("sharePage.connecting");
  const connected = t("sharePage.connected");
  const disconnected = t("sharePage.disconnected");
  const empty = t("sharePage.empty");
  const speakerPrefix = t("sharePage.speaker", { n: "" }).replace(/\s*$/, " ");
  const unknown = t("sharePage.unknown");
  const loc = localeTag();
  return `<!DOCTYPE html>
<html lang="${htmlLang}">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title}</title>
<style>
  :root { color-scheme: dark; --bg:#09090b; --card:#18181b; --muted:#a1a1aa; --fg:#fafafa; --acc:#a78bfa; --line:#27272a; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: ui-sans-serif, system-ui, "Segoe UI", "PingFang SC", "Hiragino Sans", "Microsoft YaHei", sans-serif;
    background: var(--bg); color: var(--fg); min-height: 100vh; }
  header { position: sticky; top:0; backdrop-filter: blur(8px); background: rgba(9,9,11,.85);
    border-bottom: 1px solid var(--line); padding: 12px 16px; display:flex; gap:12px; align-items:center; flex-wrap:wrap; }
  header h1 { font-size: 15px; margin:0; font-weight:600; color: var(--acc); }
  #status { font-size: 12px; color: var(--muted); }
  #status.ok { color: #34d399; }
  #status.bad { color: #f87171; }
  main { max-width: 720px; margin: 0 auto; padding: 16px; display:flex; flex-direction:column; gap:10px; }
  .seg { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; }
  .meta { font-size: 12px; color: var(--muted); margin-bottom: 6px; display:flex; gap:10px; flex-wrap:wrap; }
  .spk { font-weight: 600; }
  .text { font-size: 16px; line-height: 1.55; white-space: pre-wrap; word-break: break-word; }
  .tr { margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--line); color: #93c5fd; font-size: 14px; line-height: 1.5; }
  .empty { color: var(--muted); text-align:center; padding: 48px 16px; font-size: 14px; }
  .dot { width:8px; height:8px; border-radius:50%; background:#f87171; display:inline-block; margin-right:6px; animation: pulse 1.2s infinite; }
  .dot.on { background:#34d399; }
  @keyframes pulse { 50% { opacity: .45; } }
</style>
</head>
<body>
<header>
  <h1>${h1}</h1>
  <div id="status" class="bad"><span class="dot" id="dot"></span>${connecting}</div>
</header>
<main id="list"><div class="empty" id="empty">${empty}</div></main>
<script>
const I18N = {
  connected: '${escJs(connected)}',
  disconnected: '${escJs(disconnected)}',
  speakerPrefix: '${escJs(speakerPrefix)}',
  unknown: '${escJs(unknown)}',
  locale: '${escJs(loc)}',
};
const list = document.getElementById('list');
const empty = document.getElementById('empty');
const status = document.getElementById('status');
const spkColor = ['#5eead4','#fbbf24','#f472b6','#818cf8','#4ade80','#f87171','#38bdf8','#c084fc'];
function color(spk){ if(spk==null) return 'var(--muted)'; return spkColor[(spk-1)%spkColor.length]; }
function add(seg){
  if(empty) empty.remove();
  const el = document.createElement('div');
  el.className = 'seg';
  const spk = seg.spk != null ? I18N.speakerPrefix + seg.spk : I18N.unknown;
  const wall = seg.wallIso ? new Date(seg.wallIso).toLocaleTimeString(I18N.locale) : '';
  const range = (seg.start!=null && seg.end!=null)
    ? (fmt(seg.start)+'–'+fmt(seg.end)) : '';
  const text = seg.display || seg.text || '';
  el.innerHTML =
    '<div class="meta"><span class="spk" style="color:'+color(seg.spk)+'">● '+spk+'</span>'
    + (wall?'<span>'+wall+'</span>':'')
    + (range?'<span>'+range+'</span>':'')
    + '</div><div class="text"></div>'
    + (seg.translation ? '<div class="tr"></div>' : '');
  el.querySelector('.text').textContent = text;
  if(seg.translation) el.querySelector('.tr').textContent = '→ '+seg.translation;
  list.appendChild(el);
  if(document.hidden===false) el.scrollIntoView({behavior:'smooth', block:'end'});
}
function fmt(s){ s=Math.max(0,Math.floor(s)); const m=Math.floor(s/60); const r=s%60; return String(m).padStart(2,'0')+':'+String(r).padStart(2,'0'); }
function connect(){
  const proto = location.protocol==='https:'?'wss':'ws';
  const ws = new WebSocket(proto+'://'+location.host+'/ws');
  ws.onopen = ()=>{ status.className='ok'; status.innerHTML='<span class="dot on" id="dot"></span>'+I18N.connected; };
  ws.onclose = ()=>{ status.className='bad'; status.innerHTML='<span class="dot" id="dot"></span>'+I18N.disconnected; setTimeout(connect, 3000); };
  ws.onerror = ()=> ws.close();
  ws.onmessage = (ev)=>{
    try {
      const msg = JSON.parse(ev.data);
      if(msg.type==='segment') add(msg.segment);
      if(msg.type==='hello') status.title = msg.session || '';
      if(msg.type==='history' && Array.isArray(msg.segments)) msg.segments.forEach(add);
    } catch(e){}
  };
}
connect();
</script>
</body>
</html>`;
}

function toWire(seg: Segment) {
  return {
    start: seg.start,
    end: seg.end ?? seg.start,
    wallIso: seg.wallIso || seg.wall.toISOString(),
    spk: seg.spk,
    text: seg.text,
    corrected: seg.corrected,
    translation: seg.translation,
    display: displayText(seg),
  };
}

export async function startShareServer(
  port: number,
  opts?: { title?: string },
): Promise<ShareServer> {
  const history: ReturnType<typeof toWire>[] = [];
  const clients = new Set<WebSocket>();

  const server = http.createServer((req, res) => {
    const url = req.url || "/";
    if (url === "/" || url.startsWith("/index")) {
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(viewerHtml(opts?.title || "baribari share"));
      return;
    }
    if (url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, peers: clients.size }));
      return;
    }
    res.writeHead(404);
    res.end("not found");
  });

  const wss = new WebSocketServer({ server, path: "/ws" });
  wss.on("connection", (ws) => {
    clients.add(ws);
    ws.send(
      JSON.stringify({
        type: "hello",
        session: opts?.title || "baribari",
        peers: clients.size,
      }),
    );
    if (history.length) {
      ws.send(JSON.stringify({ type: "history", segments: history }));
    }
    ws.on("close", () => clients.delete(ws));
    ws.on("error", () => clients.delete(ws));
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "0.0.0.0", () => resolve());
  });

  const ips = lanIPv4();
  const urls = ips.map((ip) => `http://${ip}:${port}/`);

  return {
    port,
    urls,
    peerCount: () => clients.size,
    broadcast(seg: Segment) {
      const wire = toWire(seg);
      history.push(wire);
      if (history.length > 500) history.splice(0, history.length - 400);
      const msg = JSON.stringify({ type: "segment", segment: wire });
      for (const c of clients) {
        if (c.readyState === 1) {
          try {
            c.send(msg);
          } catch {
            /* ignore */
          }
        }
      }
    },
    close() {
      for (const c of clients) {
        try {
          c.close();
        } catch {
          /* ignore */
        }
      }
      clients.clear();
      try {
        wss.close();
      } catch {
        /* ignore */
      }
      try {
        server.close();
      } catch {
        /* ignore */
      }
    },
  };
}
