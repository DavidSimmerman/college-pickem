import type { LayoutServerLoad } from './$types';
export const load: LayoutServerLoad = ({ locals }) => ({ player: locals.player });
