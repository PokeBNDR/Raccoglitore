import { describe, expect, it } from 'vitest'
import {
	byLanguageAndCondition,
	centsOf,
	coverage,
	describeOffers,
	isPlain,
	languageKey,
	listOf,
	pickCards,
	pickTargets,
	quantiles,
	specialFlags,
	tally,
	trimBlueprint,
	trimOffer,
} from '../scripts/cardtrader-probe.mjs'

// An offer shaped like the examples of CardTrader's documentation, with what must never be published.
const offer = (over: Record<string, unknown> = {}, props: Record<string, unknown> = {}) => ({
	id: 101862104,
	blueprint_id: 10050,
	name_en: 'Charizard ex',
	quantity: 1,
	price: { cents: 1250, currency: 'EUR' },
	description: 'Ritiro a mano in via Roma 12, chiedi di Mario',
	properties_hash: { condition: 'Near Mint', pokemon_language: 'it', pokemon_reverse: false, signed: false, altered: false, ...props },
	expansion: { id: 3403, code: 'mew', name_en: '151' },
	user: { id: 41687, username: 'mario.rossi', can_sell_via_hub: true, country_code: 'IT', user_type: 'normal', max_sellable_in24h_quantity: null },
	graded: false,
	on_vacation: false,
	bundle_size: 1,
	...over,
})

describe('prova di CardTrader: lettura delle risposte', () => {
	it('riconosce un elenco comunque sia confezionato', () => {
		expect(listOf([1, 2])).toEqual([1, 2])
		expect(listOf({ array: [1] })).toEqual([1])
		expect(listOf({ data: [2] })).toEqual([2])
		expect(listOf({ error: 'x' })).toEqual([])
		expect(listOf(null)).toEqual([])
		expect(listOf('<html>')).toEqual([])
	})
	it('conta i valori, dal più frequente', () => {
		expect(tally(['it', 'en', 'it', undefined, null])).toEqual({ it: 2, en: 1, '(manca)': 1, '(null)': 1 })
		expect(Object.keys(tally(['a', 'b', 'c', 'c'], 2))).toEqual(['c', 'a'])
	})
	it('riassume una serie di numeri', () => {
		expect(quantiles([5, 1, 3, 2, 4])).toEqual({ n: 5, min: 1, q25: 2, med: 3, q75: 4, max: 5 })
		expect(quantiles([7])).toEqual({ n: 1, min: 7, q25: 7, med: 7, q75: 7, max: 7 })
		expect(quantiles([null, 'x'])).toBeNull()
	})
	it('trova prezzo e lingua dove sono', () => {
		expect(centsOf(offer())).toBe(1250)
		expect(centsOf({ price_cents: 90 })).toBe(90)
		expect(centsOf({})).toBeNull()
		expect(languageKey([offer(), offer()])).toBe('pokemon_language')
		expect(languageKey([{ properties_hash: { mtg_language: 'en' } }])).toBe('mtg_language')
		expect(languageKey([{ properties_hash: { condition: 'Poor' } }])).toBeNull()
	})
})

describe('prova di CardTrader: niente di personale nei file pubblicati', () => {
	it('di un’offerta restano i numeri: via venditore, descrizione e identificativo', () => {
		const text = JSON.stringify(trimOffer(offer({ user_data_field: 'scatola 7', tag: 'mio-codice' })))
		for (const secret of ['mario.rossi', '41687', 'via Roma', 'Mario', '101862104', 'scatola 7', 'mio-codice']) expect(text).not.toContain(secret)
		const o = trimOffer(offer()) as { user: Record<string, unknown>; price: unknown; properties_hash: Record<string, unknown> }
		expect(o.user).toMatchObject({ country_code: 'IT', user_type: 'normal', can_sell_via_hub: true })
		expect(o.price).toEqual({ cents: 1250, currency: 'EUR' })
		expect(o.properties_hash.pokemon_language).toBe('it')
		expect(trimOffer(null)).toBeNull()
	})
	it('il riassunto delle offerte non contiene nomi né testi', () => {
		const d = describeOffers([offer(), offer({ graded: true }, { pokemon_language: 'en', condition: 'Played' }), offer({}, { pokemon_reverse: true })])
		const text = JSON.stringify(d)
		for (const secret of ['mario.rossi', '41687', 'via Roma', '101862104']) expect(text).not.toContain(secret)
		expect(d).toMatchObject({ n: 3, langKey: 'pokemon_language', languages: { it: 2, en: 1 }, conditions: { 'Near Mint': 2, Played: 1 }, currencies: { EUR: 3 } })
		expect(d.flags.pokemon_reverse).toEqual({ false: 2, true: 1 })
	})
	it('di una carta non restano indirizzi di immagini', () => {
		const b = trimBlueprint({
			id: 1,
			name: 'Pikachu',
			image_url: 'https://example.invalid/a.jpg',
			image: { url: '/b.jpg' },
			fixed_properties: { collector_number: '025' },
			editable_properties: [{ name: 'condition', type: 'string', possible_values: ['Near Mint'] }],
			card_market_ids: [733604],
		})
		expect(JSON.stringify(b)).not.toContain('.jpg')
		expect(b).toMatchObject({ id: 1, name: 'Pikachu', fixed_properties: { collector_number: '025' }, editable_properties: ['condition:string'], card_market_ids: [733604] })
	})
})

describe('prova di CardTrader: prezzi per lingua e condizione', () => {
	const list = [
		offer({ price: { cents: 900, currency: 'EUR' } }, { condition: 'Played' }),
		offer({ price: { cents: 1500, currency: 'EUR' } }),
		offer({ price: { cents: 1400, currency: 'EUR' } }),
		offer({ price: { cents: 2500, currency: 'EUR' } }, { pokemon_language: 'en' }),
		offer({ price: { cents: 300, currency: 'EUR' } }, { pokemon_reverse: true }),
		offer({ price: { cents: 9900, currency: 'EUR' }, graded: true }, { pokemon_language: 'en' }),
	]
	it('le copie particolari sono quelle con una proprietà che la maggior parte non ha', () => {
		expect(specialFlags(list)).toEqual(['pokemon_reverse'])
		// A property set on every offer says nothing about a single one.
		expect(specialFlags([offer({}, { tournament_legal: true }), offer({}, { tournament_legal: true, signed: true }), offer({}, { tournament_legal: true })])).toEqual(['signed'])
		expect(isPlain(list[0], ['pokemon_reverse'])).toBe(true)
		expect(isPlain(list[4], ['pokemon_reverse'])).toBe(false)
		expect(isPlain(list[5], ['pokemon_reverse'])).toBe(false)
	})
	it('per lingua e condizione, i prezzi più bassi delle copie normali', () => {
		expect(byLanguageAndCondition(list, { flags: ['pokemon_reverse'] })).toEqual({ it: { Played: [900], 'Near Mint': [1400, 1500] }, en: { 'Near Mint': [2500] } })
		expect(byLanguageAndCondition(list, { flags: ['pokemon_reverse'], keep: 1 }).it['Near Mint']).toEqual([1400])
	})
	it('in quante carte di un’espansione si vede ogni lingua', () => {
		const c = coverage(
			[list, [offer({}, { pokemon_language: 'en' }), offer({}, { pokemon_language: 'en' }), offer({}, { pokemon_language: 'en' })], [offer({}, { condition: 'Poor' })]],
			['pokemon_reverse'],
		)
		expect(c.cards).toBe(3)
		expect(c.cardsWithLanguage).toEqual({ it: 2, en: 2 })
		expect(c.cardsWithNearMint).toEqual({ en: 2, it: 1 })
		expect(c.cardsWith3NearMint).toEqual({ en: 1 })
		expect(c.languagesPerCard).toMatchObject({ n: 3, min: 1, max: 2 })
	})
})

describe('prova di CardTrader: che cosa guardare da vicino', () => {
	const exps = [
		{ id: 10, game_id: 5, code: 'bs', name: 'Base Set' },
		{ id: 11, game_id: 5, code: 'b2', name: 'Base Set 2' },
		{ id: 3400, game_id: 5, code: 'sv2a', name: 'Pokemon Card 151 (Japanese)' },
		{ id: 3403, game_id: 5, code: 'mew', name: '151' },
		{ id: 3500, game_id: 5, code: 'par', name: 'Paradox Rift' },
	]
	it('un’espansione recente, una vecchia, una giapponese', () => {
		expect(pickTargets(exps).map((t) => [t.why, t.exp.id])).toEqual([
			['recente', 3403],
			['vecchia', 10],
			['giapponese', 3400],
		])
		// With names never seen before, something is looked at all the same.
		expect(pickTargets([{ id: 1, name: 'Alfa' }, { id: 9, name: 'Omega' }]).map((t) => [t.why, t.exp.id])).toEqual([['la più recente', 9]])
		expect(pickTargets([])).toEqual([])
	})
	it('tre carte singole per fascia di prezzo e un prodotto sigillato', () => {
		const many = (cents: number) => Array.from({ length: 10 }, (_, i) => offer({ price: { cents: cents + i, currency: 'EUR' } }))
		const market = { 1: many(100), 2: many(5000), 3: many(900), 4: many(20), 5: many(12000), 6: [offer()], 7: many(400) }
		const picks = pickCards(market, (id) => (id === 5 ? 'other' : 'single'))
		// The dearest single card first; the box is taken as the sealed product, not as a card.
		expect(picks.map((p) => [p.id, p.kind])).toEqual([
			[2, 'single'],
			[3, 'single'],
			[7, 'single'],
			[5, 'other'],
		])
		// A card with a handful of offers tells too little to be worth asking about.
		expect(picks.map((p) => p.id)).not.toContain(6)
		expect(pickCards({})).toEqual([])
	})
})
