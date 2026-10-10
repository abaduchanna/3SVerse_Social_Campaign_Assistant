(() => {
  if (globalThis.__metaPlannerSchedulerLoaded) return;
  globalThis.__metaPlannerSchedulerLoaded = true;
  let active = null;

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const norm = value => String(value || "").normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
  const visible = element => Boolean(element && element.getClientRects().length && getComputedStyle(element).visibility !== "hidden");
  const controls = () => [...document.querySelectorAll('button,[role="button"],[role="menuitem"],label')].filter(visible);
  const exactControl = text => controls().find(element => norm(element.innerText || element.getAttribute("aria-label")) === norm(text));
  const routeFor = type => type === "reel" ? /\/reels_composer\/?$/ : type === "story" ? /\/stories\/composer\/?$/ : /\/content_calendar\/?$/;

  function captionEditor() {
    return [...document.querySelectorAll('textarea,[contenteditable="true"][role="textbox"],input[type="text"]')]
      .filter(visible)
      .find(element => /write in the dialogue box|write.*post|caption|describe/i.test(
        `${element.getAttribute("aria-label") || ""} ${element.placeholder || ""}`
      ));
  }

  function composerReady(type) {
    if (type === "reel") {
      return routeFor(type).test(location.pathname)
        && Boolean(exactControl("Add video"))
        && Boolean(captionEditor())
        && Boolean(exactControl("Cancel"))
        && Boolean(exactControl("Next"));
    }
    const heading = type === "story" ? "create story" : "create post";
    return [...document.querySelectorAll("h1,h2")].some(element => visible(element) && norm(element.innerText) === heading);
  }

  function screenSummary() {
    const headings = [...document.querySelectorAll("h1,h2,h3")].filter(visible).map(element => element.innerText.trim()).filter(Boolean).slice(-4);
    const buttons = controls().map(element => (element.innerText || element.getAttribute("aria-label") || "").trim()).filter(Boolean).slice(-12);
    return `screen=[${headings.join(" > ") || "no heading"}], controls=[${buttons.join(" | ") || "none"}]`;
  }

  async function waitFor(getter, timeout = 60000, interval = 300, expected = "control") {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const value = getter();
      if (value) return value;
      await sleep(interval);
    }
    throw new Error(`Meta did not show ${expected} in time; ${screenSummary()}`);
  }

  function modalRoot() {
    return [...document.querySelectorAll('[role="dialog"]')].filter(visible).at(-1) || document.body;
  }

  async function openCreateMenu() {
    if (exactControl("Reel") || exactControl("Create reel") || exactControl("Story") || exactControl("Create Story")) return;
    const create = await waitFor(() => exactControl("Create"));
    create.click();
    await waitFor(() => exactControl("Story") || exactControl("Create Story") || exactControl("Reel") || exactControl("Create reel"), 15000, 250, "the Create menu options");
  }

  async function openComposer(type) {
    if (composerReady(type)) return;
    if (!location.pathname.includes("content_calendar")) throw new Error("Open Meta Planner before starting the scheduler.");
    if (type === "post") {
      (await waitFor(() => exactControl("Create post"))).click();
      await waitFor(() => [...document.querySelectorAll("h1,h2")].some(element => visible(element) && norm(element.innerText) === "create post"));
    } else {
      await openCreateMenu();
      const labels = type === "reel" ? ["Reel", "Create reel"] : ["Story", "Create Story"];
      (await waitFor(() => labels.map(exactControl).find(Boolean), 15000, 250, `${type} in Meta's Create menu`)).click();
      await waitFor(() => composerReady(type), 45000, 300, `the ${type} composer controls`);
    }
    await sleep(700);
  }

  function ensureFacebookAndInstagram() {
    const heading = [...document.querySelectorAll('[role="heading"],h1,h2,h3,h4')]
      .find(element => visible(element) && norm(element.innerText) === "post to");
    if (!heading) throw new Error("Meta's visible 'Post to' section was not found.");

    let selection = heading;
    while (selection && selection !== document.body) {
      const accounts = [...selection.querySelectorAll("img")]
        .filter(visible)
        .map(image => norm(image.alt));
      if (accounts.includes("facebook") && accounts.includes("instagram")) break;
      selection = selection.parentElement;
    }
    if (!selection || selection === document.body) {
      throw new Error("Facebook and Instagram are not both selected in Meta's 'Post to' control. Select both once, then retry.");
    }
  }

  async function attachFile(media, type) {
    const root = modalRoot();
    const file = new File([new Uint8Array(media.bytes)], media.name, { type: media.type });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    const acceptInput = input => {
      const accept = input.accept || "";
      return type !== "reel" || !accept || /video/i.test(accept);
    };
    const applyFile = input => {
      if (!input) return false;
      try {
        input.files = transfer.files;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      } catch (_) { return false; }
    };
    const existing = [...document.querySelectorAll('input[type="file"]')].find(acceptInput);
    if (existing && applyFile(existing)) return;

    const upload = controls().find(element => /add (video|photo|media)|upload (video|photo|media)/i.test(element.innerText || element.getAttribute("aria-label") || ""));
    if (!upload) throw new Error(`Meta upload button was not found; ${screenSummary()}`);
    await new Promise((resolve, reject) => {
      let settled = false;
      const finish = (ok, error) => {
        if (settled) return;
        settled = true;
        observer.disconnect();
        clearTimeout(timer);
        ok ? resolve() : reject(error);
      };
      const inspect = node => {
        if (node?.matches?.('input[type="file"]') && acceptInput(node) && applyFile(node)) return finish(true);
        const child = node?.querySelectorAll ? [...node.querySelectorAll('input[type="file"]')].find(acceptInput) : null;
        if (child && applyFile(child)) finish(true);
      };
      const observer = new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(inspect)));
      observer.observe(document.documentElement, { childList: true, subtree: true });
      const timer = setTimeout(() => finish(false, new Error(`Meta did not expose its file input after the upload click; ${screenSummary()}`)), 20000);
      upload.click();
      [...document.querySelectorAll('input[type="file"]')].filter(acceptInput).forEach(input => { if (applyFile(input)) finish(true); });
    });
  }

  async function focusCaption(type) {
    if (type === "story") return false;
    const editor = await waitFor(captionEditor, 30000, 300, "Meta's reel caption box");
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
    return [...modalRoot().querySelectorAll('button,[role="button"]')].filter(visible).filter(element =>
      norm(element.innerText || element.getAttribute("aria-label")) === norm(text)
      && !element.matches(':disabled,[aria-disabled="true"]')
    ).at(-1);
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

  function storyShareSwitch() {
    return [...document.querySelectorAll('[role="switch"],input[type="checkbox"]')]
      .find(element => visible(element) && /share to facebook story/i.test(element.getAttribute("aria-label") || ""));
  }

  async function openSchedule() {
    const story = storyShareSwitch();
    if (story && story.getAttribute("aria-checked") !== "true" && !story.checked) story.click();
    const scheduleOption = await waitFor(() => exactControl("Schedule") || [...document.querySelectorAll('[role="radio"]')].find(element => visible(element) && norm(element.innerText) === "schedule"));
    scheduleOption.click();
    await waitFor(() => document.querySelectorAll("input[placeholder='dd/mm/yyyy']").length >= 2, 15000, 250, "Facebook and Instagram date fields");
  }

  function scheduleMatches(date, time) {
    const [year, month, day] = date.split("-");
    const [hours, minutes] = time.split(":").map(Number);
    const dates = [...document.querySelectorAll("input[placeholder='dd/mm/yyyy']")].filter(visible);
    const hourInputs = [...document.querySelectorAll("input[role='spinbutton'][aria-label='hours']")].filter(visible);
    const minuteInputs = [...document.querySelectorAll("input[role='spinbutton'][aria-label='minutes']")].filter(visible);
    if (dates.length < 2 || hourInputs.length < 2 || minuteInputs.length < 2) return false;
    const dateOk = dates.every(input => norm(input.value).includes(norm(`${Number(day)} ${new Date(Number(year), Number(month) - 1, 1).toLocaleString("en", { month: "long" })} ${year}`)));
    const timeOk = hourInputs.every(input => Number(input.getAttribute("aria-valuenow")) === hours)
      && minuteInputs.every(input => Number(input.getAttribute("aria-valuenow")) === minutes);
    return dateOk && timeOk;
  }

  async function submitSchedule(date, time) {
    await waitFor(() => scheduleMatches(date, time), 15000, 250, "the requested Facebook and Instagram date/time");
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
    if (message.type === "OPEN_META_ITEM") {
      (async () => {
        active = { item: message.item, captionReady: false };
        await openComposer(message.item.type);
        ensureFacebookAndInstagram();
        sendResponse({ ok: true });
      })().catch(error => sendResponse({ ok: false, error: error.message }));
      return true;
    }
    if (message.type === "OPEN_META_UPLOAD") {
      (async () => {
        const upload = controls().find(element => /add (video|photo|media)|upload (video|photo|media)/i.test(element.innerText || element.getAttribute("aria-label") || ""));
        if (!upload) throw new Error(`Meta upload button was not found; ${screenSummary()}`);
        upload.click();
        sendResponse({ ok: true });
      })().catch(error => sendResponse({ ok: false, error: error.message }));
      return true;
    }
    if (message.type === "PREPARE_META_ITEM") {
      (async () => {
        if (!active) active = { item: message.item, captionReady: false };
        await waitFor(() => {
          const text = document.body.innerText || "";
          return text.includes(message.item.file.name) && (/(100%)|safe to publish|no copyright issues/i.test(text) || enabledExactButton("Next"));
        }, 120000, 700, `the completed upload for ${message.item.file.name}`);
        active.captionReady = await focusCaption(message.item.type);
        sendResponse({ ok: true, captionReady: active.captionReady, captionOptional: message.item.type === "story" });
      })().catch(error => sendResponse({ ok: false, error: error.message }));
      return true;
    }
    if (message.type === "OPEN_META_SCHEDULE") {
      (async () => {
        if (!active) throw new Error("Meta scheduling state was lost. Retry this item.");
        if (active.captionReady && !composerText().includes(norm(message.item.caption))) {
          throw new Error("Meta did not retain the complete caption and hashtags.");
        }
        await reachShareStep();
        await openSchedule();
        sendResponse({ ok: true, scheduleReady: true });
      })().catch(error => sendResponse({ ok: false, error: error.message }));
      return true;
    }
    if (message.type === "SUBMIT_META_ITEM") {
      (async () => {
        if (!active) throw new Error("Meta scheduling state was lost. Retry this item.");
        await submitSchedule(message.item.date, message.item.time);
        await verifyScheduled();
        active = null;
        sendResponse({ ok: true, scheduled: true });
      })().catch(error => sendResponse({ ok: false, error: error.message }));
      return true;
    }
  });
})();
