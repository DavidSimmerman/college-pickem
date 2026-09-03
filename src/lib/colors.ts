// Team colours come straight from ESPN and are, for 175 of 186 teams, exactly the
// brand colour — Auburn #002b5c, LSU #461d76, Ole Miss #13294b. So the rule here is:
// SHIP THE BRAND COLOUR. A previous version clamped every colour into a mid lightness
// band before it checked anything, which turned Auburn navy into a medium blue and Penn
// State into periwinkle. Only two teams in the whole slate actually fail AA against
// both white and near-black ink, and only ~6 are so near-black they vanish into the
// card. Those are the only ones we touch, and only as far as we must.
//
// The maths is OKLab so that the rare nudge moves lightness without dragging the hue.

type RGB = [number, number, number];

const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const linearToSrgb = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

const parseHex = (hex?: string | null): RGB | null =>
	hex && /^#[0-9a-fA-F]{6}$/.test(hex)
		? ([1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as RGB)
		: null;

const toHex = (rgb: RGB) =>
	'#' +
	rgb.map((c) => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, '0')).join('');

/** sRGB -> OKLab (Ottosson 2020). */
function rgbToOklab([r, g, b]: RGB): RGB {
	const [R, G, B] = [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
	const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
	const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
	const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
	return [
		0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
		1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
		0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
	];
}

function oklabToRgb([L, A, B]: RGB): RGB {
	const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
	const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
	const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
	return [
		linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
		linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
		linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)
	];
}

const displayable = (rgb: RGB) => rgb.every((v) => v >= -0.001 && v <= 1.001);

/**
 * Re-light a colour without touching its hue. Lifting lightness can push a saturated
 * colour outside sRGB, so chroma is pulled in until it fits — the standard gamut
 * squeeze, and the reason a lifted navy stays navy instead of going grey.
 */
function relight(rgb: RGB, L: number): RGB {
	const [, A, B] = rgbToOklab(rgb);
	let lo = 0;
	let hi = 1;
	let best = oklabToRgb([L, 0, 0]);
	for (let i = 0; i < 20; i++) {
		const t = (lo + hi) / 2;
		const c = oklabToRgb([L, A * t, B * t]);
		if (displayable(c)) {
			best = c;
			lo = t;
		} else hi = t;
	}
	return best;
}

const relLum = ([r, g, b]: RGB) =>
	0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);

/** WCAG contrast ratio, 1 (identical) to 21 (black on white). */
export function contrast(a: string, b: string): number {
	const [x, y] = [parseHex(a), parseHex(b)];
	if (!x || !y) return 1;
	const [hi, lo] = [relLum(x), relLum(y)].sort((p, q) => q - p);
	return (hi + 0.05) / (lo + 0.05);
}

// Only used when ESPN gives us no colour at all.
const FALLBACK = '#3d4354';

// The card behind these swatches is #0f121a (OKLab L 0.183). Six teams are filed so
// near-black that their flooded side is indistinguishable from it — Penn State #061440
// is 1.05:1 against the card. This floor lifts only those: Michigan (L 0.271), Ole Miss
// (0.283) and Auburn (0.295) all sit above it and pass through untouched.
const MIN_L = 0.27;
// Below this OKLab chroma a colour has no hue worth keeping — ESPN files 14 teams
// (Army, Cincinnati, UCF...) as a flat #000000, which would leave them all identical grey.
const MIN_CHROMA = 0.02;
const AA = 4.5;

const chroma = ([, A, B]: RGB) => Math.hypot(A, B);

/** Does this colour carry a hue at all, or is it just black/white/grey? */
export const hasHue = (hex?: string | null): boolean => {
	const rgb = parseHex(hex);
	return !!rgb && chroma(rgbToOklab(rgb)) >= MIN_CHROMA;
};
const bestInk = (hex: string) => (contrast(hex, '#ffffff') >= contrast(hex, '#0b0d12') ? '#ffffff' : '#0b0d12');

/**
 * The colour a team's half of the card is flooded with. Returns ESPN's own brand colour
 * untouched whenever it works, which is nearly always: the only edits are lifting a
 * near-black off the card background, and rescuing the two mid-lightness colours that
 * clear neither white nor black ink.
 */
export function teamBg(hex?: string | null, alt?: string | null, fromLogo?: string | null): string {
	// A hueless primary is a data gap, not a design choice. Fall through the alternate
	// to the colour read out of the school's own logo before giving up on grey.
	const pick = [hex, alt, fromLogo].find(hasHue) ?? hex ?? alt ?? fromLogo;
	const rgb = parseHex(pick);
	if (!rgb) return FALLBACK;

	const [L] = rgbToOklab(rgb);
	const brand = toHex(rgb);
	const ok = (h: string) => contrast(h, bestInk(h)) >= AA;

	// The overwhelmingly common case: a real brand colour that already reads.
	if (L >= MIN_L && ok(brand)) return brand;

	// Otherwise climb from wherever the colour legitimately starts, in 0.01 steps, and
	// stop the instant it works. Nothing moves further than it has to.
	for (let cand = Math.max(L, MIN_L); cand <= 0.92; cand += 0.01) {
		const hexAt = toHex(relight(rgb, cand));
		if (ok(hexAt)) return hexAt;
	}
	// Colours too light for either ink (none today) get darkened instead.
	for (let cand = L; cand >= 0.28; cand -= 0.01) {
		const hexAt = toHex(relight(rgb, cand));
		if (ok(hexAt)) return hexAt;
	}
	return brand;
}

/** Ink that reads on a background: whichever of white / near-black contrasts more. */
export const inkOn = (bg: string): string =>
	contrast(bg, '#ffffff') >= contrast(bg, '#0b0d12') ? '#ffffff' : '#0b0d12';

/**
 * Trace a logo's silhouette in the contrasting ink so it reads against a background of
 * its own colour — Tennessee's orange T on Tennessee orange. Recolouring the logo was
 * the old fix and it was the wrong one: it threw away the team's mark to solve a
 * contrast problem an outline solves while keeping every original colour.
 */
export const haloFilter = (ink: string): string =>
	[
		`drop-shadow(0 0 1px ${ink})`,
		`drop-shadow(0 0 1px ${ink})`,
		`drop-shadow(1px 1px 0 ${ink})`,
		`drop-shadow(-1px -1px 0 ${ink})`
	].join(' ');

/**
 * OKLab mix, matching what `color-mix(in oklab, a t%, b)` does in CSS. Kept in JS so
 * the server can reason about the exact colour a logo will be drawn on.
 */
export function mix(a: string, b: string, t: number): string {
	const [x, y] = [parseHex(a), parseHex(b)];
	if (!x || !y) return a;
	const [p, q] = [rgbToOklab(x), rgbToOklab(y)];
	return toHex(oklabToRgb(p.map((v, i) => v * t + q[i] * (1 - t)) as RGB));
}

// How much team colour survives on an unpicked side. At the old 0.15 a navy team was
// indistinguishable from the bare card; 0.28 reads as the team while still leaving
// #e8eaf0 text at 8.5:1 on the brightest team on the board.
export const TINT = 0.28;

/** The muted version of a team colour used before its side is picked. */
export const teamTint = (bg: string): string => mix(bg, '#0f121a', TINT);
