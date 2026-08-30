// End-to-end check against the running dev server.
// Run: node e2e.mjs      (uses the mockup-sandbox playwright install)
import { chromium } from '/home/claude/dev/mockup-sandbox/node_modules/playwright/index.mjs';
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';

const BASE = 'http://localhost:5192';
const NAME = 'e2e-' + process.pid;
const db = new DatabaseSync('data/pickem.db');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 430, height: 900 } });
const errors = [];
// vite's dev HMR socket can't reach us headless; that noise is not an app error
p.on('pageerror', (e) => /WebSocket|vite/i.test(e.message) || errors.push(e.message));

try {
	// ---- sign up
	await p.goto(`${BASE}/login`);
	await p.fill('#name', NAME);
	await p.fill('#pass', 'hunter2');
	await p.click('button:has-text("Continue")');
	await p.waitForURL(BASE + '/');
	console.log('✓ signed up + redirected to board');

	// wrong passcode is rejected
	const p2 = await (await b.newContext()).newPage();
	await p2.goto(`${BASE}/login`);
	await p2.fill('#name', NAME);
	await p2.fill('#pass', 'wrongpass');
	await p2.click('button:has-text("Continue")');
	await p2.waitForSelector('[role="alert"]');
	assert.match(await p2.textContent('[role="alert"]'), /Wrong passcode/);
	console.log('✓ wrong passcode rejected');

	// ---- spread pick persists
	const cards = p.locator('button[aria-label^="Spread pick"]:not([disabled])');
	assert.ok((await cards.count()) > 0, 'expected pickable games');
	const label = await cards.first().getAttribute('aria-label');
	await cards.first().click();
	await p.waitForFunction(
		(l) => document.querySelector(`button[aria-label="${l}"]`)?.getAttribute('aria-pressed') === 'true',
		label
	);
	await p.reload();
	assert.equal(await p.locator(`button[aria-label="${label}"]`).getAttribute('aria-pressed'), 'true');
	console.log('✓ spread pick persisted across reload:', label);

	// ---- moneyline pick persists, with the price locked in
	await p.click('button:has-text("Moneyline")');
	const ml = p.locator('button[aria-label^="Moneyline pick"]:not([disabled])');
	const mlLabel = await ml.first().getAttribute('aria-label');
	await ml.first().click();
	await p.waitForFunction(
		(l) => document.querySelector(`button[aria-label="${l}"]`)?.getAttribute('aria-pressed') === 'true',
		mlLabel
	);
	await p.reload();
	await p.click('button:has-text("Moneyline")');
	assert.equal(await p.locator(`button[aria-label="${mlLabel}"]`).getAttribute('aria-pressed'), 'true');

	const row = db
		.prepare(`SELECT kind, side, odds_at, spread_at FROM picks pk JOIN players pl ON pl.id = pk.player_id
              WHERE pl.name = ? AND kind = 'ml'`)
		.get(NAME);
	assert.ok(row && Number.isFinite(row.odds_at), 'ml pick stored its price: ' + JSON.stringify(row));
	console.log('✓ moneyline pick persisted with locked price:', JSON.stringify(row));

	// ---- deselect
	await p.locator(`button[aria-label="${mlLabel}"]`).click();
	await p.waitForFunction(
		(l) => document.querySelector(`button[aria-label="${l}"]`)?.getAttribute('aria-pressed') === 'false',
		mlLabel
	);
	assert.equal(
		db.prepare(`SELECT COUNT(*) n FROM picks pk JOIN players pl ON pl.id=pk.player_id WHERE pl.name=? AND kind='ml'`).get(NAME).n,
		0
	);
	console.log('✓ deselect removes the pick');

	// ---- started games are locked in the UI
	const started = db.prepare(`SELECT id FROM games WHERE state != 'pre' LIMIT 1`).get();
	if (started) {
		const dis = await p.locator(`button[aria-label^="Moneyline pick"][disabled]`).count();
		assert.ok(dis > 0, 'expected at least one disabled (locked) game button');
		console.log('✓ locked games are non-interactive in the UI');
	}

	// ---- server rejects a pick on a started game even if the client tries
	const cookies = await p.context().cookies();
	const sid = cookies.find((c) => c.name === 'sid').value;
	if (started) {
		const res = await fetch(`${BASE}/api/pick`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie: `sid=${sid}` },
			body: JSON.stringify({ gameId: started.id, kind: 'spread', side: 'home' })
		});
		assert.equal(res.status, 409, 'started game must be rejected, got ' + res.status);
		console.log('✓ server rejects picks on started games (409)');
	}

	// ---- unauthenticated + malformed input are rejected
	assert.equal(
		(await fetch(`${BASE}/api/pick`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status,
		401
	);
	const bad = await fetch(`${BASE}/api/pick`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', cookie: `sid=${sid}` },
		body: JSON.stringify({ gameId: 'nope', kind: 'spread', side: 'sideways' })
	});
	assert.equal(bad.status, 400);
	console.log('✓ auth + input validation enforced on the API');

	// ---- standings renders
	await p.goto(`${BASE}/standings`);
	await p.waitForSelector('table');
	console.log('✓ standings page renders');

	assert.equal(errors.length, 0, 'console errors: ' + errors.join(' | '));
	console.log('\nALL E2E CHECKS PASSED');
} finally {
	db.prepare('DELETE FROM players WHERE name = ?').run(NAME);
	await b.close();
}
