// Pulling a team's colour out of its own logo, for the ~5% of schools ESPN files as
// a flat #000000 with no alternate (Tarleton, Merrimack, Lamar...). Their logos carry
// the real colour, so we read it rather than shipping a hand-maintained override list
// that goes stale the moment a new team appears on the schedule.
//
// ponytail: node:zlib is stdlib, so this stays a zero-dependency PNG reader.
import { inflateSync } from 'node:zlib';

// Inlined rather than imported from $lib/colors so this module stays plain Node —
// it is the only way to run the decoder under `node --experimental-strip-types`.
const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const relLum = (r: number, g: number, b: number) =>
	0.2126 * lin(r / 255) + 0.7152 * lin(g / 255) + 0.0722 * lin(b / 255);
const contrastTo = (r: number, g: number, b: number, bg: number) => {
	const [hi, lo] = [relLum(r, g, b), bg].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
};

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

type Decoded = { width: number; height: number; rgba: Buffer };

function paeth(a: number, b: number, c: number): number {
	const p = a + b - c;
	const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
	return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** Minimal PNG decode: 8-bit greyscale/RGB/RGBA plus palettes. Anything exotic returns null. */
export function decodePng(buf: Buffer): Decoded | null {
	if (buf.length < 8 || !buf.subarray(0, 8).equals(SIG)) return null;

	let width = 0, height = 0, depth = 0, colorType = 0, interlace = 0;
	let palette: Buffer | null = null;
	let alpha: Buffer | null = null;
	const idat: Buffer[] = [];

	for (let p = 8; p + 8 <= buf.length; ) {
		const len = buf.readUInt32BE(p);
		const type = buf.toString('ascii', p + 4, p + 8);
		const data = buf.subarray(p + 8, p + 8 + len);
		p += 12 + len; // length + type + data + crc
		if (type === 'IHDR') {
			width = data.readUInt32BE(0);
			height = data.readUInt32BE(4);
			depth = data[8];
			colorType = data[9];
			interlace = data[12];
		} else if (type === 'PLTE') palette = Buffer.from(data);
		else if (type === 'tRNS') alpha = Buffer.from(data);
		else if (type === 'IDAT') idat.push(Buffer.from(data));
		else if (type === 'IEND') break;
	}

	const ch = CHANNELS[colorType];
	if (!width || !height || !ch || interlace !== 0 || !idat.length) return null;
	if (depth !== 8 && !(colorType === 3 && [1, 2, 4, 8].includes(depth))) return null;
	if (colorType === 3 && !palette) return null;

	const raw = inflateSync(Buffer.concat(idat));
	const bpp = Math.max(1, Math.ceil((ch * depth) / 8));
	const stride = Math.ceil((width * ch * depth) / 8);
	if (raw.length < height * (stride + 1)) return null;

	// Undo the per-scanline filters in place; each line may reference the one above it.
	const lines = Buffer.alloc(height * stride);
	for (let y = 0; y < height; y++) {
		const filter = raw[y * (stride + 1)];
		const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
		const cur = lines.subarray(y * stride, (y + 1) * stride);
		const prev = y ? lines.subarray((y - 1) * stride, y * stride) : null;
		for (let x = 0; x < stride; x++) {
			const a = x >= bpp ? cur[x - bpp] : 0;
			const b = prev ? prev[x] : 0;
			const c = prev && x >= bpp ? prev[x - bpp] : 0;
			const v = src[x];
			cur[x] =
				(filter === 0 ? v
				: filter === 1 ? v + a
				: filter === 2 ? v + b
				: filter === 3 ? v + ((a + b) >> 1)
				: filter === 4 ? v + paeth(a, b, c)
				: v) & 0xff;
		}
	}

	const rgba = Buffer.alloc(width * height * 4);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const o = (y * width + x) * 4;
			if (colorType === 3) {
				const perByte = 8 / depth;
				const byte = lines[y * stride + Math.floor(x / perByte)];
				const shift = (perByte - 1 - (x % perByte)) * depth;
				const i = (byte >> shift) & ((1 << depth) - 1);
				rgba[o] = palette![i * 3];
				rgba[o + 1] = palette![i * 3 + 1];
				rgba[o + 2] = palette![i * 3 + 2];
				rgba[o + 3] = alpha && i < alpha.length ? alpha[i] : 255;
			} else {
				const i = y * stride + x * ch;
				const [r, g, b, a] =
					colorType === 0 ? [lines[i], lines[i], lines[i], 255]
					: colorType === 4 ? [lines[i], lines[i], lines[i], lines[i + 1]]
					: colorType === 2 ? [lines[i], lines[i + 1], lines[i + 2], 255]
					: [lines[i], lines[i + 1], lines[i + 2], lines[i + 3]];
				rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = a;
			}
		}
	}
	return { width, height, rgba };
}

/**
 * The colour a logo actually reads as: the most common strongly-coloured pixel,
 * ignoring the black/white/grey that most marks are mostly made of.
 */
export function dominantColor(png: Buffer): string | null {
	const img = decodePng(png);
	if (!img) return null;
	const bins = new Map<string, { n: number; r: number; g: number; b: number }>();
	const { rgba } = img;
	for (let i = 0; i < rgba.length; i += 4) {
		if (rgba[i + 3] < 200) continue;
		const [r, g, b] = [rgba[i], rgba[i + 1], rgba[i + 2]];
		const mx = Math.max(r, g, b);
		if (mx < 40 || (mx - Math.min(r, g, b)) / mx < 0.35) continue; // near-neutral: no hue to take
		const k = `${r >> 4},${g >> 4},${b >> 4}`;
		const e = bins.get(k) ?? { n: 0, r: 0, g: 0, b: 0 };
		e.n++; e.r += r; e.g += g; e.b += b;
		bins.set(k, e);
	}
	if (!bins.size) return null;
	const top = [...bins.values()].sort((x, z) => z.n - x.n)[0];
	return (
		'#' +
		[top.r, top.g, top.b].map((s) => Math.round(s / top.n).toString(16).padStart(2, '0')).join('')
	);
}

/**
 * How much of a logo would actually be visible on a given background: the share of
 * its solid pixels that clear a loose 2.5:1 against it. A low share means the mark is
 * painted in the same colour as the thing behind it — Tennessee's orange T on
 * Tennessee orange — and needs an outline to read.
 */
export function visibleFraction(png: Buffer, bg: string): number {
	const img = decodePng(png);
	if (!img) return 1; // can't tell: leave the logo in full colour
	const [br, bgc, bb] = [1, 3, 5].map((i) => parseInt(bg.slice(i, i + 2), 16));
	const bgLum = relLum(br, bgc, bb);
	const { rgba } = img;
	let solid = 0;
	let seen = 0;
	for (let i = 0; i < rgba.length; i += 4) {
		if (rgba[i + 3] < 200) continue;
		seen++;
		if (contrastTo(rgba[i], rgba[i + 1], rgba[i + 2], bgLum) >= 2.5) solid++;
	}
	return seen ? solid / seen : 1;
}
