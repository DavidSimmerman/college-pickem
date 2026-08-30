// Backtest moneyline scoring formulas against real closing lines + real results.
// Goal: find a formula where no volume/selection strategy can farm points,
// but a genuinely better-than-market picker still profits.
import { readFileSync, existsSync } from 'node:fs';

const YEARS = [2025, 2024, 2023].filter((y) => existsSync(`season-${y}.json`));
const games = YEARS.flatMap((y) =>
	JSON.parse(readFileSync(`season-${y}.json`)).map((g) => ({ ...g, year: y }))
).filter((g) => g.mlHome && g.mlAway && Number.isFinite(g.hs) && Number.isFinite(g.as));

// deterministic RNG so runs are reproducible
let seed = 12345;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

const mult = (a) => (a > 0 ? a / 100 : 100 / -a);
const impliedRaw = (a) => (a > 0 ? 100 / (a + 100) : -a / (-a + 100));

/** Vig-free implied probability for the home side. */
function fairP(g) {
	const h = impliedRaw(g.mlHome), a = impliedRaw(g.mlAway);
	return h / (h + a);
}

// ---------- formulas: (odds, pFairForPickedSide) -> {win, lose} ----------
const FORMULAS = {
	'A. current (win=b, lose=-1/b, capped 25/10)': (o) => ({
		win: Math.min(mult(o), 25),
		lose: -Math.min(1 / mult(o), 10)
	}),
	'B. current uncapped': (o) => ({ win: mult(o), lose: -1 / mult(o) }),
	'C. flat risk (win=b, lose=-1)': (o) => ({ win: mult(o), lose: -1 }),
	'D. probability (win=10(1-p), lose=-10p)': (o, p) => ({ win: 10 * (1 - p), lose: -10 * p })
};

// ---------- strategies: pick a side, or null to skip ----------
const dogSide = (g) => (g.mlHome > 0 ? 'home' : 'away');
const favSide = (g) => (g.mlHome < 0 ? 'home' : 'away');
const dogOdds = (g) => Math.max(g.mlHome, g.mlAway);
const favOdds = (g) => Math.min(g.mlHome, g.mlAway);

const STRATEGIES = {
	'every underdog': (g) => dogSide(g),
	'dogs +500 or longer': (g) => (dogOdds(g) >= 500 ? dogSide(g) : null),
	'dogs +1500 or longer': (g) => (dogOdds(g) >= 1500 ? dogSide(g) : null),
	'every favorite': (g) => favSide(g),
	'heavy favs -500 or worse': (g) => (favOdds(g) <= -500 ? favSide(g) : null),
	'near coinflips only': (g) => (Math.abs(g.mlHome) <= 150 ? (rnd() < 0.5 ? 'home' : 'away') : null),
	'always home': () => 'home',
	'random side': () => (rnd() < 0.5 ? 'home' : 'away'),
	'*SKILL 55% winner-picker': (g) => {
		const w = g.hs > g.as ? 'home' : 'away';
		const l = w === 'home' ? 'away' : 'home';
		return rnd() < 0.55 ? w : l;
	},
	'*SKILL beats market by 3%': (g) => {
		// nudges the market probability 3 points toward the true outcome, then picks favourably
		const p = fairP(g);
		const homeWon = g.hs > g.as;
		const edge = homeWon ? Math.min(0.99, p + 0.03) : Math.max(0.01, p - 0.03);
		return rnd() < edge ? 'home' : 'away';
	}
};

function run(formulaName, strategyName) {
	const f = FORMULAS[formulaName], s = STRATEGIES[strategyName];
	let pts = 0, n = 0, hits = 0;
	for (const g of games) {
		const side = s(g);
		if (!side) continue;
		if (g.hs === g.as) continue;
		const odds = side === 'home' ? g.mlHome : g.mlAway;
		const p = side === 'home' ? fairP(g) : 1 - fairP(g);
		const won = (side === 'home') === g.hs > g.as;
		const { win, lose } = f(odds, p);
		pts += won ? win : lose;
		n++;
		if (won) hits++;
	}
	return { pts, n, hits, per: n ? pts / n : 0, rate: n ? hits / n : 0 };
}

console.log(`\n${games.length} real games with closing moneylines (${YEARS.join(', ')})\n`);
for (const fname of Object.keys(FORMULAS)) {
	console.log('═'.repeat(78));
	console.log(fname);
	console.log('  strategy                        picks   hit%    total pts    pts/pick');
	const rows = [];
	for (const sname of Object.keys(STRATEGIES)) {
		seed = 12345; // same draws for every formula
		const r = run(fname, sname);
		rows.push([sname, r]);
		console.log(
			'  ' + sname.padEnd(30) +
			String(r.n).padStart(5) +
			(r.rate * 100).toFixed(1).padStart(7) + '%' +
			r.pts.toFixed(1).padStart(12) +
			(r.per >= 0 ? '+' : '') + r.per.toFixed(3).padStart(11)
		);
	}
	const nonSkill = rows.filter(([n]) => !n.startsWith('*'));
	const skill = rows.filter(([n]) => n.startsWith('*'));
	const worstAbuse = Math.max(...nonSkill.map(([, r]) => r.per));
	const bestSkill = Math.max(...skill.map(([, r]) => r.per));
	console.log(
		`  → best no-skill strategy: ${worstAbuse >= 0 ? '+' : ''}${worstAbuse.toFixed(3)}/pick` +
		`   |   skill edge: +${bestSkill.toFixed(3)}/pick` +
		`   |   ${Math.abs(worstAbuse) < 0.05 ? 'NO CHEESE ✓' : 'EXPLOITABLE ✗'}`
	);
}
