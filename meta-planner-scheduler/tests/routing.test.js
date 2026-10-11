const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const background = fs.readFileSync(path.join(root, "background.js"), "utf8");
const content = fs.readFileSync(path.join(root, "content.js"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const appHtml = fs.readFileSync(path.join(root, "app.html"), "utf8");

assert.equal(manifest.version, "1.4.1");
assert.match(appHtml, /v1\.4\.1/);
assert.match(background, /const targetUrl = message\.plannerUrl;/);
assert.match(background, /item\.type === "post"[\s\S]*labels: \["Create post"\]/);
assert.match(background, /item\.type === "reel" \? \["Create reel", "Reel"\] : \["Create Story", "Story"\]/);
assert.match(background, /labels: \["Create"\]/);
assert.match(background, /type: "WAIT_META_COMPOSER"/);
assert.doesNotMatch(background, /type: "OPEN_META_ITEM"/);
assert.match(content, /querySelectorAll\('\[role="menuitem"\]'\)/);
assert.match(content, /createMenuItem\(\["Create reel", "Reel"\]\)/);
assert.match(content, /createMenuItem\(\["Create Story", "Story"\]\)/);
assert.match(content, /message\.type === "WAIT_META_COMPOSER"/);
assert.doesNotMatch(content, /message\.type === "OPEN_META_ITEM"/);
assert.match(content, /querySelectorAll\('\[role="heading"\],h1,h2,h3,h4'\)/);
assert.match(content, /Boolean\(exactHeading\("Planner"\)\)/);
assert.doesNotMatch(content, /querySelectorAll\("h1,h2"\).*planner/i);
assert.doesNotMatch(content, /getAttribute\("aria-haspopup"\).*getAttribute\("aria-expanded"\)/s);
assert.match(background, /attemptPhase = "Meta Planner\/composer launch"/);
assert.match(background, /attemptPhase = "Meta upload\/preparation"/);

process.stdout.write("meta scheduler trusted routing contract test passed\n");
