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
    await chrome.debugger.sendCommand(target, "Runtime.enable");
    await chrome.debugger.sendCommand(target, "Page.setInterceptFileChooserDialog", { enabled: true });
    const chooser = new Promise(resolve => {
      listener = (source, method, params) => {
        if (source.tabId !== tabId || method !== "Page.fileChooserOpened") return;
        chrome.debugger.onEvent.removeListener(listener);
        resolve(params);
      };
      chrome.debugger.onEvent.addListener(listener);
    });
    const located = await chrome.debugger.sendCommand(target, "Runtime.evaluate", {
      expression: `(() => {
        const norm = value => String(value || "").normalize("NFKC").replace(/\\s+/g, " ").trim().toLowerCase();
        const visible = element => Boolean(element && element.getClientRects().length && getComputedStyle(element).visibility !== "hidden");
        const button = [...document.querySelectorAll('button,[role="button"],label')]
          .filter(visible)
          .find(element => /^(add|upload) (video|photo|photos|media|photos\\/videos)$/.test(norm(element.innerText || element.getAttribute("aria-label"))));
        if (!button) return null;
        const rect = button.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, label: (button.innerText || button.getAttribute("aria-label") || "").trim() };
      })()`,
      returnByValue: true
    });
    const point = located?.result?.value;
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      throw new Error("Meta's visible upload button was not found.");
    }
    await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y });
    await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 });
    await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 });
    let opened;
    try {
      opened = await withTimeout(chooser, 12000, "");
    } catch (_) {
      const document = await chrome.debugger.sendCommand(target, "DOM.getDocument", { depth: -1, pierce: true });
      const inputs = await chrome.debugger.sendCommand(target, "DOM.querySelectorAll", {
        nodeId: document.root.nodeId,
        selector: 'input[type="file"]'
      });
      const nodeId = inputs?.nodeIds?.at(-1);
      if (!nodeId) throw new Error(`Meta ignored the trusted click on '${point.label}' and exposed no file input.`);
      opened = { nodeId };
    }
    await withTimeout(chrome.debugger.sendCommand(target, "DOM.setFileInputFiles", {
      files: [filePath],
      ...(opened.backendNodeId ? { backendNodeId: opened.backendNodeId } : { nodeId: opened.nodeId })
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
    ["input[placeholder='dd/mm/yyyy']", 0, `${day}/${month}/${year}`, "insert"],
    ["input[placeholder='dd/mm/yyyy']", 1, `${day}/${month}/${year}`, "insert"],
    ["input[role='spinbutton'][aria-label='hours']", 0, hours, "keys"],
    ["input[role='spinbutton'][aria-label='hours']", 1, hours, "keys"],
    ["input[role='spinbutton'][aria-label='minutes']", 0, minutes, "keys"],
    ["input[role='spinbutton'][aria-label='minutes']", 1, minutes, "keys"]
  ];
  try {
    await chrome.debugger.attach(target, "1.3");
    attached = true;
    for (const [selector, index, value, mode] of entries) {
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
      if (mode === "insert") {
        await chrome.debugger.sendCommand(target, "Input.insertText", { text: value });
      } else {
        for (const character of String(value)) {
          const virtualKey = character.charCodeAt(0);
          await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", {
            type: "keyDown", key: character, code: `Digit${character}`,
            text: character, unmodifiedText: character,
            windowsVirtualKeyCode: virtualKey, nativeVirtualKeyCode: virtualKey
          });
          await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", {
            type: "keyUp", key: character, code: `Digit${character}`,
            windowsVirtualKeyCode: virtualKey, nativeVirtualKeyCode: virtualKey
          });
        }
      }
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
  let prepared;
  let lastUploadError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    if (attempt > 1) {
      await chrome.tabs.update(tab.id, { url: targetUrl, active: false });
      await waitReady(tab.id);
      await ensureContent(tab.id);
      await new Promise(resolve => setTimeout(resolve, 1200));
    }
    try {
      const opened = await chrome.tabs.sendMessage(tab.id, { type: "OPEN_META_ITEM", item: message.item });
      if (!opened?.ok) throw new Error(opened?.error || "Meta composer was not ready.");
      await uploadNativeFile(tab.id, message.item.file.path);
      prepared = await chrome.tabs.sendMessage(tab.id, { type: "PREPARE_META_ITEM", item: message.item });
      if (!prepared?.ok || (!prepared.captionReady && !prepared.captionOptional)) {
        throw new Error(prepared?.error || "Meta composer was not ready for text.");
      }
      break;
    } catch (error) {
      lastUploadError = error;
      if (attempt === 3) throw new Error(`Meta upload failed after 3 attempts: ${error.message}`);
    }
  }
  if (!prepared) throw lastUploadError || new Error("Meta upload did not prepare the item.");
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
