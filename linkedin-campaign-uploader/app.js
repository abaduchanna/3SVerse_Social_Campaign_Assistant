const $ = selector => document.querySelector(selector);
const DASHBOARD_URL = "https://www.linkedin.com/company/144975022/admin/dashboard/";
const WINDOWS_SEPARATOR = "\\";
const sourceForFile = new WeakMap();
let queue = [];
let stopped = false;

function selectedFiles() {
  const seen = new Map();
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
  throw new Error("No campaign Markdown containing Day 1, Day 2… was found in the selected folder(s).");
}

function setStatus(message, error = false) {
  $("#status").textContent = message;
  $("#status").style.color = error ? "#ff9a9a" : "#aab3d4";
}

async function rebuildQueue() {
  try {
    const files = selectedFiles();
    if (!files.length) { queue = []; renderQueue(); return; }
    const captions = LinkedInUploaderLib.parseCampaign(await findMarkdown(files));
    const images = files.filter(file => /^image\//.test(file.type) || /\.(png|jpe?g|webp)$/i.test(file.name));
    const videos = files.filter(file => /^video\//.test(file.type) || /\.(mp4|mov|webm|m4v)$/i.test(file.name));
    queue = LinkedInUploaderLib.buildQueue(captions, images, videos, {
      image: $("#imageType").checked,
      video: $("#videoType").checked
    }, Math.max(1, Number($("#startDay").value) || 1));
    renderQueue();
    setStatus(`Matched ${captions.length} captions, ${images.length} images and ${videos.length} videos. Queue: ${queue.length}.`);
  } catch (error) {
    queue = [];
    renderQueue();
    setStatus(error.message, true);
  }
}

function renderQueue() {
  $("#queueCount").textContent = `${queue.length} items`;
  $("#queue").innerHTML = queue.length ? queue.map(item => `<div class="queueItem"><span>Day ${item.day}</span><span>${item.heading}</span><span>${item.type.toUpperCase()}</span><span>${item.file.name}</span></div>`).join("") : '<p class="hint">Select one or two folders to build the queue.</p>';
}

async function filePayload(file) {
  const source = sourceForFile.get(file);
  const base = $(source === "folder2" ? "#path2" : "#path1").value.trim().replace(/[\\/]+$/, "");
  let relative = (file.webkitRelativePath || file.name).replace(/[\\/]+/g, WINDOWS_SEPARATOR);
  if (base) {
    const baseLeaf = base.split(/[\\/]/).filter(Boolean).at(-1).toLowerCase();
    if (relative.split(WINDOWS_SEPARATOR)[0].toLowerCase() === baseLeaf) relative = relative.split(WINDOWS_SEPARATOR).slice(1).join(WINDOWS_SEPARATOR);
  }
  return {
    name: file.name,
    type: file.type || "application/octet-stream",
    bytes: Array.from(new Uint8Array(await file.arrayBuffer())),
    path: base ? `${base}${WINDOWS_SEPARATOR}${relative}` : ""
  };
}

async function start() {
  await rebuildQueue();
  if (!queue.length) throw new Error("The queue is empty. Link a campaign folder and select Image and/or Video posts.");
  stopped = false;
  $("#start").disabled = true;
  $("#stop").disabled = false;
  for (let index = 0; index < queue.length; index += 1) {
    if (stopped) break;
    const item = queue[index];
    setStatus(`Posting ${index + 1} of ${queue.length}: Day ${item.day} ${item.type}…`);
    const response = await chrome.runtime.sendMessage({ type: "POST_LINKEDIN_ITEM", item: { ...item, file: await filePayload(item.file) } });
    if (!response?.ok) throw new Error(`Day ${item.day} ${item.type}: ${response?.error || "LinkedIn posting failed."}`);
    setStatus(`Posted ${index + 1} of ${queue.length}: Day ${item.day} ${item.type}.`);
    if (index < queue.length - 1 && !stopped) await new Promise(resolve => setTimeout(resolve, Math.max(5, Number($("#delay").value) || 12) * 1000));
  }
  setStatus(stopped ? "Stopped after the current item." : `Complete: ${queue.length} LinkedIn posts published.`);
  $("#start").disabled = false;
  $("#stop").disabled = true;
}

for (const selector of ["#folder1", "#folder2", "#startDay", "#imageType", "#videoType"]) $(selector).addEventListener("change", rebuildQueue);
for (const number of [1, 2]) {
  $("#folder" + number).addEventListener("change", () => {
    const count = $("#folder" + number).files.length;
    $("#folder" + number + "Summary").textContent = count ? `Folder ${number} linked: ${count} files` : number === 1 ? "No folder selected" : "Optional folder not selected";
  });
  $("#path" + number).addEventListener("change", () => chrome.storage.local.set({ ["linkedinPath" + number]: $("#path" + number).value.trim() }));
}
$("#openLinkedIn").addEventListener("click", () => chrome.tabs.create({ url: DASHBOARD_URL }));
$("#start").addEventListener("click", () => start().catch(error => { $("#start").disabled = false; $("#stop").disabled = true; setStatus(error.message, true); }));
$("#stop").addEventListener("click", () => { stopped = true; $("#stop").disabled = true; });
chrome.storage.local.get(["linkedinPath1", "linkedinPath2"]).then(result => {
  if (result.linkedinPath1) $("#path1").value = result.linkedinPath1;
  if (result.linkedinPath2) $("#path2").value = result.linkedinPath2;
});
renderQueue();
