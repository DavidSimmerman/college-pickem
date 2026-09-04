// Scoring rules, shared by client and server. See selfTest() at the bottom.

/**
 * Points, priced off the spread rather than the moneyline.
 *
 * You still pick a winner outright; the spread is only how the pick is priced. A
 * coin-flip game is worth 5 and costs 5. Every 3.5 points of spread beyond the
 * pick-em band moves one bucket: back the favourite and the win shrinks while the
 * miss grows, take the dog and the reverse.
 *
 *   line   -14  -10.5   -7   ±3.5   +7   +10.5  +14
 *   win      2      3    4      5    6       7    8
 *   miss    -8     -7   -6     -5   -4      -3   -2
 *
 * The band is ±3.5 rather than 0, so a field goal either way is still a pick-em —
 * anything tighter turns the most interesting games on the board into six different
 * prices separated by half a point.
 *
 * Why win + |miss| is always STAKE: it is the only shape that cannot be farmed. A
 * pick against a fair line is worth nothing in expectation only if you risk the same
 * amount whatever you back; charge favourites more when they fold and every dog
 * becomes free money, so "take every underdog" beats thinking.
 *
 * A side whose win is 0 or less is pure downside — there is no decision in taking it,
 * so it is not offered. That happens past about 17.5 points of spread.
 */
export const CORE = 3.5; // half-width of the pick-em band
export const STEP = 3.5; // spread per bucket beyond it
export const BASE = 5; // what a pick-em pays
export const STAKE = 10; // win + |miss|, always
export const MAX_BUCKET = 4; // the ladder stops at 9 / -1
export const CHALK_CUTOFF = 21.5; // favourites this heavy are not offered

/**
 * Which bucket a side's line falls in. 0 inside the band, + toward the dog.
 *
 * The clamp is load-bearing, not cosmetic. Without it a 21-point dog would be
 * worth 10 for a win and nothing for a miss, and a 24.5-point dog would pay a
 * point for being wrong — a free roll you could take every week forever.
 */
export function bucket(line: number): number {
	const beyond = Math.abs(line) - CORE;
	if (beyond <= 0) return 0;
	const k = Math.min(Math.ceil(beyond / STEP), MAX_BUCKET);
	return line > 0 ? k : -k;
}

/** `line` is from the picked side's point of view: negative lays points. */
export const spWin = (line: number) => BASE + bucket(line);
export const spLose = (line: number) => spWin(line) - STAKE;

/** No line, or a favourite so heavy that backing it is not a decision. */
export const spDead = (line: number | null): boolean => line === null || line <= -CHALK_CUTOFF;

/** The line one side is getting, from ESPN's home-relative spread. */
export const lineOn = (spread: number | null, side: 'home' | 'away'): number | null =>
	spread === null ? null : side === 'home' ? spread : -spread;

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

/** Points for a graded pick, at the line that was locked in when it was made. */
export function spPoints(outcome: Outcome, line: number | null): number {
	if (line === null || outcome === 'pending' || outcome === 'push') return 0;
	return outcome === 'win' ? spWin(line) : spLose(line);
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

	// The table, exactly as specified: a pick-em pays 5 and costs 5, and every 3.5
	// points of spread past the band moves one bucket either way.
	const table: [number, number, number][] = [
		// line, win, miss
		[0, 5, -5],
		[-3.5, 5, -5], [3.5, 5, -5],   // the whole band is pick-em
		[-1.5, 5, -5], [1.5, 5, -5],
		[-7, 4, -6], [7, 6, -4],
		[-10.5, 3, -7], [10.5, 7, -3],
		[-14, 2, -8], [14, 8, -2],
		[-17.5, 1, -9], [17.5, 9, -1]
	];
	for (const [line, win, miss] of table) {
		a.equal(spWin(line), win, `line ${line} should win ${win}`);
		a.equal(spLose(line), miss, `line ${line} should cost ${miss}`);
	}

	// A half point past a boundary moves you into the next bucket, never before it.
	a.equal(spWin(-3.5), 5, 'the band is inclusive at its edge');
	a.equal(spWin(-4), 4, 'half a point past the band is the next bucket');
	a.equal(spWin(-7), 4, 'and it holds to the end of that bucket');
	a.equal(spWin(-7.5), 3);

	// win + |miss| is the stake, at every line. This is the anti-farming property.
	for (let line = -21; line <= 21; line += 0.5)
		a.equal(spWin(line) - spLose(line), STAKE, `stake must be flat at ${line}`);

	// Symmetry: what the favourite gives up is exactly what the dog picks up.
	for (let line = 0.5; line <= 17.5; line += 0.5)
		a.equal(spWin(line) + spWin(-line), 2 * BASE, `buckets must mirror at ${line}`);

	// every payout is a whole number
	for (let line = -21; line <= 21; line += 0.5) {
		a.ok(Number.isInteger(spWin(line)), `spWin(${line}) must be whole`);
		a.ok(Number.isInteger(spLose(line)), `spLose(${line}) must be whole`);
	}

	// the ladder stops, in both directions
	a.equal(spWin(-17.5), 1); a.equal(spWin(-21), 1, 'the favourite ladder floors at 1');
	a.equal(spWin(17.5), 9); a.equal(spWin(40), 9, 'and the dog ladder ceils at 9');

	// The clamp exists to stop a free roll: no miss may ever be worth nothing, let
	// alone pay. Without it a +24.5 dog would earn a point for being wrong.
	for (let line = -21; line <= 60; line += 0.5)
		a.ok(spLose(line) <= -1, `a miss at ${line} must cost at least a point`);

	// dead sides: backing a favourite this heavy is not a decision, so it is refused.
	a.equal(spDead(null), true, 'no line at all is not pickable');
	a.equal(spDead(-21), false, 'the heaviest chalk still on the board');
	a.equal(spDead(-21.5), true, 'and the first one past the cutoff is gone');
	a.equal(spDead(-40), true);
	a.equal(spDead(40), false, 'no dog is ever dead — someone has to take them');

	// A pick against a fair line is worth nothing in expectation, so no band of the
	// board can be farmed without actually beating the market. Win probability from
	// the spread via the usual normal model, sigma ~ 13.5 points in college football.
	const erf = (x: number) => {
		const t = 1 / (1 + 0.3275911 * Math.abs(x));
		const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
		return x >= 0 ? y : -y;
	};
	const pWin = (line: number) => 0.5 * (1 + erf(-line / (13.5 * Math.SQRT2)));
	let worst = 0;
	for (let line = -21; line <= 21; line += 0.5) {
		if (spDead(line)) continue;
		const p = pWin(line);
		const ev = p * spWin(line) + (1 - p) * spLose(line);
		worst = Math.max(worst, Math.abs(ev));
	}
	// Buckets are 3.5 points wide and the pick-em band is a full 7 points across, so a
	// line can sit some way from its price. The worst case is the top edge of the band:
	// a 3.5-point favourite is priced as a coin flip but wins about 60% of the time,
	// which is worth just over a point a pick. Centring the buckets on each multiple of
	// 3.5 instead would cut that to 0.02 — but a 3.5-point game would stop being a
	// pick-em, which is the shape that was asked for.
	a.ok(worst < 1.1, `no line may be worth more than ~a point of free EV: ${worst.toFixed(2)}`);

	// line rendering from a side's point of view
	a.equal(lineOn(-4.5, 'home'), -4.5, 'home lays what the spread says');
	a.equal(lineOn(-4.5, 'away'), 4.5, 'the away side gets it back');
	a.equal(lineOn(null, 'home'), null);

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
	a.equal(spPoints('win', -7), 4, 'backing a touchdown favourite pays 4');
	a.equal(spPoints('loss', -7), -6, 'and costs 6 when they lose outright');
	a.equal(spPoints('win', 10.5), 7, 'a ten-point dog winning outright pays 7');
	a.equal(spPoints('loss', 10.5), -3);
	a.equal(spPoints('push', -7), 0, 'a tie is worth nothing either way');
	a.equal(spPoints('pending', -7), 0);
	a.equal(spPoints('win', null), 0, 'a pick with no line recorded scores nothing');

	// line rendering
	a.equal(lineFor(-4.5, 'home'), '-4.5');
	a.equal(lineFor(-4.5, 'away'), '+4.5');
	a.equal(lineFor(3, 'home'), '+3');
	a.equal(lineFor(null, 'home'), '—');

	console.log('scoring self-test OK');
}

// node-only: this module is also imported by the browser, where `process` is undefined.
if (typeof process !== 'undefined' && process.argv?.[1]?.endsWith('scoring.ts')) selfTest();
