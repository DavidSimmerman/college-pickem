declare global {
	namespace App {
		interface Locals {
			player: { id: number; name: string } | null;
		}
	}
}
export {};
