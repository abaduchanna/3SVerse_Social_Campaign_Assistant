const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const background = fs.readFileSync(path.join(root, "background.js"), "utf8");
const content = fs.readFileSync(path.join(root, "content.js"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));

assert.equal(manifest.version, "1.4.0");
assert.match(background, /const targetUrl = message\.plannerUrl;/);
assert.match(background, /item\.type === "post"[\s\S]*labels: \["Create post"\]/);
assert.match(background, /item\.type === "reel" \? "Create reel" : "Create Story"/);
assert.match(background, /labels: \["Create"\]/);
assert.match(background, /type: "WAIT_META_COMPOSER"/);
assert.doesNotMatch(background, /type: "OPEN_META_ITEM"/);
assert.match(content, /querySelectorAll\('\[role="menuitem"\]'\)/);
assert.match(content, /createMenuItem\("Create reel"\)/);
assert.match(content, /createMenuItem\("Create Story"\)/);
assert.match(content, /message\.type === "WAIT_META_COMPOSER"/);
assert.doesNotMatch(content, /message\.type === "OPEN_META_ITEM"/);

process.stdout.write("meta scheduler trusted routing contract test passed\n");
