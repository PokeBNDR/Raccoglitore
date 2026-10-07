import { useEffect, useRef, useState } from 'react'
import { limiter } from './cache'
import { getState, putCard } from './store'
import { getCard, getCardLite } from './cards'
import type { CardInfo, Source } from './types'

export interface Async<T> {
	data: T | undefined
	loading: boolean
	error: unknown
	reload: () => void
}

/** Runs an async loader when `deps` change; ignores answers that arrive after a newer request. */
export function useAsync<T>(loader: () => Promise<T>, deps: unknown[]): Async<T> {
	const [state, setState] = useState<{ data: T | undefined; loading: boolean; error: unknown }>({
		data: undefined,
		loading: true,
		error: null,
	})
	const [tick, setTick] = useState(0)
	useEffect(() => {
		let alive = true
		setState((s) => ({ data: s.data, loading: true, error: null }))
		loader().then(
			(data) => alive && setState({ data, loading: false, error: null }),
			(error) => alive && setState({ data: undefined, loading: false, error }),
		)
		return () => {
			alive = false
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [...deps, tick])
	return { ...state, reload: () => setTick((t) => t + 1) }
}

/** Full card for the detail pages. Keeps the collection's copy of the prices up to date as a side effect. */
export function useCard(catalog: Source, id: string): Async<CardInfo | null> {
	const res = useAsync(async () => {
		const card = await getCard(catalog, id)
		if (card && getState().cards[card.key]) putCard(card)
		return card
	}, [catalog, id])
	return res
}

const liteLimit = limiter(4)
const liteMem = new Map<string, CardInfo | null>()

/**
 * Prices for a card shown in a grid. Loads only once the element is on screen,
 * a few at a time, so long lists do not flood the catalogue with requests.
 */
export function useLazyCard(catalog: Source, id: string) {
	const key = `${catalog}:${id}`
	const ref = useRef<HTMLElement | null>(null)
	const [card, setCard] = useState<CardInfo | null | undefined>(() => getState().cards[key] ?? liteMem.get(key))
	useEffect(() => {
		const known = getState().cards[key] ?? liteMem.get(key)
		setCard(known)
		if (known !== undefined) return
		const el = ref.current
		if (!el) return
		let alive = true
		let started = false
		const start = () => {
			if (started) return
			started = true
			void liteLimit(async () => {
				if (!alive) return
				try {
					const c = await getCardLite(catalog, id)
					liteMem.set(key, c)
					if (alive) setCard(c)
				} catch {
					if (alive) setCard(null)
				}
			})
		}
		if (typeof IntersectionObserver === 'undefined') {
			start()
			return () => {
				alive = false
			}
		}
		const io = new IntersectionObserver(
			(entries) => {
				if (entries.some((e) => e.isIntersecting)) {
					io.disconnect()
					start()
				}
			},
			{ rootMargin: '200px' },
		)
		io.observe(el)
		return () => {
			alive = false
			io.disconnect()
		}
	}, [catalog, id, key])
	return { ref, card }
}

/** Debounced copy of a fast-changing value (search box). */
export function useDebounced<T>(value: T, ms: number): T {
	const [v, setV] = useState(value)
	useEffect(() => {
		const t = setTimeout(() => setV(value), ms)
		return () => clearTimeout(t)
	}, [value, ms])
	return v
}
