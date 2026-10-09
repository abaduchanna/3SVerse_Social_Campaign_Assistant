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

  async function focusComposer() {
    const openDialog = [...document.querySelectorAll('[role="dialog"]')].find(dialog =>
      visible(dialog) && dialog.querySelector('[contenteditable="true"][role="textbox"]')
    );
    if (!openDialog) {
      const composerTrigger = await waitFor(() => findByText('[role="button"], div[tabindex="0"]', [
        "write something", "create a public post", "what's on your mind", "create post"
      ]));
      composerTrigger.click();
    }

    const editor = await waitFor(() => {
      const modalEditors = [...document.querySelectorAll('[role="dialog"] [contenteditable="true"][role="textbox"]')]
        .filter(visible);
      return modalEditors.find(element => normalize(element.getAttribute("aria-label")).includes("create a public post"))
        || modalEditors.at(-1);
    });
    const dialog = editor.closest('[role="dialog"]');
    if (!dialog) throw new Error("Facebook's active Create post dialog was not found.");
    editor.focus();
    return { ok: true, editorReady: true };
  }

  async function verifyComposer(caption, media) {
    const editor = await waitFor(() => [...document.querySelectorAll(
      '[role="dialog"] [contenteditable="true"][role="textbox"]'
    )].filter(visible).at(-1));
    const dialog = editor.closest('[role="dialog"]');
    if (!dialog) throw new Error("Facebook's active Create post dialog was not found.");
    await sleep(500);
    if (normalize(editor.innerText || editor.textContent) !== normalize(caption)) {
      throw new Error("Facebook did not retain the full caption exactly. Nothing was posted.");
    }

    if (media?.bytes?.length) {
      // Let Facebook finish any URL-card preview first so it cannot be mistaken for the selected file.
      await sleep(1500);
      const input = await waitFor(() => [...dialog.querySelectorAll('input[type="file"]')].find(input =>
        (input.accept || "").includes("video") || (input.accept || "").includes("image") || input.multiple
      ), 15000);
      const previousLargeMedia = new Set([...dialog.querySelectorAll("img, video")].filter(element => {
        const rect = element.getBoundingClientRect();
        return rect.width >= 180 && rect.height >= 90;
      }));
      const bytes = new Uint8Array(media.bytes);
      const file = new File([bytes], media.name, { type: media.type || "video/mp4" });
      const transfer = new DataTransfer();
      transfer.items.add(file);
      input.files = transfer.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));

      await waitFor(() => [...dialog.querySelectorAll("img, video")].some(element => {
        const rect = element.getBoundingClientRect();
        return !previousLargeMedia.has(element) && rect.width >= 180 && rect.height >= 90;
      }), 60000);
    }

    await waitFor(() => {
      const postButton = [...dialog.querySelectorAll('[role="button"], button')]
        .find(button => normalize(button.innerText || button.getAttribute("aria-label")) === "post");
      return postButton && !postButton.matches(':disabled,[aria-disabled="true"]');
    }, media?.bytes?.length ? 60000 : 15000);

    return {
      ok: true,
      prepared: true,
      message: media?.bytes?.length
        ? "Caption and media are verified. Publishing automatically."
        : "Caption is verified. Publishing automatically."
    };
  }

  async function publishPreparedPost() {
    const dialog = await waitFor(() => [...document.querySelectorAll('[role="dialog"]')].find(visible), 10000);
    const postButton = await waitFor(() => [...dialog.querySelectorAll('[role="button"], button')].find(button =>
      visible(button)
      && normalize(button.innerText || button.getAttribute("aria-label")) === "post"
      && !button.matches(':disabled,[aria-disabled="true"]')
    ), 10000);
    postButton.click();
    await waitFor(() => !document.contains(dialog) || !visible(dialog), 60000);
    return { ok: true, posted: true, message: "Facebook confirmed the post. Ready for the next group." };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "PING") {
      sendResponse({ ok: true });
      return;
    }
    if (message.type === "PUBLISH_POST") {
      publishPreparedPost()
        .then(sendResponse)
        .catch(error => sendResponse({ ok: false, error: error.message }));
      return true;
    }
    if (message.type === "VERIFY_COMPOSER") {
      verifyComposer(message.caption, message.media)
        .then(sendResponse)
        .catch(error => sendResponse({ ok: false, error: error.message }));
      return true;
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

      sendResponse(await focusComposer());
    })().catch(error => sendResponse({ ok: false, error: error.message }));

    return true;
  });
})();
