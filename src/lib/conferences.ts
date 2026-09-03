// ESPN conferenceId -> display name. Small and stable, so it lives here rather
// than costing one API call per conference on every scrape.
export const CONFERENCES: Record<number, string> = {
	1: 'ACC', 4: 'Big 12', 5: 'Big Ten', 8: 'SEC', 9: 'Pac-12',
	12: 'CUSA', 15: 'MAC', 17: 'Mountain West', 18: 'FBS Independents',
	37: 'Sun Belt', 151: 'American'
};

/** Which conference a game is filed under: the FBS side, home team first. */
export function confName(homeConf: number | null, awayConf: number | null): string {
	return CONFERENCES[homeConf!] ?? CONFERENCES[awayConf!] ?? 'Other';
}

// Pecking order, strongest first. Static on purpose: one week's slate is far too
// small a sample to rank leagues by, and the headings should not reshuffle
// themselves every time a scrape lands. Edit the list to change the order.
const CONF_ORDER = [
	'SEC', 'Big Ten', 'Big 12', 'ACC', 'FBS Independents',
	'Pac-12', 'American', 'Mountain West', 'Sun Belt', 'MAC', 'CUSA'
];

/** Sort key for a conference heading: lower is stronger. Unknowns sort last. */
export function confRank(name: string): number {
	const i = CONF_ORDER.indexOf(name);
	return i === -1 ? CONF_ORDER.length : i;
}
