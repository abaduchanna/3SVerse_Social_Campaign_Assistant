const assert = require("node:assert/strict");

const data = { autoCampaignMedia: { name: "reel.mp4", bytes: [1, 2, 3] } };
const sent = [];
let messageListener;
let alarmListener;
let scheduledAlarm;

global.chrome = {
  tabs: {
    query: async () => [{ id: 7, status: "complete", url: "https://www.facebook.com/" }],
    create: async () => ({ id: 7, status: "complete", url: "https://www.facebook.com/" }),
    get: async () => ({ id: 7, status: "complete", url: "https://www.facebook.com/groups/test" }),
    sendMessage: async (_tabId, message) => {
      sent.push(message.type);
      if (message.type === "PING") return { ok: true };
      if (message.type === "PREPARE_POST") return { ok: true, prepared: true };
      if (message.type === "PUBLISH_POST") return { ok: true, posted: true };
      throw new Error(`Unexpected message: ${message.type}`);
    },
    onUpdated: { addListener() {}, removeListener() {} }
  },
  scripting: { executeScript: async () => {} },
  storage: {
    local: {
      async get(keys) {
        if (typeof keys === "string") return { [keys]: data[keys] };
        return Object.fromEntries(keys.map(key => [key, data[key]]));
      },
      async set(values) { Object.assign(data, values); },
      async remove(key) { delete data[key]; }
    }
  },
  alarms: {
    async clear() { scheduledAlarm = null; },
    async create(name, options) { scheduledAlarm = { name, options }; },
    onAlarm: { addListener(listener) { alarmListener = listener; } }
  },
  runtime: {
    onStartup: { addListener() {} },
    onMessage: { addListener(listener) { messageListener = listener; } }
  }
};

require("../background.js");

function send(message) {
  return new Promise((resolve, reject) => {
    const keptOpen = messageListener(message, {}, response => {
      if (response?.ok) resolve(response);
      else reject(new Error(response?.error || "Unknown response error"));
    });
    assert.equal(keptOpen, true);
  });
}

(async () => {
  const started = await send({
    type: "START_CAMPAIGN",
    groups: ["Group One", "Group Two"],
    caption: "Line one\n\nhttps://3sverse.com\n#VidaPay"
  });
  assert.equal(started.state.posted, 1);
  assert.equal(started.state.active, true);
  assert.equal(scheduledAlarm.name, "3sverse-campaign-next");
  assert.equal(scheduledAlarm.options.delayInMinutes, 0.5);
  assert.ok(data.autoCampaignMedia);

  alarmListener({ name: scheduledAlarm.name });
  for (let attempt = 0; attempt < 100 && data.autoCampaign?.active; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 5));
  }

  assert.equal(data.autoCampaign.posted, 2);
  assert.equal(data.autoCampaign.active, false);
  assert.equal(data.autoCampaign.status, "Campaign complete: 2 of 2 posted.");
  assert.equal(data.autoCampaignMedia, undefined);
  assert.equal(sent.filter(type => type === "PREPARE_POST").length, 2);
  assert.equal(sent.filter(type => type === "PUBLISH_POST").length, 2);
  process.stdout.write("background campaign test passed\n");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
