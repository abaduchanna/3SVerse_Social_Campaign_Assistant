const $ = selector => document.querySelector(selector);
let campaign = { groups: [], caption: "", facebookTabId: null };
let runState = { active: false, index: 0, posted: 0, total: 0, status: "Ready." };

function parseGroups(text) {
  return [...new Set(text.split(/[,\n]+/).map(value => value.trim()).filter(Boolean))];
}

function paint() {
  const total = runState.total || campaign.groups.length;
  const posted = runState.posted || 0;
  const currentIndex = runState.active ? runState.index : Math.min(posted, total);
  $("#counter").textContent = `${posted} of ${total} posted`;
  $("#groupName").textContent = campaign.groups[currentIndex]
    || (total && posted >= total ? "Campaign complete" : "No group selected");
  $("#prepare").disabled = runState.active;
  $("#stop").disabled = !runState.active;
  $("#prepare").textContent = runState.active ? "Campaign running…" : "Start auto-post campaign";
}

function setStatus(message, error = false) {
  $("#status").textContent = message;
  $("#status").style.color = error ? "#ff9a9a" : "#aab3d4";
}

async function saveCampaign() {
  campaign.groups = parseGroups($("#groups").value);
  campaign.caption = $("#caption").value.trim();
  await chrome.storage.local.set({ campaign });
  paint();
  setStatus(`Saved ${campaign.groups.length} groups.`);
}

async function mediaPayload() {
  const file = $("#media").files[0];
  if (!file) return null;
  if (file.size > 50 * 1024 * 1024) throw new Error("Choose a media file smaller than 50 MB.");
  return { name: file.name, type: file.type, bytes: [...new Uint8Array(await file.arrayBuffer())] };
}

async function startCampaign() {
  await saveCampaign();
  if (!campaign.groups.length) throw new Error("Add at least one exact Facebook group name.");
  if (!campaign.caption) throw new Error("Add the post text.");

  $("#prepare").disabled = true;
  $("#prepare").textContent = "Starting…";
  const hasMedia = Boolean($("#media").files[0]);
  const media = await mediaPayload();
  await chrome.storage.local.set({ autoCampaignMedia: media });
  setStatus(`Starting ${campaign.groups.length} posts${hasMedia ? " with the selected reel/image" : " without media"}…`);
  const response = await chrome.runtime.sendMessage({
    type: "START_CAMPAIGN",
    groups: campaign.groups,
    caption: campaign.caption
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
  runState = { active: false, index: 0, posted: 0, total: campaign.groups.length, status: "Progress reset." };
  await chrome.storage.local.set({ autoCampaign: runState });
  paint();
  setStatus("Progress reset. Facebook posts were not deleted.");
});

$("#media").addEventListener("change", () => {
  const file = $("#media").files[0];
  $("#mediaHint").textContent = file
    ? `Selected: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`
    : "Optional. Without a file, every group receives a text-only post.";
});

chrome.storage.onChanged.addListener(changes => {
  if (!changes.autoCampaign?.newValue) return;
  runState = changes.autoCampaign.newValue;
  campaign.facebookTabId = runState.tabId || campaign.facebookTabId;
  paint();
  setStatus(runState.status || "Campaign updated.", Boolean(runState.error));
});

chrome.storage.local.get(["campaign", "autoCampaign"]).then(result => {
  if (result.campaign) campaign = { ...campaign, ...result.campaign };
  if (result.autoCampaign) runState = { ...runState, ...result.autoCampaign };
  $("#groups").value = campaign.groups.join(", ");
  $("#caption").value = campaign.caption;
  paint();
  setStatus(runState.status || "Ready.", Boolean(runState.error));
});
