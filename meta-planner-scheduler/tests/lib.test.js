const assert = require("node:assert/strict");
const { dayNumber, parseLinkedInCampaign, addDays, buildQueue } = require("../lib.js");

const markdown = `# Campaign

## Day 1 — Test date

![Day 1](images/day-01.png)

**Campaign stage:** Awareness
**Creative hook:** Hook one
**CTA:** Visit 3sverse.com

First paragraph.

Second paragraph.

#VidaPay #3SVerse

---

## Day 2 — Test date

**Campaign stage:** Trust
**Creative hook:** Hook two
**CTA:** Start free

Day two body.

#WirelessRetail
`;

const entries = parseLinkedInCampaign(markdown);
assert.equal(entries.length, 2);
assert.equal(entries[0].day, 1);
assert.equal(entries[0].heading, "Test date");
assert.equal(entries[0].caption, "First paragraph.\n\nSecond paragraph.\n\n#VidaPay #3SVerse");
assert.equal(dayNumber("3SVerse-Reel-09.mp4"), 9);
assert.equal(dayNumber("day-30.png"), 30);
assert.equal(addDays("2026-10-10", 22), "2026-11-01");

const file = name => ({ name });
const queue = buildQueue(entries, [file("3SVerse-Reel-01.mp4"), file("3SVerse-Reel-02.mp4")], [file("day-01.png")], "2026-10-10", "09:00", { reel: true, post: true, story: false });
assert.equal(queue.length, 3);
assert.deepEqual(queue.map(item => `${item.day}:${item.type}:${item.date}`), [
  "1:reel:2026-10-10", "1:post:2026-10-10", "2:reel:2026-10-11"
]);

process.stdout.write("meta scheduler library test passed\n");
