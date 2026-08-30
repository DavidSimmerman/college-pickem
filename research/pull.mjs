// Pull a full past FBS season: games + final scores + closing spread/moneyline.
import { writeFileSync } from 'node:fs';

const YEAR = Number(process.argv[2] ?? 2025);
const SB = 'https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard';
const CORE = 'https://sports.core.api.espn.com/v2/sports/football/leagues/college-football';

const j = async (u) => {
	for (let i = 0; i < 3; i++) {
		try {
			const r = await fetch(u, { signal: AbortSignal.timeout(25000) });
			if (r.ok) return await r.json();
		} catch {}
		await new Promise((r) => setTimeout(r, 400 * (i + 1)));
	}
	return null;
};

// 1) every completed regular-season game
const games = [];
for (let wk = 1; wk <= 16; wk++) {
	const d = await j(`${SB}?groups=80&limit=400&dates=${YEAR}&seasontype=2&week=${wk}`);
	for (const e of d?.events ?? []) {
		const c = e.competitions?.[0];
		if (c?.status?.type?.state !== 'post') continue;
		const h = c.competitors.find((x) => x.homeAway === 'home');
		const a = c.competitors.find((x) => x.homeAway === 'away');
		if (!h || !a) continue;
		games.push({
			id: e.id, week: wk,
			home: h.team.abbreviation, away: a.team.abbreviation,
			hs: Number(h.score), as: Number(a.score)
		});
	}
	process.stderr.write(`wk${wk}:${games.length} `);
}
process.stderr.write('\n');

// 2) closing line per game, 16 at a time
const num = (v) => {
	if (v === null || v === undefined || v === '') return null;
	const n = Number(String(v).replace('+', ''));
	return Number.isFinite(n) ? n : null;
};
let done = 0;
const queue = [...games];
await Promise.all(
	Array.from({ length: 16 }, async () => {
		while (queue.length) {
			const g = queue.pop();
			const d = await j(`${CORE}/events/${g.id}/competitions/${g.id}/odds`);
			const it = (d?.items ?? []).find((x) => x.provider?.name === 'DraftKings') ?? d?.items?.[0];
			g.spread = num(it?.spread);
			g.mlHome = num(it?.homeTeamOdds?.moneyLine) || null;
			g.mlAway = num(it?.awayTeamOdds?.moneyLine) || null;
			if (++done % 100 === 0) process.stderr.write(`${done} `);
		}
	})
);

const priced = games.filter((g) => g.mlHome && g.mlAway);
writeFileSync(`season-${YEAR}.json`, JSON.stringify(games));
console.log(`\n${YEAR}: ${games.length} final games, ${priced.length} with closing moneylines`);
