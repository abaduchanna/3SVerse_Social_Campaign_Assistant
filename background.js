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

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== "PREPARE_POST") return;

  (async () => {
    const tab = await getFacebookTab();
    await ensureContentScript(tab.id);
    const response = await chrome.tabs.sendMessage(tab.id, message);
    sendResponse({ ...response, tabId: tab.id });
  })().catch(error => sendResponse({ ok: false, error: error.message }));

  return true;
});
