const $ = selector => document.querySelector(selector);
const PLANNER_URL = "https://business.facebook.com/latest/content_calendar?business_id=4880742675547794&asset_id=1376773818846890";
let queue = [];
let stopped = false;
const sourceForFile = new WeakMap();

const WINDOWS_SEPARATOR = "\\";

function tomorrow() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  const pad = value => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function selectedFiles() {
  const seen = new Map();
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
    renderQueue();
    setStatus(`Matched ${captions.length} captions, ${media.length} videos and ${images.length} images. Queue: ${queue.length}.`);
  } catch (error) {
    queue = [];
    renderQueue();
    setStatus(error.message, true);
  }
}

function renderQueue() {
  $("#queueCount").textContent = `${queue.length} items`;
  $("#queue").innerHTML = queue.length ? queue.map(item => `
    <div class="queueItem">
      <span>Day ${item.day}</span>
      <span>${item.heading}</span>
      <span>${item.type.toUpperCase()}</span>
      <span>${item.date} ${item.time}</span>
    </div>`).join("") : '<p class="hint">Select one or two folders to build the queue.</p>';
}

async function filePayload(file) {
  const source = sourceForFile.get(file);
  const pathInput = source === "reelFolder" ? $("#reelPath") : $("#captionPath");
  const base = pathInput.value.trim().replace(/[\\/]+$/, "");
  if (!base) throw new Error(`Enter the exact path for ${source === "reelFolder" ? "Campaign folder 2" : "Campaign folder 1"}.`);
  let relative = (file.webkitRelativePath || file.name).replace(/[\\/]+/g, WINDOWS_SEPARATOR);
  const baseLeaf = base.split(/[\\/]/).filter(Boolean).at(-1).toLowerCase();
  const firstRelative = relative.split(WINDOWS_SEPARATOR)[0].toLowerCase();
  if (firstRelative === baseLeaf) relative = relative.split(WINDOWS_SEPARATOR).slice(1).join(WINDOWS_SEPARATOR);
  return { name: file.name, type: file.type || "application/octet-stream", path: `${base}${WINDOWS_SEPARATOR}${relative}` };
}

async function start() {
  if (!queue.length) throw new Error("The queue is empty. Link a campaign folder and check a content type.");
  stopped = false;
  $("#start").disabled = true;
  $("#stop").disabled = false;
  for (let index = 0; index < queue.length; index += 1) {
    if (stopped) break;
    const item = queue[index];
    setStatus(`Scheduling ${index + 1} of ${queue.length}: Day ${item.day} ${item.type}…`);
    const response = await chrome.runtime.sendMessage({
      type: "SCHEDULE_META_ITEM",
      plannerUrl: PLANNER_URL,
      item: { ...item, file: await filePayload(item.file) }
    });
    if (!response?.ok) throw new Error(`Day ${item.day} ${item.type}: ${response?.error || "Meta scheduling failed."}`);
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
$("#captionFolder").addEventListener("change", () => {
  const count = $("#captionFolder").files.length;
  $("#captionSummary").textContent = count ? `Folder 1 linked: ${count} files` : "No folder selected";
});
$("#reelFolder").addEventListener("change", () => {
  const count = $("#reelFolder").files.length;
  $("#reelSummary").textContent = count ? `Folder 2 linked: ${count} files` : "Optional folder not selected";
});
$("#openPlanner").addEventListener("click", () => chrome.tabs.create({ url: PLANNER_URL }));
$("#start").addEventListener("click", () => start().catch(error => {
  $("#start").disabled = false;
  $("#stop").disabled = true;
  setStatus(error.message, true);
}));
$("#stop").addEventListener("click", () => { stopped = true; $("#stop").disabled = true; });
$("#startDate").value = tomorrow();
chrome.storage.local.get(["metaCaptionPath", "metaReelPath"]).then(result => {
  if (result.metaCaptionPath) $("#captionPath").value = result.metaCaptionPath;
  if (result.metaReelPath) $("#reelPath").value = result.metaReelPath;
});
renderQueue();
