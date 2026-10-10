const PLANNER_MATCH = "https://business.facebook.com/*";

function withTimeout(promise, timeout, message) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), timeout); })
  ]).finally(() => clearTimeout(timer));
}

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

async function uploadNativeFile(tabId, filePath) {
  if (!filePath) throw new Error("The selected file has no local path. Check the Parent folder path in the scheduler.");
  const target = { tabId };
  let attached = false;
  let listener;
  try {
    await chrome.debugger.attach(target, "1.3");
    attached = true;
    await chrome.debugger.sendCommand(target, "Page.enable");
    await chrome.debugger.sendCommand(target, "DOM.enable");
    await chrome.debugger.sendCommand(target, "Page.setInterceptFileChooserDialog", { enabled: true });
    const chooser = new Promise(resolve => {
      listener = (source, method, params) => {
        if (source.tabId !== tabId || method !== "Page.fileChooserOpened") return;
        chrome.debugger.onEvent.removeListener(listener);
        resolve(params);
      };
      chrome.debugger.onEvent.addListener(listener);
    });
    const clicked = await chrome.tabs.sendMessage(tabId, { type: "OPEN_META_UPLOAD" });
    if (!clicked?.ok) throw new Error(clicked?.error || "Meta's upload button was not found.");
    const opened = await withTimeout(chooser, 12000, "Meta's native upload chooser did not open within 12 seconds.");
    await withTimeout(chrome.debugger.sendCommand(target, "DOM.setFileInputFiles", {
      files: [filePath],
      backendNodeId: opened.backendNodeId
    }), 15000, `Meta could not read the selected local file within 15 seconds. Check this exact path: ${filePath}`);
    await withTimeout(chrome.debugger.sendCommand(target, "Page.setInterceptFileChooserDialog", { enabled: false }), 5000, "Meta upload cleanup timed out.");
  } finally {
    if (listener) try { chrome.debugger.onEvent.removeListener(listener); } catch (_) {}
    if (attached) try { await withTimeout(chrome.debugger.detach(target), 5000, ""); } catch (_) {}
  }
}

async function trustedScheduleInput(tabId, date, time) {
  const [year, month, day] = date.split("-");
  const [hours, minutes] = time.split(":");
  const target = { tabId };
  let attached = false;
  const entries = [
    ["input[placeholder='dd/mm/yyyy']", 0, `${day}/${month}/${year}`],
    ["input[placeholder='dd/mm/yyyy']", 1, `${day}/${month}/${year}`],
    ["input[role='spinbutton'][aria-label='hours']", 0, hours],
    ["input[role='spinbutton'][aria-label='hours']", 1, hours],
    ["input[role='spinbutton'][aria-label='minutes']", 0, minutes],
    ["input[role='spinbutton'][aria-label='minutes']", 1, minutes]
  ];
  try {
    await chrome.debugger.attach(target, "1.3");
    attached = true;
    for (const [selector, index, value] of entries) {
      const expression = `(() => { const e = [...document.querySelectorAll(${JSON.stringify(selector)})].filter(x => x.getClientRects().length)[${index}]; if (!e) return false; e.focus(); e.select(); return true; })()`;
      const focused = await chrome.debugger.sendCommand(target, "Runtime.evaluate", { expression, returnByValue: true });
      if (!focused?.result?.value) throw new Error("Meta's Facebook and Instagram schedule fields were not all available.");
      await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", {
        type: "keyDown", key: "a", code: "KeyA", modifiers: 2,
        windowsVirtualKeyCode: 65, nativeVirtualKeyCode: 65
      });
      await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", {
        type: "keyUp", key: "a", code: "KeyA", modifiers: 2,
        windowsVirtualKeyCode: 65, nativeVirtualKeyCode: 65
      });
      await chrome.debugger.sendCommand(target, "Input.insertText", { text: value });
      await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", {
        type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9
      });
      await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", {
        type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9
      });
    }
  } finally {
    if (attached) try { await chrome.debugger.detach(target); } catch (_) {}
  }
}

async function scheduleItem(message) {
  const targetUrl = message.item.type === "reel" ? reelComposerUrl(message.plannerUrl) : message.plannerUrl;
  const tab = await workflowTab(targetUrl);
  await waitReady(tab.id);
  await ensureContent(tab.id);
  const opened = await chrome.tabs.sendMessage(tab.id, { type: "OPEN_META_ITEM", item: message.item });
  if (!opened?.ok) throw new Error(opened?.error || "Meta composer was not ready.");
  await uploadNativeFile(tab.id, message.item.file.path);
  const prepared = await chrome.tabs.sendMessage(tab.id, { type: "PREPARE_META_ITEM", item: message.item });
  if (!prepared?.ok || (!prepared.captionReady && !prepared.captionOptional)) throw new Error(prepared?.error || "Meta composer was not ready for text.");
  if (prepared.captionReady) await trustedInsert(tab.id, message.item.caption);
  const scheduling = await chrome.tabs.sendMessage(tab.id, { type: "OPEN_META_SCHEDULE", item: message.item });
  if (!scheduling?.ok || !scheduling.scheduleReady) throw new Error(scheduling?.error || "Meta schedule controls were not ready.");
  await trustedScheduleInput(tab.id, message.item.date, message.item.time);
  const finished = await chrome.tabs.sendMessage(tab.id, { type: "SUBMIT_META_ITEM", item: message.item });
  if (!finished?.ok || !finished.scheduled) throw new Error(finished?.error || "Meta did not confirm the scheduled item.");
  return finished;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== "SCHEDULE_META_ITEM") return;
  scheduleItem(message).then(result => sendResponse({ ok: true, result })).catch(error => sendResponse({ ok: false, error: error.message }));
  return true;
});
