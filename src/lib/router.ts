import { useSyncExternalStore } from 'react'

/**
 * Hash routing ("#/cerca"): works on any static host and when the app is opened as a file.
 * Also keeps the scroll position of each page, so going back from a card returns to the same
 * point of the list.
 */

const stack: string[] = [window.location.hash]
const positions = new Map<string, number>()
let replacing = false

try {
	window.history.scrollRestoration = 'manual'
} catch {
	/* older browsers */
}

function restoreScroll(target: number) {
	let tries = 0
	const step = () => {
		const max = document.documentElement.scrollHeight - window.innerHeight
		if (target <= max || tries > 40) {
			window.scrollTo(0, target)
			return
		}
		// The page is still loading its content: wait until it is tall enough.
		window.scrollTo(0, Math.max(0, max))
		tries++
		requestAnimationFrame(step)
	}
	requestAnimationFrame(step)
}

window.addEventListener('hashchange', () => {
	const h = window.location.hash
	const top = stack[stack.length - 1]
	if (h === top) return
	positions.set(top, window.scrollY)
	if (replacing) {
		replacing = false
		stack[stack.length - 1] = h
		restoreScroll(0)
	} else if (stack.length > 1 && stack[stack.length - 2] === h) {
		stack.pop()
		restoreScroll(positions.get(h) ?? 0)
	} else {
		stack.push(h)
		restoreScroll(0)
	}
})

const read = () => window.location.hash.replace(/^#\/?/, '')

const subscribe = (fn: () => void) => {
	window.addEventListener('hashchange', fn)
	return () => window.removeEventListener('hashchange', fn)
}

/** Current path split in segments, e.g. ["carta", "int", "base1-4"]. */
export function useRoute(): string[] {
	const path = useSyncExternalStore(subscribe, read)
	return path
		.split('/')
		.filter(Boolean)
		.map((s) => {
			try {
				return decodeURIComponent(s)
			} catch {
				return s
			}
		})
}

export const href = (...segments: string[]) => '#/' + segments.map(encodeURIComponent).join('/')

export function nav(to: string, replace = false) {
	if (to === window.location.hash || (to === '#/' && window.location.hash === '')) return
	if (replace) {
		replacing = true
		window.location.replace(to)
	} else {
		window.location.hash = to.replace(/^#/, '')
	}
}

/**
 * Opens a page from inside a bottom sheet. Closing a sheet undoes its own history step a moment
 * later: the new page is opened only after that, or the step back would land on the old page.
 */
export function navAfterSheet(to: string, close: () => void) {
	let done = false
	const go = () => {
		if (done) return
		done = true
		window.removeEventListener('popstate', go)
		nav(to)
	}
	window.addEventListener('popstate', go)
	window.setTimeout(go, 300)
	close()
}

/** Goes back when the previous page is inside the app, otherwise opens the fallback page. */
export function back(fallback = '#/') {
	if (stack.length > 1) window.history.back()
	else nav(fallback, true)
}
