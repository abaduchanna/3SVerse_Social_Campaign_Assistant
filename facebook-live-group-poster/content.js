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

  function groupsVisibleNow() {
    const map = new Map();
    for (const anchor of document.querySelectorAll('a[href*="/groups/"]')) {
      const id = groupId(anchor.href);
      let name = (anchor.innerText || anchor.getAttribute("aria-label") || "").trim();
      if (!name) name = (anchor.querySelector("img[alt]")?.alt || "").replace(/^profile photo of\s+/i, "").trim();
      if (!id || ["feed","discover","joins"].includes(id) || !name || norm(name) === "view group" || /last active|last visited/i.test(name)) continue;
      if (!map.has(id)) map.set(id, { name, url:`https://www.facebook.com/groups/${id}/` });
    }
    return [...map.values()];
  }

  async function scanGroups() {
    if (!location.pathname.startsWith("/groups/joins")) throw new Error("Facebook Your groups page is not open.");
    const countText = [...document.querySelectorAll("h1,h2,h3,[role=heading]")].map(e=>e.innerText||"").find(text=>/all groups you.ve joined\s*\(\d+\)/i.test(text));
    const expected = Number(countText?.match(/\((\d+)\)/)?.[1] || 0);
    const all = new Map();
    const collect = () => groupsVisibleNow().forEach(group => all.set(groupId(group.url), group));
    collect(); let stable = 0;
    for (let pass=0; pass<140 && (!expected || all.size<expected) && stable<10; pass+=1) {
      const before=all.size;
      const scrollable=[...document.querySelectorAll("div")].filter(e=>visible(e)&&e.scrollHeight>e.clientHeight+100).sort((a,b)=>b.scrollHeight-a.scrollHeight)[0]||document.scrollingElement;
      if (scrollable===document.scrollingElement) window.scrollTo(0,document.body.scrollHeight); else { scrollable.scrollTop=scrollable.scrollHeight; scrollable.dispatchEvent(new Event("scroll",{bubbles:true})); }
      await sleep(1500); collect(); stable=all.size>before?0:stable+1;
    }
    if (!all.size) throw new Error("No joined Facebook groups were found.");
    if (expected && all.size<expected) throw new Error(`Facebook loaded only ${all.size} of ${expected} joined groups. Retry after the page finishes loading.`);
    return [...all.values()];
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
    if(message.type==="SCAN_GROUPS") return run(scanGroups().then(groups=>({ok:true,groups})));
    if(message.type==="PREPARE_LIVE_POST") return run(prepare(message.target));
    if(message.type==="VERIFY_LIVE_POST") return run(verify(message.caption));
    if(message.type==="PUBLISH_LIVE_POST") return run(publish());
  });
})();
