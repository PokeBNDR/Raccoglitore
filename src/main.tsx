import '@fontsource-variable/urbanist'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { initStore } from './lib/store'
import './styles.css'

declare const __SINGLE_FILE__: boolean

createRoot(document.getElementById('root')!).render(<App />)
void initStore()

// Offline support and "install to home screen". Not available when the app is opened as a file.
const secure = location.protocol === 'https:' || location.hostname === 'localhost'
if (!__SINGLE_FILE__ && 'serviceWorker' in navigator && secure) {
	void import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true })).catch(() => undefined)
}
