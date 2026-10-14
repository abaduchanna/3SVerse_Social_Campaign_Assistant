(() => {
  if (globalThis.__threeSVerseLivePosterLoaded) return;
  globalThis.__threeSVerseLivePosterLoaded = true;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const norm = value => String(value || "").normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
  const visible = element => Boolean(element && element.getClientRects().length && getComputedStyle(element).visibility !== "hidden");

  async function waitFor(getter, timeout = 60000, interval = 400) {
    const started = Date.now();
    while (Date.now() - started < timeout) { const value = getter(); if (value) return value; await sleep(interval); }
    throw new Error("Facebook took too long to load. Check the Facebook tab and retry.");
  }

  function groupId(value) {
    try { return new URL(value, location.origin).pathname.match(/^\/groups\/([^/]+)/i)?.[1]?.toLowerCase() || ""; }
    catch (_) { return ""; }
  }

  function cleanName(raw) {
    const lines = String(raw || "").split(/\n+/).map(l => l.replace(/\s+/g, " ").trim()).filter(Boolean);
    const kept = lines.filter(l => !/last active|last visited/i.test(l) && !/^view group$/i.test(l)
      && !/^\d[\d,.]*\s+members?$/i.test(l) && !/private group|public group/i.test(l));
    return kept[0] || "";
  }

  function groupsVisibleNow() {
    const map = new Map();
    for (const anchor of document.querySelectorAll('a[href*="/groups/"]')) {
      const id = groupId(anchor.href);
      if (!id || ["feed","discover","joins","search","permalink"].includes(id)) continue;
      const photoAlt = (anchor.querySelector("img[alt]")?.alt || "").replace(/^profile photo of\s+/i, "").trim();
      const name = cleanName(photoAlt || anchor.getAttribute("aria-label") || anchor.innerText || "");
      if (!map.has(id)) map.set(id, { name: "", url:`https://www.facebook.com/groups/${id}/` });
      const entry = map.get(id);
      if (!entry.name && name && norm(name) !== "view group") entry.name = name;
    }
    return [...map.values()].filter(g => g.name);
  }

  function scrollCands(){
    const list=[{el:document.scrollingElement,win:true}];
    for(const el of document.querySelectorAll("div")) if(el.clientHeight>200&&el.scrollHeight>el.clientHeight+100&&visible(el)) list.push({el,win:false});
    return list;
  }
  function stepScroll(item){
    const before=item.win?window.scrollY:item.el.scrollTop;
    if(item.win) window.scrollBy(0,Math.max(window.innerHeight*0.75,400));
    else { item.el.scrollTop=before+Math.max(item.el.clientHeight*0.75,400); item.el.dispatchEvent(new Event("scroll",{bubbles:true})); }
    const after=item.win?window.scrollY:item.el.scrollTop;
    return after>before+2;
  }

  async function scanGroups() {
    if (!location.pathname.startsWith("/groups/joins")) throw new Error("Facebook Your groups page is not open.");
    const countText = [...document.querySelectorAll("h1,h2,h3,[role=heading]")].map(e=>e.innerText||"").find(text=>/(all\s+)?groups\s+you.?ve\s+joined\s*\(\d+\)/i.test(text));
    const expected = Number(countText?.match(/\((\d+)\)/)?.[1] || 0);
    const all = new Map();
    const collect = () => groupsVisibleNow().forEach(group => all.set(groupId(group.url), group));
    collect();
    // Facebook virtualizes this list: cards unmount as they leave the
    // viewport, so jump-to-bottom scrolling skips whole batches (owner saw
    // 121 of 618). Step-scroll every candidate container, accumulate each
    // group the moment it appears, rotate when a container stops yielding.
    // A shortfall is returned as partial, NOT thrown — the popup keeps the
    // partial list and the owner can import again.
    const done = new Set(); let stagnant = 0;
    for (let pass=0; pass<240 && (!expected || all.size<expected) && stagnant<24; pass+=1) {
      const item = scrollCands().find(c => !done.has(c.win ? "win" : c.el));
      if (!item) break;
      const before = all.size; const moved = stepScroll(item);
      await sleep(1300); collect();
      stagnant = all.size > before ? 0 : stagnant + 1;
      const el = item.el;
      if (!moved || (el.scrollTop + el.clientHeight >= el.scrollHeight - 8 && stagnant >= 6)) { done.add(item.win ? "win" : item.el); stagnant = 0; }
    }
    if (!all.size) throw new Error("No joined Facebook groups were found.");
    return { ok: true, groups: [...all.values()], expected, partial: Boolean(expected && all.size < expected) };
  }

  async function focusComposer() {
    let editor=[...document.querySelectorAll('[role="dialog"] [contenteditable="true"][role="textbox"]')].filter(visible).at(-1);
    if (!editor) {
      const trigger=await waitFor(()=>[...document.querySelectorAll('[role="button"],div[tabindex="0"]')].find(element=>visible(element)&&/write something|create a public post|what.s on your mind|create post/i.test(element.innerText||element.getAttribute("aria-label")||"")));
      trigger.click();
      editor=await waitFor(()=>[...document.querySelectorAll('[role="dialog"] [contenteditable="true"][role="textbox"]')].filter(visible).at(-1));
    }
    editor.focus(); return editor;
  }

  async function prepare(target) {
    if (groupId(location.href)!==groupId(target.url)) { location.href=target.url; return {ok:true,navigating:true}; }
    const editor=await focusComposer();
    return {ok:true,editorReady:Boolean(editor)};
  }

  async function verify(caption) {
    const editor=await waitFor(()=>[...document.querySelectorAll('[role="dialog"] [contenteditable="true"][role="textbox"]')].filter(visible).at(-1));
    if (norm(editor.innerText||editor.textContent)!==norm(caption)) throw new Error("Facebook did not retain the complete text, live link and hashtags.");
    const dialog=editor.closest('[role="dialog"]');
    await waitFor(()=>[...dialog.querySelectorAll('[role="button"],button')].find(button=>visible(button)&&norm(button.innerText||button.getAttribute("aria-label"))==="post"&&!button.matches(':disabled,[aria-disabled="true"]')),30000);
    return {ok:true};
  }

  async function publish() {
    const dialog=await waitFor(()=>[...document.querySelectorAll('[role="dialog"]')].filter(visible).at(-1));
    const button=await waitFor(()=>[...dialog.querySelectorAll('[role="button"],button')].find(element=>visible(element)&&norm(element.innerText||element.getAttribute("aria-label"))==="post"&&!element.matches(':disabled,[aria-disabled="true"]')),15000);
    button.click(); await waitFor(()=>!document.contains(dialog)||!visible(dialog),60000); return {ok:true,posted:true};
  }

  chrome.runtime.onMessage.addListener((message,_sender,sendResponse)=>{
    if(message.type==="PING"){sendResponse({ok:true});return;}
    const run = promise => { promise.then(sendResponse).catch(error=>sendResponse({ok:false,error:error.message})); return true; };
    if(message.type==="SCAN_GROUPS") return run(scanGroups());
    if(message.type==="PREPARE_LIVE_POST") return run(prepare(message.target));
    if(message.type==="VERIFY_LIVE_POST") return run(verify(message.caption));
    if(message.type==="PUBLISH_LIVE_POST") return run(publish());
  });
})();
