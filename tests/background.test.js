const assert = require("node:assert/strict");

const data = { autoCampaignMedia: { name: "reel.mp4", bytes: [1, 2, 3] } };
const sent = [];
const debuggerCommands = [];
const preparedGroups = [];
let currentTab = { id: 7, status: "complete", url: "https://www.facebook.com/" };
let joinedGroups = [
  { name: "Group One", url: "https://www.facebook.com/groups/111/" },
  { name: "Group Two", url: "https://www.facebook.com/groups/222/" }
];
let messageListener;
let alarmListener;
let scheduledAlarm;
let scanResponse = null;

global.chrome = {
  tabs: {
    query: async () => [currentTab],
    create: async () => currentTab,
    get: async () => currentTab,
    update: async (_tabId, changes) => {
      currentTab = { ...currentTab, ...changes, status: "complete" };
      return currentTab;
    },
    sendMessage: async (_tabId, message) => {
      sent.push(message.type);
      if (message.type === "PING") return { ok: true };
      if (message.type === "SCAN_JOINED_GROUPS") return scanResponse || { ok: true, groups: joinedGroups };
      if (message.type === "PREPARE_POST") {
        preparedGroups.push(message.group);
        return { ok: true, editorReady: true };
      }
      if (message.type === "VERIFY_COMPOSER") return { ok: true, prepared: true };
      if (message.type === "PUBLISH_POST") return { ok: true, posted: true };
      throw new Error(`Unexpected message: ${message.type}`);
    },
    onUpdated: { addListener() {}, removeListener() {} }
  },
  scripting: { executeScript: async () => {} },
  debugger: {
    async attach() {},
    async detach() {},
    async sendCommand(_target, method, params) { debuggerCommands.push({ method, params }); }
  },
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
  assert.equal(data.autoCampaignMedia.name, "reel.mp4");
  assert.equal(sent.filter(type => type === "PREPARE_POST").length, 2);
  assert.deepEqual(preparedGroups, [
    "https://www.facebook.com/groups/111/",
    "https://www.facebook.com/groups/222/"
  ]);
  assert.equal(sent.filter(type => type === "VERIFY_COMPOSER").length, 2);
  assert.equal(sent.filter(type => type === "PUBLISH_POST").length, 2);
  assert.equal(debuggerCommands.filter(command => command.method === "Input.insertText").length, 2);
  assert.equal(debuggerCommands.find(command => command.method === "Input.insertText").params.text,
    "Line one\n\nhttps://3sverse.com\n#VidaPay");

  const prepareCount = sent.filter(type => type === "PREPARE_POST").length;
  currentTab = { id: 7, status: "complete", url: "https://www.facebook.com/" };
  joinedGroups = [];
  await assert.rejects(
    send({ type: "START_CAMPAIGN", caption: "Test" }),
    /No joined Facebook groups were found/
  );
  assert.equal(sent.filter(type => type === "PREPARE_POST").length, prepareCount);

  currentTab = { id: 7, status: "complete", url: "https://www.facebook.com/" };
  joinedGroups = [
    { name: "Total Wireless", url: "https://www.facebook.com/groups/333/" },
    { name: "Total Wireless", url: "https://www.facebook.com/groups/444/" },
    { name: "Duplicate card", url: "https://www.facebook.com/groups/333/" }
  ];
  const expanded = await send({ type: "START_CAMPAIGN", caption: "Test" });
  assert.equal(expanded.state.total, 2);
  assert.equal(expanded.state.posted, 1);
  assert.equal(expanded.state.active, true);
  alarmListener({ name: scheduledAlarm.name });
  for (let attempt = 0; attempt < 100 && data.autoCampaign?.active; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.equal(data.autoCampaign.posted, 2);
  assert.equal(data.autoCampaign.active, false);
  assert.deepEqual(preparedGroups.slice(-2), [
    "https://www.facebook.com/groups/333/",
    "https://www.facebook.com/groups/444/"
  ]);

  // v1.3.0: import-only flow returns the joined-groups list without starting anything
  currentTab = { id: 7, status: "complete", url: "https://www.facebook.com/" };
  joinedGroups = [
    { name: "Store A", url: "https://www.facebook.com/groups/888/" },
    { name: "Store B", url: "https://www.facebook.com/groups/999/" }
  ];
  const imported = await send({ type: "IMPORT_GROUPS" });
  assert.equal(imported.ok, true);
  // v1.5.0: the response mirrors the PERSISTED merged checklist — every store
  // scanned in this test file so far is still in the list, not just this round.
  assert.equal(imported.groups.length, 6);
  assert.equal(data.autoCampaign.active, false);
  assert.equal(data.autoCampaign.total, 0);
  assert.match(data.autoCampaign.status, /Imported 6 joined groups/);

  // v1.5.0: the background itself saved the checklist + selection, so a popup
  // that closed mid-import can no longer lose the list.
  assert.equal(data.importedGroupsStore.groups.length, 6);
  assert.deepEqual([...data.importedGroupsStore.selectedIds].sort(),
    ["111", "222", "333", "444", "888", "999"]);

  // v1.3.0: START_CAMPAIGN posts only to the selected group identities
  const selective = await send({ type: "START_CAMPAIGN", caption: "Sel", selected: ["999"] });
  assert.equal(selective.state.total, 1);
  for (let attempt = 0; attempt < 100 && data.autoCampaign?.active; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.equal(data.autoCampaign.posted, 1);
  assert.equal(data.autoCampaign.active, false);
  assert.match(data.autoCampaign.status, /Campaign complete: 1 of 1 posted/);
  assert.equal(preparedGroups.at(-1), "https://www.facebook.com/groups/999/");

  // v1.3.0: a selection that matches nothing fails with a clear error
  await assert.rejects(
    send({ type: "START_CAMPAIGN", caption: "Sel", selected: ["404"] }),
    /None of the selected groups matched/
  );

  // v1.4.0: a partial scan (Facebook lazy-load shortfall) is delivered to the
  // popup with the partial flag instead of being thrown away
  currentTab = { id: 7, status: "complete", url: "https://www.facebook.com/" };
  joinedGroups = [{ name: "Store P1", url: "https://www.facebook.com/groups/771/" }];
  scanResponse = { ok: true, groups: joinedGroups, expected: 618, partial: true };
  const partial = await send({ type: "IMPORT_GROUPS" });
  scanResponse = null;
  assert.equal(partial.ok, true);
  assert.equal(partial.groups.length, 7);
  assert.equal(partial.expected, 618);
  assert.equal(partial.partial, true);
  assert.match(data.autoCampaign.status, /partial/);
  assert.equal(data.importedGroupsStore.groups.length, 7);
  assert.ok(data.importedGroupsStore.selectedIds.includes("771"));

  // v1.4.0: Start still works off the partial list — selected loaded groups post fine
  const partialStart = await send({ type: "START_CAMPAIGN", caption: "P", selected: ["771"] });
  assert.equal(partialStart.state.total, 1);
  for (let attempt = 0; attempt < 100 && data.autoCampaign?.active; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.equal(data.autoCampaign.posted, 1);
  assert.equal(data.autoCampaign.active, false);
  assert.equal(preparedGroups.at(-1), "https://www.facebook.com/groups/771/");

  // v1.5.0: a re-import never wipes the saved list and never resurrects a
  // store the owner unchecked — the ticks survive every round.
  joinedGroups = [
    { name: "Store A", url: "https://www.facebook.com/groups/888/" },
    { name: "Store B", url: "https://www.facebook.com/groups/999/" }
  ];
  data.importedGroupsStore.selectedIds = ["888"]; // owner unchecked the rest
  const reimported = await send({ type: "IMPORT_GROUPS" });
  assert.equal(reimported.ok, true);
  assert.equal(data.importedGroupsStore.groups.length, 7);
  assert.deepEqual([...data.importedGroupsStore.selectedIds], ["888"]);

  process.stdout.write("background campaign test passed\n");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
