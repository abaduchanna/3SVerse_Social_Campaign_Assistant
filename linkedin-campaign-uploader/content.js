(() => {
  if (globalThis.__threeSVerseLinkedInUploader) return;
  globalThis.__threeSVerseLinkedInUploader = true;

  const norm = value => String(value || "").normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
  const visible = element => Boolean(element && element.getClientRects().length && element.ownerDocument.defaultView.getComputedStyle(element).visibility !== "hidden");
  const enabled = element => visible(element) && !element.matches(":disabled,[aria-disabled='true']");
  const label = element => norm(element?.getAttribute("aria-label") || element?.innerText || element?.textContent);

  function documents() {
    const result = [];
    const visit = (doc, frames) => {
      result.push({ doc, frames });
      for (const frame of doc.querySelectorAll("iframe")) {
        try { if (frame.contentDocument) visit(frame.contentDocument, [...frames, frame]); } catch (_) {}
      }
    };
    visit(document, []);
    return result;
  }

  function findInAll(predicate) {
    for (const entry of documents()) {
      const element = predicate(entry.doc);
      if (element) return { ...entry, element };
    }
    return null;
  }

  function controls(doc, selector = "button,[role='button'],a,[role='link']") {
    return [...doc.querySelectorAll(selector)].filter(visible);
  }

  function target(name) {
    if (name === "create") return findInAll(doc => controls(doc, "a,[role='link'],button,[role='button']").find(element => enabled(element) && label(element) === "create"));
    if (name === "startPost") return findInAll(doc => controls(doc, "a,[role='link'],button,[role='button']").find(element => enabled(element) && /^start a post(?:\s|$)/.test(label(element))));
    if (name === "editor") return findInAll(doc => [...doc.querySelectorAll('[role="textbox"],[contenteditable="true"],textarea')].filter(visible).find(element => /text editor for creating/.test(label(element)))
      || [...doc.querySelectorAll('[role="textbox"][contenteditable="true"],[contenteditable="true"].ql-editor')].filter(visible).at(-1));
    if (name === "addMedia") return findInAll(doc => controls(doc).find(element => enabled(element) && label(element) === "add media"));
    if (name === "next") return findInAll(doc => controls(doc).find(element => enabled(element) && label(element) === "next"));
    if (name === "post") return findInAll(doc => controls(doc).filter(element => enabled(element) && label(element) === "post").at(-1));
    return null;
  }

  function pointFor(found) {
    const { element, frames } = found;
    for (const frame of frames) frame.scrollIntoView({ block: "center", inline: "center" });
    element.scrollIntoView({ block: "center", inline: "center" });
    element.focus({ preventScroll: true });
    let rect = element.getBoundingClientRect();
    let x = rect.left + rect.width / 2;
    let y = rect.top + rect.height / 2;
    for (let index = frames.length - 1; index >= 0; index -= 1) {
      rect = frames[index].getBoundingClientRect();
      x += rect.left;
      y += rect.top;
    }
    return { x, y, label: label(element), tag: element.tagName };
  }

  function screenSummary() {
    const frameNames = documents().flatMap(({ doc }) => controls(doc).map(element => label(element)).filter(Boolean)).slice(0, 24);
    return `url=${location.href}, controls=[${frameNames.join(" | ")}]`;
  }

  function state() {
    const create = target("create");
    const startPost = target("startPost");
    const editor = target("editor");
    const addMedia = target("addMedia");
    const next = target("next");
    const post = target("post");
    const liveText = documents().flatMap(({ doc }) => [...doc.querySelectorAll('[role="alert"],[role="status"],[aria-live]')].filter(visible).map(element => element.innerText || element.textContent || "")).join(" ");
    return {
      createReady: Boolean(create),
      startPostReady: Boolean(startPost),
      editorReady: Boolean(editor),
      addMediaReady: Boolean(addMedia),
      nextReady: Boolean(next),
      postReady: Boolean(post),
      successNotice: /(?:post (?:was|has been|is) (?:published|posted)|successfully (?:published|posted)|your post is live)/i.test(liveText),
      summary: screenSummary()
    };
  }

  async function attachFile(media) {
    if (!Array.isArray(media?.bytes) || !media.bytes.length) throw new Error("The selected LinkedIn media bytes are unavailable.");
    const file = new File([new Uint8Array(media.bytes)], media.name, { type: media.type });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    const accepts = input => {
      const accept = norm(input.accept);
      if (!accept) return true;
      return media.type.startsWith("video/") ? accept.includes("video") : accept.includes("image") || accept.includes("photo");
    };
    const apply = input => {
      try {
        input.files = transfer.files;
        input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
        input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
        return input.files?.length === 1;
      } catch (_) { return false; }
    };
    const started = Date.now();
    let clicked = false;
    while (Date.now() - started < 20000) {
      for (const { doc } of documents()) {
        const input = [...doc.querySelectorAll('input[type="file"]')].find(accepts);
        if (input && apply(input)) return true;
      }
      if (!clicked) {
        const add = target("addMedia")?.element;
        if (add) { add.click(); clicked = true; }
      }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error(`LinkedIn did not expose its file input; ${screenSummary()}`);
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "PING") { sendResponse({ ok: true }); return; }
    if (message.type === "GET_LINKEDIN_STATE") { sendResponse({ ok: true, state: state() }); return; }
    if (message.type === "LOCATE_LINKEDIN_TARGET") {
      const found = target(message.target);
      sendResponse(found ? { ok: true, point: pointFor(found) } : { ok: false, error: `LinkedIn control not found: ${message.target}; ${screenSummary()}` });
    }
    if (message.type === "ATTACH_LINKEDIN_FILE") {
      attachFile(message.media).then(() => sendResponse({ ok: true })).catch(error => sendResponse({ ok: false, error: error.message }));
      return true;
    }
  });
})();
