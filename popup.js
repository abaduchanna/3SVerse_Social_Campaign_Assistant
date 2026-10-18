const $ = selector => document.querySelector(selector);
let campaign = { caption: "", facebookTabId: null };
let runState = { active: false, index: 0, posted: 0, total: 0, status: "Ready." };
let storedMedia = null;
let groups = [];
let selectedIds = new Set();

$("#extVersion").textContent = `v${chrome.runtime.getManifest().version}`;

function identity(url) {
  try {
    return new URL(url).pathname.match(/^\/groups\/([^/]+)/i)?.[1]?.toLowerCase() || "";
  } catch (_) {
    return "";
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[ch]);
}

function selectedCount() {
  $("#selectedCount").textContent = `${selectedIds.size} selected`;
}

function renderGroups() {
  if (!groups.length) {
    $("#groupList").innerHTML = "";
    selectedCount();
    return;
  }
  $("#groupSearch").hidden = false;
  $("#selectAllRow").hidden = false;
  const filter = $("#groupSearch").value.trim().toLowerCase();
  const visible = groups.filter(group => !filter || group.name.toLowerCase().includes(filter));
  $("#groupList").innerHTML = visible.length ? visible.map(group => {
    const id = identity(group.url);
    return `<div class="group"><input class="groupCheck" id="g-${id}" data-id="${id}" type="checkbox" ${selectedIds.has(id) ? "checked" : ""}><label for="g-${id}">${escapeHtml(group.name)}<small>${escapeHtml(group.url)}</small></label></div>`;
  }).join("") : '<p class="hint">No matching joined groups.</p>';
  for (const checkbox of document.querySelectorAll(".groupCheck")) checkbox.addEventListener("change", () => {
    checkbox.checked ? selectedIds.add(checkbox.dataset.id) : selectedIds.delete(checkbox.dataset.id);
    selectedCount();
    persistGroupPick();
  });
  selectedCount();
}

async function persistGroupPick() {
  await chrome.storage.local.set({ importedGroupsStore: { groups, selectedIds: [...selectedIds] } });
}

function paint() {
  const total = runState.total || 0;
  const posted = runState.posted || 0;
  const currentIndex = runState.active ? runState.index : Math.min(posted, total);
  $("#counter").textContent = `${posted} of ${total} posted`;
  $("#groupName").textContent = runState.targets?.[currentIndex]?.name
    || (total && posted >= total ? "Campaign complete" : "No group selected");
  $("#prepare").disabled = runState.active;
  $("#stop").disabled = !runState.active;
  $("#prepare").textContent = runState.active ? "Campaign running…" : "Start auto-post campaign";
}

function setStatus(message, error = false) {
  $("#status").textContent = message;
  $("#status").style.color = error ? "#ff9a9a" : "#aab3d4";
}

async function paintStoredMedia() {
  const names = storedMediaFiles().map(file => file.name);
  const hasStoredMedia = names.length > 0;
  $("#media").hidden = hasStoredMedia;
  $("#storedMediaCard").hidden = !hasStoredMedia;
  $("#storedMediaName").textContent = hasStoredMedia
    ? `Stored media (${names.length}): ${names.join(", ")}`
    : "";
  $("#mediaHint").textContent = hasStoredMedia
    ? "Saved inside the extension — every selected group receives ALL of these files, even after you delete the originals from Downloads."
    : "Optional. Select as many photos/videos as you like (Ctrl+click) — every group gets all of them. Without files, groups get a text-only post.";
}

/** v1.6.0: stored media may be the new multi-file shape {files:[...]} or the
 *  legacy single-file shape {name,type,bytes} — always return a list. */
function storedMediaFiles() {
  if (Array.isArray(storedMedia?.files) && storedMedia.files.length) return storedMedia.files;
  if (storedMedia?.bytes?.length) return [storedMedia];
  return [];
}

async function saveCampaign() {
  campaign.caption = $("#caption").value.trim();
  await chrome.storage.local.set({ campaign });
  paint();
  setStatus("Post text saved. Joined groups will be imported automatically at Start.");
}

async function mediaPayload() {
  const picked = [...$("#media").files];
  if (!picked.length) return storedMedia;
  const files = [];
  for (const file of picked) {
    if (file.size > 50 * 1024 * 1024) throw new Error(`"${file.name}" is larger than 50 MB — choose a smaller file.`);
    files.push({ name: file.name, type: file.type || "application/octet-stream", bytes: [...new Uint8Array(await file.arrayBuffer())] });
  }
  return { files };
}

async function startCampaign() {
  await saveCampaign();
  if (!campaign.caption) throw new Error("Add the post text.");
  if (!selectedIds.size) throw new Error("Import your groups and select at least one (or tap Select all visible).");

  $("#prepare").disabled = true;
  $("#prepare").textContent = "Starting…";
  const media = await mediaPayload();
  const mediaCount = Array.isArray(media?.files) ? media.files.length : (media?.bytes?.length ? 1 : 0);
  await chrome.storage.local.set({ autoCampaignMedia: media });
  setStatus(`Opening Facebook Your groups and collecting the list${mediaCount ? ` with ${mediaCount} media file(s) stored` : " for the selected stores"}…`);
  const response = await chrome.runtime.sendMessage({
    type: "START_CAMPAIGN",
    caption: campaign.caption,
    selected: [...selectedIds]
  });
  if (!response?.ok) throw new Error(response?.error || "Campaign could not start.");
  runState = response.state || runState;
  campaign.facebookTabId = runState.tabId || campaign.facebookTabId;
  await chrome.storage.local.set({ campaign });
  paint();
  setStatus(runState.status || "Campaign started.");
}

async function stopCampaign() {
  const response = await chrome.runtime.sendMessage({ type: "STOP_CAMPAIGN" });
  if (!response?.ok) throw new Error(response?.error || "Campaign could not stop.");
  runState = response.state;
  paint();
  setStatus(runState.status || "Campaign stopped.");
}

$("#importGroups").addEventListener("click", async () => {
  const button = $("#importGroups");
  try {
    button.disabled = true;
    setStatus("Opening Facebook Your groups and scrolling the joined-groups list… (you can close this popup — the list saves itself)");
    const response = await chrome.runtime.sendMessage({ type: "IMPORT_GROUPS" });
    if (!response?.ok) throw new Error(response?.error || "Joined groups could not be imported.");
    await applyImportedGroups();
    const expected = response.expected || 0;
    if (response.partial && expected) {
      setStatus(`Loaded ${groups.length} of ${expected} joined groups — Facebook lazy-loads the rest in batches. Tap Import joined groups again to load more (your selection is kept).`);
    } else {
      setStatus(`Imported ${groups.length} joined groups. The checklist and your ticks are saved — close and reopen this popup any time.`);
    }
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    button.disabled = false;
  }
});

// The background persists the merged checklist (importedGroupsStore); the
// popup only MIRRORS it. This keeps the visible list identical to what is
// saved, no matter when the popup opens or closes.
async function applyImportedGroups() {
  const saved = (await chrome.storage.local.get("importedGroupsStore")).importedGroupsStore;
  if (!Array.isArray(saved?.groups)) return;
  groups = saved.groups;
  selectedIds = new Set(saved.selectedIds || []);
  $("#selectAll").checked = groups.length > 0 && selectedIds.size === groups.length;
  renderGroups();
}

$("#groupSearch").addEventListener("input", renderGroups);

$("#selectAll").addEventListener("change", () => {
  const filter = $("#groupSearch").value.trim().toLowerCase();
  for (const group of groups.filter(group => !filter || group.name.toLowerCase().includes(filter))) {
    const id = identity(group.url);
    $("#selectAll").checked ? selectedIds.add(id) : selectedIds.delete(id);
  }
  renderGroups();
  persistGroupPick();
});

$("#save").addEventListener("click", () => saveCampaign().catch(error => setStatus(error.message, true)));
$("#prepare").addEventListener("click", () => startCampaign().catch(error => {
  runState.active = false;
  paint();
  setStatus(error.message, true);
}));
$("#stop").addEventListener("click", () => stopCampaign().catch(error => setStatus(error.message, true)));
$("#openTab").addEventListener("click", async () => {
  const tabId = runState.tabId || campaign.facebookTabId;
  if (!tabId) return setStatus("Start the campaign first so the Facebook tab can be found.", true);
  await chrome.tabs.update(tabId, { active: true });
});
$("#reset").addEventListener("click", async () => {
  if (runState.active) return setStatus("Stop the running campaign before resetting.", true);
  runState = { active: false, index: 0, posted: 0, total: 0, status: "Progress reset." };
  await chrome.storage.local.set({ autoCampaign: runState });
  paint();
  setStatus("Progress reset. Facebook posts were not deleted.");
});

$("#media").addEventListener("change", async () => {
  if (!$("#media").files.length) return;
  try {
    storedMedia = await mediaPayload();
    await chrome.storage.local.set({ autoCampaignMedia: storedMedia });
    paintStoredMedia();
  } catch (error) {
    storedMedia = null;
    setStatus(error.message, true);
  }
});

$("#replaceMedia").addEventListener("click", () => {
  $("#media").hidden = false;
  $("#media").click();
});

$("#clearMedia").addEventListener("click", async () => {
  storedMedia = null;
  $("#media").value = "";
  await chrome.storage.local.remove("autoCampaignMedia");
  paintStoredMedia();
  setStatus("Stored media cleared. The next campaign will be text-only unless you choose another file.");
});

chrome.storage.onChanged.addListener(changes => {
  if (changes.autoCampaign?.newValue) {
    runState = changes.autoCampaign.newValue;
    campaign.facebookTabId = runState.tabId || campaign.facebookTabId;
    paint();
    setStatus(runState.status || "Campaign updated.", Boolean(runState.error));
  }
  // Live-render the checklist if the background saves an import while this
  // popup is open (covers reopening the popup while an import finishes).
  if (changes.importedGroupsStore?.newValue) {
    applyImportedGroups().catch(() => {});
  }
});

chrome.storage.local.get(["campaign", "autoCampaign", "autoCampaignMedia", "importedGroupsStore"]).then(result => {
  if (result.campaign) campaign = { ...campaign, ...result.campaign };
  if (result.autoCampaign) runState = { ...runState, ...result.autoCampaign };
  if (result.autoCampaignMedia?.files?.length || result.autoCampaignMedia?.bytes?.length) {
    storedMedia = result.autoCampaignMedia;   // legacy single-file shape handled by storedMediaFiles()
  }
  if (Array.isArray(result.importedGroupsStore?.groups) && result.importedGroupsStore.groups.length) {
    groups = result.importedGroupsStore.groups;
    selectedIds = new Set(result.importedGroupsStore.selectedIds || []);
  }
  $("#caption").value = campaign.caption;
  renderGroups();
  paintStoredMedia();
  paint();
  setStatus(runState.status || "Ready.", Boolean(runState.error));
});
