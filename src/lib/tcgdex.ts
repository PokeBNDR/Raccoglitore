import { getJson, getJsonMeta, type GetOpts } from './cache'
import { fold } from './format'
import type { CardBrief, CardInfo, Catalog, CmPrice, SetBrief, SetFull, VariantOpt } from './types'

/**
 * Card catalogue, pictures and Cardmarket prices come from TCGdex (https://tcgdex.dev),
 * an open database. Prices are Cardmarket's own daily price guide, refreshed once a day.
 */
export const API: string = (import.meta.env.VITE_API_BASE as string | undefined) ?? 'https://api.tcgdex.net/v2'

const H = 3_600_000
const TTL = { sets: 12 * H, set: 12 * H, card: 6 * H, search: H / 6, series: 7 * 24 * H }

interface RawBrief {
	id: string
	localId: string
	name: string
	image?: string
}
interface RawSetBrief {
	id: string
	name: string
	logo?: string
	symbol?: string
	cardCount?: { total?: number; official?: number }
}
interface RawSet extends RawSetBrief {
	releaseDate?: string
	serie?: { id: string; name: string }
	cards?: RawBrief[]
}
interface RawVariant {
	type?: string
	subtype?: string
	size?: string
	stamp?: string[]
	foil?: string
	variantId?: string
	thirdParty?: { cardmarket?: number }
	pricing?: { cardmarket?: CmPrice | null }
}
interface RawCard extends RawBrief {
	category?: string
	illustrator?: string
	rarity?: string
	set?: RawSetBrief
	variants?: Record<string, boolean>
	variants_detailed?: RawVariant[]
	dexId?: number[]
	hp?: number
	types?: string[]
	pricing?: { cardmarket?: CmPrice | null; tcgplayer?: Record<string, unknown> | null }
}

const enc = encodeURIComponent

/** International cards are read in Italian for names and pictures, in English for everything else. */
const langsOf = (c: Catalog): string[] => (c === 'int' ? ['en', 'it'] : [c])

async function perLang<T>(catalog: Catalog, path: string, ttl: number, opts?: GetOpts): Promise<Record<string, T | null>> {
	const langs = langsOf(catalog)
	const res = await Promise.allSettled(langs.map((l) => getJson<T>(`${API}/${l}/${path}`, ttl, opts)))
	const out: Record<string, T | null> = {}
	let failure: unknown = null
	let ok = 0
	res.forEach((r, i) => {
		if (r.status === 'fulfilled') {
			out[langs[i]] = r.value
			ok++
		} else {
			out[langs[i]] = null
			failure = failure ?? r.reason
		}
	})
	if (!ok) throw failure
	return out
}

function imagesOf(byLang: Record<string, { image?: string } | null | undefined>): Record<string, string> {
	const out: Record<string, string> = {}
	for (const [l, v] of Object.entries(byLang)) if (v?.image) out[l] = v.image
	return out
}

/** The set id is everything before "-<number>" (set ids can contain dashes themselves). */
export function setIdOf(b: { id: string; localId: string }): string {
	return b.id.length > b.localId.length + 1 ? b.id.slice(0, b.id.length - b.localId.length - 1) : b.id
}

function mergeBriefs(catalog: Catalog, lists: Record<string, RawBrief[] | null | undefined>): CardBrief[] {
	const order: string[] = []
	const map = new Map<string, Record<string, RawBrief>>()
	for (const l of langsOf(catalog)) {
		for (const b of lists[l] ?? []) {
			if (!b?.id) continue
			let rec = map.get(b.id)
			if (!rec) {
				rec = {}
				map.set(b.id, rec)
				order.push(b.id)
			}
			rec[l] = b
		}
	}
	return order.map((id) => {
		const rec = map.get(id)!
		const main = rec.it ?? rec.en ?? Object.values(rec)[0]
		const alt = rec.en && rec.en.name !== main.name ? rec.en.name : undefined
		return {
			catalog,
			id,
			localId: main.localId,
			setId: setIdOf(main),
			name: main.name,
			nameAlt: alt,
			images: imagesOf(rec),
		}
	})
}

// ---------------------------------------------------------------- sets

/** Digital-only cards (Pokémon TCG Pocket) are left out: this is a collection of physical cards. */
async function digitalSets(catalog: Catalog): Promise<Set<string>> {
	if (catalog !== 'int') return new Set()
	try {
		const serie = await getJson<{ sets?: Array<{ id: string }> }>(`${API}/en/series/tcgp`, TTL.series)
		return new Set((serie?.sets ?? []).map((s) => s.id))
	} catch {
		return new Set()
	}
}

export async function getSets(catalog: Catalog): Promise<SetBrief[]> {
	const [lists, digital] = await Promise.all([perLang<RawSetBrief[]>(catalog, 'sets', TTL.sets), digitalSets(catalog)])
	const langs = langsOf(catalog)
	const order: string[] = []
	const map = new Map<string, Record<string, RawSetBrief>>()
	for (const l of langs) {
		for (const s of lists[l] ?? []) {
			if (!s?.id || digital.has(s.id)) continue
			let rec = map.get(s.id)
			if (!rec) {
				rec = {}
				map.set(s.id, rec)
				order.push(s.id)
			}
			rec[l] = s
		}
	}
	return order.map((id, i) => {
		const rec = map.get(id)!
		const main = rec.it ?? rec.en ?? Object.values(rec)[0]
		const any = rec.en ?? main
		return {
			catalog,
			id,
			name: main.name,
			logo: main.logo ?? any.logo,
			symbol: main.symbol ?? any.symbol,
			official: any.cardCount?.official ?? main.cardCount?.official ?? 0,
			total: Math.max(any.cardCount?.total ?? 0, main.cardCount?.total ?? 0),
			order: i,
		}
	})
}

export async function getSet(catalog: Catalog, id: string): Promise<SetFull | null> {
	const sets = await perLang<RawSet>(catalog, `sets/${enc(id)}`, TTL.set)
	const main = sets.it ?? sets.en ?? Object.values(sets).find(Boolean)
	const any = sets.en ?? main
	if (!main || !any) return null
	const lists: Record<string, RawBrief[] | null> = {}
	for (const [l, s] of Object.entries(sets)) lists[l] = s?.cards ?? null
	return {
		catalog,
		id: any.id,
		name: main.name,
		logo: main.logo ?? any.logo,
		symbol: main.symbol ?? any.symbol,
		official: any.cardCount?.official ?? 0,
		total: Math.max(any.cardCount?.total ?? 0, main.cardCount?.total ?? 0),
		order: 0,
		releaseDate: any.releaseDate ?? main.releaseDate,
		serie: main.serie ?? any.serie,
		cards: mergeBriefs(catalog, lists),
	}
}

// ---------------------------------------------------------------- cards

const TYPE_IT: Record<string, string> = { normale: 'normal', olografica: 'holo', reverse: 'reverse', metallo: 'metal' }

function normVariants(raw: RawCard): VariantOpt[] {
	const out: VariantOpt[] = []
	const seen = new Set<string>()
	for (const v of raw.variants_detailed ?? []) {
		const t = (v.type ?? 'normal').toLowerCase()
		const type = TYPE_IT[t] ?? t
		const stamps = (v.stamp ?? []).filter(Boolean)
		const key =
			v.variantId && v.variantId !== 'generated'
				? v.variantId
				: [type, v.subtype ?? '', stamps.slice().sort().join('+'), v.foil ?? ''].join('|')
		if (seen.has(key)) continue
		seen.add(key)
		out.push({
			key,
			type,
			subtype: v.subtype || undefined,
			stamps,
			foil: v.foil || undefined,
			size: v.size ? v.size.toLowerCase() : undefined,
			cmId: v.thirdParty?.cardmarket ?? v.pricing?.cardmarket?.idProduct,
			cm: v.pricing?.cardmarket ?? undefined,
		})
	}
	if (out.length) return out
	const b = raw.variants ?? {}
	const add = (type: string, stamps: string[] = []) =>
		out.push({ key: [type, '', stamps.join('+'), ''].join('|'), type, stamps })
	for (const type of ['normal', 'holo', 'reverse']) {
		if (!b[type]) continue
		add(type)
		if (b.firstEdition) add(type, ['1st-edition'])
	}
	if (!out.length) add('normal')
	return out
}

type Species = Array<[number, string, string, string, string, string]>
let speciesP: Promise<Species> | null = null
export function loadSpecies(): Promise<Species> {
	speciesP ??= import('./species.json').then((m) => m.default as unknown as Species)
	return speciesP
}

async function speciesName(dex: number[] | undefined): Promise<string | undefined> {
	if (!dex?.length) return undefined
	try {
		const sp = await loadSpecies()
		const names = dex.map((d) => sp.find((s) => s[0] === d)?.[1]).filter(Boolean)
		return names.length ? names.join(' & ') : undefined
	} catch {
		return undefined
	}
}

async function normCard(
	catalog: Catalog,
	byLang: Record<string, RawCard | null>,
	fetchedAt: number = Date.now(),
): Promise<CardInfo | null> {
	const src = byLang.en ?? Object.values(byLang).find(Boolean)
	if (!src) return null
	const shown = byLang.it ?? src
	let nameAlt = byLang.en && byLang.en.name !== shown.name ? byLang.en.name : undefined
	if (catalog !== 'int') nameAlt = await speciesName(src.dexId)
	return {
		key: `${catalog}:${src.id}`,
		catalog,
		id: src.id,
		localId: src.localId,
		name: shown.name,
		nameAlt,
		images: imagesOf(byLang),
		set: {
			id: src.set?.id ?? setIdOf(src),
			name: shown.set?.name ?? src.set?.name ?? '',
			official: src.set?.cardCount?.official,
			total: src.set?.cardCount?.total,
			symbol: src.set?.symbol,
			logo: shown.set?.logo ?? src.set?.logo,
		},
		rarity: shown.rarity ?? src.rarity,
		category: src.category,
		illustrator: src.illustrator,
		hp: src.hp,
		types: shown.types ?? src.types,
		dexId: src.dexId,
		variants: normVariants(src),
		cm: src.pricing?.cardmarket ?? null,
		tcg: src.pricing?.tcgplayer ?? null,
		fetchedAt,
	}
}

/**
 * Full card with prices. `force` asks the network again for the prices.
 * `stale` is true when the network failed and an older saved copy is returned instead;
 * `fetchedAt` on the card is always the time the prices were really received.
 */
export async function loadCard(
	catalog: Catalog,
	id: string,
	opts: { force?: boolean } = {},
): Promise<{ card: CardInfo | null; stale: boolean }> {
	const path = `cards/${enc(id)}`
	if (catalog !== 'int') {
		const a = await getJsonMeta<RawCard>(`${API}/${catalog}/${path}`, TTL.card, { force: opts.force })
		return { card: await normCard(catalog, { [catalog]: a.data }, a.t), stale: a.stale }
	}
	// Names do not change: only the English record, which carries the prices, is refreshed.
	const [en, it] = await Promise.allSettled([
		getJsonMeta<RawCard>(`${API}/en/${path}`, TTL.card, { force: opts.force }),
		getJsonMeta<RawCard>(`${API}/it/${path}`, 30 * 24 * H),
	])
	if (en.status === 'rejected' && it.status === 'rejected') throw en.reason
	const enA = en.status === 'fulfilled' ? en.value : null
	const itA = it.status === 'fulfilled' ? it.value : null
	const priced = enA?.data ? enA : itA
	const card = await normCard('int', { en: enA?.data ?? null, it: itA?.data ?? null }, priced?.t ?? Date.now())
	return { card, stale: en.status === 'rejected' || !!priced?.stale }
}

export async function getCard(catalog: Catalog, id: string, opts: { force?: boolean } = {}): Promise<CardInfo | null> {
	return (await loadCard(catalog, id, opts)).card
}

/** Prices only (one request): used for the price tags in search results and set pages. */
export async function getCardLite(catalog: Catalog, id: string): Promise<CardInfo | null> {
	const lang = catalog === 'int' ? 'en' : catalog
	const a = await getJsonMeta<RawCard>(`${API}/${lang}/cards/${enc(id)}`, TTL.card)
	if (a.data) return normCard(catalog, { [lang]: a.data }, a.t)
	return catalog === 'int' ? getCard(catalog, id) : null
}

/** The version most people mean by "the card": unstamped, standard print. */
export function defaultVariant(card: CardInfo): VariantOpt {
	const vs = card.variants
	const plain = (v: VariantOpt) => v.stamps.length === 0 && (!v.size || v.size === 'standard')
	return (
		vs.find((v) => plain(v) && v.type !== 'reverse' && (!v.subtype || v.subtype === 'unlimited') && !v.foil) ??
		vs.find((v) => plain(v) && v.type !== 'reverse') ??
		vs.find(plain) ??
		vs[0]
	)
}

// ---------------------------------------------------------------- search

export interface ParsedQuery {
	name: string
	num?: number
	total?: number
}

/** "pikachu 58/102" → name + number + set size. A bare trailing number is read as the card number. */
export function parseQuery(input: string): ParsedQuery {
	let s = input.trim().replace(/\s+/g, ' ')
	let num: number | undefined
	let total: number | undefined
	const frac = s.match(/(?:^|\s)#?(\d{1,4})\s*\/\s*(\d{1,4})$/)
	if (frac) {
		num = parseInt(frac[1], 10)
		total = parseInt(frac[2], 10)
		s = s.slice(0, frac.index).trim()
	} else {
		const tail = s.match(/(?:^|\s)#?(\d{1,4})$/)
		if (tail && (tail.index ?? 0) > 0) {
			num = parseInt(tail[1], 10)
			s = s.slice(0, tail.index).trim()
		} else if (tail && /^#?\d{1,4}$/.test(s)) {
			num = parseInt(tail[1], 10)
			s = ''
		}
	}
	return { name: s, num, total }
}

const numOf = (localId: string) => (/^\d+$/.test(localId) ? parseInt(localId, 10) : NaN)

export interface SearchResult {
	cards: CardBrief[]
	/** The number filter matched nothing, so it was dropped. */
	numberIgnored: boolean
	/** A bare number was typed: a name or the set size is needed. */
	needMore: boolean
}

export async function searchCards(catalog: Catalog, input: string, signal?: AbortSignal): Promise<SearchResult> {
	const q = parseQuery(input)
	const opts: GetOpts = { signal, memoryOnly: true }
	const sets = await getSets(catalog).catch(() => [] as SetBrief[])
	const setById = new Map(sets.map((s) => [s.id, s]))
	let cards: CardBrief[] = []

	if (!q.name) {
		if (q.num == null || q.total == null) return { cards: [], numberIgnored: false, needMore: q.num != null }
		// "4/102": look the number up in every set of that size.
		const wanted = sets.filter((s) => s.official === q.total).slice(-12)
		const found = await Promise.all(
			wanted.map(async (s) => {
				try {
					const lists = await perLang<RawCard>(catalog, `sets/${enc(s.id)}/${q.num}`, TTL.search, opts)
					const briefs: Record<string, RawBrief[] | null> = {}
					for (const [l, c] of Object.entries(lists)) briefs[l] = c ? [c] : null
					return mergeBriefs(catalog, briefs)
				} catch (err) {
					if ((err as Error)?.name === 'AbortError') throw err
					return []
				}
			}),
		)
		cards = found.flat()
		return { cards: sortBriefs(cards, setById), numberIgnored: false, needMore: false }
	}

	if (catalog === 'int') {
		const lists = await perLang<RawBrief[]>(catalog, `cards?name=${enc(q.name)}`, TTL.search, opts)
		cards = mergeBriefs(catalog, lists)
	} else {
		cards = await searchAsian(catalog, q.name, opts)
	}
	cards = cards.filter((c) => setById.size === 0 || setById.has(c.setId))

	let numberIgnored = false
	if (q.num != null) {
		const hit = cards.filter((c) => {
			if (numOf(c.localId) !== q.num) return false
			return q.total == null || setById.get(c.setId)?.official === q.total
		})
		if (hit.length) cards = hit
		else numberIgnored = true
	}
	return { cards: sortBriefs(cards, setById), numberIgnored, needMore: false }
}

/**
 * Asian cards are named in their own script. A name typed in Latin letters is matched against
 * the Pokémon species list and looked up by Pokédex number instead.
 */
async function searchAsian(catalog: Catalog, name: string, opts: GetOpts): Promise<CardBrief[]> {
	const out = new Map<string, CardBrief>()
	const jobs: Array<Promise<void>> = []
	const latin = /^[\p{Script=Latin}\d\s.'’:\-♀♂]+$/u.test(name)
	if (latin) {
		const sp = await loadSpecies().catch(() => [] as Species)
		const f = fold(name)
		const score = (s: Species[number]) => {
			let best = 0
			for (const n of [s[1], s[2], s[3], s[4]]) {
				const fn = fold(n)
				if (!fn) continue
				if (fn === f) best = Math.max(best, 3)
				else if (fn.startsWith(f)) best = Math.max(best, 2)
				else if (f.length >= 4 && fn.includes(f)) best = Math.max(best, 1)
			}
			return best
		}
		const hits = sp
			.map((s) => ({ s, k: score(s) }))
			.filter((x) => x.k > 0)
			.sort((a, b) => b.k - a.k || a.s[0] - b.s[0])
			.slice(0, 6)
		for (const { s } of hits) {
			jobs.push(
				getJson<{ cards?: RawBrief[] }>(`${API}/${catalog}/dex-ids/${s[0]}`, TTL.search, opts).then((res) => {
					for (const b of res?.cards ?? []) {
						if (!out.has(b.id)) {
							out.set(b.id, {
								catalog,
								id: b.id,
								localId: b.localId,
								setId: setIdOf(b),
								name: b.name,
								nameAlt: s[1],
								images: b.image ? { [catalog]: b.image } : {},
							})
						}
					}
				}),
			)
		}
	}
	jobs.push(
		getJson<RawBrief[]>(`${API}/${catalog}/cards?name=${enc(name)}`, TTL.search, opts).then((res) => {
			for (const b of mergeBriefs(catalog, { [catalog]: res ?? [] })) if (!out.has(b.id)) out.set(b.id, b)
		}),
	)
	const done = await Promise.allSettled(jobs)
	const aborted = done.find((d) => d.status === 'rejected' && (d.reason as Error)?.name === 'AbortError')
	if (aborted) throw (aborted as PromiseRejectedResult).reason
	if (!out.size) {
		const failed = done.find((d) => d.status === 'rejected') as PromiseRejectedResult | undefined
		if (failed && done.every((d) => d.status === 'rejected')) throw failed.reason
	}
	return [...out.values()]
}

/** Newest sets first, then by card number. */
function sortBriefs(cards: CardBrief[], setById: Map<string, SetBrief>): CardBrief[] {
	return cards.slice().sort((a, b) => {
		const oa = setById.get(a.setId)?.order ?? -1
		const ob = setById.get(b.setId)?.order ?? -1
		if (oa !== ob) return ob - oa
		const na = numOf(a.localId)
		const nb = numOf(b.localId)
		if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb
		return a.localId.localeCompare(b.localId)
	})
}

// ---------------------------------------------------------------- pictures

const ASSET = /^(https?:\/\/[^/]+\/)([^/]+)(\/.+)$/

/**
 * Picture urls to try, best first: the card's own language, then Italian, English and whatever exists.
 * The catalogue lists a picture only where one exists, so other languages are tried by swapping the
 * language folder and falling through when the file is missing.
 */
export function imageCandidates(images: Record<string, string>, prefer: string[], quality: 'low' | 'high'): string[] {
	const out: string[] = []
	const push = (base?: string) => {
		if (!base) return
		const url = `${base}/${quality}.webp`
		if (!out.includes(url)) out.push(url)
	}
	const any = images.en ?? images.it ?? Object.values(images)[0]
	for (const l of prefer) {
		if (images[l]) push(images[l])
		// Italian and English are always asked for: when they are absent the picture does not exist.
		else if (any && l !== 'it' && l !== 'en') {
			const m = any.match(ASSET)
			if (m && l !== m[2]) push(`${m[1]}${l}${m[3]}`)
		}
	}
	push(images.it)
	push(images.en)
	for (const v of Object.values(images)) push(v)
	return out
}

/**
 * Logo urls of a set to try, best first. The catalogue now and then lists a logo whose webp file is
 * missing while the png is there, so: webp, png, the English logo when the Italian one fails, and
 * last the small set symbol.
 */
export function logoCandidates(logo?: string, symbol?: string): string[] {
	const out: string[] = []
	const push = (base?: string) => {
		if (!base) return
		for (const ext of ['webp', 'png']) {
			const url = `${base}.${ext}`
			if (!out.includes(url)) out.push(url)
		}
	}
	push(logo)
	const m = logo?.match(ASSET)
	if (m && m[2] === 'it') push(`${m[1]}en${m[3]}`)
	push(symbol)
	return out
}
