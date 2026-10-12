(function(root){
  const dayNumber=name=>Number(String(name||"").match(/(?:day|reel)[-_ ]?(\d{1,3})/i)?.[1]||0);
  const clean=value=>String(value||"").replace(/\r/g,"").trim();
  function parseCampaign(markdown){
    const entries=[];
    for(const block of String(markdown||"").split(/^## Day\s+/m).slice(1)){
      const newline=block.indexOf("\n");
      const heading=clean(newline<0?block:block.slice(0,newline));
      const day=Number(heading.match(/^(\d{1,3})\b/)?.[1]||0); if(!day)continue;
      const body=(newline<0?"":block.slice(newline+1)).split(/^---\s*$/m)[0];
      const description=clean(body.split("\n").filter(line=>{const value=line.trim();return !/^!\[/.test(value)&&!/^\[(?:image|video|reel|creative)/i.test(value)&&!/^\*\*(?:campaign stage|creative hook|cta|image|video|reel):/i.test(value)}).join("\n")).replace(/\n{3,}/g,"\n\n");
      const title=clean(heading.replace(/^\d+\s+[—-]\s*/,"")).slice(0,100)||`3S Verse - Day ${day}`;
      const tags=[...new Set((description.match(/#[\p{L}\p{N}_-]+/gu)||[]).map(tag=>tag.slice(1)))].join(",");
      entries.push({day,title,description,tags});
    }
    return entries.sort((a,b)=>a.day-b.day);
  }
  function addDays(dateText,amount){const [year,month,day]=String(dateText).split("-").map(Number);const date=new Date(year,month-1,day,12);date.setDate(date.getDate()+amount);const pad=value=>String(value).padStart(2,"0");return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`}
  function buildQueue(entries,videos,startDay=1,startDate="",time="09:00"){const byDay=new Map(videos.map(file=>[dayNumber(file.name),file]).filter(([day])=>day));return entries.filter(entry=>entry.day>=startDay&&byDay.has(entry.day)).map(entry=>({...entry,file:byDay.get(entry.day),date:addDays(startDate,entry.day-startDay),time}))}
  const api={dayNumber,parseCampaign,addDays,buildQueue};root.YouTubeUploaderLib=api;if(typeof module!=="undefined")module.exports=api;
})(typeof globalThis!=="undefined"?globalThis:this);
