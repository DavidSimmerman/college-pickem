// Scoring rules, shared by client and server. See selfTest() at the bottom.

/** Decimal-odds profit multiple for American odds. -200 -> 0.5, +150 -> 1.5 */
export const mult = (american: number) => (american > 0 ? american / 100 : 100 / -american);

/**
 * Moneyline points — "flat risk", the only farm-proof shape.
 *
 *   win  = the odds multiple x SCALE, capped at MAX_WIN  (a +350 dog pays 35)
 *   lose = exactly RISK, always
 *
 * Why the loss has to be flat: if a hit pays the odds multiple b, the only loss
 * that makes a pick break even against a fair line is
 *     EV = p·b − (1−p)·L = 0,  with b = (1−p)/p   ⇒   L = 1  (scaled: L = RISK)
 * Charging heavy favourites more when they fold (the tempting −1/b rule) makes
 * every underdog strictly +EV, so "take every longshot every week" farms points
 * with no skill at all. Backtested over 2,316 real games with real closing lines
 * (2023-25): under this rule every no-skill strategy lands at or below zero and
 * only beating the market pays.
 *
 * Heavy favourites are still punished — through the ratio, not the penalty.
 * A -400 favourite risks 10 points to win 3, so it has to hit 80% of the time just
 * to break even. Chasing chalk still bleeds you dry.
 *
 * MAX_WIN caps the lottery: an uncapped +5000 cupcake would pay 500 points and
 * decide the season on a single fluke.
 *
 * Points are whole numbers. That is why RISK is 10 rather than 1: at a risk of one
 * point, rounding flattens the board — every favourite shorter than -200 collapses to
 * zero (60 of 134 pickable sides on a real week) and a pick'em is worth the same as a
 * -180 favourite. Charging ten points per miss keeps a full point of resolution where
 * it matters while every displayed number stays an integer.
 */
export const SCALE = 10;
export const MAX_WIN = 15 * SCALE;
export const RISK = 1 * SCALE;

export const mlWin = (american: number) => Math.min(Math.round(mult(american) * SCALE), MAX_WIN);
export const mlLose = (_american?: number) => -RISK;

/**
 * A side so heavily favoured that a correct pick pays nothing: it can only cost you
 * points. There is no decision in taking it, so the UI refuses the pick rather than
 * letting someone hand back a point for nothing.
 */
export const mlDead = (american: number | null): boolean => american === null || mlWin(american) === 0;

export type Outcome = 'win' | 'loss' | 'push' | 'pending';
export type Side = 'home' | 'away';

/**
 * ESPN's `spread` is home-relative: -4.5 means the home team is laying 4.5.
 * Home covers when (homeScore - awayScore) + spread > 0.
 */
export function gradeSpread(
	pick: Side,
	spread: number | null,
	homeScore: number | null,
	awayScore: number | null
): Outcome {
	if (spread === null || homeScore === null || awayScore === null) return 'pending';
	const edge = homeScore - awayScore + spread;
	const mine = pick === 'home' ? edge : -edge;
	return mine > 0 ? 'win' : mine < 0 ? 'loss' : 'push';
}

export function gradeMl(pick: Side, homeScore: number | null, awayScore: number | null): Outcome {
	if (homeScore === null || awayScore === null) return 'pending';
	if (homeScore === awayScore) return 'push';
	const winner: Side = homeScore > awayScore ? 'home' : 'away';
	return pick === winner ? 'win' : 'loss';
}

/** Points earned for a graded moneyline pick at the price that was locked in. */
export function mlPoints(outcome: Outcome, american: number | null): number {
	if (american === null || outcome === 'pending' || outcome === 'push') return 0;
	return outcome === 'win' ? mlWin(american) : mlLose(american);
}

/** "-4.5" / "+3" from a given side's perspective. */
export function lineFor(spread: number | null, side: Side): string {
	if (spread === null) return '—';
	const s = side === 'home' ? spread : -spread;
	return (s > 0 ? '+' : '') + s;
}

export const fmtOdds = (a: number) => (a > 0 ? '+' : '') + a;
export const fmtPts = (n: number) => (n > 0 ? '+' : '') + n;

/* ponytail: one assert-based self-check instead of a test framework.
   Run with `node --experimental-strip-types src/lib/scoring.ts`. */
export async function selfTest() {
	// Annotated rather than destructured: TypeScript only accepts calls to an assertion
	// function through a name with an explicit type, and every a.equal() below is one.
	const a: typeof import('node:assert').strict = (await import('node:assert')).strict;
	const near = (x: number, y: number, m = '') => a.ok(Math.abs(x - y) < 1e-9, `${m} ${x} != ${y}`);

	// payout shape: the win scales with the upset, a miss always costs the same
	near(mlWin(350), 35, 'dog win pays the odds');
	near(mlWin(-400), 3, 'chalk win is thin');
	near(mlWin(100), 10, 'pick-em pays even');
	near(mlLose(350), -10, 'every miss costs exactly RISK');
	near(mlLose(-400), -10);
	near(mlLose(-9000), -10, 'even a blown cupcake chalk costs only RISK');

	// every payout is a whole number, which is the point of the scale
	for (const odds of [-9000, -400, -298, -110, 100, 240, 350, 5000])
		a.ok(Number.isInteger(mlWin(odds)), `mlWin(${odds}) must be a whole number`);
	a.ok(Number.isInteger(mlLose()), 'mlLose must be a whole number');

	// dead sides: paying nothing for a correct pick is pure downside, so they are
	// not offered at all.
	a.equal(mlDead(-100000), true, 'a -100000 chalk pays nothing');
	a.equal(mlDead(-2500), true);
	a.equal(mlDead(-200), false, 'the shortest price still worth a point stays live');
	a.equal(mlDead(-110), false);
	a.equal(mlDead(5000), false);
	a.equal(mlDead(null), true, 'no line at all is not pickable');

	// The farm-proof property survives the rounding: against a fair line every pick is
	// worth zero up to the half-point the rounding can move it, so no odds range can be
	// farmed for points without beating the market.
	for (const odds of [-9000, -450, -200, -110, 120, 350, 900, 2500]) {
		const b = mult(odds);
		const p = 1 / (b + 1); // fair win probability implied by that price
		const ev = p * mlWin(odds) + (1 - p) * mlLose(odds);
		if (b * SCALE <= MAX_WIN) a.ok(Math.abs(ev) <= 0.5, `odds ${odds} must be EV-neutral: ${ev}`);
		else a.ok(ev < 0, `capped longshot ${odds} must not be +EV`);
	}

	// lottery cap
	near(mlWin(20000), MAX_WIN, 'longshot payout is capped');
	near(mlWin(1500), MAX_WIN, 'cap boundary');
	near(mlWin(1400), 140, 'just inside the cap is exact');

	// spread grading: home -4.5, home wins by 7 -> home covers
	a.equal(gradeSpread('home', -4.5, 28, 21), 'win');
	a.equal(gradeSpread('away', -4.5, 28, 21), 'loss');
	// home -4.5, home wins by 3 -> away covers
	a.equal(gradeSpread('home', -4.5, 24, 21), 'loss');
	a.equal(gradeSpread('away', -4.5, 24, 21), 'win');
	// exact push on a whole number
	a.equal(gradeSpread('home', -7, 28, 21), 'push');
	a.equal(gradeSpread('away', -7, 28, 21), 'push');
	// away favored: spread +3 means home getting 3; away wins by 10 -> away covers
	a.equal(gradeSpread('away', 3, 14, 24), 'win');
	a.equal(gradeSpread('home', 3, 14, 24), 'loss');
	// away favored by 3, away wins by 1 -> home covers the +3
	a.equal(gradeSpread('home', 3, 20, 21), 'win');
	a.equal(gradeSpread('home', null, 20, 21), 'pending');
	a.equal(gradeSpread('home', -3, null, null), 'pending');

	// moneyline grading
	a.equal(gradeMl('home', 28, 21), 'win');
	a.equal(gradeMl('away', 28, 21), 'loss');
	a.equal(gradeMl('away', 21, 28), 'win');
	a.equal(gradeMl('home', 21, 21), 'push');
	a.equal(gradeMl('home', null, 3), 'pending');

	// points wiring
	near(mlPoints('win', 240), 24);
	near(mlPoints('loss', -298), -10);
	near(mlPoints('loss', -20000), -RISK);
	near(mlPoints('push', -298), 0);
	near(mlPoints('pending', -298), 0);
	near(mlPoints('win', null), 0);

	// line rendering
	a.equal(lineFor(-4.5, 'home'), '-4.5');
	a.equal(lineFor(-4.5, 'away'), '+4.5');
	a.equal(lineFor(3, 'home'), '+3');
	a.equal(lineFor(null, 'home'), '—');

	console.log('scoring self-test OK');
}

// node-only: this module is also imported by the browser, where `process` is undefined.
if (typeof process !== 'undefined' && process.argv?.[1]?.endsWith('scoring.ts')) selfTest();
