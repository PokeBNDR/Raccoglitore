import { createStore, get, set, type UseStore } from 'idb-keyval'
import { useSyncExternalStore } from 'react'
import { limiter, onOffline, pruneCache } from './cache'
import { dayStr, round2, uid } from './format'
import { CONDS, DEFAULT_SETTINGS, LANGS } from './labels'
import { cardKey, totals, unitValue } from './pricing'
import { loadCard } from './tcgdex'
import type { CardInfo, Catalog, Cond, Holding, LangCode, Settings, Snapshot } from './types'

export interface RefreshState {
	running: boolean
	done: number
	total: number
	failed: number
	lastRun: number | null
}

export interface State {
	ready: boolean
	/** False when this browser refuses to save anything (private window, storage blocked). */
	storageOk: boolean
	offline: boolean
	holdings: Holding[]
	settings: Settings
	snapshots: Snapshot[]
	/** Catalogue data and prices of the cards in the collection. */
	cards: Record<string, CardInfo>
	/** Value of one copy, day by day, for each collection entry. */
	hist: Record<string, Record<string, number>>
	refresh: RefreshState
	lastBackup: number | null
}

// Cardmarket's price guide changes once a day and the catalogue caches it: asking more often adds load, not freshness.
const PRICE_MAX_AGE = 12 * 3_600_000

let state: State = {
	ready: false,
	storageOk: true,
	offline: false,
	holdings: [],
	settings: DEFAULT_SETTINGS,
	snapshots: [],
	cards: {},
	hist: {},
	refresh: { running: false, done: 0, total: 0, failed: 0, lastRun: null },
	lastBackup: null,
}

const listeners = new Set<() => void>()
export const getState = () => state
const subscribe = (fn: () => void) => {
	listeners.add(fn)
	return () => listeners.delete(fn)
}

export function useStore<T>(selector: (s: State) => T): T {
	return useSyncExternalStore(subscribe, () => selector(state))
}

function setState(patch: Partial<State>) {
	state = { ...state, ...patch }
	listeners.forEach((l) => l())
	schedulePersist()
}

// ------------------------------------------------------------ persistence

const PERSISTED = ['holdings', 'settings', 'snapshots', 'cards', 'hist', 'lastBackup'] as const
type PKey = (typeof PERSISTED)[number]
const saved: Partial<Record<PKey, unknown>> = {}

let kv: UseStore | null = null
const LS = 'raccoglitore:'

async function load<T>(key: string): Promise<T | undefined> {
	if (kv) {
		try {
			const v = await get<T>(key, kv)
			if (v !== undefined) return v
		} catch {
			/* fall through to localStorage */
		}
	}
	try {
		const raw = localStorage.getItem(LS + key)
		return raw == null ? undefined : (JSON.parse(raw) as T)
	} catch {
		return undefined
	}
}

async function save(key: string, value: unknown): Promise<boolean> {
	if (kv) {
		try {
			await set(key, value, kv)
			return true
		} catch {
			/* fall through */
		}
	}
	try {
		localStorage.setItem(LS + key, JSON.stringify(value))
		return true
	} catch {
		return false
	}
}

let persistTimer: ReturnType<typeof setTimeout> | null = null
function schedulePersist() {
	if (!state.ready || persistTimer) return
	persistTimer = setTimeout(() => {
		persistTimer = null
		void flush()
	}, 250)
}

export async function flush() {
	if (!state.ready) return
	let ok = true
	for (const key of PERSISTED) {
		const value = state[key]
		if (saved[key] === value) continue
		saved[key] = value
		if (!(await save(key, value))) ok = false
	}
	if (ok !== state.storageOk) setState({ storageOk: ok })
}

// ------------------------------------------------------------ start-up

function cleanSettings(raw: Partial<Settings> | undefined): Settings {
	const s = raw ?? {}
	return {
		...DEFAULT_SETTINGS,
		...s,
		condMult: { ...DEFAULT_SETTINGS.condMult, ...(s.condMult ?? {}) },
		langMult: { ...DEFAULT_SETTINGS.langMult, ...(s.langMult ?? {}) },
	}
}

const isCond = (v: unknown): v is Cond => CONDS.some((c) => c.code === v)
const isLang = (v: unknown): v is LangCode => LANGS.some((l) => l.code === v)
const numOrNull = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null)

/** Makes a holding read from storage or from a backup file safe to use. */
export function cleanHolding(raw: unknown): Holding | null {
	if (!raw || typeof raw !== 'object') return null
	const r = raw as Record<string, unknown>
	if (typeof r.cardId !== 'string' || typeof r.name !== 'string') return null
	const now = Date.now()
	const grade =
		r.grade && typeof r.grade === 'object' && typeof (r.grade as Record<string, unknown>).company === 'string'
			? {
					company: String((r.grade as Record<string, unknown>).company),
					value: String((r.grade as Record<string, unknown>).value ?? ''),
				}
			: null
	return {
		id: typeof r.id === 'string' && r.id ? r.id : uid(),
		catalog: (['int', 'ja', 'ko', 'zh-tw', 'zh-cn'].includes(r.catalog as string) ? r.catalog : 'int') as Catalog,
		cardId: r.cardId,
		name: r.name,
		nameAlt: typeof r.nameAlt === 'string' ? r.nameAlt : undefined,
		setId: typeof r.setId === 'string' ? r.setId : '',
		setName: typeof r.setName === 'string' ? r.setName : '',
		localId: typeof r.localId === 'string' ? r.localId : '',
		setOfficial: typeof r.setOfficial === 'number' ? r.setOfficial : undefined,
		images: r.images && typeof r.images === 'object' ? (r.images as Record<string, string>) : {},
		rarity: typeof r.rarity === 'string' ? r.rarity : undefined,
		lang: isLang(r.lang) ? r.lang : 'IT',
		cond: isCond(r.cond) ? r.cond : 'NM',
		variantKey: typeof r.variantKey === 'string' ? r.variantKey : 'normal|||',
		variantType: typeof r.variantType === 'string' ? r.variantType : 'normal',
		variantLabel: typeof r.variantLabel === 'string' ? r.variantLabel : 'Normale',
		stamps: Array.isArray(r.stamps) ? r.stamps.filter((s): s is string => typeof s === 'string') : [],
		grade,
		qty: typeof r.qty === 'number' && r.qty >= 1 ? Math.floor(r.qty) : 1,
		buyPrice: numOrNull(r.buyPrice),
		buyDate: typeof r.buyDate === 'string' && r.buyDate ? r.buyDate : null,
		manualPrice: numOrNull(r.manualPrice),
		manualAt: typeof r.manualAt === 'number' ? r.manualAt : null,
		note: typeof r.note === 'string' ? r.note : '',
		createdAt: typeof r.createdAt === 'number' ? r.createdAt : now,
		updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : now,
	}
}

let started = false
export async function initStore() {
	if (started) return
	started = true
	try {
		kv = createStore('raccoglitore', 'kv')
		await get('probe', kv)
	} catch {
		kv = null
	}
	const [holdings, settings, snapshots, cards, hist, lastBackup, lastRun] = await Promise.all([
		load<unknown[]>('holdings'),
		load<Partial<Settings>>('settings'),
		load<Snapshot[]>('snapshots'),
		load<Record<string, CardInfo>>('cards'),
		load<State['hist']>('hist'),
		load<number | null>('lastBackup'),
		load<number | null>('lastRun'),
	])
	const cleanH = (Array.isArray(holdings) ? holdings : []).map(cleanHolding).filter((h): h is Holding => !!h)
	state = {
		...state,
		ready: true,
		holdings: cleanH,
		settings: cleanSettings(settings),
		snapshots: Array.isArray(snapshots) ? snapshots : [],
		cards: cards && typeof cards === 'object' ? cards : {},
		hist: hist && typeof hist === 'object' ? hist : {},
		lastBackup: typeof lastBackup === 'number' ? lastBackup : null,
		refresh: { ...state.refresh, lastRun: typeof lastRun === 'number' ? lastRun : null },
	}
	for (const key of PERSISTED) saved[key] = state[key]
	listeners.forEach((l) => l())

	// Ask the browser not to clear the collection when the device runs low on space.
	try {
		void navigator.storage?.persist?.()
	} catch {
		/* not supported */
	}
	onOffline((offline) => {
		if (offline !== state.offline) setState({ offline })
	})
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'hidden') void flush()
		else void refreshPrices()
	})
	window.addEventListener('pagehide', () => void flush())
	void pruneCache(45 * 24 * 3_600_000)
	void refreshPrices()
}

// ------------------------------------------------------------ collection

export type HoldingInput = Omit<Holding, 'id' | 'createdAt' | 'updatedAt'>

const sameGrade = (a: Holding['grade'], b: Holding['grade']) =>
	(!a && !b) || (!!a && !!b && a.company === b.company && a.value === b.value)

/**
 * Adds copies to the collection. Copies that match an existing entry in every respect
 * (card, version, language, condition, grade, prices) raise its quantity instead of making a duplicate.
 */
export function addHolding(input: HoldingInput, card?: CardInfo): Holding {
	const now = Date.now()
	const twin = state.holdings.find(
		(h) =>
			h.catalog === input.catalog &&
			h.cardId === input.cardId &&
			h.variantKey === input.variantKey &&
			h.lang === input.lang &&
			h.cond === input.cond &&
			sameGrade(h.grade, input.grade) &&
			h.buyPrice === input.buyPrice &&
			h.manualPrice === input.manualPrice &&
			h.buyDate === input.buyDate &&
			h.note === input.note,
	)
	let result: Holding
	let holdings: Holding[]
	if (twin) {
		result = { ...twin, qty: twin.qty + input.qty, updatedAt: now }
		holdings = state.holdings.map((h) => (h.id === twin.id ? result : h))
	} else {
		result = { ...input, id: uid(), createdAt: now, updatedAt: now }
		holdings = [result, ...state.holdings]
	}
	setState({ holdings, ...(card ? { cards: { ...state.cards, [card.key]: card } } : {}) })
	recordToday()
	return result
}

export function updateHolding(id: string, patch: Partial<HoldingInput>) {
	const holdings = state.holdings.map((h) => (h.id === id ? { ...h, ...patch, updatedAt: Date.now() } : h))
	setState({ holdings })
	recordToday()
}

export function removeHolding(id: string) {
	const gone = state.holdings.find((h) => h.id === id)
	if (!gone) return
	const holdings = state.holdings.filter((h) => h.id !== id)
	const hist = { ...state.hist }
	delete hist[id]
	const cards = { ...state.cards }
	const key = cardKey(gone)
	if (!holdings.some((h) => cardKey(h) === key)) delete cards[key]
	setState({ holdings, hist, cards })
	recordToday()
}

export function putCard(card: CardInfo) {
	const old = state.cards[card.key]
	if (old && old.fetchedAt >= card.fetchedAt) return
	setState({ cards: { ...state.cards, [card.key]: card } })
}

export function setSettings(patch: Partial<Settings>) {
	setState({ settings: cleanSettings({ ...state.settings, ...patch }) })
	if (patch.basis || patch.condMult || patch.langMult) recordToday()
}

// ------------------------------------------------------------ history

const MAX_HIST_DAYS = 400

/** Writes today's total and today's value of each entry. Called whenever something that affects value changes. */
export function recordToday() {
	if (!state.ready) return
	const { holdings, cards, settings } = state
	if (!holdings.length && !state.snapshots.length) return
	const day = dayStr()
	const t = totals(holdings, cards, settings)
	const snap: Snapshot = { date: day, value: t.value, cost: t.cost, copies: t.copies }
	const last = state.snapshots[state.snapshots.length - 1]
	let snapshots = state.snapshots
	if (!last || last.date !== day) snapshots = [...state.snapshots, snap]
	else if (last.value !== snap.value || last.cost !== snap.cost || last.copies !== snap.copies) {
		snapshots = [...state.snapshots.slice(0, -1), snap]
	}

	let hist = state.hist
	let changed = false
	for (const h of holdings) {
		const u = unitValue(h, cards[cardKey(h)], settings).value
		if (u == null) continue
		const v = round2(u)
		const mine = hist[h.id]
		if (mine?.[day] === v) continue
		if (!changed) {
			hist = { ...hist }
			changed = true
		}
		const next: Record<string, number> = { ...(mine ?? {}), [day]: v }
		const days = Object.keys(next).sort()
		if (days.length > MAX_HIST_DAYS) for (const d of days.slice(0, days.length - MAX_HIST_DAYS)) delete next[d]
		hist[h.id] = next
	}
	if (snapshots !== state.snapshots || changed) setState({ snapshots, hist })
}

// ------------------------------------------------------------ prices

const runLimited = limiter(4)

/**
 * Refreshes the Cardmarket prices of every card in the collection.
 * Without `force`, only prices older than twelve hours are fetched (the source updates once a day).
 */
export async function refreshPrices(opts: { force?: boolean } = {}) {
	if (!state.ready || state.refresh.running) return
	const now = Date.now()
	const wanted = new Map<string, { catalog: Catalog; id: string }>()
	for (const h of state.holdings) {
		const key = cardKey(h)
		const have = state.cards[key]
		if (!opts.force && have && now - have.fetchedAt < PRICE_MAX_AGE) continue
		wanted.set(key, { catalog: h.catalog, id: h.cardId })
	}
	if (!wanted.size) {
		recordToday()
		return
	}
	setState({ refresh: { ...state.refresh, running: true, done: 0, total: wanted.size, failed: 0 } })
	let done = 0
	let failed = 0
	const fresh: Record<string, CardInfo> = {}
	await Promise.all(
		[...wanted.entries()].map(([key, ref]) =>
			runLimited(async () => {
				try {
					const { card, stale } = await loadCard(ref.catalog, ref.id, { force: true })
					if (card) fresh[key] = card
					// A saved copy came back instead of a fresh answer: the network is down.
					if (!card || stale) failed++
				} catch {
					failed++
				}
				done++
				if (done % 5 === 0 || done === wanted.size) {
					setState({ refresh: { ...state.refresh, done, failed } })
				}
			}),
		),
	)
	const cards = { ...state.cards }
	for (const [key, card] of Object.entries(fresh)) {
		if (!cards[key] || cards[key].fetchedAt <= card.fetchedAt) cards[key] = card
	}
	const lastRun = failed < wanted.size ? Date.now() : state.refresh.lastRun
	setState({ cards, refresh: { running: false, done, total: wanted.size, failed, lastRun } })
	void save('lastRun', lastRun)
	recordToday()
}

/** The most recent moment a price arrived for a card of the collection, or null if none has yet. */
export function latestPriceTime(s: Pick<State, 'holdings' | 'cards' | 'refresh'>): number | null {
	let latest = s.refresh.lastRun ?? 0
	for (const h of s.holdings) latest = Math.max(latest, s.cards[cardKey(h)]?.fetchedAt ?? 0)
	return latest || null
}

// ------------------------------------------------------------ backup

export interface BackupFile {
	app: 'raccoglitore'
	version: 1
	exportedAt: string
	holdings: Holding[]
	settings: Settings
	snapshots: Snapshot[]
	hist: State['hist']
}

export function exportData(): BackupFile {
	return {
		app: 'raccoglitore',
		version: 1,
		exportedAt: new Date().toISOString(),
		holdings: state.holdings,
		settings: state.settings,
		snapshots: state.snapshots,
		hist: state.hist,
	}
}

export function markBackedUp() {
	setState({ lastBackup: Date.now() })
}

/** Reads a backup file. Throws with a message for the user when the file is not a backup. */
export function importData(raw: unknown, mode: 'replace' | 'merge'): { added: number; total: number } {
	const file = raw as Partial<BackupFile> | null
	if (!file || typeof file !== 'object' || !Array.isArray(file.holdings)) {
		throw new Error('Questo file non è un backup di Raccoglitore.')
	}
	const incoming = file.holdings.map(cleanHolding).filter((h): h is Holding => !!h)
	if (file.holdings.length && !incoming.length) throw new Error('Il backup non contiene carte leggibili.')
	if (mode === 'replace') {
		setState({
			holdings: incoming,
			settings: cleanSettings(file.settings),
			snapshots: Array.isArray(file.snapshots) ? file.snapshots : [],
			hist: file.hist && typeof file.hist === 'object' ? file.hist : {},
			cards: {},
		})
		void refreshPrices()
		return { added: incoming.length, total: incoming.length }
	}
	const have = new Set(state.holdings.map((h) => h.id))
	const extra = incoming.filter((h) => !have.has(h.id))
	const hist = { ...state.hist }
	for (const h of extra) if (file.hist?.[h.id]) hist[h.id] = file.hist[h.id]
	setState({ holdings: [...extra, ...state.holdings], hist })
	void refreshPrices()
	return { added: extra.length, total: state.holdings.length }
}

export function wipeAll() {
	setState({ holdings: [], snapshots: [], hist: {}, cards: {}, lastBackup: null })
}
