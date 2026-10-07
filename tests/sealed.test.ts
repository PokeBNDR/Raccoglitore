import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildDataset, expansionLabel, majority } from '../scripts/build-sealed.mjs'
import { DEFAULT_SETTINGS, isAsian, variantLabel } from '../src/lib/labels'
import { cardmarketUrl, ebaySoldUrl, namedOf } from '../src/lib/links'
import { unitValue } from '../src/lib/pricing'
import { buildIndex, catInfo, sealedCard, sealedOfSet, searchSealed, type SealedFile } from '../src/lib/sealed'
import { cleanHolding } from '../src/lib/store'
import type { Holding } from '../src/lib/types'

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/cardmarket/${name}.json`, import.meta.url), 'utf8'))
const file = buildDataset({
	nonsingles: fixture('nonsingles'),
	prices: fixture('prices'),
	sets: { 'int:base1': 1523, 'int:xy4': 1521, 'int:sv03.5': 5402, 'ja:SV2a': 5402, 'int:nowhere': 99999 },
	names: { 'int:base1': 'Base Set', 'int:sv03.5': '151' },
	now: new Date('2026-10-07T04:00:00Z'),
}) as SealedFile
const index = buildIndex(file)

describe('file dei prodotti sigillati', () => {
	it('ricava il nome di un’espansione dai nomi dei suoi prodotti', () => {
		expect(expansionLabel(['Base Set Booster', 'Base Set Booster Box'])).toBe('Base Set')
		expect(expansionLabel(['Black & White Booster'])).toBe('Black & White')
		expect(expansionLabel(['151 Booster Bundle', '151 Elite Trainer Box', '151 Mini Tin'])).toBe('151')
		expect(expansionLabel(['Scarlet & Violet: Paldea Evolved Booster Box', 'Scarlet & Violet: Paldea Evolved Elite Trainer Box'])).toBe(
			'Scarlet & Violet: Paldea Evolved',
		)
		expect(expansionLabel(['Pikachu V Box', 'Eevee V Box', 'Pikachu V Box'])).toBe('Pikachu V')
		expect(expansionLabel([])).toBe('')
	})
	it('sceglie il valore più frequente', () => {
		expect(majority([6030, 1523, 6030])).toBe(6030)
		expect(majority([])).toBeUndefined()
	})
	it('unisce elenco e listino di Cardmarket', () => {
		expect(file.v).toBe(1)
		expect(file.updated).toBe('2026-10-06T02:48:24+0200')
		expect(file.meta).toMatchObject({ products: 14, priced: 13, expansions: 7, mapped: 3 })
		// Newest product first; missing figures become 0; the "-holo" columns are not carried over.
		expect(file.p[0][0]).toBe(900002)
		expect(file.p.find((r) => r[0] === 271824)).toEqual([271824, 'Base Set Booster Box', 53, 1523, 19020.98, 15000, 19950, 0, 0, 0])
		expect(file.p.find((r) => r[0] === 733904)).toEqual([733904, '151 Mini Tin', 1014, 5402, 0, 0, 0, 0, 0, 0])
		expect(file.cats).toMatchObject({ 52: 'Pokémon Booster', 53: 'Pokémon Display', 1016: 'Pokémon Elite Trainer Boxes' })
		// A set of the card catalogue gives its name; otherwise the name comes from the products.
		expect(file.exp[1523]).toEqual({ n: 'Base Set', s: ['int:base1'] })
		expect(file.exp[5402]).toEqual({ n: '151', s: ['int:sv03.5', 'ja:SV2a'] })
		expect(file.exp[1521]).toEqual({ n: 'Phantom Forces', s: ['int:xy4'] })
		expect(file.exp[6030]).toEqual({ n: 'Destined Rivals' })
		// A mapping to an expansion with no sealed products is dropped.
		expect(Object.keys(file.exp)).not.toContain('99999')
	})
})

describe('prodotti sigillati nell’app', () => {
	it('i prodotti di un set, in ordine di tipo', () => {
		const base = sealedOfSet(index, 'int', 'base1')
		expect(base.map((p) => p.name)).toEqual(['Base Set Booster Box', 'Base Set Booster'])
		const s151 = sealedOfSet(index, 'int', 'sv03.5')
		expect(s151.map((p) => p.kind.one)).toEqual(['Busta', 'ETB', 'Collezione', 'Collezione', 'Tin'])
		// The same expansion can belong to a set of another catalogue too.
		expect(sealedOfSet(index, 'ja', 'SV2a')).toHaveLength(5)
		expect(sealedOfSet(index, 'int', 'sv10')).toEqual([])
		expect(sealedOfSet(null, 'int', 'base1')).toEqual([])
	})
	it('un prodotto collegato a più set rimanda a quello internazionale', () => {
		expect(index.byId.get(733901)?.set).toEqual({ catalog: 'int', id: 'sv03.5' })
		expect(index.byId.get(826500)?.set).toBeUndefined()
		expect(index.byId.get(826500)?.expName).toBe('Destined Rivals')
	})
	it('ricerca per nome, espansione e tipo, anche in italiano', () => {
		expect(searchSealed(index, '151 etb').map((p) => p.id)).toEqual([733901])
		expect(searchSealed(index, 'base set display').map((p) => p.id)).toEqual([271824])
		expect(searchSealed(index, 'buste phantom').map((p) => p.id)).toEqual([271439])
		expect(searchSealed(index, 'collezione 151').map((p) => p.id)).toEqual([733902, 733900])
		expect(searchSealed(index, 'tin').map((p) => p.id)).toEqual([733904])
		expect(searchSealed(index, 'BOOSTER').length).toBe(8)
		expect(searchSealed(index, 'zzz')).toEqual([])
		expect(searchSealed(index, '  ')).toEqual([])
	})
	it('i tipi che l’app non conosce tengono il nome di Cardmarket', () => {
		expect(catInfo(53).one).toBe('Display')
		expect(catInfo(1234, 'Pokémon Coins')).toMatchObject({ one: 'Coins', glyph: 'other' })
		expect(catInfo(undefined).one).toBe('Prodotto')
	})

	const product = index.byId.get(733901)!
	const card = sealedCard(product, 1_700_000_000_000, '151')
	const holding = (over: Partial<Holding> = {}): Holding => ({
		id: 'h',
		catalog: 'sealed',
		sealed: card.sealed,
		cardId: card.id,
		name: card.name,
		setId: card.set.id,
		setName: card.set.name,
		localId: '',
		images: {},
		rarity: card.rarity,
		lang: 'IT',
		cond: 'PL',
		variantKey: 'sealed',
		variantType: 'sealed',
		variantLabel: 'Sigillato',
		stamps: [],
		grade: null,
		qty: 1,
		buyPrice: null,
		buyDate: null,
		manualPrice: null,
		manualAt: null,
		note: '',
		createdAt: 0,
		updatedAt: 0,
		...over,
	})

	it('un prodotto prende la forma di una carta con una sola versione', () => {
		expect(card).toMatchObject({
			key: 'sealed:733901',
			catalog: 'sealed',
			id: '733901',
			name: '151 Elite Trainer Box',
			rarity: 'ETB',
			sealed: { cat: 1016, exp: 5402, setCatalog: 'int' },
			set: { id: 'sv03.5', name: '151' },
		})
		expect(card.variants).toHaveLength(1)
		expect(variantLabel(card.variants[0])).toBe('Sigillato')
		expect(card.cm).toMatchObject({ idProduct: 733901, trend: 121.9, avg7: 120.2, avg30: 117.6, low: 95 })
	})
	it('valore: prezzo Cardmarket × lingua, la condizione non conta', () => {
		const s = { ...DEFAULT_SETTINGS, langMult: { ...DEFAULT_SETTINGS.langMult, EN: 1.5 } }
		expect(unitValue(holding(), card, s)).toMatchObject({ value: 121.9, condM: 1, langM: 1, kind: 'auto', gradedGuess: false })
		expect(unitValue(holding({ lang: 'EN' }), card, s).value).toBe(182.85)
		expect(unitValue(holding({ manualPrice: 150 }), card, s)).toMatchObject({ value: 150, kind: 'manual' })
		// Trend missing: the next figure of the price guide is used.
		const upc = sealedCard(index.byId.get(733902)!, 0)
		expect(unitValue(holding({ cardId: '733902' }), upc, s).value).toBe(415.5)
		// No price at all on Cardmarket.
		const tin = sealedCard(index.byId.get(733904)!, 0)
		expect(unitValue(holding({ cardId: '733904' }), tin, s)).toMatchObject({ value: null, kind: 'none' })
	})
	it('link: Cardmarket filtra per lingua ma non per condizione', () => {
		expect(cardmarketUrl(card)).toBe('https://www.cardmarket.com/it/Pokemon/Products?idProduct=733901')
		expect(cardmarketUrl(card, holding({ lang: 'EN' }))).toBe('https://www.cardmarket.com/it/Pokemon/Products?idProduct=733901&language=1')
		const ebay = decodeURIComponent(ebaySoldUrl(namedOf(card), holding(), 'www.ebay.it').replace(/\+/g, ' '))
		expect(ebay).toContain('_nkw=151 Elite Trainer Box (ita,italiano,italiana,italian)')
		expect(ebay).toContain('LH_Sold=1')
	})
	it('un prodotto salvato o letto da un backup resta un prodotto', () => {
		const back = cleanHolding(JSON.parse(JSON.stringify(holding({ grade: { company: 'PSA', value: '10' } }))))
		expect(back).toMatchObject({ catalog: 'sealed', sealed: { cat: 1016, exp: 5402, setCatalog: 'int' }, grade: null, variantType: 'sealed' })
		// An entry of an older backup, with a catalogue this version does not know, falls back to a card.
		expect(cleanHolding({ cardId: 'base1-4', name: 'Charizard', catalog: 'boh' })).toMatchObject({ catalog: 'int' })
		expect(cleanHolding({ cardId: 'base1-4', name: 'Charizard' })?.sealed).toBeUndefined()
	})
	it('i cataloghi asiatici sono solo quelli delle carte', () => {
		expect(isAsian('ja')).toBe(true)
		expect(isAsian('int')).toBe(false)
		expect(isAsian('sealed')).toBe(false)
	})
})
