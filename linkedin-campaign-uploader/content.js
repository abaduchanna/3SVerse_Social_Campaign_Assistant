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
    if (name === "schedulePost") return findInAll(doc => controls(doc).find(element => enabled(element) && label(element) === "schedule post"));
    if (name === "scheduleNext") return findInAll(doc => {
      const heading = [...doc.querySelectorAll('h1,h2,h3,[role="heading"]')].find(element => visible(element) && label(element) === "schedule post");
      return heading ? controls(doc).find(element => enabled(element) && label(element) === "next") : null;
    });
    if (name === "scheduleFinal") return findInAll(doc => controls(doc).filter(element => enabled(element) && label(element) === "schedule").at(-1));
    return null;
  }

  function scheduleFields() {
    return findInAll(doc => doc.querySelector("#share-post__scheduled-date"))?.doc || null;
  }

  function scheduleValues() {
    const doc = scheduleFields();
    return doc ? {
      date: doc.querySelector("#share-post__scheduled-date")?.value || "",
      time: doc.querySelector("#share-post__scheduled-time")?.value || ""
    } : { date: "", time: "" };
  }

  function expectedSchedule(date, time) {
    const [year, month, day] = date.split("-");
    const [hours, minutes] = time.split(":").map(Number);
    const meridiem = hours >= 12 ? "PM" : "AM";
    const displayHour = hours % 12 || 12;
    return { date: `${month}/${day}/${year}`, time: `${displayHour}:${String(minutes).padStart(2, "0")} ${meridiem}` };
  }

  function setNativeValue(input, value) {
    const prototype = Object.getPrototypeOf(input);
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (setter) setter.call(input, value); else input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    input.dispatchEvent(new Event("blur", { bubbles: true, composed: true }));
  }

  async function setSchedule(date, time) {
    const doc = scheduleFields();
    if (!doc) throw new Error(`LinkedIn schedule fields were not found; ${screenSummary()}`);
    const wanted = expectedSchedule(date, time);
    const dateInput = doc.querySelector("#share-post__scheduled-date");
    const timeInput = doc.querySelector("#share-post__scheduled-time");
    setNativeValue(dateInput, wanted.date);
    setNativeValue(timeInput, wanted.time);
    await new Promise(resolve => setTimeout(resolve, 500));
    const actual = scheduleValues();
    if (actual.date !== wanted.date || norm(actual.time) !== norm(wanted.time)) {
      throw new Error(`LinkedIn did not retain ${wanted.date} ${wanted.time}; current values are ${actual.date} ${actual.time}.`);
    }
    return actual;
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
    const schedulePost = target("schedulePost");
    const scheduleNext = target("scheduleNext");
    const scheduleFinal = target("scheduleFinal");
    const schedule = scheduleValues();
    const liveText = documents().flatMap(({ doc }) => [...doc.querySelectorAll('[role="alert"],[role="status"],[aria-live]')].filter(visible).map(element => element.innerText || element.textContent || "")).join(" ");
    return {
      createReady: Boolean(create),
      startPostReady: Boolean(startPost),
      editorReady: Boolean(editor),
      addMediaReady: Boolean(addMedia),
      nextReady: Boolean(next),
      postReady: Boolean(post),
      schedulePostReady: Boolean(schedulePost),
      scheduleDialogReady: Boolean(scheduleNext) && Boolean(schedule.date) && Boolean(schedule.time),
      scheduleFinalReady: Boolean(scheduleFinal),
      schedule,
      composerOpen: Boolean(editor) || Boolean(addMedia) || Boolean(post) || Boolean(scheduleFinal),
      successNotice: /(?:post (?:was|has been|is) (?:published|posted|scheduled)|successfully (?:published|posted|scheduled)|your post is live|post scheduled)/i.test(liveText),
      summary: screenSummary()
    };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "PING") { sendResponse({ ok: true }); return; }
    if (message.type === "GET_LINKEDIN_STATE") { sendResponse({ ok: true, state: state() }); return; }
    if (message.type === "LOCATE_LINKEDIN_TARGET") {
      const found = target(message.target);
      sendResponse(found ? { ok: true, point: pointFor(found) } : { ok: false, error: `LinkedIn control not found: ${message.target}; ${screenSummary()}` });
    }
    if (message.type === "SET_LINKEDIN_SCHEDULE") {
      setSchedule(message.date, message.time).then(values => sendResponse({ ok: true, values })).catch(error => sendResponse({ ok: false, error: error.message }));
      return true;
    }
  });
})();
