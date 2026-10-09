const $ = selector => document.querySelector(selector);
let campaign = { groups: [], caption: "", index: 0, facebookTabId: null, preparedGroup: null };

function parseGroups(text) {
  return [...new Set(text.split(/[,\n]+/).map(value => value.trim()).filter(Boolean))];
}

function paint() {
  const total = campaign.groups.length;
  $("#counter").textContent = `${Math.min(campaign.index, total)} of ${total} posted`;
  $("#groupName").textContent = campaign.groups[campaign.index] || (total ? "Campaign complete" : "No group selected");
  $("#publish").disabled = !campaign.preparedGroup;
}

function setStatus(message, error = false) {
  $("#status").textContent = message;
  $("#status").style.color = error ? "#ff9a9a" : "#aab3d4";
}

async function saveCampaign() {
  const nextGroups = parseGroups($("#groups").value);
  const nextCaption = $("#caption").value.trim();
  const draftChanged = JSON.stringify(nextGroups) !== JSON.stringify(campaign.groups)
    || nextCaption !== campaign.caption;
  campaign.groups = nextGroups;
  campaign.caption = nextCaption;
  if (draftChanged) campaign.preparedGroup = null;
  if (campaign.index >= campaign.groups.length) campaign.index = 0;
  await chrome.storage.local.set({ campaign });
  paint();
  setStatus(`Saved ${campaign.groups.length} groups. Nothing has been posted.`);
}

async function mediaPayload() {
  const file = $("#media").files[0];
  if (!file) return null;
  if (file.size > 25 * 1024 * 1024) throw new Error("Choose a media file smaller than 25 MB.");
  return { name: file.name, type: file.type, bytes: [...new Uint8Array(await file.arrayBuffer())] };
}

async function prepare() {
  await saveCampaign();
  const group = campaign.groups[campaign.index];
  if (!group) throw new Error("Add at least one exact Facebook group name.");
  if (!campaign.caption) throw new Error("Add the post text.");

  $("#prepare").disabled = true;
  $("#prepare").textContent = "Preparing…";
  const hasMedia = Boolean($("#media").files[0]);
  setStatus(`Preparing ${group}${hasMedia ? " with media" : " as text-only"}. Slow Facebook pages can take up to 60 seconds…`);
  try {
    const response = await chrome.runtime.sendMessage({
      type: "PREPARE_POST",
      group,
      caption: campaign.caption,
      media: await mediaPayload()
    });
    if (!response?.ok) throw new Error(response?.error || "Facebook preparation failed.");
    campaign.facebookTabId = response.tabId || campaign.facebookTabId;
    if (response.prepared) {
      campaign.preparedGroup = group;
      await chrome.storage.local.set({ campaign });
    }
    paint();
    setStatus(`${response.message}${hasMedia ? "" : " This draft is text-only because no media file was selected."}`);
  } finally {
    $("#prepare").disabled = false;
    $("#prepare").textContent = "Start / prepare next group";
  }
}

async function publishPrepared() {
  if (!campaign.preparedGroup || !campaign.facebookTabId) {
    throw new Error("Prepare and review a Facebook draft first.");
  }
  $("#publish").disabled = true;
  $("#publish").textContent = "Posting…";
  setStatus(`Publishing to ${campaign.preparedGroup}…`);
  try {
    const response = await chrome.runtime.sendMessage({
      type: "PUBLISH_POST",
      tabId: campaign.facebookTabId,
      group: campaign.preparedGroup
    });
    if (!response?.ok) throw new Error(response?.error || "Facebook did not confirm the post.");
    campaign.index += 1;
    campaign.preparedGroup = null;
    await chrome.storage.local.set({ campaign });
    paint();
    setStatus(response.message);
  } finally {
    $("#publish").textContent = "Post this prepared draft";
    $("#publish").disabled = !campaign.preparedGroup;
  }
}

$("#save").addEventListener("click", () => saveCampaign().catch(error => setStatus(error.message, true)));
$("#prepare").addEventListener("click", () => prepare().catch(error => setStatus(error.message, true)));
$("#publish").addEventListener("click", () => publishPrepared().catch(error => setStatus(error.message, true)));
$("#openTab").addEventListener("click", async () => {
  if (!campaign.facebookTabId) return setStatus("Prepare a group first so the Facebook tab can be found.", true);
  await chrome.tabs.update(campaign.facebookTabId, { active: true });
});
$("#reset").addEventListener("click", async () => {
  campaign.index = 0;
  campaign.preparedGroup = null;
  await chrome.storage.local.set({ campaign });
  paint();
  setStatus("Progress reset. Nothing was deleted from Facebook.");
});

$("#media").addEventListener("change", () => {
  const file = $("#media").files[0];
  $("#mediaHint").textContent = file
    ? `Selected: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`
    : "Optional. Without a file, the assistant prepares a text-only post.";
});

chrome.storage.local.get("campaign").then(result => {
  if (result.campaign) campaign = { ...campaign, ...result.campaign };
  $("#groups").value = campaign.groups.join(", ");
  $("#caption").value = campaign.caption;
  paint();
});
