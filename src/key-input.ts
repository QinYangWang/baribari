/**
 * Terminal raw-mode key feeder with proper UTF-8 decoding.
 * Avoids 乱码 from multi-byte CJK when keys arrive as byte streams.
 */

export type KeyHandler = (key: string) => void;

function utf8SeqLen(first: number): number {
  if (first < 0x80) return 1;
  if ((first & 0xe0) === 0xc0) return 2;
  if ((first & 0xf0) === 0xe0) return 3;
  if ((first & 0xf8) === 0xf0) return 4;
  return 1; // invalid lead — emit as-is
}

/**
 * Create a feed(chunk) that:
 * - reassembles UTF-8 multi-byte chars into single onKey(char) calls
 * - buffers ESC / CSI sequences (arrows, PgUp, …)
 * - passes Enter, Tab, Backspace, Ctrl+C, printable ASCII, and CJK
 */
export function createKeyFeeder(onKey: KeyHandler): {
  feed: (chunk: Buffer | string) => void;
  reset: () => void;
} {
  let escBuf = "";
  let escTimer: ReturnType<typeof setTimeout> | null = null;
  const utf8Pending: number[] = [];

  function clearEscTimer() {
    if (escTimer) {
      clearTimeout(escTimer);
      escTimer = null;
    }
  }

  function emitEsc() {
    if (!escBuf) return;
    const k = escBuf;
    escBuf = "";
    onKey(k);
  }

  function flushUtf8() {
    if (!utf8Pending.length) return;
    const s = Buffer.from(utf8Pending).toString("utf8");
    utf8Pending.length = 0;
    for (const c of s) {
      // Skip lone replacement if decode failed mid-stream
      if (c === "\uFFFD") continue;
      onKey(c);
    }
  }

  function pushUtf8Byte(b: number) {
    utf8Pending.push(b);
    const need = utf8SeqLen(utf8Pending[0]!);
    if (utf8Pending.length >= need) flushUtf8();
  }

  function feed(chunk: Buffer | string) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, "utf8");
    for (let i = 0; i < buf.length; i++) {
      const b = buf[i]!;

      // Completing a multi-byte UTF-8 character
      if (utf8Pending.length) {
        // continuation bytes are 10xxxxxx
        if ((b & 0xc0) === 0x80) {
          pushUtf8Byte(b);
          continue;
        }
        // unexpected — flush partial then reprocess this byte
        flushUtf8();
      }

      // Escape sequences (must not mix with UTF-8 leads)
      if (b === 0x1b) {
        // abandon incomplete utf8
        utf8Pending.length = 0;
        escBuf = "\x1b";
        clearEscTimer();
        escTimer = setTimeout(() => {
          escTimer = null;
          emitEsc();
        }, 40);
        continue;
      }

      if (escBuf) {
        const ch = String.fromCharCode(b);
        escBuf += ch;
        // CSI: ESC [ ... finalbyte   or SS3: ESC O A
        if (
          escBuf.length >= 3 &&
          (escBuf.startsWith("\x1b[") || escBuf.startsWith("\x1bO"))
        ) {
          if (/[A-Za-z~]$/.test(escBuf)) {
            clearEscTimer();
            emitEsc();
          } else if (escBuf.length > 16) {
            clearEscTimer();
            emitEsc();
          }
        } else if (escBuf.length > 8) {
          clearEscTimer();
          emitEsc();
        }
        continue;
      }

      // UTF-8 multi-byte lead
      if (b >= 0x80) {
        pushUtf8Byte(b);
        continue;
      }

      // ASCII controls + printable
      if (
        b === 0x03 || // Ctrl+C
        b === 0x04 || // Ctrl+D
        b === 0x15 || // Ctrl+U
        b === 0x0d || // Enter
        b === 0x0a || // LF
        b === 0x09 || // Tab
        b === 0x08 || // BS
        b === 0x7f || // DEL
        b >= 0x20
      ) {
        onKey(String.fromCharCode(b));
      }
    }
  }

  function reset() {
    clearEscTimer();
    escBuf = "";
    utf8Pending.length = 0;
  }

  return { feed, reset };
}
