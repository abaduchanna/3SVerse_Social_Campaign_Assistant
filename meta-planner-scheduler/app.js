const $ = selector => document.querySelector(selector);
const PLANNER_URL = "https://business.facebook.com/latest/content_calendar?business_id=4880742675547794&asset_id=1376773818846890";
let queue = [];
let displayQueue = [];
let stopped = false;
const sourceForFile = new WeakMap();
const PROGRESS_KEY = "metaScheduleProgressV1";
let progress = {};
let vaultFiles = [];

$("#extVersion").textContent = `v${chrome.runtime.getManifest().version}`;

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
  if (($("#captionFolder")?.files?.length || 0) + ($("#reelFolder")?.files?.length || 0)) return false; // live folder still linked
  for (const record of records) vaultFiles.push(vaultFile(record));
  if (rebuild) await rebuildQueue();
  return true;
}

const WINDOWS_SEPARATOR = "\\";

function tomorrow() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  const pad = value => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function selectedFiles() {
  const seen = new Map();
  for (const file of vaultFiles) {
    sourceForFile.set(file, file.__vaultSlot || "reelFolder");
    seen.set(`${file.webkitRelativePath || file.name}:${file.size}:${file.lastModified}`, file);
  }
  for (const input of [$("#captionFolder"), $("#reelFolder")]) {
    for (const file of input.files) {
      sourceForFile.set(file, input.id);
      const key = `${file.webkitRelativePath || file.name}:${file.size}:${file.lastModified}`;
      seen.set(key, file);
    }
  }
  return [...seen.values()];
}

async function findMarkdown(files) {
  const candidates = files.filter(file => /\.md$/i.test(file.name));
  for (const file of candidates) {
    const text = await file.text();
    if (/^## Day\s+\d+/m.test(text)) return text;
  }
  throw new Error("No campaign Markdown containing Day 1, Day 2… was found in the selected folder(s).");
}

function settings() {
  return {
    reel: $("#reelType").checked,
    post: $("#postType").checked,
    story: $("#storyType").checked
  };
}

function setStatus(message, error = false) {
  $("#status").textContent = message;
  $("#status").style.color = error ? "#ff9a9a" : "#aab3d4";
}

function itemKey(item) {
  return `${item.day}:${item.type}:${item.date}:${item.time}:${item.file?.name || ""}`;
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

async function rebuildQueue() {
  try {
    const files = selectedFiles();
    if (!files.length) {
      queue = [];
      renderQueue();
      return;
    }
    const markdown = await findMarkdown(files);
    const captions = MetaSchedulerLib.parseLinkedInCampaign(markdown);
    const media = files.filter(file => /^video\//.test(file.type) || /\.(mp4|webm|mov)$/i.test(file.name));
    const images = files.filter(file => /^image\//.test(file.type) || /\.(png|jpe?g|webp)$/i.test(file.name));
    const firstDayTime = $("#customFirstDay").checked ? $("#firstDayTime").value : "";
    const startDay = Math.max(1, Number($("#startDay").value) || 1);
    queue = MetaSchedulerLib.buildQueue(captions, media, images, $("#startDate").value, $("#time").value, settings(), firstDayTime, startDay);
    const campaignStartDate = MetaSchedulerLib.addDays($("#startDate").value, 1 - startDay);
    const previous = MetaSchedulerLib.buildQueue(captions, media, images, campaignStartDate, $("#time").value, settings(), firstDayTime, 1)
      .filter(item => item.day < startDay)
      .map(item => ({ ...item, skipped: true }));
    displayQueue = [...previous, ...queue];
    renderQueue();
    let vaultNote = "";
    try {
      await vaultSync(files);
      const total = await vaultTotal();
      if (total) vaultNote = ` ${total} file copies saved inside the extension — deleting the folder from Downloads is safe.`;
    } catch (_) {}
    setStatus(`Matched ${captions.length} captions, ${media.length} videos and ${images.length} images. Queue: ${queue.length}.${vaultNote}`);
  } catch (error) {
    queue = [];
    displayQueue = [];
    renderQueue();
    setStatus(error.message, true);
  }
}

function renderQueue() {
  $("#queueCount").textContent = `${displayQueue.length} items · ${queue.length} scheduled from selected day`;
  $("#queue").innerHTML = displayQueue.length ? displayQueue.map(item => `
    <div class="queueItem">
      <span>Day ${item.day}</span>
      <span>${item.heading}</span>
      <span>${item.type.toUpperCase()}</span>
      <span>${item.date} ${item.time}</span>
      <span class="queueStatus" data-status="${itemStatus(item)}">${itemStatus(item).toUpperCase()}</span>
    </div>`).join("") : '<p class="hint">Select one or two folders to build the queue.</p>';
}

async function filePayload(file) {
  const source = sourceForFile.get(file);
  const pathInput = source === "reelFolder" ? $("#reelPath") : $("#captionPath");
  const base = pathInput.value.trim().replace(/[\\/]+$/, "");
  let relative = (file.webkitRelativePath || file.name).replace(/[\\/]+/g, WINDOWS_SEPARATOR);
  let path = "";
  if (base) {
    const baseLeaf = base.split(/[\\/]/).filter(Boolean).at(-1).toLowerCase();
    const firstRelative = relative.split(WINDOWS_SEPARATOR)[0].toLowerCase();
    if (firstRelative === baseLeaf) relative = relative.split(WINDOWS_SEPARATOR).slice(1).join(WINDOWS_SEPARATOR);
    path = `${base}${WINDOWS_SEPARATOR}${relative}`;
  }
  return {
    name: file.name,
    type: file.type || "application/octet-stream",
    bytes: Array.from(new Uint8Array(await file.arrayBuffer())),
    path
  };
}

async function start() {
  // Read the live field values even when the operator types a day/date/time and
  // immediately presses Start before the input's change event fires.
  await rebuildQueue();
  if (!queue.length) throw new Error("The queue is empty. Link a campaign folder and check a content type.");
  stopped = false;
  $("#start").disabled = true;
  $("#stop").disabled = false;
  for (let index = 0; index < queue.length; index += 1) {
    if (stopped) break;
    const item = queue[index];
    await setItemStatus(item, "running");
    setStatus(`Scheduling ${index + 1} of ${queue.length}: Day ${item.day} ${item.type}…`);
    try {
      const response = await chrome.runtime.sendMessage({
        type: "SCHEDULE_META_ITEM",
        plannerUrl: PLANNER_URL,
        item: { ...item, file: await filePayload(item.file) }
      });
      if (!response?.ok) throw new Error(response?.error || "Meta scheduling failed.");
    } catch (error) {
      await setItemStatus(item, "failed", error.message);
      throw new Error(`Day ${item.day} ${item.type}: ${error.message}`);
    }
    await setItemStatus(item, "completed");
    setStatus(`Scheduled ${index + 1} of ${queue.length}.`);
    await new Promise(resolve => setTimeout(resolve, 3500));
  }
  setStatus(stopped ? "Stopped after the current item." : `Complete: ${queue.length} items scheduled in Meta Planner.`);
  $("#start").disabled = false;
  $("#stop").disabled = true;
}

for (const selector of ["#captionFolder", "#reelFolder", "#startDay", "#startDate", "#time", "#firstDayTime", "#customFirstDay", "#reelType", "#postType", "#storyType"]) {
  $(selector).addEventListener("change", rebuildQueue);
}
$("#customFirstDay").addEventListener("change", () => { $("#firstDayTime").disabled = !$("#customFirstDay").checked; });
for (const id of ["captionPath", "reelPath"]) {
  $("#" + id).addEventListener("change", () => chrome.storage.local.set({ ["meta" + id[0].toUpperCase() + id.slice(1)]: $("#" + id).value.trim() }));
}
$("#captionFolder").addEventListener("change", async () => {
  const input = $("#captionFolder");
  const count = input.files.length;
  $("#captionSummary").textContent = count ? `Folder 1 linked: ${count} files` : "No folder selected";
  if (count) {
    // A freshly linked folder replaces its saved copies in the vault.
    try { await AssetVault.clearSlot("captionFolder"); } catch (_) {}
    vaultFiles = vaultFiles.filter(file => file.__vaultSlot !== "captionFolder");
  }
});
$("#reelFolder").addEventListener("change", async () => {
  const input = $("#reelFolder");
  const count = input.files.length;
  $("#reelSummary").textContent = count ? `Folder 2 linked: ${count} files` : "Optional folder not selected";
  if (count) {
    try { await AssetVault.clearSlot("reelFolder"); } catch (_) {}
    vaultFiles = vaultFiles.filter(file => file.__vaultSlot !== "reelFolder");
  }
});
$("#openPlanner").addEventListener("click", () => chrome.tabs.create({ url: PLANNER_URL }));
$("#start").addEventListener("click", () => start().catch(error => {
  $("#start").disabled = false;
  $("#stop").disabled = true;
  setStatus(error.message, true);
}));
$("#stop").addEventListener("click", () => { stopped = true; $("#stop").disabled = true; });
$("#clearVault").addEventListener("click", async () => {
  try {
    await AssetVault.clearAll();
    vaultFiles = [];
    setStatus("Saved file copies cleared inside the extension. Link the campaign folder again to save fresh copies.");
    if (!$("#captionFolder").files.length && !$("#reelFolder").files.length) { queue = []; displayQueue = []; renderQueue(); }
  } catch (error) { setStatus(error.message, true); }
});
$("#startDate").value = tomorrow();
chrome.storage.local.get(["metaCaptionPath", "metaReelPath", PROGRESS_KEY]).then(result => {
  progress = result[PROGRESS_KEY] || {};
  if (result.metaCaptionPath) $("#captionPath").value = result.metaCaptionPath;
  if (result.metaReelPath) $("#reelPath").value = result.metaReelPath;
  renderQueue();
  // No live folder linked? Rebuild the queue from the copies saved inside
  // the extension, so a deleted Downloads folder never stops the campaign.
  vaultRestoreIfEmpty(true).then(restored => {
    if (restored) setStatus(`Restored ${vaultFiles.length} saved campaign files from inside the extension — the Downloads folder is no longer needed.`);
  }).catch(error => setStatus(error.message, true));
});
renderQueue();
