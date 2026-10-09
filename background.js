const FACEBOOK_HOME = "https://www.facebook.com/";

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
          reject(new Error("Facebook navigation timed out. Open the Facebook tab, confirm you are signed in, and retry."));
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
  for (let step = 0; step < 4; step += 1) {
    await ensureContentScript(tab.id);
    const before = await chrome.tabs.get(tab.id);
    const response = await chrome.tabs.sendMessage(tab.id, message);
    if (!response?.navigating) return response;
    await waitForNavigation(tab.id, before.url);
  }
  throw new Error("Facebook opened too many intermediate pages. Use a direct Facebook group URL and retry.");
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== "PREPARE_POST") return;

  (async () => {
    const tab = await getFacebookTab();
    const response = await prepareThroughNavigation(tab, message);
    sendResponse({ ...response, tabId: tab.id });
  })().catch(error => sendResponse({ ok: false, error: error.message }));

  return true;
});
