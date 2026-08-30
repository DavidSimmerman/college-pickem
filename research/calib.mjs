import { readFileSync, existsSync } from 'node:fs';
const YEARS=[2025,2024,2023].filter(y=>existsSync(`season-${y}.json`));
const games=YEARS.flatMap(y=>JSON.parse(readFileSync(`season-${y}.json`)))
  .filter(g=>g.mlHome&&g.mlAway&&Number.isFinite(g.hs)&&Number.isFinite(g.as)&&g.hs!==g.as);
const impliedRaw=a=>a>0?100/(a+100):-a/(-a+100);
const fairP=g=>{const h=impliedRaw(g.mlHome),a=impliedRaw(g.mlAway);return h/(h+a);};

console.log('Are ESPN/DraftKings closing moneylines well calibrated?');
console.log('(every game contributes its FAVOURITE side)\n');
console.log('implied p bucket    games   market says   actually won    gap');
const buckets=[[.5,.6],[.6,.7],[.7,.8],[.8,.9],[.9,.95],[.95,.99],[.99,1.01]];
let totGap=0,totN=0;
for(const [lo,hi] of buckets){
  let n=0,sump=0,w=0;
  for(const g of games){
    const ph=fairP(g); const p=Math.max(ph,1-ph);
    if(p<lo||p>=hi) continue;
    const side=ph>=0.5?'home':'away';
    const won=(side==='home')===(g.hs>g.as);
    n++;sump+=p;if(won)w++;
  }
  if(!n) continue;
  const exp=sump/n, act=w/n;
  totGap+=(act-exp)*n; totN+=n;
  console.log(`${(lo*100).toFixed(0)}-${(hi*100).toFixed(0)}%`.padEnd(20)+String(n).padStart(5)+
    (exp*100).toFixed(1).padStart(13)+'%'+(act*100).toFixed(1).padStart(14)+'%'+
    ((act-exp)>=0?'+':'')+((act-exp)*100).toFixed(1).padStart(7)+'pp');
}
console.log('\noverall favourite-side gap:', (totGap/totN*100).toFixed(2)+'pp');
// home bias
let hn=0,hw=0,hp=0;
for(const g of games){hn++;hp+=fairP(g);if(g.hs>g.as)hw++;}
console.log(`home teams: market ${(hp/hn*100).toFixed(1)}%  actual ${(hw/hn*100).toFixed(1)}%  gap ${((hw/hn-hp/hn)*100).toFixed(2)}pp`);
// how extreme do the prices get?
const ext=games.map(g=>Math.min(g.mlHome,g.mlAway)).sort((a,b)=>a-b);
console.log(`steepest favourite prices: ${ext.slice(0,5).join(', ')}`);
console.log(`games with a favourite steeper than -2000: ${ext.filter(x=>x<-2000).length}`);
