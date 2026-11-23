(function (root) {
  function dayNumber(name) {
    return Number(String(name || "").match(/(?:day|reel)[-_ ]?(\d{1,2})/i)?.[1] || 0);
  }

  function platformSection(body, platform) {
    const lines = String(body || "").split(/\r?\n/);
    const start = lines.findIndex(line => {
      const heading = line.match(/^###\s+(.+?)\s*$/);
      return heading && heading[1].trim().toLowerCase() === platform;
    });
    if (start < 0) return null;
    const out = [];
    for (const line of lines.slice(start + 1)) {
      if (/^###\s/.test(line) || /^---\s*$/.test(line.trim())) break;
      out.push(line);
    }
    return out.join("\n");
  }
  // Text for one platform. Blocks with ### platform headings never fall back to other platforms' text.
  function platformBody(block, platform) {
    const section = platformSection(block, platform);
    if (section !== null) return section;
    if (/^###\s/m.test(block)) return "";
    return block.split(/^---\s*$/m)[0];
  }
  function captionText(text) {
    return String(text || "").split(/\r?\n/).filter(line => {
      const value = line.trim();
      return !/^!\[/.test(value)
        && !/^\[(?:image|video|reel|creative)/i.test(value)
        && !/^\[[^\]]*\]\((?:videos|images)\//i.test(value)
        && !/^\*\*(?:campaign stage|creative hook|cta|image|video|reel):/i.test(value);
    }).join("\n").trim().replace(/\n{3,}/g, "\n\n");
  }

  function parseCampaign(markdown) {
    const entries = [];
    const blocks = String(markdown || "").split(/^## Day\s+/m).slice(1);
    for (const block of blocks) {
      const firstLineEnd = block.indexOf("\n");
      const heading = (firstLineEnd >= 0 ? block.slice(0, firstLineEnd) : block).trim();
      const day = Number(heading.match(/^(\d{1,2})\b/)?.[1] || 0);
      if (!day) continue;
      const caption = captionText(platformBody(firstLineEnd >= 0 ? block.slice(firstLineEnd + 1) : "", "linkedin"));
      if (caption) entries.push({ day, heading: heading.replace(/^\d+\s+[—-]\s*/, ""), caption });
    }
    return entries.sort((a, b) => a.day - b.day);
  }

  function addDays(dateText, amount) {
    const [year, month, day] = String(dateText).split("-").map(Number);
    const date = new Date(year, month - 1, day, 12, 0, 0);
    date.setDate(date.getDate() + amount);
    const pad = value => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function buildQueue(captions, images, videos, selectedTypes, startAtDay = 1, startDate = "", time = "09:00") {
    const imageByDay = new Map(images.map(file => [dayNumber(file.name), file]).filter(([day]) => day));
    const videoByDay = new Map(videos.map(file => [dayNumber(file.name), file]).filter(([day]) => day));
    const queue = [];
    for (const entry of captions) {
      if (entry.day < startAtDay) continue;
      const type = selectedTypes.video ? "video" : "image";
      const file = type === "video" ? videoByDay.get(entry.day) : imageByDay.get(entry.day);
      if (file) queue.push({ ...entry, type, file, date: addDays(startDate, entry.day - startAtDay), time });
    }
    return queue;
  }

  const api = { dayNumber, parseCampaign, addDays, buildQueue };
  root.LinkedInUploaderLib = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
