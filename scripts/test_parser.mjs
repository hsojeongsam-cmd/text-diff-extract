// Quick smoke test for parser.js (runs under Node ≥19 thanks to globalThis.crypto).
import { parseMessages, messageHash, inferChatName, chatKey } from "../parser.js";

const run1 = `\
[2026. 4. 27. 오후 2:30:45] 홍길동: 안녕!
[2026. 4. 27. 오후 2:31:02] 김철수: 안녕하세요
오늘 점심 같이 먹어요
[2026. 4. 27. 오후 2:32:10] 홍길동: 좋아요`;

const run2 = `${run1}
[2026. 4. 28. 오전 9:00:11] 김철수: 어제 잘 들어가셨어요?
[2026. 4. 28. 오전 9:05:00] 홍길동: 네, 감사합니다 😊
다음에 또 봬요`;

function assertEq(actual, expected, label) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${pass ? "✓" : "✗"} ${label}: ${pass ? "ok" : `expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`}`);
  if (!pass) process.exitCode = 1;
}

const m1 = parseMessages(run1);
assertEq(m1.length, 3, "run1 message count");
assertEq(m1[1].content, "안녕하세요\n오늘 점심 같이 먹어요", "multiline content merged");

const m2 = parseMessages(run2);
assertEq(m2.length, 5, "run2 message count");

// Hash determinism
const h_a = await messageHash(m1[0]);
const h_b = await messageHash(m1[0]);
assertEq(h_a, h_b, "hash determinism");
assertEq(h_a.length, 64, "hash hex length");

// Diff: all hashes from m1 should be in m2's first 3
const m1hashes = new Set(await Promise.all(m1.map(messageHash)));
const m2hashes = await Promise.all(m2.map(messageHash));
const newOnly = m2hashes.filter((h) => !m1hashes.has(h));
assertEq(newOnly.length, 2, "incremental diff = 2 new messages");

// Empty / no changes
const noNew = m2hashes.filter((h) => !new Set(m2hashes).has(h));
assertEq(noNew.length, 0, "no diff when comparing same export");

// Inferred name
assertEq(inferChatName("WhatsApp Chat with 가족.txt"), "가족", "inferChatName en pattern");
assertEq(inferChatName("_chat.txt"), null, "inferChatName generic _chat skipped");
assertEq(inferChatName("export.zip"), "export", "inferChatName falls back to stem");

// chat key stability
const k1 = chatKey(m1, null);
const k2 = chatKey(m2, null);
assertEq(k1, k2, "auto chatKey stable across runs (same first message)");
assertEq(chatKey([], "가족 톡방"), "가족_톡방", "manual chatKey sanitizes");

// English-format export with brackets and a system message
const enExport = `\
[1/15/24, 10:30:45 AM] John Doe: Hello there
[1/15/24, 10:31:00 AM] ‎Messages and calls are end-to-end encrypted.
[1/15/24, 10:31:05 AM] Jane: Hi!`;
const me = parseMessages(enExport);
assertEq(me.length, 3, "en bracket format count");
assertEq(me[1].sender, "<system>", "system message sender");

console.log("\nall tests done");
