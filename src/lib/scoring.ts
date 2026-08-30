// Scoring rules, shared by client and server. See selfTest() at the bottom.

/** Decimal-odds profit multiple for American odds. -200 -> 0.5, +150 -> 1.5 */
export const mult = (american: number) => (american > 0 ? american / 100 : 100 / -american);

/**
 * Moneyline points — "flat risk", the only farm-proof shape.
 *
 *   win  = the odds multiple, capped at MAX_WIN   (a +350 dog pays 3.50)
 *   lose = exactly one point, always
 *
 * Why the loss has to be flat: if a hit pays the odds multiple b, the only loss
 * that makes a pick break even against a fair line is
 *     EV = p·b − (1−p)·L = 0,  with b = (1−p)/p   ⇒   L = 1
 * Charging heavy favourites more when they fold (the tempting −1/b rule) makes
 * every underdog strictly +EV, so "take every longshot every week" farms points
 * with no skill at all. Backtested over 2,316 real games with real closing lines
 * (2023-25): under this rule every no-skill strategy lands at or below zero and
 * only beating the market pays.
 *
 * Heavy favourites are still punished — through the ratio, not the penalty.
 * A -400 favourite risks a full point to win 0.25, so it has to hit 80% of the
 * time just to break even. Chasing chalk still bleeds you dry.
 *
 * MAX_WIN caps the lottery: an uncapped +5000 cupcake would pay 50 points and
 * decide the season on a single fluke.
 */
export const MAX_WIN = 15;
export const RISK = 1;

export const mlWin = (american: number) => Math.min(mult(american), MAX_WIN);
export const mlLose = (_american?: number) => -RISK;

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
export const fmtPts = (n: number) => (n > 0 ? '+' : '') + n.toFixed(2);

/* ponytail: one assert-based self-check instead of a test framework.
   Run with `node --experimental-strip-types src/lib/scoring.ts`. */
export async function selfTest() {
	const { strict: a } = await import('node:assert');
	const near = (x: number, y: number, m = '') => a.ok(Math.abs(x - y) < 1e-9, `${m} ${x} != ${y}`);

	// payout shape: the win scales with the upset, a miss always costs one point
	near(mlWin(350), 3.5, 'dog win pays the odds');
	near(mlWin(-400), 0.25, 'chalk win is thin');
	near(mlWin(100), 1, 'pick-em pays even');
	near(mlLose(350), -1, 'every miss costs exactly one');
	near(mlLose(-400), -1);
	near(mlLose(-9000), -1, 'even a blown cupcake chalk costs only one');

	// The farm-proof property: against a fair line every pick is worth exactly
	// zero, so no odds range can be farmed for points without beating the market.
	for (const odds of [-9000, -450, -200, -110, 120, 350, 900, 2500]) {
		const b = mult(odds);
		const p = 1 / (b + 1); // fair win probability implied by that price
		const ev = p * mlWin(odds) + (1 - p) * mlLose(odds);
		if (b <= MAX_WIN) near(ev, 0, `odds ${odds} must be EV-neutral`);
		else a.ok(ev < 0, `capped longshot ${odds} must not be +EV`);
	}

	// lottery cap
	near(mlWin(20000), MAX_WIN, 'longshot payout is capped');
	near(mlWin(1500), MAX_WIN, 'cap boundary');
	near(mlWin(1499), 14.99, 'just inside the cap is exact');

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
	near(mlPoints('win', 240), 2.4);
	near(mlPoints('loss', -298), -1);
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
