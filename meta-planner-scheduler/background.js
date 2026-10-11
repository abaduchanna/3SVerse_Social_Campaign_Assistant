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

async function trustedClick(tabId, request) {
  const target = { tabId };
  let attached = false;
  try {
    await chrome.debugger.attach(target, "1.3");
    attached = true;
    await chrome.debugger.sendCommand(target, "Runtime.enable");
    const expression = `(() => {
      const request = ${JSON.stringify(request)};
      const norm = value => String(value || "").normalize("NFKC").replace(/\\s+/g, " ").trim().toLowerCase();
      const visible = element => Boolean(element && element.getClientRects().length && getComputedStyle(element).visibility !== "hidden");
      const enabled = element => !element.matches(":disabled,[aria-disabled='true']");
      const textFor = element => {
        const direct = element.innerText || element.getAttribute("aria-label") || "";
        if (direct) return direct;
        if (element.id) {
          const label = document.querySelector('label[for="' + CSS.escape(element.id) + '"]');
          if (label) return label.innerText || label.getAttribute("aria-label") || "";
        }
        return element.closest("label")?.innerText || "";
      };
      const labels = request.labels.map(norm);
      let matches = [...document.querySelectorAll('button,[role="button"],[role="menuitem"],[role="checkbox"],[role="radio"],input[type="checkbox"],input[type="radio"],label')]
        .filter(visible)
        .filter(enabled)
        .filter(element => labels.includes(norm(textFor(element))));
      if (request.requireChecked === true) matches = matches.filter(element => element.checked || element.getAttribute("aria-checked") === "true");
      if (request.requireChecked === false) matches = matches.filter(element => !(element.checked || element.getAttribute("aria-checked") === "true"));
      const element = request.preferLast ? matches.at(-1) : matches[0];
      if (!element) return null;
      element.scrollIntoView({ block: "center", inline: "center" });
      element.focus({ preventScroll: true });
      const rect = element.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const hit = document.elementFromPoint(x, y);
      if (!hit || !(hit === element || element.contains(hit))) return null;
      return { x, y, label: textFor(element).trim() };
    })()`;
    const located = await chrome.debugger.sendCommand(target, "Runtime.evaluate", { expression, returnByValue: true });
    const point = located?.result?.value;
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      throw new Error(`Meta control was not found: ${request.labels.join(" / ")}`);
    }
    await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y });
    await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 });
    await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 });
    return point.label;
  } finally {
    if (attached) try { await chrome.debugger.detach(target); } catch (_) {}
  }
}

async function trustedKeyActivate(tabId, label) {
  const target = { tabId };
  let attached = false;
  try {
    await chrome.debugger.attach(target, "1.3");
    attached = true;
    await chrome.debugger.sendCommand(target, "Runtime.enable");
    const focused = await chrome.debugger.sendCommand(target, "Runtime.evaluate", {
      expression: `(() => {
        const wanted = ${JSON.stringify(label)}.toLowerCase();
        const norm = value => String(value || "").normalize("NFKC").replace(/\\s+/g, " ").trim().toLowerCase();
        const visible = element => Boolean(element && element.getClientRects().length && getComputedStyle(element).visibility !== "hidden");
        const button = [...document.querySelectorAll('button,[role="button"]')]
          .filter(visible)
          .filter(element => !element.matches(':disabled,[aria-disabled="true"]'))
          .filter(element => norm(element.innerText || element.getAttribute("aria-label")) === wanted)
          .at(-1);
        if (!button) return false;
        button.scrollIntoView({ block: "center", inline: "center" });
        button.focus({ preventScroll: true });
        return document.activeElement === button || button.contains(document.activeElement);
      })()`,
      returnByValue: true
    });
    if (!focused?.result?.value) throw new Error(`Meta's ${label} button could not receive keyboard focus.`);
    await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", {
      type: "rawKeyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13
    });
    await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", {
      type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13
    });
  } finally {
    if (attached) try { await chrome.debugger.detach(target); } catch (_) {}
  }
}

async function readFlowState(tabId) {
  const response = await chrome.tabs.sendMessage(tabId, { type: "GET_META_FLOW_STATE" });
  if (!response?.ok) throw new Error(response?.error || "Meta flow state could not be read.");
  return response.state;
}

async function readLaunchState(tabId, item) {
  const response = await chrome.tabs.sendMessage(tabId, { type: "GET_META_LAUNCH_STATE", item });
  if (!response?.ok) throw new Error(response?.error || "Meta launch state could not be read.");
  return response.state;
}

async function waitForLaunchState(tabId, item, predicate, timeout, errorPrefix) {
  const started = Date.now();
  let state;
  while (Date.now() - started < timeout) {
    state = await readLaunchState(tabId, item);
    if (predicate(state)) return state;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`${errorPrefix}; ${state?.summary || "Meta launch state unavailable"}`);
}

async function withActiveWorkflowTab(tabId, action) {
  const workflow = await chrome.tabs.get(tabId);
  const [previous] = await chrome.tabs.query({ active: true, windowId: workflow.windowId });
  const shouldRestore = previous?.id && previous.id !== tabId;
  try {
    if (shouldRestore) {
      await chrome.tabs.update(tabId, { active: true });
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    return await action();
  } finally {
    if (shouldRestore) {
      try { await chrome.tabs.update(previous.id, { active: true }); } catch (_) {}
    }
  }
}

async function openMetaItemFromPlanner(tabId, item) {
  await waitForLaunchState(tabId, item, state => state.plannerReady, 30000, "Meta Planner did not become ready");
  await withActiveWorkflowTab(tabId, async () => {
    if (item.type === "post") {
      await trustedClick(tabId, { labels: ["Create post"], preferLast: false });
    } else {
      const menuLabel = item.type === "reel" ? "Create reel" : "Create Story";
      await trustedClick(tabId, { labels: ["Create"], preferLast: false });
      await waitForLaunchState(
        tabId,
        item,
        state => item.type === "reel" ? state.reelMenuReady : state.storyMenuReady,
        15000,
        "Meta's Create dropdown did not open"
      );
      await trustedClick(tabId, { labels: [menuLabel], preferLast: false });
    }
    const opened = await chrome.tabs.sendMessage(tabId, { type: "WAIT_META_COMPOSER", item });
    if (!opened?.ok || !opened.composerReady) {
      throw new Error(opened?.error || `Meta did not open the ${item.type} composer.`);
    }
  });
}

async function waitForFlowState(tabId, predicate, timeout, errorPrefix) {
  const started = Date.now();
  let state;
  while (Date.now() - started < timeout) {
    state = await readFlowState(tabId);
    if (predicate(state)) return state;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`${errorPrefix}; ${state?.summary || "Meta state unavailable"}`);
}

async function foregroundTrustedNext(tabId, previousStage) {
  const workflow = await chrome.tabs.get(tabId);
  const [previous] = await chrome.tabs.query({ active: true, windowId: workflow.windowId });
  const shouldRestore = previous?.id && previous.id !== tabId;
  try {
    if (shouldRestore) {
      await chrome.tabs.update(tabId, { active: true });
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    await trustedClick(tabId, { labels: ["Next"], preferLast: true });
    try {
      // Keep Meta active until its React editor commits the stage change.
      // Restoring the scheduler tab after a fixed 350 ms interrupted this step.
      return await waitForFlowState(
        tabId,
        current => current.shareStep || current.stageKey !== previousStage,
        15000,
        "Meta did not accept the Edit-stage mouse click"
      );
    } catch (_) {
      // A focused trusted Enter is Meta's reliable accessibility activation
      // when its media editor ignores pointer input.
      await trustedKeyActivate(tabId, "Next");
      return await waitForFlowState(
        tabId,
        current => current.shareStep || current.stageKey !== previousStage,
        45000,
        "Meta ignored both the Edit-stage mouse click and focused Enter"
      );
    }
  } finally {
    if (shouldRestore) {
      try { await chrome.tabs.update(previous.id, { active: true }); } catch (_) {}
    }
  }
}

async function reachTrustedScheduleStep(tabId, item) {
  await waitForFlowState(
    tabId,
    state => state.online !== false,
    60000,
    "Meta is offline; waiting for the Internet connection to return"
  );
  if (item.type !== "story") {
    await waitForFlowState(
      tabId,
      state => state.captionRetained,
      15000,
      "Meta did not retain the complete caption and hashtags"
    );
  }

  if (item.type === "reel") {
    let state = await readFlowState(tabId);
    let transitions = 0;
    while (!state.shareStep && transitions < 3) {
      const isEditStage = /create completed status/.test(state.stageKey || "")
        && /edit pending status/.test(state.stageKey || "");
      if (isEditStage) {
        state = await foregroundTrustedNext(tabId, state.stageKey);
      } else {
        const advanced = await chrome.tabs.sendMessage(tabId, { type: "ACTIVATE_META_NEXT" });
        if (advanced?.ok) {
          state = advanced.state;
        } else {
        // The Edit step rejects synthetic DOM activation while its media tools
        // are mounted. Briefly activate the Meta tab for a genuine browser
        // click, restore the user's tab, then verify the stage actually moved.
          state = await foregroundTrustedNext(tabId, state.stageKey);
        }
      }
      transitions += 1;
    }
    if (!state.shareStep) {
      throw new Error(`Meta did not reach the Share/Scheduling step after ${transitions} verified stage transitions; ${state.summary}`);
    }
  } else {
    await waitForFlowState(
      tabId,
      state => state.shareStep,
      30000,
      `Meta did not expose the ${item.type} scheduling controls`
    );
  }

  let state = await readFlowState(tabId);
  if (state.storyAvailable && !state.storyOn) {
    await trustedClick(tabId, { labels: ["Share to Facebook story"], requireChecked: false });
    await waitForFlowState(tabId, current => current.storyOn, 10000, "Meta did not enable Facebook Story sharing");
  }
  state = await readFlowState(tabId);
  if (!state.scheduleSelected) {
    const activated = await chrome.tabs.sendMessage(tabId, { type: "ACTIVATE_META_SCHEDULE" });
    if (!activated?.ok || !activated.scheduleReady) {
      throw new Error(activated?.error || "Meta's Schedule option did not activate.");
    }
  }
  const ready = await chrome.tabs.sendMessage(tabId, { type: "WAIT_META_SCHEDULE_FIELDS" });
  if (!ready?.ok || !ready.scheduleReady) throw new Error(ready?.error || "Meta schedule controls were not ready.");
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

async function uploadCampaignFile(tabId, item) {
  let byteUploadError;
  if (Array.isArray(item.file?.bytes) && item.file.bytes.length) {
    try {
      const injected = await chrome.scripting.executeScript({
        target: { tabId },
        world: "MAIN",
        args: [{ name: item.file.name, type: item.file.type, bytes: item.file.bytes }, item.type],
        func: async (media, type) => {
          const norm = value => String(value || "").normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
          const visible = element => Boolean(element && element.getClientRects().length && getComputedStyle(element).visibility !== "hidden");
          const upload = [...document.querySelectorAll('button,[role="button"],label')]
            .filter(visible)
            .find(element => /^(add|upload) (video|photo|photos|media|photos\/videos)$/.test(norm(element.innerText || element.getAttribute("aria-label"))));
          if (!upload) return { ok: false, error: "Meta's visible upload button was not found." };

          const file = new File([new Uint8Array(media.bytes)], media.name, { type: media.type || "application/octet-stream" });
          const transfer = new DataTransfer();
          transfer.items.add(file);
          const originalClick = HTMLInputElement.prototype.click;
          let captured = false;
          HTMLInputElement.prototype.click = function (...args) {
            const accept = this.accept || "";
            const compatible = this.type === "file" && (type !== "reel" || !accept || /video/i.test(accept));
            if (!compatible) return originalClick.apply(this, args);
            this.files = transfer.files;
            this.dispatchEvent(new Event("input", { bubbles: true }));
            this.dispatchEvent(new Event("change", { bubbles: true }));
            captured = true;
          };
          try {
            upload.click();
            await new Promise(resolve => setTimeout(resolve, 0));
          } finally {
            HTMLInputElement.prototype.click = originalClick;
          }
          return captured ? { ok: true, attached: true } : { ok: false, error: "Meta did not invoke its detached file input." };
        }
      });
      const mainResult = injected?.[0]?.result;
      if (mainResult?.ok && mainResult.attached) return "detached-bytes";

      const response = await chrome.tabs.sendMessage(tabId, {
        type: "ATTACH_META_FILE",
        item,
        media: {
          name: item.file.name,
          type: item.file.type,
          bytes: item.file.bytes
        }
      });
      if (response?.ok && response.attached) return "bytes";
      throw new Error(response?.error || mainResult?.error || "Meta rejected the in-page media attachment.");
    } catch (error) {
      byteUploadError = error;
    }
  }
  if (item.file?.path) {
    await uploadNativeFile(tabId, item.file.path);
    return "native";
  }
  throw new Error(`The proven in-page uploader failed${byteUploadError ? `: ${byteUploadError.message}` : ""}. Relink the campaign folder and retry.`);
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

async function hardOpenWorkflow(tabId, targetUrl) {
  // Meta keeps completed Reel/Post/Story flows inside its SPA. A reload can
  // therefore reload the wrong composer even after chrome.tabs.update. Pass
  // through about:blank so every item gets a real document navigation to its
  // exact starting URL (Reel Composer or Planner).
  await chrome.tabs.update(tabId, { url: "about:blank", active: false });
  const blankStarted = Date.now();
  while (Date.now() - blankStarted < 15000) {
    const current = await chrome.tabs.get(tabId);
    if (current.url === "about:blank" && current.status === "complete") break;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  await chrome.tabs.update(tabId, { url: targetUrl, active: false });
  const target = new URL(targetUrl);
  const started = Date.now();
  while (Date.now() - started < 90000) {
    const current = await chrome.tabs.get(tabId);
    let currentUrl;
    try { currentUrl = new URL(current.url || ""); } catch (_) { currentUrl = null; }
    if (current.status === "complete"
      && currentUrl?.origin === target.origin
      && currentUrl.pathname === target.pathname) {
      await ensureContent(tabId);
      await new Promise(resolve => setTimeout(resolve, 1200));
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error("Meta did not open the exact workflow link.");
}

async function scheduleItem(message) {
  // Every item starts from the verified Planner. Reel and Story must be chosen
  // from the Create split-button menu; only a Post may use Create post.
  const targetUrl = message.plannerUrl;
  const tab = await workflowTab(targetUrl);
  // No item may reuse Meta's previous SPA composer state.
  await hardOpenWorkflow(tab.id, targetUrl);
  let prepared;
  let lastUploadError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    if (attempt > 1) {
      await hardOpenWorkflow(tab.id, targetUrl);
    }
    try {
      await openMetaItemFromPlanner(tab.id, message.item);
      await uploadCampaignFile(tab.id, message.item);
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
  let finished;
  await withActiveWorkflowTab(tab.id, async () => {
    if (prepared.captionReady) await trustedInsert(tab.id, message.item.caption);
    await reachTrustedScheduleStep(tab.id, message.item);
    await trustedScheduleInput(tab.id, message.item.date, message.item.time);
    const preflight = await chrome.tabs.sendMessage(tab.id, { type: "PREFLIGHT_META_ITEM", item: message.item });
    if (!preflight?.ok || !preflight.ready) throw new Error(preflight?.error || "Meta schedule preflight failed.");
    await trustedClick(tab.id, { labels: ["Schedule"], preferLast: true });
    finished = await chrome.tabs.sendMessage(tab.id, { type: "VERIFY_META_ITEM", item: message.item });
    if (!finished?.ok || !finished.scheduled) throw new Error(finished?.error || "Meta did not confirm the scheduled item.");
  });
  // The scheduled item is already committed at this point. Return the tab to
  // this item's exact clean start page, but never mark an already-confirmed
  // item failed if Meta temporarily resists that navigation.
  try { await hardOpenWorkflow(tab.id, targetUrl); }
  catch (_) { await chrome.tabs.update(tab.id, { url: targetUrl, active: false }); }
  return finished;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== "SCHEDULE_META_ITEM") return;
  scheduleItem(message).then(result => sendResponse({ ok: true, result })).catch(error => sendResponse({ ok: false, error: error.message }));
  return true;
});
