(function(root){
  const dayNumber=name=>Number(String(name||"").match(/(?:day|reel)[-_ ]?(\d{1,3})/i)?.[1]||0);
  const clean=value=>String(value||"").replace(/\r/g,"").trim();
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

  function parseCampaign(markdown){
    const entries=[];
    for(const block of String(markdown||"").split(/^## Day\s+/m).slice(1)){
      const newline=block.indexOf("\n");
      const heading=clean(newline<0?block:block.slice(0,newline));
      const day=Number(heading.match(/^(\d{1,3})\b/)?.[1]||0); if(!day)continue;
      const body=platformBody(newline<0?"":block.slice(newline+1),"youtube");
      if(!body.trim())continue;
      const titleLine=body.match(/^\*\*YouTube Title:\*\*\s*(.*)$/im);
      const fallbackTitle=clean(heading.replace(/^\d+\s+[—-]\s*/,"")).slice(0,100)||`3S Verse - Day ${day}`;
      const title=(titleLine&&clean(titleLine[1]).slice(0,100))||fallbackTitle;
      const description=captionText(body.replace(/^\*\*YouTube Title:\*\*.*$/im,"").replace(/^\*\*YouTube Description:\*\*\s*/im,""));
      const tags=[...new Set((description.match(/#[\p{L}\p{N}_-]+/gu)||[]).map(tag=>tag.slice(1)))].join(",");
      entries.push({day,title,description,tags});
    }
    return entries.sort((a,b)=>a.day-b.day);
  }
  function addDays(dateText,amount){const [year,month,day]=String(dateText).split("-").map(Number);const date=new Date(year,month-1,day,12);date.setDate(date.getDate()+amount);const pad=value=>String(value).padStart(2,"0");return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`}
  function buildQueue(entries,videos,startDay=1,startDate="",time="09:00"){const byDay=new Map(videos.map(file=>[dayNumber(file.name),file]).filter(([day])=>day));return entries.filter(entry=>entry.day>=startDay&&byDay.has(entry.day)).map(entry=>({...entry,file:byDay.get(entry.day),date:addDays(startDate,entry.day-startDay),time}))}
  const api={dayNumber,parseCampaign,addDays,buildQueue};root.YouTubeUploaderLib=api;if(typeof module!=="undefined")module.exports=api;
})(typeof globalThis!=="undefined"?globalThis:this);
