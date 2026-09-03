// Sign in with Google, hand-rolled. ponytail: node:crypto and fetch are stdlib, so this
// stays a zero-dependency OAuth client rather than pulling in an auth framework for one
// provider and one flow.
//
// Configure by setting GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in the server's
// environment. With neither set, `configured()` is false and the button never renders —
// the passcode form keeps working exactly as before.

import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

const AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = 'https://oauth2.googleapis.com/token';

const id = () => process.env.GOOGLE_CLIENT_ID ?? '';
const secret = () => process.env.GOOGLE_CLIENT_SECRET ?? '';

/** Whether this server has Google credentials at all. */
export const configured = (): boolean => !!(id() && secret());

/** The one redirect URI Google must have on file, derived from the request's origin. */
export const redirectUri = (origin: string): string => `${origin}/auth/google/callback`;

export const newState = (): string => randomBytes(24).toString('base64url');

/** Constant-time compare so a returned state cannot be probed a byte at a time. */
export function stateMatches(a: string | undefined, b: string | undefined): boolean {
	if (!a || !b || a.length !== b.length) return false;
	return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export function authUrl(origin: string, state: string): string {
	const q = new URLSearchParams({
		client_id: id(),
		redirect_uri: redirectUri(origin),
		response_type: 'code',
		scope: 'openid email profile',
		state,
		// We only ever read the profile once, at sign-in, so there is nothing to refresh.
		access_type: 'online',
		prompt: 'select_account'
	});
	return `${AUTH}?${q}`;
}

export type Profile = { sub: string; email: string | null; name: string | null };

/**
 * Trade the one-time code for the user's identity.
 *
 * The id_token's signature is deliberately not verified: it arrives in the body of a
 * direct TLS call to Google's token endpoint, authenticated with our client secret, so
 * there is no untrusted party in the path. Signature checking is what you need when a
 * token reaches you via the browser, which is not this flow.
 */
export async function exchange(code: string, origin: string): Promise<Profile> {
	const res = await fetch(TOKEN, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			code,
			client_id: id(),
			client_secret: secret(),
			redirect_uri: redirectUri(origin),
			grant_type: 'authorization_code'
		}),
		signal: AbortSignal.timeout(15_000)
	});
	if (!res.ok) throw new Error(`google token ${res.status}: ${(await res.text()).slice(0, 200)}`);

	const { id_token } = (await res.json()) as { id_token?: string };
	if (!id_token) throw new Error('google returned no id_token');
	return decodeIdToken(id_token);
}

/** Read the payload of a JWT. Exported so the flow can be tested without Google. */
export function decodeIdToken(jwt: string): Profile {
	const part = jwt.split('.')[1];
	if (!part) throw new Error('malformed id_token');
	const claims = JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<string, unknown>;
	const sub = typeof claims.sub === 'string' ? claims.sub : '';
	if (!sub) throw new Error('id_token carries no subject');
	return {
		sub,
		email: typeof claims.email === 'string' ? claims.email : null,
		name:
			(typeof claims.name === 'string' && claims.name) ||
			(typeof claims.given_name === 'string' && claims.given_name) ||
			null
	};
}

/**
 * Turn a Google profile into a player id. Kept out of the route so the three paths
 * through it — link, return visit, first visit — can be exercised directly.
 *
 * `linkTo` is the id of the player already signed in, if any. Linking is the only way
 * an existing passcode account ever gains a Google login: matching on name or email
 * would let anyone who picks the right display name walk into someone else's season.
 */
export function resolveAccount(
	dbh: DatabaseSync,
	profile: Profile,
	linkTo: number | null,
	freshPass: () => string
): { id: number } | { error: string } {
	const { sub, email, name } = profile;
	const existing = dbh.prepare('SELECT id FROM players WHERE google_sub = ?').get(sub) as
		| { id: number }
		| undefined;

	if (linkTo !== null) {
		if (existing && existing.id !== linkTo) return { error: 'That Google account is already linked to another player.' };
		dbh.prepare('UPDATE players SET google_sub = ?, email = ? WHERE id = ?').run(sub, email, linkTo);
		return { id: linkTo };
	}

	if (existing) {
		if (email) dbh.prepare('UPDATE players SET email = ? WHERE id = ?').run(email, existing.id);
		return { id: existing.id };
	}

	// First visit, nothing to link to. If the Google name is already somebody's, stop
	// rather than inventing "David 2" — a duplicate account silently strands a season of
	// picks, and the owner can connect Google properly in one click from My Picks.
	const wanted = (name ?? email?.split('@')[0] ?? 'Player').trim().slice(0, 24);
	if (wanted.length < 2) return { error: 'Google gave us no usable name. Create an account with a passcode instead.' };
	if (dbh.prepare('SELECT 1 FROM players WHERE name = ?').get(wanted))
		return { error: `An account called ${wanted} already exists. Sign in with your passcode, then connect Google from My Picks.` };

	const row = dbh
		.prepare('INSERT INTO players (name, pass, google_sub, email) VALUES (?,?,?,?) RETURNING id')
		.get(wanted, freshPass(), sub, email) as { id: number };
	return { id: Number(row.id) };
}
