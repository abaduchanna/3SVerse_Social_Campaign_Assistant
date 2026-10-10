(function (root) {
  function dayNumber(name) {
    return Number(String(name || "").match(/(?:day|reel)[-_ ]?(\d{1,2})/i)?.[1] || 0);
  }

  function parseLinkedInCampaign(markdown) {
    const entries = [];
    const blocks = String(markdown || "").split(/^## Day\s+/m).slice(1);
    for (const block of blocks) {
      const firstLineEnd = block.indexOf("\n");
      const heading = firstLineEnd >= 0 ? block.slice(0, firstLineEnd).trim() : block.trim();
      const day = Number(heading.match(/^(\d{1,2})\b/)?.[1] || 0);
      if (!day) continue;
      const raw = (firstLineEnd >= 0 ? block.slice(firstLineEnd + 1) : "").split(/^---\s*$/m)[0];
      const lines = raw.split(/\r?\n/).filter(line => {
        const trimmed = line.trim();
        return !/^!\[/.test(trimmed)
          && !/^\*\*(Campaign stage|Creative hook|CTA):/i.test(trimmed);
      });
      const caption = lines.join("\n").trim().replace(/\n{3,}/g, "\n\n");
      if (caption) entries.push({ day, heading: heading.replace(/^\d+\s+[—-]\s*/, ""), caption });
    }
    return entries.sort((a, b) => a.day - b.day);
  }

  function addDays(dateText, amount) {
    const [year, month, day] = dateText.split("-").map(Number);
    const date = new Date(year, month - 1, day, 12, 0, 0);
    date.setDate(date.getDate() + amount);
    const pad = value => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function buildQueue(captions, mediaFiles, imageFiles, startDate, time, selectedTypes, firstDayTime = "", startAtDay = 1) {
    const mediaByDay = new Map(mediaFiles.map(file => [dayNumber(file.name), file]).filter(([day]) => day));
    const imageByDay = new Map(imageFiles.map(file => [dayNumber(file.name), file]).filter(([day]) => day));
    const queue = [];
    for (const entry of captions) {
      if (entry.day < startAtDay) continue;
      const date = addDays(startDate, entry.day - 1);
      const itemTime = entry.day === 1 && firstDayTime ? firstDayTime : time;
      if (selectedTypes.reel && mediaByDay.has(entry.day)) {
        queue.push({ ...entry, type: "reel", file: mediaByDay.get(entry.day), date, time: itemTime });
      }
      if (selectedTypes.post && imageByDay.has(entry.day)) {
        queue.push({ ...entry, type: "post", file: imageByDay.get(entry.day), date, time: itemTime });
      }
      if (selectedTypes.story) {
        const file = imageByDay.get(entry.day) || mediaByDay.get(entry.day);
        if (file) queue.push({ ...entry, type: "story", file, date, time: itemTime });
      }
    }
    return queue;
  }

  const api = { dayNumber, parseLinkedInCampaign, addDays, buildQueue };
  root.MetaSchedulerLib = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
