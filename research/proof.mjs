import { readFileSync, existsSync } from 'node:fs';
const YEARS=[2025,2024,2023].filter(y=>existsSync(`season-${y}.json`));
const all=YEARS.flatMap(y=>JSON.parse(readFileSync(`season-${y}.json`)))
  .filter(g=>g.mlHome&&g.mlAway&&Number.isFinite(g.hs)&&Number.isFinite(g.as)&&g.hs!==g.as);
const mult=a=>a>0?a/100:100/-a;

console.log('UNIQUENESS: if the win side must stay as approved (win = b), what loss is fair?');
console.log('  EV = p*b - (1-p)*L = 0,  and b = (1-p)/p  =>  L = p*b/(1-p) = 1  exactly.');
console.log('  So keeping "+350 pays 3.50" forces "loses cost 1.00". No other choice is neutral.\n');

console.log('How often do extreme longshots actually cash? (the lottery-ticket risk)\n');
console.log(' dog price      picks    won    win%   biggest single payout');
for(const [lo,hi] of [[100,300],[300,600],[600,1200],[1200,2500],[2500,1e9]]){
  const set=all.filter(g=>{const d=Math.max(g.mlHome,g.mlAway);return d>=lo&&d<hi;});
  let w=0,best=0;
  for(const g of set){
    const side=g.mlHome>0?'home':'away';
    const won=(side==='home')===(g.hs>g.as);
    if(won){w++;best=Math.max(best,mult(side==='home'?g.mlHome:g.mlAway));}
  }
  console.log(`+${lo}`.padEnd(6)+`to +${hi>1e8?'∞':hi}`.padEnd(9)+String(set.length).padStart(7)+
    String(w).padStart(7)+(set.length?(w/set.length*100).toFixed(1):'0').padStart(7)+'%'+
    (best?('+'+best.toFixed(2)):'—').padStart(12));
}
console.log('\n→ a single +2500-or-longer hit would pay more than a whole season of good picking.');
console.log('   That is pure variance, not skill: capping the payout removes the lottery.\n');

// final candidate: flat risk, payout capped
const CAP=Number(process.env.CAP||15);
const impliedRaw=a=>a>0?100/(a+100):-a/(-a+100);
let seed=99;const rnd=()=>((seed=(seed*1103515245+12345)&0x7fffffff)/0x7fffffff);
const S={
 'every underdog':g=>g.mlHome>0?'home':'away',
 'dogs +500 or longer':g=>Math.max(g.mlHome,g.mlAway)>=500?(g.mlHome>0?'home':'away'):null,
 'dogs +1500 or longer':g=>Math.max(g.mlHome,g.mlAway)>=1500?(g.mlHome>0?'home':'away'):null,
 'every favorite':g=>g.mlHome<0?'home':'away',
 'heavy favs -500 or worse':g=>Math.min(g.mlHome,g.mlAway)<=-500?(g.mlHome<0?'home':'away'):null,
 'always home':()=>'home',
 'random side':()=>rnd()<0.5?'home':'away',
 '*SKILL beats market by 3%':g=>{const h=impliedRaw(g.mlHome),a=impliedRaw(g.mlAway);const p=h/(h+a);
   const e=g.hs>g.as?Math.min(.99,p+.03):Math.max(.01,p-.03);return rnd()<e?'home':'away';}
};
console.log(`FINAL CANDIDATE — flat risk, payout capped at +${CAP}:  win = min(b, ${CAP}),  lose = -1.00\n`);
console.log('  strategy                        picks   hit%   season pts/yr   pts/pick');
for(const [n,f] of Object.entries(S)){
  seed=99;let pts=0,k=0,w=0;
  for(const g of all){const side=f(g);if(!side)continue;
    const o=side==='home'?g.mlHome:g.mlAway;
    const won=(side==='home')===(g.hs>g.as);
    pts+=won?Math.min(mult(o),CAP):-1;k++;if(won)w++;}
  console.log('  '+n.padEnd(30)+String(k).padStart(5)+(w/k*100).toFixed(1).padStart(7)+'%'+
    (pts/YEARS.length>=0?'+':'')+(pts/YEARS.length).toFixed(1).padStart(13)+
    (pts/k>=0?'+':'')+(pts/k).toFixed(3).padStart(11));
}
