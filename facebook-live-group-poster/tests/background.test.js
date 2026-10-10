const assert = require("node:assert/strict");
const data = {};
const messages = [];
const inserted = [];
let listener;
let alarmListener;
let alarm;
let tab = { id: 9, status: "complete", url: "https://www.facebook.com/groups/111/" };

global.chrome = {
  tabs: {
    query: async () => [tab], get: async () => tab, create: async () => tab,
    update: async (_id, changes) => (tab = { ...tab, ...changes, status: "complete" }),
    sendMessage: async (_id, message) => {
      messages.push(message.type);
      if (message.type === "PING") return { ok: true };
      if (message.type === "PREPARE_LIVE_POST") return { ok: true, editorReady: true };
      if (message.type === "VERIFY_LIVE_POST") return { ok: true };
      if (message.type === "PUBLISH_LIVE_POST") return { ok: true, posted: true };
      throw new Error(`Unexpected ${message.type}`);
    },
    onUpdated: { addListener() {}, removeListener() {} }
  },
  scripting: { executeScript: async () => {} },
  debugger: {
    attach: async () => {}, detach: async () => {},
    sendCommand: async (_target, method, params) => { if (method === "Input.insertText") inserted.push(params.text); }
  },
  storage: { local: {
    get: async key => typeof key === "string" ? { [key]: data[key] } : Object.fromEntries(key.map(k => [k, data[k]])),
    set: async values => Object.assign(data, values)
  } },
  alarms: {
    clear: async () => { alarm = null; }, create: async (name, options) => { alarm = { name, options }; },
    onAlarm: { addListener: fn => { alarmListener = fn; } }
  },
  runtime: { onStartup: { addListener() {} }, onMessage: { addListener: fn => { listener = fn; } } }
};

require("../background.js");
const send = message => new Promise((resolve, reject) => {
  assert.equal(listener(message, {}, response => response.ok ? resolve(response) : reject(new Error(response.error))), true);
});

(async () => {
  const targets = [
    { name: "Group One", url: "https://www.facebook.com/groups/111/" },
    { name: "Group Two", url: "https://www.facebook.com/groups/222/" }
  ];
  const caption = "Live now\n\nhttps://facebook.com/live/abc\n\n#3SVerse #VidaPay";
  const first = await send({ type: "START_LIVE_CAMPAIGN", targets, caption });
  assert.equal(first.state.posted, 1);
  assert.equal(alarm.options.delayInMinutes, 0.5);
  alarmListener({ name: alarm.name });
  for (let i = 0; i < 100 && data.livePosterCampaign.active; i += 1) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(data.livePosterCampaign.posted, 2);
  assert.equal(data.livePosterCampaign.active, false);
  assert.deepEqual(inserted, [caption, caption]);
  assert.equal(messages.filter(type => type === "PUBLISH_LIVE_POST").length, 2);
  process.stdout.write("live poster background test passed\n");
})().catch(error => { console.error(error); process.exitCode = 1; });
