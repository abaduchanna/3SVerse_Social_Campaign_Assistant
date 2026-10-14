const $ = selector => document.querySelector(selector);
const STUDIO_URL = "https://studio.youtube.com/";
const sourceForFile = new WeakMap();
const PROGRESS_KEY = "youtubeScheduleProgressV1";

$("#extVersion").textContent = `v${chrome.runtime.getManifest().version}`;
let queue = [];
let displayQueue = [];
let progress = {};
let stopped = false;
let vaultFiles = [];

// ---- extension vault: campaign files saved INSIDE the extension ----
async function vaultSync(files) {
  const bySlot = new Map();
  for (const file of files) {
    const slot = sourceForFile.get(file) || file.__vaultSlot || "";
    if (!slot) continue;
    if (!bySlot.has(slot)) bySlot.set(slot, []);
    bySlot.get(slot).push(file);
  }
  let saved = 0;
  for (const [slot, slotFiles] of bySlot) saved += await vaultSaveFiles(slot, slotFiles);
  return saved;
}

async function vaultTotal() {
  return (await AssetVault.all()).length;
}

async function vaultRestoreIfEmpty(rebuild) {
  vaultFiles = [];
  const records = await AssetVault.all();
  if (!records.length) return false;
  if (($("#folder1")?.files?.length || 0) + ($("#folder2")?.files?.length || 0)) return false; // live folder still linked
  for (const record of records) vaultFiles.push(vaultFile(record));
  if (rebuild) await rebuildQueue();
  return true;
}

function tomorrow() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  const pad = value => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function selectedFiles() {
  const seen = new Map();
  for (const file of vaultFiles) {
    sourceForFile.set(file, file.__vaultSlot || "folder1");
    seen.set(`${file.webkitRelativePath || file.name}:${file.size}:${file.lastModified}`, file);
  }
  for (const input of [$("#folder1"), $("#folder2")]) {
    for (const file of input.files) {
      sourceForFile.set(file, input.id);
      seen.set(`${file.webkitRelativePath || file.name}:${file.size}:${file.lastModified}`, file);
    }
  }
  return [...seen.values()];
}

async function findMarkdown(files) {
  for (const file of files.filter(file => /\.md$/i.test(file.name))) {
    const text = await file.text();
    if (/^## Day\s+\d+/m.test(text)) return text;
  }
  throw new Error("Campaign Day 1, Day 2… wala Markdown selected folders mein nahi mila.");
}

function setStatus(message, error = false) {
  $("#status").textContent = message;
  $("#status").style.color = error ? "#ff9a9a" : "#aab3d4";
}

function itemKey(item) {
  return `${item.day}:video:${item.date}:${item.time}:${item.file?.name || ""}`;
}

function itemStatus(item) {
  if (progress[itemKey(item)]?.status === "completed") return "completed";
  if (item.skipped) return "skipped";
  return progress[itemKey(item)]?.status || "pending";
}

async function setItemStatus(item, status, detail = "") {
  progress[itemKey(item)] = { status, detail, updatedAt: new Date().toISOString() };
  await chrome.storage.local.set({ [PROGRESS_KEY]: progress });
  renderQueue();
}

function renderQueue() {
  $("#queueCount").textContent = `${displayQueue.length} uploads · ${queue.length} scheduled from selected day`;
  $("#queue").innerHTML = displayQueue.length ? displayQueue.map(item => `<div class="queueItem"><span>Day ${item.day}</span><span>${item.title}</span><span>${item.date} ${item.time}</span><span class="queueStatus" data-status="${itemStatus(item)}">${itemStatus(item).toUpperCase()}</span></div>`).join("") : '<p class="hint">Select folders to preview the queue.</p>';
}

async function rebuildQueue() {
  try {
    const files = selectedFiles();
    if (!files.length) { queue = []; displayQueue = []; renderQueue(); return; }
    const entries = YouTubeUploaderLib.parseCampaign(await findMarkdown(files));
    const videos = files.filter(file => /^video\//.test(file.type) || /\.(mp4|mov|webm|m4v)$/i.test(file.name));
    const startDay = Math.max(1, Number($("#startDay").value) || 1);
    queue = YouTubeUploaderLib.buildQueue(entries, videos, startDay, $("#startDate").value, $("#time").value);
    const campaignStartDate = YouTubeUploaderLib.addDays($("#startDate").value, 1 - startDay);
    const previous = YouTubeUploaderLib.buildQueue(entries, videos, 1, campaignStartDate, $("#time").value)
      .filter(item => item.day < startDay)
      .map(item => ({ ...item, skipped: true }));
    displayQueue = [...previous, ...queue];
    renderQueue();
    let vaultNote = "";
    try {
      const savedNow = await vaultSync(files);
      const total = await vaultTotal();
      if (total) vaultNote = ` ${total} file copies saved inside the extension — deleting the folder from Downloads is safe.`;
    } catch (_) {}
    setStatus(`Matched ${entries.length} captions and ${videos.length} videos. ${queue.length} daily uploads ready.${vaultNote}`);
  } catch (error) {
    queue = [];
    displayQueue = [];
    renderQueue();
    setStatus(error.message, true);
  }
}

async function filePayload(file) {
  const source = sourceForFile.get(file);
  const base = $(source === "folder2" ? "#path2" : "#path1").value.trim().replace(/[\\/]+$/, "");
  let relative = (file.webkitRelativePath || file.name).replace(/[\\/]+/g, "\\");
  if (base && relative.split("\\")[0].toLowerCase() === base.split(/[\\/]/).filter(Boolean).at(-1).toLowerCase()) relative = relative.split("\\").slice(1).join("\\");
  return { name: file.name, type: file.type || "video/mp4", bytes: Array.from(new Uint8Array(await file.arrayBuffer())), path: base ? `${base}\\${relative}` : "" };
}

async function start() {
  await rebuildQueue();
  if (!queue.length) throw new Error("No matched daily videos are ready.");
  const first = new Date(`${queue[0].date}T${queue[0].time}:00`);
  if (!Number.isFinite(first.getTime()) || first.getTime() <= Date.now() + 10 * 60 * 1000) throw new Error("Start date/time at least 10 minutes future mein rakhein.");
  stopped = false;
  $("#start").disabled = true;
  $("#stop").disabled = false;
  for (let index = 0; index < queue.length && !stopped; index += 1) {
    const item = queue[index];
    await setItemStatus(item, "running");
    setStatus(`Uploading ${index + 1}/${queue.length}: Day ${item.day} → ${item.date} ${item.time} on 3S Verse…`);
    try {
      const response = await chrome.runtime.sendMessage({ type: "UPLOAD_YOUTUBE_ITEM", item: { ...item, file: await filePayload(item.file), channel: "3S Verse" } });
      if (!response?.ok) throw new Error(response?.error || "YouTube upload failed.");
    } catch (error) {
      await setItemStatus(item, "failed", error.message);
      throw new Error(`Day ${item.day}: ${error.message}`);
    }
    await setItemStatus(item, "completed");
    setStatus(`Scheduled ${index + 1}/${queue.length}: Day ${item.day}.`);
    if (index < queue.length - 1 && !stopped) await new Promise(resolve => setTimeout(resolve, 4000));
  }
  setStatus(stopped ? "Stopped after current upload." : `Complete: ${queue.length} daily YouTube uploads scheduled.`);
  $("#start").disabled = false;
  $("#stop").disabled = true;
}

for (const selector of ["#folder1", "#folder2", "#startDay", "#startDate", "#time"]) $(selector).addEventListener("change", rebuildQueue);
for (const number of [1, 2]) {
  $("#folder" + number).addEventListener("change", async () => {
    const input = $("#folder" + number);
    $("#folder" + number + "Summary").textContent = input.files.length ? `Folder ${number} linked: ${input.files.length} files` : `Folder ${number} not selected`;
    if (input.files.length) {
      // A freshly linked folder replaces its saved copies in the vault.
      try { await AssetVault.clearSlot("folder" + number); } catch (_) {}
      vaultFiles = vaultFiles.filter(file => file.__vaultSlot !== "folder" + number);
    }
  });
  $("#path" + number).addEventListener("change", () => chrome.storage.local.set({ ["youtubePath" + number]: $("#path" + number).value.trim() }));
}
$("#openYouTube").addEventListener("click", () => chrome.tabs.create({ url: STUDIO_URL }));
$("#start").addEventListener("click", () => start().catch(error => { $("#start").disabled = false; $("#stop").disabled = true; setStatus(error.message, true); }));
$("#stop").addEventListener("click", () => { stopped = true; $("#stop").disabled = true; });
$("#clearVault").addEventListener("click", async () => {
  try {
    await AssetVault.clearAll();
    vaultFiles = [];
    setStatus("Saved file copies cleared inside the extension. Link the campaign folder again to save fresh copies.");
    if (!$("#folder1").files.length && !$("#folder2").files.length) { queue = []; displayQueue = []; renderQueue(); }
  } catch (error) { setStatus(error.message, true); }
});
chrome.storage.local.get(["youtubePath1", "youtubePath2", PROGRESS_KEY]).then(result => {
  progress = result[PROGRESS_KEY] || {};
  if (result.youtubePath1) $("#path1").value = result.youtubePath1;
  if (result.youtubePath2) $("#path2").value = result.youtubePath2;
  renderQueue();
  // No live folder linked? Rebuild the queue from the copies saved inside
  // the extension, so a deleted Downloads folder never stops the campaign.
  vaultRestoreIfEmpty(true).then(restored => {
    if (restored) setStatus(`Restored ${vaultFiles.length} saved campaign files from inside the extension — the Downloads folder is no longer needed.`);
  }).catch(error => setStatus(error.message, true));
});
$("#startDate").value = tomorrow();
renderQueue();
