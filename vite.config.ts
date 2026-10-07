import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import { VitePWA } from 'vite-plugin-pwa'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Two outputs:
//  - `npm run build`         → dist/         the installable web app (what gets hosted)
//  - `npm run build:single`  → dist-single/  one self-contained HTML file to try on a computer
export default defineConfig(({ mode }) => {
	const single = mode === 'single'
	// The single-file build has no service worker: its registration is swapped for a no-op.
	const alias: Record<string, string> = single
		? { 'virtual:pwa-register': fileURLToPath(new URL('./src/lib/noop-sw.ts', import.meta.url)) }
		: {}
	return {
		base: './',
		resolve: { alias },
		define: {
			__SINGLE_FILE__: JSON.stringify(single),
			__BUILD_TIME__: JSON.stringify(new Date().toISOString()),
		},
		build: {
			outDir: single ? 'dist-single' : 'dist',
			target: 'es2020',
			chunkSizeWarningLimit: 900,
		},
		plugins: [
			react(),
			...(single
				? [viteSingleFile()]
				: [
						VitePWA({
							registerType: 'autoUpdate',
							includeAssets: ['icon.svg', 'apple-touch-icon.png'],
							manifest: {
								name: 'Raccoglitore',
								short_name: 'Raccoglitore',
								description: 'Il portfolio delle tue carte Pokémon, con lingua e condizione di ogni copia.',
								lang: 'it',
								start_url: './',
								scope: './',
								display: 'standalone',
								orientation: 'portrait',
								background_color: '#000000',
								theme_color: '#000000',
								icons: [
									{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
									{ src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
									{ src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
								],
							},
							workbox: {
								globPatterns: ['**/*.{js,css,html,svg,png,woff2,json}'],
							// The list of sealed products changes every day and the app keeps its own copy of it:
							// it must not be part of what is stored at installation.
							globIgnores: ['**/data/**'],
								navigateFallback: 'index.html',
								cleanupOutdatedCaches: true,
							},
						}),
					]),
		],
		test: {
			environment: 'node',
			include: ['tests/**/*.test.ts'],
		},
	}
})
