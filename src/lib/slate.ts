// "Games of the Week" — the ten games the show would actually go to.
//
// ESPN's GameDay crew makes an editorial call, not a calculation, but the thing they
// optimise for is consistent enough to model: a close game between two teams worth
// watching, with a strong bias toward the power conferences. This ranks the week's
// slate the same way.
//
// The one structural trap is worth spelling out, because the obvious model falls
// straight into it. If quality and closeness are *added*, a #1 team's rating alone
// outweighs the entire closeness term and Ball State at Ohio State (-50.5) lands sixth.
// GameDay would never go to that game. So quality here is carried mostly by the WEAKER
// team, and closeness MULTIPLIES rather than adds — a blowout keeps only a quarter of
// its marquee value no matter whose name is on it.

import { CONFERENCES } from './conferences.ts';
import { mlDead } from './scoring.ts';

const POWER = new Set(['SEC', 'Big Ten', 'Big 12', 'ACC', 'FBS Independents']);
const MID = new Set(['American', 'Mountain West', 'Sun Belt', 'MAC', 'CUSA', 'Pac-12']);

/** How many games are on the board each week. One constant: week 1 is the thinnest
 *  slate of the season, and a November Saturday could justify more. */
export const SLATE_SIZE = 10;

/** At least this many pure mid-major games are guaranteed a spot. */
export const MID_MAJOR_LOCK = 1;

/** Spreads at or beyond this are treated as equally uncompetitive. */
const BLOWOUT = 21;

export type SlateGame = {
	id: string;
	spread: number | null;
	ml_home: number | null;
	ml_away: number | null;
	home_rank: number | null;
	away_rank: number | null;
	home_conf: number | null;
	away_conf: number | null;
};

export type Tier = 'power' | 'mixed' | 'mid' | 'other';

const league = (conf: number | null): string | undefined => CONFERENCES[conf as number];

/** What one team brings. A ranked team is worth far more than any unranked one, and
 *  an unranked team is worth whatever its league is worth. */
function teamValue(rank: number | null, conf: number | null): number {
	const c = league(conf);
	if (rank !== null && rank > 0 && rank < 26) return 1 + (26 - rank) / 25;
	return POWER.has(c!) ? 0.4 : MID.has(c!) ? 0.15 : 0.02; // 0.02 = FCS / unaffiliated
}

export function tierOf(g: SlateGame): Tier {
	const [h, a] = [league(g.home_conf), league(g.away_conf)];
	if (!h || !a) return 'other';
	if (POWER.has(h) && POWER.has(a)) return 'power';
	if (MID.has(h) && MID.has(a)) return 'mid';
	return 'mixed';
}

/** 0 (a 21+ point mismatch) to 1 (a pick'em). */
function closeness(spread: number | null): number {
	if (spread === null) return 0.15; // no line yet: assume nothing, rank it low
	return 1 - Math.min(Math.abs(spread), BLOWOUT) / BLOWOUT;
}

/** How much the show would want this game. Higher is better. */
export function slateScore(g: SlateGame): number {
	const [h, a] = [teamValue(g.home_rank, g.home_conf), teamValue(g.away_rank, g.away_conf)];
	// The weaker side carries most of the weight: two good teams beat one great team
	// and a cupcake, which is the whole difference between this and a power ranking.
	const quality = 0.7 * Math.min(h, a) + 0.3 * ((h + a) / 2);
	return quality * (0.25 + 0.75 * closeness(g.spread));
}

/**
 * The week's slate, best first. A game is only eligible if BOTH sides are live. No
 * moneyline means we cannot tell how lopsided it is; a side priced near-certain means
 * everyone picks it and everyone banks the same win, which decides nothing. Neither is
 * a decision, and ten forced non-decisions is not a contest. (Miami -3200 at Stanford
 * cleared the ranking on Miami's name alone and would have burned a slot on a game
 * nobody could get wrong.)
 *
 * The mid-major lock runs after the ranking: if the top N is all power conferences,
 * the best pure mid-major game displaces the weakest game in it. Otherwise the MAC
 * and the Sun Belt never appear, because the ranking is built to prefer the SEC.
 */
export function buildSlate(games: SlateGame[], size = SLATE_SIZE): SlateGame[] {
	const eligible = games
		.filter((g) => !mlDead(g.ml_home) && !mlDead(g.ml_away))
		.map((g) => ({ g, score: slateScore(g) }))
		.sort((x, z) => z.score - x.score);

	const chosen = eligible.slice(0, size);
	let mids = chosen.filter((c) => tierOf(c.g) === 'mid').length;

	for (const cand of eligible.slice(size)) {
		if (mids >= MID_MAJOR_LOCK) break;
		if (tierOf(cand.g) !== 'mid') continue;
		// Drop the weakest game that is not itself the reason we are here.
		const drop = chosen.map((c, i) => [c, i] as const).filter(([c]) => tierOf(c.g) !== 'mid').pop();
		if (!drop) break;
		chosen[drop[1]] = cand;
		mids++;
	}

	return chosen.sort((x, z) => z.score - x.score).map((c) => c.g);
}

/* ponytail: one assert-based self-check instead of a test framework.
   Run with `node --experimental-strip-types src/lib/slate.ts`. */
export async function selfTest() {
	const a: typeof import('node:assert').strict = (await import('node:assert')).strict;
	let n = 0;
	const g = (o: Partial<SlateGame>): SlateGame => ({
		id: `g${++n}`, spread: 0, ml_home: -110, ml_away: -110,
		home_rank: null, away_rank: null, home_conf: 8, away_conf: 8, ...o
	});
	const SEC = 8, MAC = 15, FCS = null;

	// The trap this module exists to avoid: #1 vs a cupcake must lose to a good even game.
	const cupcake = g({ home_rank: 1, away_conf: FCS, spread: -50.5 });
	const even = g({ spread: 0 });
	a.ok(slateScore(even) > slateScore(cupcake), 'a close power game beats #1 vs an FCS team');

	// Quality still breaks ties between two equally close games.
	const ranked = g({ home_rank: 5, away_rank: 8, spread: -3 });
	const midMajor = g({ home_conf: MAC, away_conf: MAC, spread: -3 });
	a.ok(slateScore(ranked) > slateScore(midMajor), 'ranked teams outrank a mid-major of the same closeness');
	// ...which is exactly why the lock has to exist.
	const board = [ranked, g({ spread: -1 }), g({ spread: -2 }), midMajor];
	a.ok(buildSlate(board, 3).some((x) => x.id === midMajor.id), 'the mid-major lock forces one in');
	a.equal(buildSlate(board, 3).length, 3, 'the lock displaces rather than growing the board');

	// Ineligible games never make a card: they are not decisions.
	const noLine = g({ ml_home: null, ml_away: null, spread: 0 });
	const oneSided = g({ ml_home: -100000, ml_away: 5000, spread: 0 });
	const fine = g({ spread: -3 });
	const built = buildSlate([noLine, oneSided, fine], 3);
	a.deepEqual(built.map((x) => x.id), [fine.id], 'no-line and foregone games are excluded');

	// Ordering is by score, best first, and stable across calls.
	const many = [g({ spread: -20 }), g({ spread: -1 }), g({ spread: -10 })];
	const order = buildSlate(many, 3).map((x) => x.id);
	a.deepEqual(order, buildSlate(many, 3).map((x) => x.id), 'the same input gives the same card');
	a.equal(order[0], many[1].id, 'the closest game leads the board');

	a.equal(tierOf(g({ home_conf: SEC, away_conf: MAC })), 'mixed');
	a.equal(tierOf(g({ home_conf: MAC, away_conf: MAC })), 'mid');
	a.equal(tierOf(g({ home_conf: SEC, away_conf: FCS })), 'other');

	console.log('slate self-test OK');
}

// node-only: this module is also imported by the browser, where `process` is undefined.
if (typeof process !== 'undefined' && process.argv?.[1]?.endsWith('slate.ts')) selfTest();
