const FACEBOOK_HOME = "https://www.facebook.com/";
const CAMPAIGN_ALARM = "3sverse-campaign-next";
const POST_INTERVAL_MINUTES = 0.5;
let campaignBusy = false;

async function getFacebookTab() {
  const tabs = await chrome.tabs.query({ url: ["https://www.facebook.com/*", "https://m.facebook.com/*"] });
  if (tabs.length) return tabs[0];
  return chrome.tabs.create({ url: FACEBOOK_HOME, active: false });
}

async function ensureContentScript(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "PING" });
  } catch (_) {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
  }
}

async function waitForTabReady(tabId, timeout = 60000) {
  const current = await chrome.tabs.get(tabId);
  if (current.status === "complete") return current;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("Facebook is still loading. Check your connection and try again."));
    }, timeout);
    const listener = (updatedId, changeInfo, tab) => {
      if (updatedId === tabId && changeInfo.status === "complete") {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve(tab);
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function waitForNavigation(tabId, previousUrl, timeout = 60000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    let changedAt = 0;
    const poll = setInterval(async () => {
      try {
        const tab = await chrome.tabs.get(tabId);
        if (tab.url && tab.url !== previousUrl) {
          if (!changedAt) changedAt = Date.now();
          if (tab.status === "complete" || Date.now() - changedAt > 2000) {
            clearInterval(poll);
            resolve(tab);
            return;
          }
        }
        if (Date.now() - started > timeout) {
          clearInterval(poll);
          reject(new Error("Facebook navigation timed out. Check the Facebook tab and retry."));
        }
      } catch (error) {
        clearInterval(poll);
        reject(error);
      }
    }, 400);
  });
}

async function prepareThroughNavigation(tab, message) {
  await waitForTabReady(tab.id);
  for (let step = 0; step < 6; step += 1) {
    await ensureContentScript(tab.id);
    const before = await chrome.tabs.get(tab.id);
    const response = await chrome.tabs.sendMessage(tab.id, message);
    if (!response?.navigating) return response;
    await waitForNavigation(tab.id, before.url);
  }
  throw new Error("Facebook could not reach the selected group. Check its exact name or use its URL.");
}

async function saveState(state) {
  await chrome.storage.local.set({ autoCampaign: state });
  return state;
}

async function resumeCampaign() {
  if (campaignBusy) return;
  campaignBusy = true;
  try {
    const stored = await chrome.storage.local.get(["autoCampaign", "autoCampaignMedia"]);
    const state = stored.autoCampaign;
    const media = stored.autoCampaignMedia || null;
    if (!state?.active) return;
    if (state.index >= state.groups.length) {
      state.active = false;
      state.status = `Campaign complete: ${state.posted} of ${state.total} posted.`;
      await saveState(state);
      await chrome.storage.local.remove("autoCampaignMedia");
      return;
    }

    const group = state.groups[state.index];
    state.status = `Preparing ${state.index + 1} of ${state.total}: ${group}`;
    state.error = null;
    await saveState(state);
    const tab = await chrome.tabs.get(state.tabId);
    const prepared = await prepareThroughNavigation(tab, {
      type: "PREPARE_POST",
      group,
      caption: state.caption,
      media
    });
    if (!prepared?.ok || !prepared.prepared) throw new Error(prepared?.error || "Facebook draft preparation failed.");

    const beforePublish = (await chrome.storage.local.get("autoCampaign")).autoCampaign;
    if (!beforePublish?.active) return;

    state.status = `Posting ${state.index + 1} of ${state.total}: ${group}`;
    await saveState(state);
    await ensureContentScript(state.tabId);
    const posted = await chrome.tabs.sendMessage(state.tabId, { type: "PUBLISH_POST", group });
    if (!posted?.ok || !posted.posted) throw new Error(posted?.error || "Facebook did not confirm the post.");

    const afterPublish = (await chrome.storage.local.get("autoCampaign")).autoCampaign;
    state.index += 1;
    state.posted += 1;
    if (!afterPublish?.active) {
      state.active = false;
      state.status = `Campaign stopped. ${state.posted} of ${state.total} posted.`;
      await saveState(state);
      await chrome.storage.local.remove("autoCampaignMedia");
      return;
    }
    if (state.index >= state.groups.length) {
      state.active = false;
      state.status = `Campaign complete: ${state.posted} of ${state.total} posted.`;
      await saveState(state);
      await chrome.storage.local.remove("autoCampaignMedia");
      return;
    }
    state.status = `Posted ${state.posted} of ${state.total}. Next group starts in 30 seconds.`;
    await saveState(state);
    await chrome.alarms.create(CAMPAIGN_ALARM, { delayInMinutes: POST_INTERVAL_MINUTES });
  } catch (error) {
    const stored = await chrome.storage.local.get("autoCampaign");
    const state = stored.autoCampaign || {};
    state.active = false;
    state.error = error.message;
    state.status = `Stopped after ${state.posted || 0} posts: ${error.message}`;
    await saveState(state);
    await chrome.storage.local.remove("autoCampaignMedia");
  } finally {
    campaignBusy = false;
  }
}

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === CAMPAIGN_ALARM) resumeCampaign();
});

chrome.runtime.onStartup.addListener(() => resumeCampaign());

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "START_CAMPAIGN") {
    (async () => {
      await chrome.alarms.clear(CAMPAIGN_ALARM);
      const tab = await getFacebookTab();
      const state = {
        active: true,
        tabId: tab.id,
        groups: message.groups,
        caption: message.caption,
        index: 0,
        posted: 0,
        total: message.groups.length,
        status: `Campaign started. Preparing 1 of ${message.groups.length}.`,
        error: null
      };
      await chrome.storage.local.set({ autoCampaign: state });
      await resumeCampaign();
      const current = (await chrome.storage.local.get("autoCampaign")).autoCampaign;
      sendResponse({ ok: !current?.error, state: current, error: current?.error });
    })().catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "STOP_CAMPAIGN") {
    (async () => {
      await chrome.alarms.clear(CAMPAIGN_ALARM);
      const stored = await chrome.storage.local.get("autoCampaign");
      const state = stored.autoCampaign || {};
      state.active = false;
      state.status = `Campaign stopped. ${state.posted || 0} of ${state.total || 0} posted.`;
      await saveState(state);
      await chrome.storage.local.remove("autoCampaignMedia");
      sendResponse({ ok: true, state });
    })().catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }
});
