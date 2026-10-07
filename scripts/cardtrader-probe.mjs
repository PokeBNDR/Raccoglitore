// A trial run against CardTrader's API, to find out whether it can give the app what Cardmarket's
// public files do not have: real prices by language and by condition.
//
// It asks a few dozen questions (which games, which expansions, how a card and an offer are
// described, how many offers come back per language) and writes the answers to three small files
// in public/data/ (cardtrader-report.json, cardtrader-targets.json, cardtrader-expansions.json),
// published with the site so they can be read from its address.
// Only numbers and field names go in them: no seller names, no account data, no free text.
//
//   CARDTRADER_TOKEN=… node scripts/cardtrader-probe.mjs
//
// Without the token it does nothing. It never fails the build.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const API = (process.env.CARDTRADER_API || 'https://api.cardtrader.com/api/v2').replace(/\/$/, '')
const TOKEN = (process.env.CARDTRADER_TOKEN || '').trim()
const OUT = resolve(process.env.CT_OUT || resolve(HERE, '../public/data/cardtrader-report.json'))
const OUT_TARGETS = resolve(dirname(OUT), 'cardtrader-targets.json')
const OUT_EXP = resolve(dirname(OUT), 'cardtrader-expansions.json')
const CM = 'https://downloads.s3.cardmarket.com/productCatalog/productList'
const CM_SINGLES = process.env.CM_SINGLES || `${CM}/products_singles_6.json`
const CM_NONSINGLES = process.env.CM_NONSINGLES || `${CM}/products_nonsingles_6.json`
const ORIGIN = process.env.SITE_ORIGIN || 'https://pokebndr.github.io'
const BUDGET_MS = Number(process.env.CT_BUDGET_MS || 240_000)
/** Pause before a marketplace call: the documentation gives two limits, this respects the stricter one. */
const MARKET_GAP_MS = Number(process.env.CT_MARKET_GAP_MS || 1200)
const GAP_MS = Number(process.env.CT_GAP_MS || 250)
const LANGS = ['it', 'en', 'de', 'fr', 'es', 'pt', 'jp']
const UA = 'Raccoglitore (personal Pokémon card portfolio; github.com/PokeBNDR/Raccoglitore)'

// ------------------------------------------------------------------ pure parts (tested)

/** A list out of the shapes the API uses: a plain array, or an object holding one. */
export function listOf(x) {
	if (Array.isArray(x)) return x
	for (const k of ['array', 'data', 'items', 'results']) if (Array.isArray(x?.[k])) return x[k]
	return []
}

/** How many times each value appears, most frequent first, at most `max` values. */
export function tally(values, max = 20) {
	const count = new Map()
	for (const v of values) {
		const k = v === undefined ? '(manca)' : v === null ? '(null)' : String(v).slice(0, 40)
		count.set(k, (count.get(k) ?? 0) + 1)
	}
	return Object.fromEntries([...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, max))
}

export function quantiles(numbers) {
	const list = numbers.filter((n) => typeof n === 'number' && Number.isFinite(n)).sort((a, b) => a - b)
	if (!list.length) return null
	const at = (q) => list[Math.min(list.length - 1, Math.floor(q * (list.length - 1) + 0.5))]
	return { n: list.length, min: list[0], q25: at(0.25), med: at(0.5), q75: at(0.75), max: list[list.length - 1] }
}

/** Price of an offer in cents, wherever the API puts it. */
export function centsOf(product) {
	const c = product?.price?.cents ?? product?.price_cents
	return typeof c === 'number' && Number.isFinite(c) ? c : null
}
export const currencyOf = (product) => product?.price?.currency ?? product?.price_currency ?? null

/** The property that carries the language ("mtg_language", "pokemon_language"…), if there is one. */
export function languageKey(products) {
	const count = new Map()
	for (const p of products) for (const k of Object.keys(p?.properties_hash ?? {})) if (/language/i.test(k)) count.set(k, (count.get(k) ?? 0) + 1)
	return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}

/**
 * What a list of offers looks like: how many, in which languages and conditions, at what prices.
 * Sellers and descriptions are never copied.
 */
export function describeOffers(products) {
	const list = products.filter((p) => p && typeof p === 'object')
	const langKey = languageKey(list)
	const prop = (p, k) => p?.properties_hash?.[k]
	const keys = new Map()
	for (const p of list) for (const k of Object.keys(p?.properties_hash ?? {})) keys.set(k, (keys.get(k) ?? 0) + 1)
	const out = {
		n: list.length,
		langKey,
		languages: tally(list.map((p) => (langKey ? prop(p, langKey) : undefined))),
		conditions: tally(list.map((p) => prop(p, 'condition'))),
		currencies: tally(list.map(currencyOf)),
		graded: tally(list.map((p) => p.graded)),
		hub: tally(list.map((p) => p?.user?.can_sell_via_hub)),
		sellerTypes: tally(list.map((p) => p?.user?.user_type)),
		sellerCountries: tally(
			list.map((p) => p?.user?.country_code),
			8,
		),
		bundle: tally(list.map((p) => p.bundle_size)),
		propertyKeys: Object.fromEntries([...keys.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)),
		cents: quantiles(list.map(centsOf)),
	}
	// The other yes/no properties (reverse, first edition, signed…): they change the price a lot.
	const flags = {}
	for (const k of keys.keys()) {
		if (k === 'condition' || k === langKey) continue
		const values = list.map((p) => prop(p, k)).filter((v) => v !== undefined)
		if (values.every((v) => typeof v === 'boolean' || v === null)) flags[k] = tally(values, 4)
	}
	out.flags = flags
	return out
}

/**
 * The yes/no properties that make an offer a special copy (reverse, first edition, signed…):
 * the ones that are set in some offers but not in most. One that is set everywhere says nothing.
 */
export function specialFlags(products) {
	const yes = new Map()
	let n = 0
	for (const p of products) {
		n++
		for (const [k, v] of Object.entries(p?.properties_hash ?? {})) if (v === true) yes.set(k, (yes.get(k) ?? 0) + 1)
	}
	return [...yes.entries()].filter(([, c]) => c / n < 0.5).map(([k]) => k).sort()
}

/** An offer of an ordinary copy: not graded, and none of the special properties set. */
export function isPlain(p, flags = []) {
	if (p?.graded) return false
	return !flags.some((k) => p?.properties_hash?.[k] === true)
}

/**
 * For one card: per language and per condition, the cheapest prices (cents) of the ordinary copies.
 * { it: { 'Near Mint': [500, 520…], … }, en: {…} }
 */
export function byLanguageAndCondition(products, { keep = 5, flags = [] } = {}) {
	const langKey = languageKey(products)
	const out = {}
	for (const p of products) {
		if (!isPlain(p, flags)) continue
		const lang = String((langKey && p?.properties_hash?.[langKey]) ?? '?')
		const cond = String(p?.properties_hash?.condition ?? '?')
		const cents = centsOf(p)
		if (cents == null) continue
		out[lang] ??= {}
		out[lang][cond] ??= []
		out[lang][cond].push(cents)
	}
	for (const lang of Object.keys(out)) for (const cond of Object.keys(out[lang])) out[lang][cond] = out[lang][cond].sort((a, b) => a - b).slice(0, keep)
	return out
}

/**
 * Over a whole expansion (one list of offers per card): in how many cards each language shows up
 * at all, and in how many with at least one or three Near Mint copies. It says whether one question
 * per expansion is enough to know the price of a language.
 */
export function coverage(lists, flags = []) {
	const cards = lists.length
	const any = {}
	const nm1 = {}
	const nm3 = {}
	const perCard = []
	for (const list of lists) {
		const langKey = languageKey(list)
		const seen = new Map()
		for (const p of list) {
			if (!isPlain(p, flags)) continue
			const lang = String((langKey && p?.properties_hash?.[langKey]) ?? '?')
			const entry = seen.get(lang) ?? { n: 0, nm: 0 }
			entry.n++
			if (/^(near mint|mint)$/i.test(String(p?.properties_hash?.condition ?? ''))) entry.nm++
			seen.set(lang, entry)
		}
		perCard.push(seen.size)
		for (const [lang, e] of seen) {
			any[lang] = (any[lang] ?? 0) + 1
			if (e.nm >= 1) nm1[lang] = (nm1[lang] ?? 0) + 1
			if (e.nm >= 3) nm3[lang] = (nm3[lang] ?? 0) + 1
		}
	}
	const top = (o) => Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 12))
	return { cards, languagesPerCard: quantiles(perCard), cardsWithLanguage: top(any), cardsWithNearMint: top(nm1), cardsWith3NearMint: top(nm3) }
}

/** A card as the API describes it, without pictures and long texts. */
export function trimBlueprint(b) {
	if (!b || typeof b !== 'object') return null
	const short = (v) => (typeof v === 'string' ? v.slice(0, 60) : v)
	const out = {}
	for (const [k, v] of Object.entries(b)) {
		if (/image|url|scryfall/i.test(k)) out[k] = v ? '(c’è)' : v
		else if (k === 'editable_properties') out[k] = listOf(v).map((p) => `${p?.name}:${p?.type}`)
		else if (v && typeof v === 'object' && !Array.isArray(v)) out[k] = Object.fromEntries(Object.entries(v).slice(0, 20).map(([a, c]) => [a, short(c)]))
		else if (Array.isArray(v)) out[k] = v.slice(0, 8).map(short)
		else out[k] = short(v)
	}
	return out
}

/** An offer as the API describes it: the seller is reduced to country and kind, texts are dropped. */
export function trimOffer(p) {
	if (!p || typeof p !== 'object') return null
	const out = {}
	for (const [k, v] of Object.entries(p)) {
		if (k === 'user') out.user = v ? { country_code: v.country_code, user_type: v.user_type, can_sell_via_hub: v.can_sell_via_hub, keys: Object.keys(v) } : v
		else if (k === 'description' || k === 'user_data_field' || k === 'tag') out[k] = v ? '(testo)' : v
		else if (k === 'id') out.id = '(numero)'
		else if (k === 'expansion') out.expansion = v ? { id: v.id, code: v.code, name_en: v.name_en } : v
		else if (v && typeof v === 'object' && !Array.isArray(v)) out[k] = Object.fromEntries(Object.entries(v).slice(0, 20).map(([a, c]) => [a, typeof c === 'string' ? c.slice(0, 40) : c]))
		else if (Array.isArray(v)) out[k] = v.slice(0, 6)
		else out[k] = typeof v === 'string' ? v.slice(0, 60) : v
	}
	return out
}

/** The expansions to look at closely: a recent popular one, an old one, a Japanese one. */
export function pickTargets(expansions) {
	const name = (e) => String(e?.name ?? e?.name_en ?? '')
	const code = (e) => String(e?.code ?? '').toLowerCase()
	const japanese = (e) => /japan|giappon|\bjp\b|\bjpn\b/i.test(name(e)) || /^(jp|ja)[-_]|[-_](jp|ja)$/.test(code(e))
	const newest = [...expansions].sort((a, b) => (b?.id ?? 0) - (a?.id ?? 0))
	const modern =
		expansions.find((e) => ['mew', 'sv3pt5', 'sv035', '151'].includes(code(e)) && !japanese(e)) ??
		expansions.find((e) => /^(scarlet\s*&\s*violet\s*[-:–—]?\s*)?151$/i.test(name(e).trim())) ??
		expansions.find((e) => /\b151\b/.test(name(e)) && !japanese(e))
	const old = expansions.find((e) => /^base set$/i.test(name(e).trim())) ?? expansions.find((e) => /^base( set)?( unlimited)?$/i.test(name(e).trim()))
	const ja = expansions.find((e) => /\b151\b/.test(name(e)) && japanese(e)) ?? expansions.find((e) => japanese(e))
	const out = []
	const add = (why, e) => {
		if (e && !out.some((t) => t.exp.id === e.id)) out.push({ why, exp: e })
	}
	add('recente', modern)
	add('vecchia', old)
	add('giapponese', ja)
	// Whatever the names turn out to be, something is always looked at.
	if (!out.length) add('la più recente', newest[0])
	return out
}

/**
 * What to ask about language by language: three single cards of an expansion (dear, middling,
 * cheap) and one sealed product. `kindOf` says whether a card id is a single card or not.
 */
export function pickCards(market, kindOf = () => 'single') {
	const rows = Object.entries(market ?? {})
		.map(([id, list]) => ({ id: Number(id), n: listOf(list).length, low: quantiles(listOf(list).map(centsOf))?.min ?? null, name: listOf(list)[0]?.name_en ?? '' }))
		.filter((r) => r.n >= 8 && r.low != null)
		.sort((a, b) => b.low - a.low)
	const singles = rows.filter((r) => kindOf(r.id) === 'single')
	const sealed = rows.filter((r) => kindOf(r.id) !== 'single').sort((a, b) => b.n - a.n || b.low - a.low)
	const picks = [singles[0], singles[Math.floor(singles.length / 4)], singles[Math.floor(singles.length / 2)], sealed[0]]
	return picks.filter((r, i) => r && picks.findIndex((x) => x?.id === r.id) === i).map((r) => ({ ...r, kind: kindOf(r.id) }))
}

// ------------------------------------------------------------------ asking

function makeClient(report) {
	const started = Date.now()
	let lastMarket = 0
	const left = () => BUDGET_MS - (Date.now() - started)
	/**
	 * One GET. Returns the parsed answer, or null when it failed; either way the call is noted in
	 * the report with its outcome, duration and size.
	 */
	async function get(path, { market = false, note = '' } = {}) {
		if (left() <= 0) {
			report.calls.push({ path, skipped: 'tempo finito' })
			return null
		}
		const wait = market ? Math.max(0, lastMarket + MARKET_GAP_MS - Date.now()) : GAP_MS
		if (wait) await new Promise((r) => setTimeout(r, wait))
		const t0 = Date.now()
		const entry = { path, ...(note ? { note } : {}) }
		report.calls.push(entry)
		try {
			const res = await fetch(API + path, {
				headers: { authorization: `Bearer ${TOKEN}`, accept: 'application/json', 'user-agent': UA },
				signal: AbortSignal.timeout(60_000),
			})
			if (market) lastMarket = Date.now()
			entry.status = res.status
			for (const [k, v] of res.headers) if (/rate|retry|limit/i.test(k)) (report.rateHeaders[k] ??= []).length < 3 && report.rateHeaders[k].push(String(v).slice(0, 40))
			const text = await res.text()
			entry.ms = Date.now() - t0
			entry.kB = Math.round(text.length / 102.4) / 10
			if (!res.ok) {
				// The beginning of an error says what is wrong; it never contains the token.
				entry.error = text.replace(/\s+/g, ' ').slice(0, 160)
				return null
			}
			try {
				return JSON.parse(text)
			} catch {
				entry.error = 'risposta non JSON: ' + text.replace(/\s+/g, ' ').slice(0, 80)
				return null
			}
		} catch (err) {
			if (market) lastMarket = Date.now()
			entry.ms = Date.now() - t0
			entry.error = String(err?.message ?? err).slice(0, 160)
			return null
		}
	}
	return { get, left }
}

async function loadJson(src) {
	if (!/^https?:/i.test(src)) return JSON.parse(await readFile(src, 'utf8'))
	const res = await fetch(src, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(120_000) })
	if (!res.ok) throw new Error(`HTTP ${res.status}`)
	return res.json()
}

/** Can a web page call the API directly? What the server answers to a browser's preliminary question. */
async function corsCheck() {
	const out = {}
	const pick = (res) => ({
		status: res.status,
		allowOrigin: res.headers.get('access-control-allow-origin'),
		allowHeaders: res.headers.get('access-control-allow-headers'),
		allowMethods: res.headers.get('access-control-allow-methods'),
	})
	try {
		const res = await fetch(API + '/games', {
			method: 'OPTIONS',
			headers: { origin: ORIGIN, 'access-control-request-method': 'GET', 'access-control-request-headers': 'authorization', 'user-agent': UA },
			signal: AbortSignal.timeout(30_000),
		})
		out.preflight = pick(res)
		await res.arrayBuffer().catch(() => {})
	} catch (err) {
		out.preflight = { error: String(err?.message ?? err).slice(0, 120) }
	}
	try {
		const res = await fetch(API + '/games', {
			headers: { origin: ORIGIN, authorization: `Bearer ${TOKEN}`, accept: 'application/json', 'user-agent': UA },
			signal: AbortSignal.timeout(30_000),
		})
		out.get = pick(res)
		await res.arrayBuffer().catch(() => {})
	} catch (err) {
		out.get = { error: String(err?.message ?? err).slice(0, 120) }
	}
	return out
}

export async function probe() {
	const report = { v: 1, at: new Date().toISOString(), api: API.replace(/^https?:\/\//, ''), calls: [], rateHeaders: {}, notes: [] }
	const { get, left } = makeClient(report)
	const note = (m) => report.notes.push(String(m).slice(0, 200))

	// 1. Does the token work? Only the outcome is kept: the answer holds account data.
	const info = await get('/info')
	const refused = [401, 403].includes(report.calls[0]?.status)
	report.tokenWorks = !!info
	if (refused) {
		note('Il token non è stato accettato: controlla di averlo copiato per intero.')
		return { report, targets: null, expansions: null }
	}
	if (info && typeof info === 'object') report.infoKeys = Object.keys(info).filter((k) => !/secret|token|mail|name|phone|address/i.test(k))

	// 2. The games, and which one is Pokémon.
	const games = listOf(await get('/games'))
	if (games.length) report.tokenWorks = true
	report.games = games.map((g) => [g?.id, g?.name, g?.display_name])
	const pokemon = games.find((g) => /pok[eé]mon/i.test(`${g?.name} ${g?.display_name}`))
	if (!pokemon) {
		// No list at all means the API did not answer: whether the token is good is not known.
		if (!games.length && !info) report.tokenWorks = null
		note(games.length ? 'Pokémon non è tra i giochi elencati.' : 'CardTrader non ha risposto in modo leggibile: vedi «calls».')
		return { report, targets: null, expansions: null }
	}
	report.pokemonGameId = pokemon.id

	// 3. The kinds of product (single cards, boxes, boosters…) with the properties each one has.
	const categories = listOf(await get(`/categories?game_id=${pokemon.id}`)).filter((c) => c?.game_id == null || c.game_id === pokemon.id)
	const props = (c) => listOf(c?.properties).map((p) => ({ name: p?.name, type: p?.type, values: listOf(p?.possible_values).slice(0, 30) }))
	const single = categories.find((c) => /single/i.test(String(c?.name))) ?? categories[0]
	const sealedCat = categories.find((c) => /booster|box|sealed|display/i.test(String(c?.name)))
	report.categories = {
		n: categories.length,
		keys: Object.keys(categories[0] ?? {}),
		list: categories.slice(0, 60).map((c) => [c?.id, String(c?.name ?? '').slice(0, 40)]),
		singleCards: single ? { id: single.id, name: single.name, properties: props(single) } : null,
		sealedExample: sealedCat ? { id: sealedCat.id, name: sealedCat.name, properties: props(sealedCat) } : null,
	}

	// 4. The expansions.
	const allExp = listOf(await get('/expansions'))
	const exps = allExp.filter((e) => e?.game_id === pokemon.id)
	const row = (e) => [e?.id, e?.code, String(e?.name ?? e?.name_en ?? '').slice(0, 60)]
	const step = Math.max(1, Math.floor(exps.length / 30))
	report.expansions = {
		allGames: allExp.length,
		pokemon: exps.length,
		keys: Object.keys(exps[0] ?? {}),
		sample: exps.filter((_, i) => i % step === 0).slice(0, 30).map(row),
		with151: exps.filter((e) => /\b151\b/.test(String(e?.name))).slice(0, 12).map(row),
		withBase: exps.filter((e) => /^base\b/i.test(String(e?.name))).slice(0, 12).map(row),
		japaneseLooking: exps.filter((e) => /japan|giappon|\bjp\b/i.test(String(e?.name)) || /(^|[-_])(jp|ja|jpn)([-_]|$)/i.test(String(e?.code))).length,
	}

	// 5. Cardmarket's own lists, to see whether CardTrader's cards point to Cardmarket's products.
	let cmSingles = null
	let cmSealed = null
	try {
		const [a, b] = await Promise.all([loadJson(CM_SINGLES), loadJson(CM_NONSINGLES)])
		cmSingles = new Map(listOf(a?.products).map((p) => [p.idProduct, p.idExpansion]))
		cmSealed = new Map(listOf(b?.products).map((p) => [p.idProduct, p.idExpansion]))
		report.cardmarket = { singles: cmSingles.size, sealed: cmSealed.size }
	} catch (err) {
		note('Elenchi Cardmarket non letti: ' + String(err?.message ?? err).slice(0, 100))
	}

	// 6. Three expansions up close: how the cards are described, and what the marketplace returns.
	const targets = []
	let firstMarket = null
	let firstTarget = null
	let firstFlags = []
	const kind = new Map()
	for (const { why, exp } of pickTargets(exps)) {
		if (left() < 30_000) break
		const t = { why, expansion: row(exp) }
		targets.push(t)

		const blueprints = listOf(await get(`/blueprints/export?expansion_id=${exp.id}`, { note: why }))
		for (const b of blueprints) kind.set(b?.id, !single || b?.category_id === single.id ? 'single' : 'other')
		const ids = (b) => listOf(b?.card_market_ids).filter((x) => typeof x === 'number')
		const withCm = blueprints.filter((b) => ids(b).length)
		t.blueprints = {
			n: blueprints.length,
			keys: Object.keys(blueprints[0] ?? {}),
			byCategory: tally(blueprints.map((b) => b?.category_id)),
			withCardmarketId: withCm.length,
			withSeveralCardmarketIds: blueprints.filter((b) => ids(b).length > 1).length,
			withTcgplayerId: blueprints.filter((b) => b?.tcg_player_id).length,
			versions: tally(blueprints.map((b) => b?.version)),
			fixedPropertyKeys: tally(blueprints.flatMap((b) => Object.keys(b?.fixed_properties ?? {})), 30),
			samples: [blueprints[0], blueprints[Math.floor(blueprints.length / 2)], blueprints.find((b) => sealedCat && b?.category_id === sealedCat.id)]
				.filter(Boolean)
				.slice(0, 3)
				.map(trimBlueprint),
		}
		if (cmSingles && cmSealed) {
			const all = withCm.flatMap(ids)
			t.blueprints.cardmarket = {
				ids: all.length,
				inSingles: all.filter((id) => cmSingles.has(id)).length,
				inSealed: all.filter((id) => cmSealed.has(id)).length,
				nowhere: all.filter((id) => !cmSingles.has(id) && !cmSealed.has(id)).length,
				// Which Cardmarket expansions the cards of this CardTrader expansion belong to.
				expansions: tally(all.map((id) => cmSingles.get(id) ?? cmSealed.get(id)).filter(Boolean), 6),
			}
		}

		const market = await get(`/marketplace/products?expansion_id=${exp.id}`, { market: true, note: why })
		if (market && typeof market === 'object') {
			const lists = Object.values(market).map(listOf)
			const offers = lists.flat()
			const flags = specialFlags(offers)
			t.market = {
				cards: lists.length,
				cardsOfExpansion: blueprints.length,
				perCard: quantiles(lists.map((l) => l.length)),
				// Offers with one of these set are left out of the counts by language below.
				specialFlags: flags,
				singleCards: coverage(Object.entries(market).filter(([id]) => kind.get(Number(id)) === 'single').map(([, l]) => listOf(l)), flags),
				otherProducts: coverage(Object.entries(market).filter(([id]) => kind.get(Number(id)) !== 'single').map(([, l]) => listOf(l)), flags),
				offers: describeOffers(offers),
				offerKeys: Object.keys(offers[0] ?? {}),
				samples: [offers[0], offers[Math.floor(offers.length / 2)]].filter(Boolean).map(trimOffer),
			}
			if (!firstMarket) {
				firstMarket = market
				firstTarget = { t, exp }
				firstFlags = flags
			}
		}
	}

	// 7. Language by language. First a whole expansion in Italian: does the filter work there too?
	if (firstTarget && left() > 20_000) {
		const { t, exp } = firstTarget
		const it = await get(`/marketplace/products?expansion_id=${exp.id}&language=it`, { market: true, note: 'solo italiano' })
		if (it && typeof it === 'object') {
			const lists = Object.values(it).map(listOf)
			const d = describeOffers(lists.flat())
			t.marketItalian = {
				cards: lists.length,
				perCard: quantiles(lists.map((l) => l.length)),
				languages: d.languages,
				conditions: d.conditions,
				cents: d.cents,
				singleCards: coverage(Object.entries(it).filter(([id]) => kind.get(Number(id)) === 'single').map(([, l]) => listOf(l)), firstFlags),
			}
		}
		// Then a few cards, one question per language: how many offers, in which conditions, from what price.
		t.cards = []
		for (const card of pickCards(firstMarket, (id) => kind.get(id) ?? 'single')) {
			const all = listOf(firstMarket[card.id])
			const entry = {
				blueprint: card.id,
				kind: card.kind,
				name: String(card.name).slice(0, 40),
				cheapestCents: card.low,
				unfiltered: byLanguageAndCondition(all, { keep: 3, flags: firstFlags }),
				languages: {},
			}
			t.cards.push(entry)
			for (const lang of LANGS) {
				if (left() < 8_000) break
				const res = await get(`/marketplace/products?blueprint_id=${card.id}&language=${lang}`, { market: true })
				const offers = res && typeof res === 'object' ? Object.values(res).flatMap(listOf) : null
				if (!offers) {
					entry.languages[lang] = null
					continue
				}
				const split = byLanguageAndCondition(offers, { flags: firstFlags })
				entry.languages[lang] = {
					n: offers.length,
					plain: offers.filter((p) => isPlain(p, firstFlags)).length,
					// Normally one language only: the one asked for. More than one means the filter is not applied.
					got: Object.keys(split),
					byCondition: split[Object.keys(split)[0]] ?? {},
				}
			}
		}
	}

	// 8. Could the phone ask CardTrader directly, without going through the site's files?
	report.cors = await corsCheck()

	return { report, targets, expansions: exps.map(row) }
}

export async function main() {
	if (!TOKEN) {
		console.log('CardTrader: nessun token (segreto CARDTRADER_TOKEN), prova saltata.')
		return null
	}
	let result
	try {
		result = await probe()
	} catch (err) {
		result = { report: { v: 1, at: new Date().toISOString(), crashed: String(err?.stack ?? err).slice(0, 600) }, targets: null, expansions: null }
	}
	// Last line of defence: the token must never end up in a published file.
	const save = async (file, value) => {
		let text = JSON.stringify(value)
		if (text.includes(TOKEN)) text = JSON.stringify({ v: 1, at: result.report.at, error: 'il file conteneva il token ed è stato scartato' })
		await mkdir(dirname(file), { recursive: true })
		await writeFile(file, text)
		return text.length
	}
	const size = await save(OUT, result.report)
	if (result.targets) await save(OUT_TARGETS, { v: 1, at: result.report.at, targets: result.targets })
	if (result.expansions) await save(OUT_EXP, { v: 1, at: result.report.at, rows: result.expansions })
	const r = result.report
	console.log(
		`CardTrader: token ${r.tokenWorks ? 'accettato' : r.tokenWorks === false ? 'non accettato' : 'non verificato'}, ${r.calls?.length ?? 0} domande, ${r.expansions?.pokemon ?? 0} espansioni Pokémon; rapporto di ${(size / 1024).toFixed(1)} kB → ${OUT}`,
	)
	return result.report
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main().catch((err) => {
		console.error(String(err?.message ?? err))
	})
}
