import adapter from '@sveltejs/adapter-node'; // node build: this VM is the host, not a serverless platform
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

const PORT = 5192;

export default defineConfig({
	// Inlined rather than imported from the sandbox preset: an out-of-project import
	// loads a second copy of @sveltejs/kit, which breaks redirects. Works anywhere.
	server: {
		port: PORT,
		host: true,
		allowedHosts: true,
		// so HMR survives being served through an https tunnel
		hmr: { protocol: 'wss', clientPort: 443 }
	},
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter()
		})
	]
});
