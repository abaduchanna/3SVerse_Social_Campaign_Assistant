(() => {
  if (globalThis.__threeSVerseCampaignAssistantLoaded) return;
  globalThis.__threeSVerseCampaignAssistantLoaded = true;

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function normalize(value) {
    return (value || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  async function waitFor(test, timeout = 30000, interval = 500) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const value = test();
      if (value) return value;
      await sleep(interval);
    }
    throw new Error("Facebook took too long to load. Check the tab and retry.");
  }

  function visible(element) {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function findByText(selector, texts) {
    const wanted = texts.map(normalize);
    return [...document.querySelectorAll(selector)].find(element => {
      const value = normalize(element.innerText || element.getAttribute("aria-label"));
      return visible(element) && wanted.some(text => value === text || value.includes(text));
    });
  }

  function setEditorText(editor, text) {
    const existing = normalize(editor.innerText || editor.textContent);
    const fingerprint = normalize(text).slice(0, 80);
    if (fingerprint && existing.includes(fingerprint)) return;
    editor.focus();
    document.execCommand("selectAll", false, null);
    document.execCommand("insertText", false, text);
    editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
  }

  async function openExactGroup(groupName) {
    const query = encodeURIComponent(groupName);
    const searchUrl = `https://www.facebook.com/search/groups/?q=${query}`;
    if (!location.href.startsWith("https://www.facebook.com/search/groups/") || !location.href.includes(query)) {
      location.href = searchUrl;
      return { navigating: true };
    }

    const link = await waitFor(() => {
      const wanted = normalize(groupName);
      const candidates = [...document.querySelectorAll('a[href*="/groups/"]')].filter(visible);
      const nameFor = anchor => {
        const imageAlt = anchor.querySelector('img[alt]')?.getAttribute("alt") || "";
        const imageName = imageAlt.replace(/^profile photo of\s+/i, "");
        return normalize(imageName || anchor.getAttribute("aria-label") || anchor.innerText);
      };
      return candidates.find(anchor => nameFor(anchor) === wanted)
        || candidates.find(anchor => nameFor(anchor).includes(wanted));
    });
    location.href = link.href;
    return { navigating: true };
  }

  function groupUrl(value) {
    try {
      const url = new URL(value);
      return url.hostname.endsWith("facebook.com") && url.pathname.includes("/groups/") ? url.href : null;
    } catch (_) {
      return null;
    }
  }

  async function prepareComposer(caption, media) {
    const composerTrigger = await waitFor(() => findByText('[role="button"], div[tabindex="0"]', [
      "write something", "create a public post", "what's on your mind", "create post"
    ]));
    composerTrigger.click();

    const editor = await waitFor(() => {
      const modalEditors = [...document.querySelectorAll('[role="dialog"] [contenteditable="true"][role="textbox"]')]
        .filter(visible);
      return modalEditors.find(element => normalize(element.getAttribute("aria-label")).includes("create a public post"))
        || modalEditors.at(-1);
    });
    setEditorText(editor, caption);

    if (media?.bytes?.length) {
      const input = await waitFor(() => [...document.querySelectorAll('input[type="file"]')].find(input =>
        (input.accept || "").includes("video") || (input.accept || "").includes("image") || input.multiple
      ), 15000);
      const bytes = new Uint8Array(media.bytes);
      const file = new File([bytes], media.name, { type: media.type || "video/mp4" });
      const transfer = new DataTransfer();
      transfer.items.add(file);
      input.files = transfer.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }

    await waitFor(() => {
      const dialog = editor.closest('[role="dialog"]');
      const postButton = dialog && [...dialog.querySelectorAll('[role="button"], button')]
        .find(button => normalize(button.innerText || button.getAttribute("aria-label")) === "post");
      return postButton && !postButton.matches(':disabled,[aria-disabled="true"]');
    }, 15000);

    return { ok: true, prepared: true, message: "Draft prepared. Review the Facebook tab and press Post yourself." };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "PING") {
      sendResponse({ ok: true });
      return;
    }
    if (message.type !== "PREPARE_POST") return;

    (async () => {
      const group = message.group.trim();
      if (!group) throw new Error("Group name is empty.");

      const directUrl = groupUrl(group);
      if (directUrl && !location.href.startsWith(directUrl.replace(/\/$/, ""))) {
        sendResponse({ ok: true, navigating: true, message: "Opening the saved group URL…" });
        location.href = directUrl;
        return;
      }

      if (location.pathname.startsWith("/search/groups/")) {
        sendResponse({ ok: true, navigating: true, message: `Opening ${group}…` });
        await openExactGroup(group);
        return;
      }

      if (!location.pathname.includes("/groups/")) {
        sendResponse({ ok: true, navigating: true, message: `Searching for ${group}…` });
        location.href = `https://www.facebook.com/search/groups/?q=${encodeURIComponent(group)}`;
        return;
      }

      const pageTitle = normalize(document.title.replace(/\|\s*facebook.*$/i, ""));
      if (!directUrl && !pageTitle.includes(normalize(group))) {
        sendResponse({ ok: true, navigating: true, message: `Searching for ${group}…` });
        location.href = `https://www.facebook.com/search/groups/?q=${encodeURIComponent(group)}`;
        return;
      }

      sendResponse(await prepareComposer(message.caption, message.media));
    })().catch(error => sendResponse({ ok: false, error: error.message }));

    return true;
  });
})();
