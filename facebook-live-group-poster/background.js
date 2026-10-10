const JOINED_GROUPS_URL = "https://www.facebook.com/groups/joins/?nav_source=tab&ordering=viewer_added";
const ALARM = "3sverse-live-poster-next";
let busy = false;

async function facebookTab() {
  const tabs = await chrome.tabs.query({ url: ["https://www.facebook.com/*", "https://m.facebook.com/*"] });
  return tabs.find(tab => /facebook\.com\/groups\//i.test(tab.url || "")) || tabs[0]
    || chrome.tabs.create({ url: "https://www.facebook.com/", active: false });
}

async function waitReady(tabId, timeout = 60000) {
  const tab = await chrome.tabs.get(tabId);
  if (tab.status === "complete") return tab;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { chrome.tabs.onUpdated.removeListener(listener); reject(new Error("Facebook is still loading.")); }, timeout);
    const listener = (id, info, updated) => {
      if (id === tabId && info.status === "complete") { clearTimeout(timer); chrome.tabs.onUpdated.removeListener(listener); resolve(updated); }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function waitNavigation(tabId, previous, timeout = 60000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const tab = await chrome.tabs.get(tabId);
    if (tab.url !== previous && tab.status === "complete") return tab;
    await new Promise(resolve => setTimeout(resolve, 400));
  }
  throw new Error("Facebook navigation timed out.");
}

async function ensureContent(tabId) {
  try { const reply = await chrome.tabs.sendMessage(tabId, { type: "PING" }); if (reply?.ok) return; } catch (_) {}
  await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
}

async function importGroups(tab) {
  if (!tab.url?.startsWith("https://www.facebook.com/groups/joins/")) {
    const previous = tab.url;
    await chrome.tabs.update(tab.id, { url: JOINED_GROUPS_URL, active: false });
    await waitNavigation(tab.id, previous);
  }
  await waitReady(tab.id); await ensureContent(tab.id);
  const response = await chrome.tabs.sendMessage(tab.id, { type: "SCAN_GROUPS" });
  if (!response?.ok) throw new Error(response?.error || "Your groups could not be read.");
  const unique = new Map(response.groups.map(group => [new URL(group.url).pathname, group]));
  return [...unique.values()];
}

async function prepare(tabId, target) {
  for (let step = 0; step < 5; step += 1) {
    await waitReady(tabId); await ensureContent(tabId);
    const before = await chrome.tabs.get(tabId);
    const response = await chrome.tabs.sendMessage(tabId, { type: "PREPARE_LIVE_POST", target });
    if (!response?.navigating) return response;
    await waitNavigation(tabId, before.url);
  }
  throw new Error(`Facebook could not open ${target.name}.`);
}

async function trustedText(tabId, text) {
  const target = { tabId }; let attached = false;
  try {
    await chrome.debugger.attach(target, "1.3"); attached = true;
    await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", { type:"keyDown",key:"a",code:"KeyA",modifiers:2,windowsVirtualKeyCode:65,nativeVirtualKeyCode:65 });
    await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", { type:"keyUp",key:"a",code:"KeyA",modifiers:2,windowsVirtualKeyCode:65,nativeVirtualKeyCode:65 });
    await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", { type:"keyDown",key:"Backspace",code:"Backspace",windowsVirtualKeyCode:8,nativeVirtualKeyCode:8 });
    await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", { type:"keyUp",key:"Backspace",code:"Backspace",windowsVirtualKeyCode:8,nativeVirtualKeyCode:8 });
    await chrome.debugger.sendCommand(target, "Input.insertText", { text });
  } finally { if (attached) try { await chrome.debugger.detach(target); } catch (_) {} }
}

async function save(state) { await chrome.storage.local.set({ livePosterCampaign: state }); return state; }

async function resume() {
  if (busy) return; busy = true;
  try {
    const state = (await chrome.storage.local.get("livePosterCampaign")).livePosterCampaign;
    if (!state?.active) return;
    if (state.index >= state.targets.length) { state.active = false; state.status = `Campaign complete: ${state.posted} of ${state.total} posted.`; await save(state); return; }
    const target = state.targets[state.index];
    state.status = `Preparing ${state.index + 1} of ${state.total}: ${target.name}`; state.error = null; await save(state);
    const opened = await prepare(state.tabId, target);
    if (!opened?.ok || !opened.editorReady) throw new Error(opened?.error || "Facebook composer did not open.");
    await trustedText(state.tabId, state.caption);
    const verified = await chrome.tabs.sendMessage(state.tabId, { type: "VERIFY_LIVE_POST", caption: state.caption });
    if (!verified?.ok) throw new Error(verified?.error || "Facebook did not retain the full live-link post.");
    state.status = `Posting ${state.index + 1} of ${state.total}: ${target.name}`; await save(state);
    const posted = await chrome.tabs.sendMessage(state.tabId, { type: "PUBLISH_LIVE_POST" });
    if (!posted?.ok) throw new Error(posted?.error || "Facebook did not confirm the post.");
    state.index += 1; state.posted += 1;
    if (state.index >= state.targets.length) { state.active = false; state.status = `Campaign complete: ${state.posted} of ${state.total} posted.`; await save(state); return; }
    state.status = `Posted ${state.posted} of ${state.total}. Next selected group starts in 30 seconds.`; await save(state);
    await chrome.alarms.create(ALARM, { delayInMinutes: 0.5 });
  } catch (error) {
    const state = (await chrome.storage.local.get("livePosterCampaign")).livePosterCampaign || {};
    state.active = false; state.error = error.message; state.status = `Stopped after ${state.posted || 0} posts: ${error.message}`; await save(state);
  } finally { busy = false; }
}

chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === ALARM) resume(); });
chrome.runtime.onStartup.addListener(resume);
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "IMPORT_JOINED_GROUPS") {
    (async () => { const tab = await facebookTab(); const groups = await importGroups(tab); sendResponse({ ok:true, groups, tabId:tab.id }); })().catch(error => sendResponse({ ok:false,error:error.message }));
    return true;
  }
  if (message.type === "START_LIVE_CAMPAIGN") {
    (async () => {
      await chrome.alarms.clear(ALARM);
      const tab = await facebookTab();
      const state = { active:true,tabId:tab.id,targets:message.targets,caption:message.caption,index:0,posted:0,total:message.targets.length,status:`Starting 1 of ${message.targets.length}.`,error:null };
      await save(state); await resume();
      const current = (await chrome.storage.local.get("livePosterCampaign")).livePosterCampaign;
      sendResponse({ ok:!current.error,state:current,error:current.error });
    })().catch(error => sendResponse({ ok:false,error:error.message }));
    return true;
  }
  if (message.type === "STOP_LIVE_CAMPAIGN") {
    (async () => { await chrome.alarms.clear(ALARM); const state=(await chrome.storage.local.get("livePosterCampaign")).livePosterCampaign||{}; state.active=false; state.status=`Campaign stopped. ${state.posted||0} of ${state.total||0} posted.`; await save(state); sendResponse({ok:true,state}); })().catch(error=>sendResponse({ok:false,error:error.message}));
    return true;
  }
});
