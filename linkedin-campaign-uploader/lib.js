(function (root) {
  function dayNumber(name) {
    return Number(String(name || "").match(/(?:day|reel)[-_ ]?(\d{1,2})/i)?.[1] || 0);
  }

  function parseCampaign(markdown) {
    const entries = [];
    const blocks = String(markdown || "").split(/^## Day\s+/m).slice(1);
    for (const block of blocks) {
      const firstLineEnd = block.indexOf("\n");
      const heading = (firstLineEnd >= 0 ? block.slice(0, firstLineEnd) : block).trim();
      const day = Number(heading.match(/^(\d{1,2})\b/)?.[1] || 0);
      if (!day) continue;
      const raw = (firstLineEnd >= 0 ? block.slice(firstLineEnd + 1) : "").split(/^---\s*$/m)[0];
      const caption = raw.split(/\r?\n/).filter(line => {
        const value = line.trim();
        return !/^!\[/.test(value)
          && !/^\[(?:image|video|reel|creative)/i.test(value)
          && !/^\*\*(?:campaign stage|creative hook|cta|image|video|reel):/i.test(value);
      }).join("\n").trim().replace(/\n{3,}/g, "\n\n");
      if (caption) entries.push({ day, heading: heading.replace(/^\d+\s+[—-]\s*/, ""), caption });
    }
    return entries.sort((a, b) => a.day - b.day);
  }

  function buildQueue(captions, images, videos, selectedTypes, startAtDay = 1) {
    const imageByDay = new Map(images.map(file => [dayNumber(file.name), file]).filter(([day]) => day));
    const videoByDay = new Map(videos.map(file => [dayNumber(file.name), file]).filter(([day]) => day));
    const queue = [];
    for (const entry of captions) {
      if (entry.day < startAtDay) continue;
      if (selectedTypes.image && imageByDay.has(entry.day)) queue.push({ ...entry, type: "image", file: imageByDay.get(entry.day) });
      if (selectedTypes.video && videoByDay.has(entry.day)) queue.push({ ...entry, type: "video", file: videoByDay.get(entry.day) });
    }
    return queue;
  }

  const api = { dayNumber, parseCampaign, buildQueue };
  root.LinkedInUploaderLib = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
