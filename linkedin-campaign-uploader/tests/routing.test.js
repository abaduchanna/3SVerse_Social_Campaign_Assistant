const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const background = fs.readFileSync(path.join(root, "background.js"), "utf8");
const content = fs.readFileSync(path.join(root, "content.js"), "utf8");

assert.match(background, /company\/144975022\/admin\/dashboard/);
assert.match(background, /company\/144975022\/admin\/page-posts\/published/);
assert.match(background, /Page\.setInterceptFileChooserDialog/);
assert.match(background, /DOM\.setFileInputFiles/);
assert.match(background, /state\.nextReady/);
assert.match(background, /state\.editorReady && state\.postReady/);
assert.match(content, /start a post/);
assert.match(content, /text editor for creating/);
assert.match(content, /add media/);
assert.match(content, /name === "next"/);
assert.match(content, /name === "post"/);
console.log("LinkedIn exact routing contracts passed.");
