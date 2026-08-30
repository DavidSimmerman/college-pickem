// Scoring rules, shared by client and server. See selfTest() at the bottom.

/** Decimal-odds profit multiple for American odds. -200 -> 0.5, +150 -> 1.5 */
export const mult = (american: number) => (american > 0 ? american / 100 : 100 / -american);

/**
 * Moneyline points, asymmetric and derived entirely from the price:
 *   win  = mult          (a +350 dog pays 3.50)
 *   lose = -1 / mult     (a -400 favorite that folds costs 4.00)
 * So chasing upsets is cheap and blowing a heavy chalk pick is brutal.
 */
/* Tail guard: ESPN prices cupcake games as low as -20000, which the raw formula
   turns into -200.00 for a single game. Caps only bite outside roughly -1000/+2500,
   so every ordinary line scores exactly as the plain rule says. */
export const MAX_WIN = 25;
export const MAX_LOSS = 10;

export const mlWin = (american: number) => Math.min(mult(american), MAX_WIN);
export const mlLose = (american: number) => -Math.min(1 / mult(american), MAX_LOSS);

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

export function gradeMl(
	pick: Side,
	homeScore: number | null,
	awayScore: number | null
): Outcome {
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
export const fmtPts = (n: number) => (n > 0 ? '+' : n < 0 ? '' : '') + n.toFixed(2);

/* ponytail: one assert-based self-check instead of a test framework.
   Run with `node --experimental-strip-types src/lib/scoring.ts`. */
export async function selfTest() {
	const { strict: a } = await import('node:assert');
	const near = (x: number, y: number, m = '') => a.ok(Math.abs(x - y) < 1e-9, `${m} ${x} != ${y}`);

	// payout shape
	// caps must not touch ordinary lines
	near(mlWin(350), 3.5, 'dog win');
	near(mlLose(350), -1 / 3.5, 'dog loss is cheap');
	near(mlWin(-400), 0.25, 'chalk win is thin');
	near(mlLose(-400), -4, 'chalk loss is brutal');
	near(mlWin(100), 1);
	near(mlLose(100), -1, 'pick-em is symmetric');

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
	near(mlPoints('loss', -298), -2.98);
	near(mlPoints('push', -298), 0);
	near(mlPoints('pending', -298), 0);
	near(mlPoints('win', null), 0);

	// tail guard: absurd cupcake prices are clamped, ordinary ones are not
	near(mlLose(-9000), -MAX_LOSS, 'blown cupcake chalk is capped');
	near(mlWin(20000), MAX_WIN, 'longshot payout is capped');
	near(mlLose(-1000), -MAX_LOSS, 'cap boundary');
	near(mlLose(-999), -9.99, 'just inside the cap is exact');
	near(mlWin(2500), MAX_WIN, 'win cap boundary');
	near(mlWin(2499), 24.99, 'just inside the win cap is exact');
	near(mlPoints('loss', -20000), -MAX_LOSS);

	// line rendering
	a.equal(lineFor(-4.5, 'home'), '-4.5');
	a.equal(lineFor(-4.5, 'away'), '+4.5');
	a.equal(lineFor(3, 'home'), '+3');
	a.equal(lineFor(null, 'home'), '—');

	console.log('scoring self-test OK');
}

// node-only: this module is also imported by the browser, where `process` is undefined.
if (typeof process !== 'undefined' && process.argv?.[1]?.endsWith('scoring.ts')) selfTest();
