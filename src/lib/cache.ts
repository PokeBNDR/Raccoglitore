import { createStore, del, entries, get, set, type UseStore } from 'idb-keyval'

/**
 * Small HTTP cache: memory first, then IndexedDB, then the network.
 * When the network fails, the last saved answer is returned instead, so the app keeps working offline.
 */

interface Entry {
	t: number
	data: unknown
}

let store: UseStore | null = null
try {
	store = createStore('raccoglitore-cache', 'http')
} catch {
	store = null
}

const mem = new Map<string, Entry>()
const inflight = new Map<string, Promise<unknown>>()

let offlineListener: ((offline: boolean) => void) | null = null
export function onOffline(fn: (offline: boolean) => void) {
	offlineListener = fn
}

async function readDisk(url: string): Promise<Entry | undefined> {
	if (!store) return undefined
	try {
		return await get<Entry>(url, store)
	} catch {
		return undefined
	}
}

async function writeDisk(url: string, entry: Entry) {
	if (!store) return
	try {
		await set(url, entry, store)
	} catch {
		/* storage full or unavailable: the memory copy still serves this session */
	}
}

export class HttpError extends Error {
	constructor(
		public status: number,
		url: string,
	) {
		super(`HTTP ${status} ${url}`)
	}
}

export interface GetOpts {
	/** Skip a fresh cached copy and ask the network. */
	force?: boolean
	signal?: AbortSignal
	/** Keep the answer only in memory (search results). */
	memoryOnly?: boolean
}

export interface Answer<T> {
	/** null when the server answers 404. */
	data: T | null
	/** When this answer was received from the network. */
	t: number
	/** The network failed and an older saved answer is being returned. */
	stale: boolean
}

export async function getJsonMeta<T>(url: string, ttlMs: number, opts: GetOpts = {}): Promise<Answer<T>> {
	const now = Date.now()
	let cached = mem.get(url)
	if (!cached && !opts.memoryOnly) {
		cached = await readDisk(url)
		if (cached) mem.set(url, cached)
	}
	if (cached && !opts.force && now - cached.t < ttlMs) return { data: cached.data as T | null, t: cached.t, stale: false }

	const running = inflight.get(url)
	if (running) return running as Promise<Answer<T>>

	const p = (async (): Promise<Answer<T>> => {
		try {
			// No custom headers: the request stays a "simple" one, with no CORS preflight round trip.
			const res = await fetch(url, { signal: opts.signal })
			if (res.status !== 404 && !res.ok) throw new HttpError(res.status, url)
			const data = res.status === 404 ? null : ((await res.json()) as T)
			const entry = { t: Date.now(), data }
			mem.set(url, entry)
			if (!opts.memoryOnly) void writeDisk(url, entry)
			offlineListener?.(false)
			return { data, t: entry.t, stale: false }
		} catch (err) {
			if ((err as Error)?.name === 'AbortError') throw err
			if (!(err instanceof HttpError)) offlineListener?.(true)
			if (cached) return { data: cached.data as T | null, t: cached.t, stale: true }
			throw err
		} finally {
			inflight.delete(url)
		}
	})()
	inflight.set(url, p)
	return p
}

/** Resolves to null when the server answers 404. */
export async function getJson<T>(url: string, ttlMs: number, opts: GetOpts = {}): Promise<T | null> {
	return (await getJsonMeta<T>(url, ttlMs, opts)).data
}

/** Drops cached answers that have not been refreshed for a long time. */
export async function pruneCache(maxAgeMs: number) {
	if (!store) return
	try {
		const all = await entries<string, Entry>(store)
		const limit = Date.now() - maxAgeMs
		await Promise.all(all.filter(([, e]) => !e || e.t < limit).map(([k]) => del(k, store!)))
	} catch {
		/* best effort */
	}
}

/** Runs async jobs with at most `n` at a time. */
export function limiter(n: number) {
	let active = 0
	const queue: Array<() => void> = []
	const next = () => {
		active--
		queue.shift()?.()
	}
	return async function run<T>(job: () => Promise<T>): Promise<T> {
		if (active >= n) await new Promise<void>((res) => queue.push(res))
		active++
		try {
			return await job()
		} finally {
			next()
		}
	}
}
