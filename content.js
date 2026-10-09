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
      const exact = [...document.querySelectorAll('a[href*="/groups/"]')].find(anchor =>
        visible(anchor) && normalize(anchor.innerText) === normalize(groupName)
      );
      return exact || findByText('a[href*="/groups/"]', [groupName]);
    });
    link.click();
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

    const editor = await waitFor(() => [...document.querySelectorAll('[contenteditable="true"][role="textbox"]')].find(visible));
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

      const heading = document.querySelector('h1, [role="main"] h2');
      if (!directUrl && heading && !normalize(heading.innerText).includes(normalize(group))) {
        sendResponse({ ok: true, navigating: true, message: `Searching for ${group}…` });
        location.href = `https://www.facebook.com/search/groups/?q=${encodeURIComponent(group)}`;
        return;
      }

      sendResponse(await prepareComposer(message.caption, message.media));
    })().catch(error => sendResponse({ ok: false, error: error.message }));

    return true;
  });
})();
