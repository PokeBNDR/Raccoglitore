import '@fontsource-variable/urbanist'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { initStore } from './lib/store'
import './styles.css'

declare const __SINGLE_FILE__: boolean
declare const __BUILD_TIME__: string

// Which version of the app is running, readable from outside (the tests use it).
document.documentElement.dataset.built = __BUILD_TIME__

createRoot(document.getElementById('root')!).render(<App />)
void initStore()

// Offline support and "install to home screen". Not available when the app is opened as a file.
const secure = location.protocol === 'https:' || location.hostname === 'localhost'
if (!__SINGLE_FILE__ && 'serviceWorker' in navigator && secure) {
	void import('virtual:pwa-register')
		.then(({ registerSW }) =>
			registerSW({
				immediate: true,
				// A phone keeps an installed app open for days, and a new version is only looked for when
				// the page loads: look again whenever the app comes back to the front. Not while a form is
				// open, because a new version reloads the page.
				onRegisteredSW(_url, registration) {
					if (!registration) return
					let last = Date.now()
					document.addEventListener('visibilitychange', () => {
						if (document.visibilityState !== 'visible' || Date.now() - last < 15 * 60_000) return
						if (document.body.classList.contains('locked')) return
						last = Date.now()
						registration.update().catch(() => undefined)
					})
				},
			}),
		)
		.catch(() => undefined)
}
