import { parseMessages, messageHash, inferChatName, chatKey } from "./parser.js";

const APP_VERSION = "0.1.0";

// ─── IndexedDB ────────────────────────────────────────────────────────────────
const DB_NAME = "wa-extract";
const DB_VER = 1;
const STORE = "chats";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(record) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDelete(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbAll() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

// ─── File reading ─────────────────────────────────────────────────────────────
async function readExportFile(file) {
  const isZip = /\.zip$/i.test(file.name) || file.type === "application/zip";
  if (!isZip) {
    return { text: await file.text(), inferredName: inferChatName(file.name) };
  }
  if (typeof JSZip === "undefined") {
    throw new Error("JSZip 라이브러리를 불러오지 못했습니다 (오프라인일 때 캐시 누락)");
  }
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const entries = Object.values(zip.files).filter((e) => !e.dir && /\.txt$/i.test(e.name));
  if (!entries.length) throw new Error("zip 안에 .txt 채팅 파일이 없습니다");
  entries.sort((a, b) => {
    const aChat = /chat/i.test(a.name) ? 0 : 1;
    const bChat = /chat/i.test(b.name) ? 0 : 1;
    return aChat - bChat || a.name.length - b.name.length;
  });
  const entry = entries[0];
  const text = await entry.async("string");
  const inferredName = inferChatName(entry.name) || inferChatName(file.name);
  return { text, inferredName };
}

// ─── Processing pipeline ──────────────────────────────────────────────────────
let pending = null;

async function processFile(file) {
  setBusy(true);
  try {
    const { text, inferredName } = await readExportFile(file);
    const messages = parseMessages(text);
    if (!messages.length) {
      alert("메시지를 파싱하지 못했습니다. WhatsApp 내보내기 파일이 맞나요?");
      return;
    }

    const hashes = await Promise.all(messages.map(messageHash));
    const initialName = inferredName || "";
    const key = chatKey(messages, initialName || null);
    const existing = await idbGet(key);
    const seen = new Set(existing?.hashes || []);
    const newIdx = [];
    for (let i = 0; i < messages.length; i++) {
      if (!seen.has(hashes[i])) newIdx.push(i);
    }

    pending = {
      messages,
      hashes,
      newIdx,
      key,
      name: existing?.name || initialName || key,
      inferredName: initialName,
      existing,
    };

    showResult();
  } catch (e) {
    console.error(e);
    alert("처리 실패: " + e.message);
  } finally {
    setBusy(false);
  }
}

function showResult() {
  $("#newCount").textContent = pending.newIdx.length.toLocaleString();
  $("#totalCount").textContent = pending.messages.length.toLocaleString();
  $("#chatName").value = pending.name || "";
  $("#resultMeta").textContent =
    `직전 실행: ${pending.existing?.lastRun || "없음"} · 키: ${pending.key}`;
  $("#result").hidden = false;
  $("#download").disabled = pending.newIdx.length === 0;
  $("#result").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function buildOutput(p) {
  const header = [
    "# WhatsApp incremental export",
    `# chat: ${p.name}`,
    `# generated: ${new Date().toISOString()}`,
    `# new messages: ${p.newIdx.length} / total in export: ${p.messages.length}`,
    `# previous run: ${p.existing?.lastRun || "never"}`,
    "",
    "",
  ].join("\n");
  const body = p.newIdx.map((i) => p.messages[i].raw).join("\n");
  return header + body + "\n";
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function commitState() {
  if (!pending) return;
  // Recompute key in case the user renamed the chat after preview.
  const enteredName = $("#chatName").value.trim();
  const finalName = enteredName || pending.name || pending.inferredName || pending.key;
  const finalKey = enteredName
    ? chatKey(pending.messages, enteredName)
    : pending.key;

  // If the user renamed, migrate state from the old key.
  let prior = pending.existing;
  if (finalKey !== pending.key) {
    const existingAtNewKey = await idbGet(finalKey);
    prior = existingAtNewKey || prior;
    if (pending.existing && pending.existing.key !== finalKey) {
      await idbDelete(pending.existing.key);
    }
  }

  const allSeen = new Set([...(prior?.hashes || []), ...pending.hashes]);
  await idbPut({
    key: finalKey,
    name: finalName,
    inferredName: pending.inferredName || "",
    lastRun: nowIso(),
    messageCount: pending.messages.length,
    hashes: [...allSeen].sort(),
  });
  pending = null;
  $("#result").hidden = true;
  await refreshList();
}

// ─── Chat list ────────────────────────────────────────────────────────────────
async function refreshList() {
  const chats = await idbAll();
  const el = $("#chatList");
  if (!chats.length) {
    el.innerHTML = '<div class="muted">아직 추적 중인 채팅이 없습니다.</div>';
    return;
  }
  chats.sort((a, b) => (b.lastRun || "").localeCompare(a.lastRun || ""));
  const rows = chats
    .map(
      (c) => `
    <tr>
      <td>
        <div><strong>${escapeHtml(c.name || c.key)}</strong></div>
        <div class="muted">${escapeHtml(c.key)}</div>
      </td>
      <td>${(c.messageCount || 0).toLocaleString()}</td>
      <td class="muted">${escapeHtml(c.lastRun || "")}</td>
      <td class="actions">
        <button data-action="reset" data-key="${escapeHtml(c.key)}">초기화</button>
        <button class="danger" data-action="forget" data-key="${escapeHtml(c.key)}">삭제</button>
      </td>
    </tr>
  `,
    )
    .join("");
  el.innerHTML = `
    <table>
      <thead><tr><th>채팅</th><th>메시지</th><th>최근 실행</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
  el.querySelectorAll("button[data-action]").forEach((b) => {
    b.addEventListener("click", async () => {
      const action = b.dataset.action;
      const key = b.dataset.key;
      const c = await idbGet(key);
      if (!c) return;
      if (action === "forget") {
        if (!confirm(`"${c.name || key}" 의 상태를 삭제할까요?\n다음 import 시 모든 메시지가 새 메시지로 처리됩니다.`)) return;
        await idbDelete(key);
      } else if (action === "reset") {
        if (!confirm(`"${c.name || key}" 의 추적 해시를 비울까요? (이름은 유지)`)) return;
        await idbPut({ ...c, hashes: [], messageCount: 0 });
      }
      refreshList();
    });
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));
}

function nowIso() {
  return new Date().toISOString().replace(/\.\d+Z$/, "Z");
}

function nowTag() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function safeFilename(s) {
  return String(s).replace(/[\\/:*?"<>|]+/g, "_");
}

function setBusy(busy) {
  document.body.style.cursor = busy ? "progress" : "";
  $("#drop").style.opacity = busy ? "0.6" : "";
  $("#drop").style.pointerEvents = busy ? "none" : "";
}

const $ = (sel) => document.querySelector(sel);

// ─── Wiring ───────────────────────────────────────────────────────────────────
function init() {
  const drop = $("#drop");
  const picker = $("#picker");
  drop.addEventListener("click", () => picker.click());
  drop.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); picker.click(); }
  });
  drop.addEventListener("dragover", (e) => {
    e.preventDefault();
    drop.classList.add("drag");
  });
  drop.addEventListener("dragleave", () => drop.classList.remove("drag"));
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.classList.remove("drag");
    if (e.dataTransfer.files.length) processFile(e.dataTransfer.files[0]);
  });
  picker.addEventListener("change", () => {
    if (picker.files.length) processFile(picker.files[0]);
    picker.value = "";
  });

  $("#download").addEventListener("click", async () => {
    if (!pending) return;
    const enteredName = $("#chatName").value.trim();
    const fileBase = safeFilename(enteredName || pending.name || pending.key);
    downloadText(`${fileBase}_new_${nowTag()}.txt`, buildOutput({
      ...pending,
      name: enteredName || pending.name || pending.key,
    }));
    await commitState();
  });
  $("#commit").addEventListener("click", commitState);
  $("#cancel").addEventListener("click", () => {
    pending = null;
    $("#result").hidden = true;
  });

  $("#refreshList").addEventListener("click", refreshList);

  $("#exportState").addEventListener("click", async () => {
    const chats = await idbAll();
    downloadText(
      `wa-extract-state-${nowTag()}.json`,
      JSON.stringify({ version: 1, exportedAt: nowIso(), chats }, null, 2),
    );
  });
  $("#importState").addEventListener("click", () => $("#importFile").click());
  $("#importFile").addEventListener("change", async () => {
    const file = $("#importFile").files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.chats)) throw new Error("잘못된 백업 파일");
      if (!confirm(`${data.chats.length}개 채팅의 상태를 복원합니다. 같은 키는 덮어씁니다.`)) return;
      for (const c of data.chats) await idbPut(c);
      await refreshList();
      alert("복원 완료");
    } catch (e) {
      alert("복원 실패: " + e.message);
    }
    $("#importFile").value = "";
  });
  $("#forgetAll").addEventListener("click", async () => {
    if (!confirm("모든 채팅 상태를 삭제할까요? 되돌릴 수 없습니다.")) return;
    const chats = await idbAll();
    for (const c of chats) await idbDelete(c.key);
    await refreshList();
  });

  $("#version").textContent = `v${APP_VERSION}`;

  refreshList();
  handleSharedFiles();
}

async function handleSharedFiles() {
  const url = new URL(location.href);
  if (!url.searchParams.has("shared")) return;
  url.searchParams.delete("shared");
  history.replaceState({}, "", url.toString());

  try {
    const cache = await caches.open("shared-files");
    const requests = await cache.keys();
    if (!requests.length) return;
    const req = requests[0];
    const resp = await cache.match(req);
    const blob = await resp.blob();
    const filename = decodeURIComponent(req.url.split("/").pop());
    const file = new File([blob], filename, { type: blob.type });
    for (const r of requests) await cache.delete(r);
    await processFile(file);
  } catch (e) {
    console.error("shared file handling failed", e);
  }
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .register("./sw.js")
    .catch((e) => console.warn("SW register failed", e));
}

document.addEventListener("DOMContentLoaded", init);
