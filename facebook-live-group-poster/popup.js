const $ = selector => document.querySelector(selector);
let groups = [];
let selectedIds = new Set();
let state = { active: false, posted: 0, total: 0, index: 0, status: "Ready." };

$("#extVersion").textContent = `v${chrome.runtime.getManifest().version}`;

function identity(url) {
  try { return new URL(url).pathname.match(/^\/groups\/([^/]+)/i)?.[1]?.toLowerCase() || ""; }
  catch (_) { return ""; }
}

function setStatus(message, error = false) {
  $("#status").textContent = message;
  $("#status").style.color = error ? "#ff9a9a" : "#aab3d4";
}

function renderGroups() {
  const filter = $("#groupSearch").value.trim().toLowerCase();
  const visible = groups.filter(group => !filter || group.name.toLowerCase().includes(filter));
  $("#groupList").innerHTML = visible.length ? visible.map(group => {
    const id = identity(group.url);
    return `<div class="group"><input class="groupCheck" id="g-${id}" data-id="${id}" type="checkbox" ${selectedIds.has(id) ? "checked" : ""}><label for="g-${id}">${group.name}<small>${group.url}</small></label></div>`;
  }).join("") : '<p class="hint">No matching joined groups.</p>';
  $("#selectedCount").textContent = `${selectedIds.size} selected`;
  for (const checkbox of document.querySelectorAll(".groupCheck")) checkbox.addEventListener("change", () => {
    checkbox.checked ? selectedIds.add(checkbox.dataset.id) : selectedIds.delete(checkbox.dataset.id);
    $("#selectedCount").textContent = `${selectedIds.size} selected`;
  });
}

function composeCaption() {
  const parts = [$("#postText").value.trim(), $("#liveLink").value.trim(), $("#hashtags").value.trim()].filter(Boolean);
  return parts.join("\n\n");
}

async function saveForm() {
  await chrome.storage.local.set({
    livePosterForm: { liveLink: $("#liveLink").value.trim(), postText: $("#postText").value.trim(), hashtags: $("#hashtags").value.trim() },
    livePosterSelectedIds: [...selectedIds]
  });
}

function paintState() {
  $("#counter").textContent = `${state.posted || 0} of ${state.total || 0} posted`;
  $("#currentGroup").textContent = state.targets?.[state.index]?.name || (state.active ? "Working…" : "Ready");
  $("#start").disabled = state.active;
  $("#stop").disabled = !state.active;
}

$("#importGroups").addEventListener("click", async () => {
  try {
    setStatus("Opening Facebook Your groups and scrolling the joined-groups list… (you can close this popup — the list saves itself)");
    const response = await chrome.runtime.sendMessage({ type: "IMPORT_JOINED_GROUPS" });
    if (!response?.ok) throw new Error(response?.error || "Joined groups could not be imported.");
    await mirrorStore();
    const expected = response.expected || 0;
    setStatus(response.partial && expected
      ? `Loaded ${groups.length} of ${expected} joined groups — Facebook lazy-loads the rest in batches. Tap Import joined groups again to load more (your selection is kept).`
      : `Imported ${groups.length} joined groups. The checklist and your ticks are saved — tap Save selection any time to be safe.`);
  } catch (error) { setStatus(error.message, true); }
});

// The background persists the merged checklist; the popup MIRRORS it, so the
// visible list is always exactly what is saved.
async function mirrorStore() {
  const saved = await chrome.storage.local.get(["livePosterGroups", "livePosterSelectedIds"]);
  groups = saved.livePosterGroups || [];
  selectedIds = new Set(saved.livePosterSelectedIds || []);
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
});
$("#saveSelection").addEventListener("click", () => saveForm().then(() => setStatus(`Saved ${selectedIds.size} selected groups.`)).catch(error => setStatus(error.message, true)));

$("#start").addEventListener("click", async () => {
  try {
    const link = $("#liveLink").value.trim();
    if (!/^https?:\/\//i.test(link)) throw new Error("Enter the complete Facebook Live link.");
    const targets = groups.filter(group => selectedIds.has(identity(group.url)));
    if (!targets.length) throw new Error("Select and save at least one joined group.");
    const caption = composeCaption();
    if (!caption) throw new Error("Add the live link or post text.");
    await saveForm();
    setStatus(`Starting ${targets.length} selected groups…`);
    const response = await chrome.runtime.sendMessage({ type: "START_LIVE_CAMPAIGN", caption, targets });
    if (!response?.ok) throw new Error(response?.error || "Campaign could not start.");
    state = response.state;
    paintState();
    setStatus(state.status);
  } catch (error) { setStatus(error.message, true); }
});

$("#stop").addEventListener("click", async () => {
  const response = await chrome.runtime.sendMessage({ type: "STOP_LIVE_CAMPAIGN" });
  if (response?.state) state = response.state;
  paintState();
  setStatus(state.status || "Campaign stopped.");
});
$("#openTab").addEventListener("click", async () => {
  if (!state.tabId) return setStatus("Import groups or start a campaign first.", true);
  await chrome.tabs.update(state.tabId, { active: true });
});

chrome.storage.onChanged.addListener(changes => {
  if (changes.livePosterCampaign?.newValue) {
    state = changes.livePosterCampaign.newValue;
    paintState();
    setStatus(state.status || "Updated.", Boolean(state.error));
  }
  // Live-render the checklist when the background saves an import while the
  // popup is open.
  if (changes.livePosterGroups?.newValue) mirrorStore().catch(() => {});
});

chrome.storage.local.get(["livePosterForm", "livePosterGroups", "livePosterSelectedIds", "livePosterCampaign"]).then(saved => {
  const form = saved.livePosterForm || {};
  $("#liveLink").value = form.liveLink || "";
  $("#postText").value = form.postText || "";
  $("#hashtags").value = form.hashtags || "";
  groups = saved.livePosterGroups || [];
  selectedIds = new Set(saved.livePosterSelectedIds || []);
  state = saved.livePosterCampaign || state;
  renderGroups(); paintState(); setStatus(state.status || "Ready.", Boolean(state.error));
});
