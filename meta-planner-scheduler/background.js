const PLANNER_MATCH = "https://business.facebook.com/*";

chrome.action.onClicked.addListener(() => chrome.tabs.create({ url: chrome.runtime.getURL("app.html") }));

async function workflowTab(url) {
  const stored = await chrome.storage.local.get("metaPlannerTabId");
  if (stored.metaPlannerTabId) {
    try {
      const existing = await chrome.tabs.get(stored.metaPlannerTabId);
      if (/business\.facebook\.com/.test(existing.url || "")) {
        if (existing.url !== url) return chrome.tabs.update(existing.id, { url, active: false });
        return chrome.tabs.update(existing.id, { active: false });
      }
    } catch (_) {}
  }
  const tab = await chrome.tabs.create({ url, active: false });
  await chrome.storage.local.set({ metaPlannerTabId: tab.id });
  return tab;
}

function reelComposerUrl(plannerUrl) {
  const source = new URL(plannerUrl);
  const target = new URL("https://business.facebook.com/latest/reels_composer/");
  for (const key of ["asset_id", "business_id"]) {
    const value = source.searchParams.get(key);
    if (value) target.searchParams.set(key, value);
  }
  target.searchParams.set("ref", "biz_web_left_nav_create_reel");
  target.searchParams.set("context_ref", "CONTENT_CALENDAR");
  return target.href;
}

async function waitReady(tabId, timeout = 90000) {
  const current = await chrome.tabs.get(tabId);
  if (current.status === "complete") return;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { chrome.tabs.onUpdated.removeListener(listener); reject(new Error("Meta Planner is still loading.")); }, timeout);
    const listener = (id, info) => {
      if (id === tabId && info.status === "complete") {
        clearTimeout(timer); chrome.tabs.onUpdated.removeListener(listener); resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function ensureContent(tabId) {
  const started = Date.now();
  while (Date.now() - started < 30000) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, { type: "PING" });
      if (response?.ok) return;
    } catch (_) {}
    try { await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] }); }
    catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error("The Meta composer loaded, but the scheduler could not connect to it.");
}

async function trustedInsert(tabId, text) {
  const target = { tabId };
  let attached = false;
  try {
    await chrome.debugger.attach(target, "1.3");
    attached = true;
    await chrome.debugger.sendCommand(target, "Input.insertText", { text });
  } finally {
    if (attached) try { await chrome.debugger.detach(target); } catch (_) {}
  }
}

async function scheduleItem(message) {
  const targetUrl = message.item.type === "reel" ? reelComposerUrl(message.plannerUrl) : message.plannerUrl;
  const tab = await workflowTab(targetUrl);
  await waitReady(tab.id);
  await ensureContent(tab.id);
  const prepared = await chrome.tabs.sendMessage(tab.id, { type: "PREPARE_META_ITEM", item: message.item });
  if (!prepared?.ok || (!prepared.captionReady && !prepared.captionOptional)) throw new Error(prepared?.error || "Meta composer was not ready for text.");
  if (prepared.captionReady) await trustedInsert(tab.id, message.item.caption);
  const finished = await chrome.tabs.sendMessage(tab.id, { type: "FINALIZE_META_ITEM", item: message.item });
  if (!finished?.ok || !finished.scheduled) throw new Error(finished?.error || "Meta did not confirm the scheduled item.");
  return finished;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== "SCHEDULE_META_ITEM") return;
  scheduleItem(message).then(result => sendResponse({ ok: true, result })).catch(error => sendResponse({ ok: false, error: error.message }));
  return true;
});
