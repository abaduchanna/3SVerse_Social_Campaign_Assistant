(() => {
  if (globalThis.__metaPlannerSchedulerLoaded) return;
  globalThis.__metaPlannerSchedulerLoaded = true;
  let active = null;

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const norm = value => String(value || "").normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
  const visible = element => Boolean(element && element.getClientRects().length && getComputedStyle(element).visibility !== "hidden");
  const controls = () => [...document.querySelectorAll('button,[role="button"],[role="menuitem"],label')].filter(visible);
  const exactControl = text => controls().find(element => norm(element.innerText || element.getAttribute("aria-label")) === norm(text));

  async function waitFor(getter, timeout = 60000, interval = 300) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const value = getter();
      if (value) return value;
      await sleep(interval);
    }
    throw new Error("Meta Business Suite did not show the expected control in time.");
  }

  function modalRoot() {
    return [...document.querySelectorAll('[role="dialog"]')].filter(visible).at(-1) || document.body;
  }

  async function openCreateMenu() {
    const create = await waitFor(() => exactControl("Create"));
    create.click();
    await waitFor(() => exactControl("Create Story") || exactControl("Create reel"));
  }

  async function openComposer(type) {
    if (!location.pathname.includes("content_calendar")) throw new Error("Open Meta Planner before starting the scheduler.");
    if (type === "post") {
      (await waitFor(() => exactControl("Create post"))).click();
      await waitFor(() => [...document.querySelectorAll("h1,h2")].some(element => visible(element) && norm(element.innerText) === "create post"));
    } else {
      await openCreateMenu();
      const label = type === "reel" ? "Create reel" : "Create Story";
      (await waitFor(() => exactControl(label))).click();
      await waitFor(() => [...document.querySelectorAll("h1,h2")].some(element => visible(element) && norm(element.innerText) === norm(label)));
    }
    await sleep(700);
  }

  function ensureFacebookAndInstagram() {
    const root = modalRoot();
    const postTo = [...root.querySelectorAll('[role="combobox"],button')].find(element =>
      visible(element) && /post to/i.test(element.getAttribute("aria-label") || element.innerText || "")
    );
    if (!postTo) throw new Error("Meta 'Post to' account selector was not found.");
    const value = norm(postTo.innerText || postTo.getAttribute("aria-label"));
    if (!value.includes(" and ")) {
      throw new Error("Facebook and Instagram are not both selected in Meta's 'Post to' control. Select both once, then retry.");
    }
  }

  async function attachFile(media, type) {
    const root = modalRoot();
    if (!root.querySelector('input[type="file"]')) {
      const uploadLabel = type === "reel" ? "Add video" : type === "story" ? "Add media" : "Add photos/videos";
      const upload = exactControl(uploadLabel)
        || controls().find(element => /add (video|photo|media)|upload (video|photo|media)/i.test(element.innerText || element.getAttribute("aria-label") || ""));
      upload?.click();
    }
    const input = await waitFor(() => {
      const inputs = [...root.querySelectorAll('input[type="file"]')];
      return inputs.find(element => {
        const accept = element.accept || "";
        return type !== "reel" || !accept || /video/i.test(accept);
      }) || inputs[0];
    }, 20000);
    const file = new File([new Uint8Array(media.bytes)], media.name, { type: media.type });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function focusCaption(type) {
    if (type === "story") return false;
    const root = modalRoot();
    const editor = await waitFor(() => [...root.querySelectorAll('textarea,[contenteditable="true"][role="textbox"],input[type="text"]')]
      .filter(visible)
      .find(element => !/search|tag/i.test(element.getAttribute("aria-label") || element.placeholder || "")), 30000);
    editor.focus();
    if (editor.isContentEditable) document.execCommand("selectAll", false);
    else {
      editor.select?.();
      const prototype = Object.getPrototypeOf(editor);
      const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
      setter?.call(editor, "");
      editor.dispatchEvent(new Event("input", { bubbles: true }));
      editor.focus();
    }
    return true;
  }

  function composerText() {
    return norm(modalRoot().innerText);
  }

  function enabledExactButton(text) {
    return [...modalRoot().querySelectorAll('button,[role="button"]')].filter(visible).find(element =>
      norm(element.innerText || element.getAttribute("aria-label")) === norm(text)
      && !element.matches(':disabled,[aria-disabled="true"]')
    );
  }

  async function reachShareStep() {
    for (let step = 0; step < 3; step += 1) {
      if (exactControl("Schedule") || /scheduling options|publish now/i.test(modalRoot().innerText)) return;
      const next = await waitFor(() => enabledExactButton("Next"), 120000, 700);
      next.click();
      await sleep(1200);
    }
    if (!(exactControl("Schedule") || /scheduling options|publish now/i.test(modalRoot().innerText))) {
      throw new Error("Meta did not reach the Share/Scheduling step.");
    }
  }

  function setNativeValue(input, value) {
    const prototype = Object.getPrototypeOf(input);
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (setter) setter.call(input, value); else input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  async function chooseSchedule(date, time) {
    const scheduleOption = await waitFor(() => exactControl("Schedule") || [...document.querySelectorAll('[role="radio"]')].find(element => visible(element) && norm(element.innerText) === "schedule"));
    scheduleOption.click();
    await sleep(500);
    const root = modalRoot();
    const inputs = [...root.querySelectorAll("input")].filter(visible);
    const dateInput = inputs.find(input => input.type === "date" || /date/i.test(`${input.getAttribute("aria-label") || ""} ${input.placeholder || ""}`));
    const timeInput = inputs.find(input => input.type === "time" || /time/i.test(`${input.getAttribute("aria-label") || ""} ${input.placeholder || ""}`));
    if (!dateInput || !timeInput) throw new Error("Meta's schedule date/time fields were not found.");
    const [year, month, day] = date.split("-");
    setNativeValue(dateInput, dateInput.type === "date" ? date : `${month}/${day}/${year}`);
    setNativeValue(timeInput, timeInput.type === "time" ? time : time);
    await sleep(500);
    const finalButton = await waitFor(() => enabledExactButton("Schedule"), 15000);
    finalButton.click();
  }

  async function verifyScheduled() {
    await waitFor(() => {
      const text = norm(document.body.innerText);
      const composerGone = ![...document.querySelectorAll("h1,h2")].some(element => visible(element) && /^create (post|reel|story)$/i.test(element.innerText.trim()));
      return composerGone || /scheduled|your (post|reel|story) is scheduled/.test(text);
    }, 90000, 700);
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "PING") { sendResponse({ ok: true }); return; }
    if (message.type === "PREPARE_META_ITEM") {
      (async () => {
        active = { item: message.item, captionReady: false };
        await openComposer(message.item.type);
        ensureFacebookAndInstagram();
        await attachFile(message.item.file, message.item.type);
        active.captionReady = await focusCaption(message.item.type);
        sendResponse({ ok: true, captionReady: active.captionReady, captionOptional: message.item.type === "story" });
      })().catch(error => sendResponse({ ok: false, error: error.message }));
      return true;
    }
    if (message.type === "FINALIZE_META_ITEM") {
      (async () => {
        if (!active) throw new Error("Meta scheduling state was lost. Retry this item.");
        if (active.captionReady && !composerText().includes(norm(message.item.caption))) {
          throw new Error("Meta did not retain the complete caption and hashtags.");
        }
        await reachShareStep();
        await chooseSchedule(message.item.date, message.item.time);
        await verifyScheduled();
        active = null;
        sendResponse({ ok: true, scheduled: true });
      })().catch(error => sendResponse({ ok: false, error: error.message }));
      return true;
    }
  });
})();
