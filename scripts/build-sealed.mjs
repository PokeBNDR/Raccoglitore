// Builds public/data/sealed.json: the sealed products of every Pokémon expansion (booster packs,
// booster boxes, Elite Trainer Boxes, tins, collections, decks…) with Cardmarket's daily prices.
//
// Cardmarket publishes its product list and its price guide as public files, but a web page is not
// allowed to read them directly. This script runs when the site is built (once a day and at every
// change), reads them, and writes one compact file the app loads from its own address.
//
//   node scripts/build-sealed.mjs
//
// It never fails the build: if Cardmarket cannot be reached, the file published last time is kept.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const CM = 'https://downloads.s3.cardmarket.com/productCatalog'
const SRC = {
	nonsingles: process.env.CM_NONSINGLES || `${CM}/productList/products_nonsingles_6.json`,
	singles: process.env.CM_SINGLES || `${CM}/productList/products_singles_6.json`,
	prices: process.env.CM_PRICES || `${CM}/priceGuide/price_guide_6.json`,
}
const TCGDEX = (process.env.TCGDEX_API || 'https://api.tcgdex.net/v2').replace(/\/$/, '')
const PREVIOUS = process.env.PREVIOUS_URL || ''
const OUT = resolve(process.env.OUT || resolve(HERE, '../public/data/sealed.json'))
const SEED = resolve(process.env.SEED || resolve(HERE, 'expansions-seed.json'))
/** How long the set-by-set lookups may take in one run. What is left is done at the next build. */
const LOOKUP_BUDGET_MS = Number(process.env.LOOKUP_BUDGET_MS || 150_000)
/** A set that could not be matched is tried again after this many days. */
const RETRY_DAYS = 7
const UA = 'Raccoglitore (personal Pokémon card portfolio; github.com/PokeBNDR/Raccoglitore)'

// ------------------------------------------------------------------ pure parts (tested)

/** Cardmarket writes a missing figure as null or 0. */
const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : 0)

const TAIL =
	/\s+(booster\s+box(?:\s+case)?|booster\s+display|display|booster(?:\s+pack)?s?|sleeved\s+booster|elite\s+trainer\s+box|trainer\s+kit|theme\s+decks?|tins?|box(?:\s+set)?|collection|blister|bundle|case)$/i
const TRAIL = /[\s:–—\-&,(]+$/

/**
 * A name for an expansion, worked out from the names of its products ("Base Set Booster",
 * "Base Set Booster Box" → "Base Set"). Cardmarket's files identify expansions only by number.
 */
export function expansionLabel(names) {
	const list = names.map((n) => String(n ?? '').trim()).filter(Boolean)
	if (!list.length) return ''
	const clean = (s) => {
		let out = s.replace(TRAIL, '')
		for (let i = 0; i < 3; i++) out = out.replace(TAIL, '').replace(TRAIL, '')
		return out.trim()
	}
	if (list.length === 1) return clean(list[0])
	const words = list.map((n) => n.split(/\s+/))
	const first = words[0]
	let n = 0
	while (n < first.length && words.every((w) => w[n] !== undefined && w[n].toLowerCase() === first[n].toLowerCase())) n++
	const prefix = clean(first.slice(0, n).join(' '))
	if (prefix.length >= 3) return prefix
	// No shared beginning: take the most common name once the kind of product is removed.
	const count = new Map()
	for (const name of list) {
		const c = clean(name)
		if (c.length >= 3) count.set(c, (count.get(c) ?? 0) + 1)
	}
	return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0]?.[0] ?? ''
}

/** The most frequent value of a list, or undefined when the list is empty. */
export function majority(list) {
	const count = new Map()
	for (const v of list) count.set(v, (count.get(v) ?? 0) + 1)
	return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
}

/**
 * Joins Cardmarket's product list and price guide into the file the app reads.
 * `sets` maps "catalogue:setId" (as in the app) to a Cardmarket expansion id; `names` gives the
 * English name of the international sets.
 */
export function buildDataset({ nonsingles, prices, sets = {}, names = {}, lookups = {}, now = new Date() }) {
	const priceById = new Map()
	for (const p of prices?.priceGuides ?? []) if (p && typeof p.idProduct === 'number') priceById.set(p.idProduct, p)

	const cats = {}
	const catCounts = {}
	const byExp = new Map()
	const rows = []
	let priced = 0
	for (const p of nonsingles?.products ?? []) {
		if (!p || typeof p.idProduct !== 'number' || !p.name) continue
		const cat = Number(p.idCategory) || 0
		const exp = Number(p.idExpansion) || 0
		if (p.categoryName) cats[cat] = String(p.categoryName)
		catCounts[cat] = (catCounts[cat] ?? 0) + 1
		const g = priceById.get(p.idProduct)
		const row = [p.idProduct, String(p.name), cat, exp, num(g?.trend), num(g?.avg), num(g?.low), num(g?.avg1), num(g?.avg7), num(g?.avg30)]
		if (row[4] || row[5] || row[6] || row[7] || row[8] || row[9]) priced++
		rows.push(row)
		if (!byExp.has(exp)) byExp.set(exp, [])
		byExp.get(exp).push(row[1])
	}
	// Newest products first: ids grow with time.
	rows.sort((a, b) => b[0] - a[0])

	const setsOfExp = new Map()
	for (const [key, exp] of Object.entries(sets)) {
		if (!exp || !byExp.has(exp)) continue
		if (!setsOfExp.has(exp)) setsOfExp.set(exp, [])
		setsOfExp.get(exp).push(key)
	}
	const exp = {}
	let mapped = 0
	for (const [id, productNames] of byExp) {
		const keys = (setsOfExp.get(id) ?? []).sort()
		const intKey = keys.find((k) => k.startsWith('int:'))
		const entry = { n: (intKey && names[intKey]) || expansionLabel(productNames) || `Espansione ${id}` }
		if (keys.length) {
			entry.s = keys
			mapped++
		}
		exp[id] = entry
	}

	return {
		v: 1,
		source: 'Cardmarket',
		updated: prices?.createdAt ?? null,
		built: now.toISOString(),
		cats,
		exp,
		p: rows,
		// Results of the set-by-set lookups, kept so that the next build does not repeat them.
		lookups,
		meta: { products: rows.length, priced, expansions: byExp.size, mapped, catCounts, errors: [] },
	}
}

// ------------------------------------------------------------------ reading

async function load(src, { tries = 3, timeoutMs = 120_000 } = {}) {
	if (!/^https?:/i.test(src)) return JSON.parse(await readFile(src, 'utf8'))
	let last
	for (let i = 0; i < tries; i++) {
		try {
			const res = await fetch(src, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) })
			if (res.status === 404) return null
			if (!res.ok) throw new Error(`HTTP ${res.status}`)
			return await res.json()
		} catch (err) {
			last = err
			await new Promise((r) => setTimeout(r, 800 * (i + 1)))
		}
	}
	throw new Error(`${src}: ${last?.message ?? last}`)
}

function pool(n) {
	let active = 0
	const queue = []
	const next = () => {
		active--
		queue.shift()?.()
	}
	return async (job) => {
		if (active >= n) await new Promise((r) => queue.push(r))
		active++
		try {
			return await job()
		} finally {
			next()
		}
	}
}

/** Cardmarket product ids of a card as the catalogue serves it. */
function cardProductIds(card) {
	const ids = []
	const main = card?.pricing?.cardmarket?.idProduct
	if (typeof main === 'number') ids.push(main)
	for (const v of card?.variants_detailed ?? []) {
		const id = v?.thirdParty?.cardmarket ?? v?.pricing?.cardmarket?.idProduct
		if (typeof id === 'number') ids.push(id)
	}
	return ids
}

/**
 * Finds the Cardmarket expansion of the sets the seed file does not cover, by looking at a few
 * cards of each set: the catalogue knows their Cardmarket product, and Cardmarket's list of single
 * cards says which expansion a product belongs to.
 */
async function lookupSets({ known, lookups, log }) {
	const started = Date.now()
	const today = new Date().toISOString().slice(0, 10)
	const due = (key) => {
		if (known[key]) return false
		const old = lookups[key]
		if (!old) return true
		if (old.e) return false
		return (Date.now() - new Date(old.d).getTime()) / 86_400_000 >= RETRY_DAYS
	}
	const out = { ...lookups }
	let singlesExp = null
	let resolved = 0
	let tried = 0
	for (const [catalog, lang] of [
		['int', 'en'],
		['ja', 'ja'],
	]) {
		let list
		try {
			list = await load(`${TCGDEX}/${lang}/sets`, { tries: 2, timeoutMs: 30_000 })
		} catch (err) {
			log(`elenco dei set ${lang}: ${err.message}`)
			continue
		}
		let digital = new Set()
		if (catalog === 'int') {
			try {
				const serie = await load(`${TCGDEX}/en/series/tcgp`, { tries: 2, timeoutMs: 30_000 })
				digital = new Set((serie?.sets ?? []).map((s) => s.id))
			} catch {
				/* the digital sets simply stay in the list */
			}
		}
		const todo = (list ?? []).filter((s) => s?.id && !digital.has(s.id) && due(`${catalog}:${s.id}`))
		if (!todo.length) continue
		if (!singlesExp) {
			const singles = await load(SRC.singles)
			singlesExp = new Map()
			for (const p of singles?.products ?? []) if (p?.idProduct && p.idExpansion) singlesExp.set(p.idProduct, p.idExpansion)
			console.log(`Carte singole Cardmarket lette: ${singlesExp.size}; set da collegare: ${todo.length} (${catalog})`)
		}
		const run = pool(5)
		await Promise.all(
			todo.map((s) =>
				run(async () => {
					if (Date.now() - started > LOOKUP_BUDGET_MS) return
					const key = `${catalog}:${s.id}`
					tried++
					try {
						const set = await load(`${TCGDEX}/${lang}/sets/${encodeURIComponent(s.id)}`, { tries: 2, timeoutMs: 30_000 })
						const cards = set?.cards ?? []
						const picks = [...new Set([0, Math.floor(cards.length / 3), Math.floor((cards.length * 2) / 3), cards.length - 1])]
							.map((i) => cards[i])
							.filter(Boolean)
						const exps = []
						for (const c of picks) {
							const card = await load(`${TCGDEX}/${lang}/cards/${encodeURIComponent(c.id)}`, { tries: 2, timeoutMs: 30_000 })
							for (const id of cardProductIds(card)) {
								const e = singlesExp.get(id)
								if (e) exps.push(e)
							}
						}
						const e = majority(exps)
						out[key] = e ? { e, d: today } : { e: 0, d: today }
						if (e) resolved++
					} catch (err) {
						log(`${key}: ${err.message}`)
					}
				}),
			),
		)
	}
	return { lookups: out, tried, resolved }
}

// ------------------------------------------------------------------ main

export async function main() {
	// What went wrong, kept in the file itself (a handful of lines) so it can be read from the app's address.
	const errors = []
	const log = (m) => {
		if (errors.length < 20) errors.push(String(m).slice(0, 200))
		console.warn('! ' + m)
	}
	let previous = null
	if (PREVIOUS) {
		try {
			previous = await load(PREVIOUS, { tries: 2, timeoutMs: 60_000 })
			if (previous && (previous.v !== 1 || !Array.isArray(previous.p))) previous = null
		} catch (err) {
			console.warn('File precedente non letto: ' + err.message)
		}
	}

	let data
	try {
		const [nonsingles, prices, seed] = await Promise.all([
			load(SRC.nonsingles),
			load(SRC.prices),
			load(SEED).catch(() => ({})),
		])
		if (!nonsingles?.products?.length) throw new Error('elenco dei prodotti vuoto')
		if (!prices?.priceGuides?.length) throw new Error('listino vuoto')

		const known = {}
		for (const [catalog, map] of Object.entries(seed ?? {})) {
			if (!map || typeof map !== 'object') continue
			for (const [setId, exp] of Object.entries(map)) if (typeof exp === 'number') known[`${catalog}:${setId}`] = exp
		}

		let lookups = previous?.lookups && typeof previous.lookups === 'object' ? previous.lookups : {}
		let tried = 0
		let resolved = 0
		if (process.env.SKIP_LOOKUPS !== '1') {
			try {
				const res = await lookupSets({ known, lookups, log })
				lookups = res.lookups
				tried = res.tried
				resolved = res.resolved
			} catch (err) {
				log(`ricerca delle espansioni: ${err.message}`)
			}
		}
		const sets = { ...known }
		for (const [key, v] of Object.entries(lookups)) if (v?.e && !sets[key]) sets[key] = v.e

		// English names of the international sets, for the expansions' labels.
		const names = {}
		try {
			for (const s of (await load(`${TCGDEX}/en/sets`, { tries: 2, timeoutMs: 30_000 })) ?? []) if (s?.id && s.name) names[`int:${s.id}`] = s.name
		} catch (err) {
			log(`nomi dei set: ${err.message}`)
		}

		data = buildDataset({ nonsingles, prices, sets, names, lookups })
		data.meta.lookupsTried = tried
		data.meta.lookupsResolved = resolved
		data.meta.errors = errors
	} catch (err) {
		console.warn('! Cardmarket non letto: ' + (err?.message ?? err))
		if (previous) {
			data = { ...previous, meta: { ...(previous.meta ?? {}), stale: true, errors: [String(err?.message ?? err).slice(0, 200)] } }
		} else {
			data = {
				v: 1,
				source: 'Cardmarket',
				updated: null,
				built: new Date().toISOString(),
				cats: {},
				exp: {},
				p: [],
				lookups: {},
				meta: { products: 0, priced: 0, expansions: 0, mapped: 0, errors: [String(err?.message ?? err).slice(0, 200)] },
			}
		}
	}

	await mkdir(dirname(OUT), { recursive: true })
	const text = JSON.stringify(data)
	await writeFile(OUT, text)
	const m = data.meta ?? {}
	console.log(
		`Sigillati: ${m.products ?? 0} prodotti (${m.priced ?? 0} con prezzo), ${m.expansions ?? 0} espansioni di cui ${m.mapped ?? 0} collegate a un set; listino del ${data.updated ?? '—'}; ${(text.length / 1024).toFixed(0)} kB → ${OUT}`,
	)
	return data
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main().catch((err) => {
		// Even an unexpected error must not stop the site from being published.
		console.error(err)
	})
}
