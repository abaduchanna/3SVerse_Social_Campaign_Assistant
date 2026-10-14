const FACEBOOK_HOME = "https://www.facebook.com/";
const JOINED_GROUPS_URL = "https://www.facebook.com/groups/joins/?nav_source=tab&ordering=viewer_added";
const CAMPAIGN_ALARM = "3sverse-campaign-next";
const POST_INTERVAL_MINUTES = 0.5;
let campaignBusy = false;

async function getFacebookTab() {
  const tabs = await chrome.tabs.query({ url: ["https://www.facebook.com/*", "https://m.facebook.com/*"] });
  if (tabs.length) {
    return tabs.find(tab => /facebook\.com\/groups\/(joins|feed)/i.test(tab.url || "")) || tabs[0];
  }
  return chrome.tabs.create({ url: FACEBOOK_HOME, active: false });
}

function groupIdentity(value) {
  try {
    const match = new URL(value).pathname.match(/^\/groups\/([^/]+)/i);
    return match ? match[1].toLowerCase() : null;
  } catch (_) {
    return null;
  }
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

async function loadJoinedGroups(tabId) {
  // ALWAYS (re)load Your groups: every import must start from a fresh,
  // unscrolled virtual list. A repeat import after a partial scan would
  // otherwise continue on an already-exhausted list and harvest nothing.
  await chrome.tabs.update(tabId, { url: JOINED_GROUPS_URL, active: false });
  await new Promise(resolve => setTimeout(resolve, 800)); // let the reload begin
  await waitForTabReady(tabId);
  await ensureContentScript(tabId);
  const response = await chrome.tabs.sendMessage(tabId, { type: "SCAN_JOINED_GROUPS" });
  if (!response?.ok) throw new Error(response?.error || "Facebook Your groups could not be read.");
  return response;
}

function allJoinedGroups(joined) {
  const unique = new Map();
  for (const group of joined) {
    const identity = groupIdentity(group.url);
    if (identity && group.name?.trim()) unique.set(identity, group);
  }
  return [...unique.values()];
}

async function saveState(state) {
  await chrome.storage.local.set({ autoCampaign: state });
  return state;
}

// The joined-groups checklist is persisted HERE in the background, never
// only through the popup: the popup dies the moment focus leaves it (the
// import itself opens/scrolls Facebook), so a scan that returned 622 groups
// used to be lost before the checklist could render. The background merge
// keeps the owner's checked/unchecked stores and pre-selects newly found
// ones, so the list and its selection survive any popup close/reopen.
async function persistImportedGroups(groups) {
  const stored = await chrome.storage.local.get("importedGroupsStore");
  const existing = stored.importedGroupsStore || { groups: [], selectedIds: [] };
  const merged = new Map((existing.groups || []).map(group => [groupIdentity(group.url), group]));
  const selected = new Set(existing.selectedIds || []);
  for (const group of groups) {
    const id = groupIdentity(group.url);
    if (!id) continue;
    if (!merged.has(id)) {
      merged.set(id, group);
      selected.add(id); // newly found stores pre-selected
    }
  }
  const persisted = {
    groups: [...merged.values()],
    selectedIds: [...selected].filter(id => merged.has(id))
  };
  await chrome.storage.local.set({ importedGroupsStore: persisted });
  return persisted;
}

async function insertCaptionWithDebugger(tabId, caption) {
  const target = { tabId };
  let attached = false;
  try {
    await chrome.debugger.attach(target, "1.3");
    attached = true;
    try { await chrome.debugger.sendCommand(target, "Emulation.setFocusEmulationEnabled", { enabled: true }); } catch (_) {}
    await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", {
      type: "keyDown", key: "a", code: "KeyA", modifiers: 2,
      windowsVirtualKeyCode: 65, nativeVirtualKeyCode: 65
    });
    await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", {
      type: "keyUp", key: "a", code: "KeyA", modifiers: 2,
      windowsVirtualKeyCode: 65, nativeVirtualKeyCode: 65
    });
    await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", {
      type: "keyDown", key: "Backspace", code: "Backspace",
      windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8
    });
    await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", {
      type: "keyUp", key: "Backspace", code: "Backspace",
      windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8
    });
    await chrome.debugger.sendCommand(target, "Input.insertText", { text: caption });
  } catch (error) {
    throw new Error(`Trusted Facebook caption input failed: ${error.message}`);
  } finally {
    if (attached) {
      try { await chrome.debugger.detach(target); } catch (_) {}
    }
  }
}

async function resumeCampaign() {
  if (campaignBusy) return;
  campaignBusy = true;
  try {
    const stored = await chrome.storage.local.get(["autoCampaign", "autoCampaignMedia"]);
    const state = stored.autoCampaign;
    const media = stored.autoCampaignMedia || null;
    if (!state?.active) return;
    if (!state.targets?.length) throw new Error("Exact joined-group targets are missing. Start the campaign again.");
    if (state.index >= state.targets.length) {
      state.active = false;
      state.status = `Campaign complete: ${state.posted} of ${state.total} posted.`;
      await saveState(state);
      return;
    }

    const target = state.targets[state.index];
    const group = target.url;
    state.status = `Preparing ${state.index + 1} of ${state.total}: ${target.name}`;
    state.error = null;
    await saveState(state);
    const tab = await chrome.tabs.get(state.tabId);
    const prepared = await prepareThroughNavigation(tab, {
      type: "PREPARE_POST",
      group
    });
    if (!prepared?.ok || !prepared.editorReady) throw new Error(prepared?.error || "Facebook editor did not become ready.");
    await insertCaptionWithDebugger(state.tabId, state.caption);
    const verified = await chrome.tabs.sendMessage(state.tabId, {
      type: "VERIFY_COMPOSER",
      caption: state.caption,
      media
    });
    if (!verified?.ok || !verified.prepared) throw new Error(verified?.error || "Facebook draft verification failed.");

    const beforePublish = (await chrome.storage.local.get("autoCampaign")).autoCampaign;
    if (!beforePublish?.active) return;

    state.status = `Posting ${state.index + 1} of ${state.total}: ${target.name}`;
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
      return;
    }
    if (state.index >= state.targets.length) {
      state.active = false;
      state.status = `Campaign complete: ${state.posted} of ${state.total} posted.`;
      await saveState(state);
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
  } finally {
    campaignBusy = false;
  }
}

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === CAMPAIGN_ALARM) resumeCampaign();
});

chrome.runtime.onStartup.addListener(() => resumeCampaign());

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "IMPORT_GROUPS") {
    (async () => {
      const tab = await getFacebookTab();
      await saveState({
        active: false, tabId: tab.id, index: 0, posted: 0,
        total: 0, status: "Reading and scrolling the complete Facebook Your groups list…", error: null
      });
      const joined = await loadJoinedGroups(tab.id);
      const groups = allJoinedGroups(joined.groups || []);
      if (!groups.length) {
        throw new Error("No joined Facebook groups were found. Open Facebook, confirm you are signed in, and retry.");
      }
      // Persist BEFORE reporting: even if the popup closed mid-import, the
      // checklist is already saved and will render on the next open.
      const persisted = await persistImportedGroups(groups);
      await saveState({
        active: false, tabId: tab.id, index: 0, posted: 0, total: 0,
        status: joined.partial
          ? `Loaded ${persisted.groups.length} of ${joined.expected || "?"} joined groups (partial). Import again to load more; the selection list is ready.`
          : `Imported ${persisted.groups.length} joined groups. The checklist is saved — reopen this popup any time.`,
        error: null
      });
      sendResponse({ ok: true, groups: persisted.groups, count: persisted.groups.length, expected: joined.expected || 0, partial: Boolean(joined.partial) });
    })().catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "START_CAMPAIGN") {
    (async () => {
      await chrome.alarms.clear(CAMPAIGN_ALARM);
      const tab = await getFacebookTab();
      const resolvingState = {
        active: false, tabId: tab.id, index: 0, posted: 0,
        total: 0, status: "Reading and scrolling the complete Facebook Your groups list…", error: null
      };
      await saveState(resolvingState);
      const joined = await loadJoinedGroups(tab.id);
      const scanned = allJoinedGroups(joined.groups || []);
      if (scanned.length) await persistImportedGroups(scanned); // keep the checklist current
      const wanted = Array.isArray(message.selected)
        ? new Set(message.selected.map(value => String(value).toLowerCase()))
        : null;
      const targets = scanned.filter(group =>
        !wanted || wanted.has(groupIdentity(group.url)));
      if (!targets.length) {
        throw new Error(wanted
          ? "None of the selected groups matched the imported list. Import again and select at least one group."
          : "No joined Facebook groups were found. Open Facebook, confirm you are signed in, and retry.");
      }
      const state = {
        active: true,
        tabId: tab.id,
        targets,
        caption: message.caption,
        index: 0,
        posted: 0,
        total: targets.length,
        status: `Imported ${targets.length} selected groups from Facebook Your groups. Preparing 1 of ${targets.length}.`,
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
      sendResponse({ ok: true, state });
    })().catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }
});
