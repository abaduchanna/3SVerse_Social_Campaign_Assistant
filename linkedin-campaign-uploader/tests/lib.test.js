const assert = require("node:assert/strict");
const { dayNumber, parseCampaign, buildQueue } = require("../lib.js");

assert.equal(dayNumber("day-10.png"), 10);
assert.equal(dayNumber("3SVerse-Reel-02.mp4"), 2);

const markdown = `# Campaign
## Day 1 — First
Full first caption.

#VidaPay #3SVerse

![Creative](images/day-01.png)
---
## Day 2 — Second
Full second caption.

#LinkedIn #WirelessRetail
`;
const captions = parseCampaign(markdown);
assert.deepEqual(captions.map(item => item.day), [1, 2]);
assert.equal(captions[0].caption, "Full first caption.\n\n#VidaPay #3SVerse");
assert.match(captions[1].caption, /#LinkedIn #WirelessRetail$/);

const images = [{ name: "day-01.png" }, { name: "day-02.jpg" }];
const videos = [{ name: "3SVerse-Reel-01.mp4" }, { name: "3SVerse-Reel-02.mp4" }];
assert.deepEqual(buildQueue(captions, images, videos, { image: true, video: false }).map(item => `${item.day}:${item.type}`), ["1:image", "2:image"]);
assert.deepEqual(buildQueue(captions, images, videos, { image: true, video: true }, 2).map(item => `${item.day}:${item.type}`), ["2:image", "2:video"]);
console.log("LinkedIn campaign parser and queue tests passed.");
