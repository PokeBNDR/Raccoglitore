import { getJsonMeta } from './cache'
import { fold } from './format'
import { getSets } from './tcgdex'
import type { CardInfo, Catalog, CmPrice } from './types'

declare const __SINGLE_FILE__: boolean
declare const __BUILD_TIME__: string

/** When this version of the app was built (0 where that is not known, as in the tests). */
const BUILT_AT = typeof __BUILD_TIME__ !== 'undefined' ? Date.parse(__BUILD_TIME__) || 0 : 0

/**
 * Sealed products (booster packs and boxes, Elite Trainer Boxes, tins, collections, decks…).
 *
 * Catalogue and prices are Cardmarket's own public files. A web page cannot read them directly,
 * so the site's build turns them into one compact file, `data/sealed.json`, once a day
 * (see scripts/build-sealed.mjs). Like for single cards there is one price per product:
 * Cardmarket does not split it by language.
 */

/** One product as stored in the file: id, name, category, expansion, then trend, avg, low, avg1, avg7, avg30 (0 = missing). */
export type SealedRow = [number, string, number, number, number, number, number, number, number, number]

export interface SealedFile {
	v: number
	updated: string | null
	built?: string
	/** Cardmarket category id → Cardmarket's own name for it. */
	cats: Record<string, string>
	/** Cardmarket expansion id → its name and the catalogue sets ("int:base1") it corresponds to. */
	exp: Record<string, { n?: string; s?: string[] }>
	p: SealedRow[]
	meta?: { products?: number; priced?: number; stale?: boolean; errors?: string[]; catCounts?: Record<string, number> }
}

export interface SealedProduct {
	id: number
	name: string
	cat: number
	/** How this kind of product is called and drawn. */
	kind: CatInfo
	exp: number
	/** Name of the expansion, in English. */
	expName: string
	/** The set of the card catalogue this expansion corresponds to. */
	set?: { catalog: Catalog; id: string }
	cm: CmPrice
}

export interface SealedIndex {
	updated: string | null
	stale: boolean
	/** Newest first. */
	products: SealedProduct[]
	byId: Map<number, SealedProduct>
	/** "catalogue:setId" → the products of that set's expansion. */
	bySet: Map<string, SealedProduct[]>
	cats: Record<string, string>
}

// ---------------------------------------------------------------- kinds of product

export type Glyph = 'box' | 'pack' | 'etb' | 'gift' | 'tin' | 'deck' | 'coin' | 'other'

export interface CatInfo {
	/** One product: "Busta". */
	one: string
	/** Heading of the group: "Buste". */
	many: string
	/** Position in lists: the products collectors look for first come first. */
	order: number
	glyph: Glyph
	/** What people type when they look for this kind of product, Italian and English. */
	words: string
	/**
	 * Listed by Cardmarket next to the sealed products without being one: coins, lots of loose
	 * cards, complete sets of cards. Shown after the sealed products.
	 */
	extra?: boolean
}

const CATS: Record<number, CatInfo> = {
	53: { one: 'Display', many: 'Display (box di buste)', order: 1, glyph: 'box', words: 'display booster box boosterbox scatola' },
	52: { one: 'Busta', many: 'Buste', order: 2, glyph: 'pack', words: 'booster pack busta bustina buste bustine pacchetto' },
	1083: { one: 'Blister', many: 'Blister', order: 3, glyph: 'pack', words: 'blister' },
	1016: {
		one: 'ETB',
		many: 'Set Allenatore Fuoriclasse (ETB)',
		order: 4,
		glyph: 'etb',
		words: 'etb elite trainer box set allenatore fuoriclasse',
	},
	1015: {
		one: 'Collezione',
		many: 'Collezioni e cofanetti',
		order: 5,
		glyph: 'gift',
		words: 'box set collection collezione cofanetto premium bundle',
	},
	1014: { one: 'Tin', many: 'Tin', order: 6, glyph: 'tin', words: 'tin latta scatola di latta' },
	54: { one: 'Mazzo', many: 'Mazzi', order: 7, glyph: 'deck', words: 'theme deck mazzo mazzi deck' },
	1013: { one: 'Kit Allenatore', many: 'Kit Allenatore', order: 8, glyph: 'deck', words: 'trainer kit kit allenatore' },
	1654: {
		one: 'Set completo',
		many: 'Set completi di carte',
		order: 20,
		glyph: 'deck',
		words: 'full set main set master set completo completi',
		extra: true,
	},
	1064: { one: 'Lotto', many: 'Lotti e carte promo', order: 21, glyph: 'other', words: 'lot lotto lotti promo', extra: true },
	1017: { one: 'Moneta', many: 'Monete', order: 22, glyph: 'coin', words: 'coin moneta monete', extra: true },
}

/** How a Cardmarket category is shown. Categories this app does not know keep Cardmarket's name. */
export function catInfo(cat: number | undefined, raw?: string): CatInfo {
	const known = cat != null ? CATS[cat] : undefined
	if (known) return known
	const name = (raw ?? '').replace(/^Pok[ée]mon\s+/i, '').trim() || 'Prodotto'
	return { one: name, many: name, order: 50, glyph: 'other', words: name }
}

// ---------------------------------------------------------------- index

const price = (v: number): number | null => (typeof v === 'number' && v > 0 ? v : null)

const KNOWN_CATALOGS = ['int', 'ja', 'ko', 'zh-tw', 'zh-cn']

function parseSetKey(key: string): { catalog: Catalog; id: string } | undefined {
	const i = key.indexOf(':')
	if (i <= 0) return undefined
	const catalog = key.slice(0, i)
	const id = key.slice(i + 1)
	return KNOWN_CATALOGS.includes(catalog) && id ? { catalog: catalog as Catalog, id } : undefined
}

export function buildIndex(file: SealedFile, stale = false): SealedIndex {
	const expInfo = new Map<number, { name: string; sets: Array<{ catalog: Catalog; id: string }> }>()
	for (const [id, e] of Object.entries(file.exp ?? {})) {
		const sets = (e?.s ?? []).map(parseSetKey).filter((s): s is { catalog: Catalog; id: string } => !!s)
		// The international set is the one a product page links to when an expansion has several.
		sets.sort((a, b) => Number(b.catalog === 'int') - Number(a.catalog === 'int'))
		expInfo.set(Number(id), { name: e?.n ?? '', sets })
	}
	const products: SealedProduct[] = []
	const byId = new Map<number, SealedProduct>()
	const byExp = new Map<number, SealedProduct[]>()
	for (const row of file.p ?? []) {
		if (!Array.isArray(row) || typeof row[0] !== 'number' || typeof row[1] !== 'string') continue
		const info = expInfo.get(row[3])
		const p: SealedProduct = {
			id: row[0],
			name: row[1],
			cat: row[2],
			kind: catInfo(row[2], file.cats?.[row[2]]),
			exp: row[3],
			expName: info?.name ?? '',
			set: info?.sets[0],
			cm: {
				idProduct: row[0],
				unit: 'EUR',
				updated: file.updated ?? undefined,
				trend: price(row[4]),
				avg: price(row[5]),
				low: price(row[6]),
				avg1: price(row[7]),
				avg7: price(row[8]),
				avg30: price(row[9]),
			},
		}
		products.push(p)
		byId.set(p.id, p)
		let list = byExp.get(p.exp)
		if (!list) byExp.set(p.exp, (list = []))
		list.push(p)
	}
	products.sort((a, b) => b.id - a.id)
	const bySet = new Map<string, SealedProduct[]>()
	for (const [exp, info] of expInfo) {
		const list = byExp.get(exp)
		if (!list) continue
		for (const s of info.sets) bySet.set(`${s.catalog}:${s.id}`, [...(bySet.get(`${s.catalog}:${s.id}`) ?? []), ...list])
	}
	return { updated: file.updated ?? null, stale, products, byId, bySet, cats: file.cats ?? {} }
}

/** The sealed products of a set, grouped by kind in the order collectors expect. */
export function sealedOfSet(index: SealedIndex | null | undefined, catalog: Catalog, setId: string): SealedProduct[] {
	return sortSealed(index?.bySet.get(`${catalog}:${setId}`) ?? [])
}

export function sortSealed(list: SealedProduct[]): SealedProduct[] {
	return list.slice().sort((a, b) => a.kind.order - b.kind.order || a.cat - b.cat || a.name.localeCompare(b.name, 'en', { numeric: true }))
}

/** Lower-case words of a text, each preceded by a space: " 151 elite trainer box". */
const wordsOf = (text: string): string =>
	' ' +
	fold(text)
		.split(/[^a-z0-9]+/)
		.filter(Boolean)
		.join(' ')

const hayCache = new WeakMap<SealedProduct, string>()
function hay(p: SealedProduct, cats: Record<string, string>): string {
	let h = hayCache.get(p)
	if (h === undefined) {
		// The group heading is left out: "Display (box di buste)" would make every box answer to "buste".
		h = wordsOf([p.name, p.expName, p.kind.one, p.kind.words, cats[p.cat] ?? ''].join(' '))
		hayCache.set(p, h)
	}
	return h
}

/**
 * Products whose name, expansion or kind have a word starting with each word typed. Newest first.
 * Whole words, not pieces of them: "tin" must not find "Destined Rivals".
 * `altName` gives another name the expansion goes by (its Italian name), to search by that too.
 */
export function searchSealed(
	index: SealedIndex | null | undefined,
	query: string,
	altName?: (p: SealedProduct) => string | undefined,
): SealedProduct[] {
	if (!index) return []
	const words = wordsOf(query).split(' ').filter(Boolean)
	if (!words.length) return []
	const found = index.products.filter((p) => {
		let h = hay(p, index.cats)
		const alt = altName?.(p)
		if (alt) h += wordsOf(alt)
		return words.every((w) => h.includes(' ' + w))
	})
	// Coins, lots and complete sets answer too, after the sealed products.
	return found.sort((a, b) => Number(!!a.kind.extra) - Number(!!b.kind.extra))
}

// ---------------------------------------------------------------- loading

const TTL = 6 * 3_600_000
let built: { src: SealedFile; stale: boolean; index: SealedIndex } | null = null
/** The saved copy of the file has been compared with the age of this version of the app. */
let buildChecked = false
let buildTriedAt = 0

/** Address of the data file, next to the app's own page. */
export const sealedUrl = (): string => new URL('data/sealed.json', document.baseURI).href

/**
 * The catalogue of sealed products. `index` is null when the file is not there
 * (for example in the single-file version of the app, which has no data folder).
 */
export async function loadSealed(opts: { force?: boolean } = {}): Promise<{ index: SealedIndex | null; t: number; stale: boolean }> {
	// The one-file version of the app is opened from disk and has nothing next to it to load.
	if (typeof __SINGLE_FILE__ !== 'undefined' && __SINGLE_FILE__) return { index: null, t: Date.now(), stale: false }
	const asked = Date.now()
	// `fresh`: the file sits next to the app, where the browser would otherwise reuse for ten minutes
	// the copy it already has, even right after a new version went online.
	let a = await getJsonMeta<SealedFile>(sealedUrl(), TTL, { force: opts.force, fresh: true })
	// The file is rebuilt every time the app is: a copy saved before this version of the app was made
	// is older than the one online, whatever its age. Settled once per session, so that a device with
	// its clock set back does not download the file over and over.
	if (!buildChecked && !a.stale) {
		const fromSaved = a.t < asked
		if (!fromSaved || a.t >= BUILT_AT) buildChecked = true
		else if (asked - buildTriedAt > 60_000) {
			buildTriedAt = asked
			const b = await getJsonMeta<SealedFile>(sealedUrl(), TTL, { force: true, fresh: true }).catch(() => null)
			// With no network the saved copy keeps being used, and the question is asked again later.
			if (b && !b.stale) {
				a = b
				buildChecked = true
			}
		}
	}
	const file = a.data
	if (!file || file.v !== 1 || !Array.isArray(file.p) || !file.p.length) return { index: null, t: a.t, stale: a.stale }
	if (built?.src !== file || built.stale !== a.stale) built = { src: file, stale: a.stale, index: buildIndex(file, a.stale) }
	return { index: built.index, t: a.t, stale: a.stale }
}

/** A sealed product in the shape the rest of the app uses for cards: one version, one price list. */
export function sealedCard(p: SealedProduct, fetchedAt: number, setName?: string): CardInfo {
	return {
		key: `sealed:${p.id}`,
		catalog: 'sealed',
		sealed: { cat: p.cat, exp: p.exp, setCatalog: p.set?.catalog },
		id: String(p.id),
		localId: '',
		name: p.name,
		images: {},
		set: { id: p.set?.id ?? '', name: setName || p.expName },
		// Shown where a card shows its rarity: the kind of product.
		rarity: p.kind.one,
		variants: [{ key: 'sealed', type: p.kind.extra ? 'item' : 'sealed', stamps: [], cmId: p.id, cm: p.cm }],
		cm: p.cm,
		tcg: null,
		fetchedAt,
	}
}

let lastForced = 0

export async function loadSealedCard(id: string, opts: { force?: boolean } = {}): Promise<{ card: CardInfo | null; stale: boolean }> {
	// All products are in one file: refreshing many of them in a row downloads it once, not once each.
	const force = !!opts.force && Date.now() - lastForced > 60_000
	if (force) lastForced = Date.now()
	const { index, t, stale } = await loadSealed({ force })
	const p = index?.byId.get(Number(id))
	if (!p) return { card: null, stale }
	// International sets have an Italian name in the card catalogue: use it when it is at hand.
	let setName: string | undefined
	if (p.set?.catalog === 'int') {
		try {
			setName = (await getSets('int')).find((s) => s.id === p.set!.id)?.name
		} catch {
			/* offline with no saved list: the English name is shown */
		}
	}
	return { card: sealedCard(p, t, setName), stale }
}
