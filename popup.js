const $ = selector => document.querySelector(selector);
let campaign = { caption: "", facebookTabId: null };
let runState = { active: false, index: 0, posted: 0, total: 0, status: "Ready." };
let storedMedia = null;

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

function paintStoredMedia() {
  const hasStoredMedia = Boolean(storedMedia?.bytes?.length);
  $("#media").hidden = hasStoredMedia;
  $("#storedMediaCard").hidden = !hasStoredMedia;
  $("#storedMediaName").textContent = hasStoredMedia ? `Stored reel/image: ${storedMedia.name}` : "";
  $("#mediaHint").textContent = hasStoredMedia
    ? "This stored file will be uploaded to every group in the campaign."
    : "Optional. Without a file, every group receives a text-only post.";
}

async function saveCampaign() {
  campaign.caption = $("#caption").value.trim();
  await chrome.storage.local.set({ campaign });
  paint();
  setStatus("Post text saved. Joined groups will be imported automatically at Start.");
}

async function mediaPayload() {
  const file = $("#media").files[0];
  if (!file) return storedMedia;
  if (file.size > 50 * 1024 * 1024) throw new Error("Choose a media file smaller than 50 MB.");
  return { name: file.name, type: file.type, bytes: [...new Uint8Array(await file.arrayBuffer())] };
}

async function startCampaign() {
  await saveCampaign();
  if (!campaign.caption) throw new Error("Add the post text.");

  $("#prepare").disabled = true;
  $("#prepare").textContent = "Starting…";
  const media = await mediaPayload();
  const hasMedia = Boolean(media?.bytes?.length);
  await chrome.storage.local.set({ autoCampaignMedia: media });
  setStatus(`Opening Facebook Your groups and collecting every joined group${hasMedia ? " with the selected reel/image stored" : " for a text-only campaign"}…`);
  const response = await chrome.runtime.sendMessage({
    type: "START_CAMPAIGN",
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
  runState = { active: false, index: 0, posted: 0, total: 0, status: "Progress reset." };
  await chrome.storage.local.set({ autoCampaign: runState });
  paint();
  setStatus("Progress reset. Facebook posts were not deleted.");
});

$("#media").addEventListener("change", async () => {
  const file = $("#media").files[0];
  if (!file) return;
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
  if (!changes.autoCampaign?.newValue) return;
  runState = changes.autoCampaign.newValue;
  campaign.facebookTabId = runState.tabId || campaign.facebookTabId;
  paint();
  setStatus(runState.status || "Campaign updated.", Boolean(runState.error));
});

chrome.storage.local.get(["campaign", "autoCampaign", "autoCampaignMedia"]).then(result => {
  if (result.campaign) campaign = { ...campaign, ...result.campaign };
  if (result.autoCampaign) runState = { ...runState, ...result.autoCampaign };
  if (result.autoCampaignMedia?.bytes?.length) {
    storedMedia = result.autoCampaignMedia;
  }
  $("#caption").value = campaign.caption;
  paintStoredMedia();
  paint();
  setStatus(runState.status || "Ready.", Boolean(runState.error));
});
