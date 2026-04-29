// WhatsApp export parser. Pure functions, no DOM access — safe to run in Node for tests.

const DATE_BRACKET = String.raw`\[([^\]]+)\]`;
const DATE_LOOSE = String.raw`(\d{1,4}[./\-년]\s?\d{1,2}[./\-월]\s?\d{1,4}일?,?\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[APap][Mm])?(?:\s*[一-鿿가-힯]+)?)`;

const PATTERNS = [
  { re: new RegExp(`^${DATE_BRACKET}\\s+([^:]+?):\\s?(.*)$`), hasSender: true },
  { re: new RegExp(`^${DATE_LOOSE}\\s+-\\s+([^:]+?):\\s?(.*)$`), hasSender: true },
  { re: new RegExp(`^${DATE_BRACKET}\\s+(.*)$`), hasSender: false },
  { re: new RegExp(`^${DATE_LOOSE}\\s+-\\s+(.*)$`), hasSender: false },
];

const INVISIBLE = /^[﻿​-‏‪-‮⁦-⁩]+/;

export function parseMessages(text) {
  const messages = [];
  let current = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(INVISIBLE, "");
    let matched = null;
    let hasSender = false;
    for (const { re, hasSender: hs } of PATTERNS) {
      const m = re.exec(line);
      if (m) {
        matched = m;
        hasSender = hs;
        break;
      }
    }
    if (matched) {
      if (current) messages.push(current);
      let timestamp, sender, content;
      if (hasSender) {
        [, timestamp, sender, content] = matched;
      } else {
        [, timestamp, content] = matched;
        sender = "<system>";
      }
      current = {
        timestamp: timestamp.trim(),
        sender: sender.trim(),
        content,
        raw: rawLine,
      };
    } else if (current) {
      current.content += "\n" + line;
      current.raw += "\n" + rawLine;
    }
    // Lines before the first parsed message (export header) are dropped.
  }
  if (current) messages.push(current);
  return messages;
}

export async function messageHash(msg) {
  const enc = new TextEncoder();
  const ts = enc.encode(msg.timestamp);
  const sd = enc.encode(msg.sender);
  const ct = enc.encode(msg.content);
  const buf = new Uint8Array(ts.length + sd.length + ct.length + 3);
  let o = 0;
  buf.set(ts, o); o += ts.length; buf[o++] = 0;
  buf.set(sd, o); o += sd.length; buf[o++] = 0;
  buf.set(ct, o); o += ct.length; buf[o++] = 0;
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function inferChatName(filename) {
  if (!filename) return null;
  const base = filename.replace(/^.*[\\/]/, "").replace(/\.[^.]+$/, "");
  const m = base.match(/(?:Chat with|채팅:?)\s+(.+)$/i);
  if (m) return m[1].trim();
  if (/^_?chat$/i.test(base)) return null;
  return base;
}

// Stable JS-side chat key from the first message. Doesn't need to match Python — when the user
// supplies a name explicitly, that takes precedence and is sanitized into a key.
export function chatKey(messages, override) {
  if (override) {
    const cleaned = override.replace(/[^A-Za-z0-9가-힣_.\-]+/g, "_").replace(/^_+|_+$/g, "");
    return cleaned || "chat";
  }
  if (!messages.length) return "unknown";
  const seed = messages[0].timestamp + "|" + messages[0].sender;
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return "auto_" + (h >>> 0).toString(16).padStart(8, "0");
}
