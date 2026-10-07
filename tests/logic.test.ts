import { describe, expect, it } from 'vitest'
import { dayStr, eur, eurShort, eurTight, fmtWhen, ofWhen, parseNum, pct, round2, signedEur, usd } from '../src/lib/format'
import { DEFAULT_SETTINGS, cardNumber, variantLabel } from '../src/lib/labels'
import { cardmarketUrl, ebaySoldUrl, marketQuery, namedOf } from '../src/lib/links'
import { basePrice, figure, pickVariant, priceSource, totals, unitValue } from '../src/lib/pricing'
import type { CardInfo, Holding, VariantOpt } from '../src/lib/types'

// Only the pure parts of tcgdex.ts are imported: the module reads import.meta.env at load.
import { defaultVariant, imageCandidates, logoCandidates, parseQuery, setIdOf } from '../src/lib/tcgdex'

const v = (o: Partial<VariantOpt> & { key: string; type: string }): VariantOpt => ({ stamps: [], ...o })

function card(over: Partial<CardInfo> = {}): CardInfo {
	return {
		key: 'int:sv03.5-001',
		catalog: 'int',
		id: 'sv03.5-001',
		localId: '001',
		name: 'Bulbasaur',
		images: { en: 'https://assets.tcgdex.net/en/sv/sv03.5/001' },
		set: { id: 'sv03.5', name: '151', official: 165, total: 207 },
		variants: [v({ key: 'n', type: 'normal', cmId: 733596 }), v({ key: 'r', type: 'reverse', cmId: 733596 })],
		cm: {
			idProduct: 733596,
			avg: 0.1,
			low: 0.02,
			trend: 0.12,
			avg1: 0.11,
			avg7: 0.1,
			avg30: 0.09,
			'avg-holo': 0.5,
			'low-holo': 0.2,
			'trend-holo': 0.6,
			'avg1-holo': 0.55,
			'avg7-holo': 0.52,
			'avg30-holo': 0.48,
		},
		tcg: null,
		fetchedAt: 0,
		...over,
	}
}

function holding(over: Partial<Holding> = {}): Holding {
	return {
		id: 'h1',
		catalog: 'int',
		cardId: 'sv03.5-001',
		name: 'Bulbasaur',
		setId: 'sv03.5',
		setName: '151',
		localId: '001',
		setOfficial: 165,
		images: {},
		lang: 'IT',
		cond: 'NM',
		variantKey: 'n',
		variantType: 'normal',
		variantLabel: 'Normale',
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
	}
}

describe('prezzi digitati', () => {
	it('legge i formati italiani', () => {
		expect(parseNum('12,50')).toBe(12.5)
		expect(parseNum('1.250,00')).toBe(1250)
		expect(parseNum('1.250')).toBe(1250)
		expect(parseNum('12.5')).toBe(12.5)
		expect(parseNum('0.150')).toBe(0.15)
		expect(parseNum('€ 3')).toBe(3)
		expect(parseNum(' ')).toBeNull()
		expect(parseNum('')).toBeNull()
	})
	it('rifiuta ciò che non è un prezzo', () => {
		expect(parseNum('abc')).toBeNaN()
		expect(parseNum('-5')).toBeNaN()
		expect(parseNum('12,5,0')).toBeNaN()
	})
	it('formatta percentuali e importi stretti', () => {
		expect(pct(12.34)).toBe('+12,3%')
		expect(pct(-4)).toBe('−4%')
		expect(eurTight(1168.49).replace(/\s/g, ' ')).toBe('1.168 €')
		expect(round2(0.048)).toBe(0.05)
		expect(dayStr(new Date(2026, 9, 6))).toBe('2026-10-06')
	})
	it('gli importi hanno sempre il punto delle migliaia, anche sotto i diecimila', () => {
		const t = (s: string) => s.replace(/\s/g, ' ')
		expect(t(eur(0.4))).toBe('0,40 €')
		expect(t(eur(999.9))).toBe('999,90 €')
		expect(t(eur(2091.92))).toBe('2.091,92 €')
		expect(t(eur(12345.678))).toBe('12.345,68 €')
		expect(t(eur(1234567.891))).toBe('1.234.567,89 €')
		expect(t(eurShort(9999.5))).toBe('9.999,50 €')
		expect(t(eurShort(12345.678))).toBe('12.346 €')
		expect(t(signedEur(-2091.92))).toBe('−2.091,92 €')
		expect(t(signedEur(4469.26))).toBe('+4.469,26 €')
		expect(t(usd(1234.5))).toMatch(/^1\.234,50 /)
		expect(pct(4900)).toBe('+4.900%')
		expect(eur(null)).toBe('—')
		expect(eur(Number.NaN)).toBe('—')
	})
	it('date dopo un nome: «di ieri», «del 3 ott», «dell’8 ott»', () => {
		const at = (d: Date) => ofWhen(d.getTime()).replace(/\s/g, ' ')
		const now = new Date()
		const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 5)
		const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 11, 52)
		expect(at(today)).toBe('di oggi alle 09:05')
		expect(fmtWhen(today.getTime())).toBe('oggi alle 09:05')
		expect(at(yesterday)).toBe('di ieri alle 11:52')
		expect(at(new Date(2020, 9, 3, 12, 0))).toBe('del 3 ott alle 12:00')
		expect(at(new Date(2020, 9, 8, 12, 0))).toBe('dell’8 ott alle 12:00')
		expect(at(new Date(2020, 9, 11, 12, 0))).toBe('dell’11 ott alle 12:00')
		expect(at(new Date(2020, 9, 1, 12, 0))).toBe('dell’1 ott alle 12:00')
		expect(ofWhen(null)).toBe('—')
		expect(ofWhen('non una data')).toBe('—')
	})
})

describe('prezzo di partenza', () => {
	it('la normale legge le colonne semplici', () => {
		const c = card()
		expect(basePrice(c, c.variants[0], 'trend').value).toBe(0.12)
		expect(basePrice(c, c.variants[0], 'avg30').value).toBe(0.09)
	})
	it('la reverse che condivide il prodotto legge le colonne "-holo"', () => {
		const c = card()
		const r = basePrice(c, c.variants[1], 'trend')
		expect(r.value).toBe(0.6)
		expect(r.approx).toBe(false)
		expect(figure(priceSource(c, c.variants[1]), 'low')).toBe(0.2)
	})
	it('la reverse senza prezzi propri usa quelli della normale e lo segnala', () => {
		const c = card({ cm: { idProduct: 1, trend: 0.3, avg7: 0.25, 'trend-holo': 0, 'avg7-holo': null } })
		const r = basePrice(c, c.variants[1], 'trend')
		expect(r.value).toBe(0.3)
		expect(r.approx).toBe(true)
	})
	it('una versione con un suo prodotto legge il suo listino', () => {
		const cosmos = v({ key: 'c', type: 'reverse', foil: 'cosmos', cmId: 794908, cm: { idProduct: 794908, trend: 4, avg7: 3.5 } })
		const c = card({ variants: [...card().variants, cosmos] })
		const r = basePrice(c, cosmos, 'trend')
		expect(r.value).toBe(4)
		expect(r.approx).toBe(false)
	})
	it('se manca il dato scelto ne usa un altro e lo dice', () => {
		const c = card({ cm: { trend: 0, avg7: 2, avg30: 3 } })
		const r = basePrice(c, c.variants[0], 'trend')
		expect(r.value).toBe(2)
		expect(r.basis).toBe('avg7')
		expect(r.substituted).toBe(true)
	})
	it('nessun listino: nessun prezzo', () => {
		const c = card({ cm: null })
		expect(basePrice(c, c.variants[0], 'trend').value).toBeNull()
		expect(basePrice(undefined, undefined, 'trend').value).toBeNull()
	})
})

describe('valore di una copia', () => {
	const s = { ...DEFAULT_SETTINGS, langMult: { ...DEFAULT_SETTINGS.langMult, IT: 0.7 } }
	it('prezzo × condizione × lingua', () => {
		const u = unitValue(holding({ cond: 'EX' }), card(), s)
		expect(u.kind).toBe('auto')
		expect(u.value).toBe(round2(0.12 * 0.8 * 0.7))
	})
	it('il prezzo scritto a mano sostituisce il calcolo', () => {
		const u = unitValue(holding({ manualPrice: 5, cond: 'PO' }), card(), s)
		expect(u.kind).toBe('manual')
		expect(u.value).toBe(5)
	})
	it('una gradata ignora la condizione e viene segnalata come stima', () => {
		const u = unitValue(holding({ cond: 'PO', grade: { company: 'PSA', value: '9' }, lang: 'EN' }), card(), s)
		expect(u.condM).toBe(1)
		expect(u.value).toBe(0.12)
		expect(u.gradedGuess).toBe(true)
	})
	it('ritrova la versione anche se la chiave è cambiata', () => {
		const c = card()
		expect(pickVariant(c, { variantKey: 'vecchia', variantType: 'reverse', stamps: [] })?.key).toBe('r')
		expect(pickVariant(c, { variantKey: 'r', variantType: 'normal', stamps: [] })?.key).toBe('r')
	})
	it('totali: il guadagno conta solo le copie con un prezzo pagato', () => {
		const hs = [
			holding({ id: 'a', qty: 2, buyPrice: 0.05 }),
			holding({ id: 'b', manualPrice: 10 }),
			holding({ id: 'c', cardId: 'manca', manualPrice: null }),
		]
		const t = totals(hs, { 'int:sv03.5-001': card() }, DEFAULT_SETTINGS)
		expect(t.value).toBe(round2(0.12 * 2 + 10))
		expect(t.cost).toBe(0.1)
		expect(t.pl).toBe(round2(0.24 - 0.1))
		expect(t.copies).toBe(4)
		expect(t.unpriced).toBe(1)
		expect(t.withCost).toBe(1)
	})
})

describe('link ai mercati', () => {
	it('Cardmarket: prodotto, lingua e condizione minima della copia', () => {
		const url = cardmarketUrl(card(), holding({ lang: 'IT', cond: 'EX' }))
		expect(url).toBe('https://www.cardmarket.com/it/Pokemon/Products?idProduct=733596&language=5&minCondition=3')
	})
	it('Cardmarket: reverse, 1ª edizione e cinese', () => {
		const url = cardmarketUrl(card(), holding({ lang: 'ZH', cond: 'NM', variantKey: 'r', variantType: 'reverse', stamps: ['1st-edition'] }))
		expect(url).toContain('language=6,11')
		expect(url).toContain('isReverseHolo=Y')
		expect(url).toContain('isFirstEd=Y')
	})
	it('Cardmarket: una gradata non filtra per condizione', () => {
		expect(cardmarketUrl(card(), holding({ grade: { company: 'PSA', value: '10' } }))).not.toContain('minCondition')
	})
	it('Cardmarket: senza id prodotto apre la ricerca per nome', () => {
		const c = card({ cm: null, variants: [v({ key: 'n', type: 'normal' })] })
		expect(cardmarketUrl(c)).toBe('https://www.cardmarket.com/it/Pokemon/Products/Search?searchString=Bulbasaur')
	})
	it('eBay: venduti, con numero stampato, lingua e voto', () => {
		const c = card({ name: 'Ricerca Accademica', nameAlt: "Professor's Research" })
		expect(marketQuery(namedOf(c), { lang: 'IT', grade: null })).toBe('Ricerca Accademica 001/165 (ita,italiano,italiana,italian)')
		expect(marketQuery(namedOf(c), { lang: 'EN', grade: { company: 'PSA', value: '9' } })).toBe(
			"Professor's Research 001/165 (eng,inglese,english) PSA 9",
		)
		const url = ebaySoldUrl(namedOf(c), { lang: 'IT', grade: null }, 'www.ebay.it')
		expect(url.startsWith('https://www.ebay.it/sch/i.html?_nkw=Ricerca+Accademica')).toBe(true)
		expect(url).toContain('LH_Sold=1')
		expect(url).toContain('LH_Complete=1')
	})
})

describe('catalogo', () => {
	it('legge "nome numero/totale"', () => {
		expect(parseQuery('pikachu 58/102')).toEqual({ name: 'pikachu', num: 58, total: 102 })
		expect(parseQuery('  charizard   4 ')).toEqual({ name: 'charizard', num: 4, total: undefined })
		expect(parseQuery('4/102')).toEqual({ name: '', num: 4, total: 102 })
		expect(parseQuery('mr. mime')).toEqual({ name: 'mr. mime', num: undefined, total: undefined })
		expect(parseQuery('porygon2')).toEqual({ name: 'porygon2', num: undefined, total: undefined })
		expect(parseQuery('25')).toEqual({ name: '', num: 25, total: undefined })
	})
	it('ricava il set dall’id della carta, anche con trattini', () => {
		expect(setIdOf({ id: 'base1-4', localId: '4' })).toBe('base1')
		expect(setIdOf({ id: 'tk-xy-latia-12', localId: '12' })).toBe('tk-xy-latia')
		expect(setIdOf({ id: 'SV-P-001', localId: '001' })).toBe('SV-P')
	})
	it('sceglie la versione "normale" come predefinita', () => {
		const c = card({
			variants: [
				v({ key: 's', type: 'holo', subtype: 'shadowless', stamps: ['1st-edition'] }),
				v({ key: 'u', type: 'holo', subtype: 'unlimited' }),
				v({ key: 'r', type: 'reverse' }),
			],
		})
		expect(defaultVariant(c).key).toBe('u')
	})
	it('immagini: prima la lingua della copia, poi italiano e inglese', () => {
		const imgs = { it: 'https://assets.tcgdex.net/it/base/base1/4', en: 'https://assets.tcgdex.net/en/base/base1/4' }
		expect(imageCandidates(imgs, ['it'], 'low')).toEqual([
			'https://assets.tcgdex.net/it/base/base1/4/low.webp',
			'https://assets.tcgdex.net/en/base/base1/4/low.webp',
		])
		// German was never asked to the catalogue: its file is tried, then the known ones.
		expect(imageCandidates(imgs, ['de'], 'high')[0]).toBe('https://assets.tcgdex.net/de/base/base1/4/high.webp')
		// No Italian picture in the catalogue: it is not requested at all.
		expect(imageCandidates({ en: imgs.en }, ['it'], 'low')).toEqual(['https://assets.tcgdex.net/en/base/base1/4/low.webp'])
		expect(imageCandidates({}, ['it'], 'low')).toEqual([])
	})
	it('logo dei set: altro formato, poi quello inglese, poi il simbolo', () => {
		const a = 'https://assets.tcgdex.net'
		expect(logoCandidates(`${a}/it/me/me05/logo`, `${a}/univ/me/me05/symbol`)).toEqual([
			`${a}/it/me/me05/logo.webp`,
			`${a}/it/me/me05/logo.png`,
			`${a}/en/me/me05/logo.webp`,
			`${a}/en/me/me05/logo.png`,
			`${a}/univ/me/me05/symbol.webp`,
			`${a}/univ/me/me05/symbol.png`,
		])
		// An English or a Japanese logo has no other language to fall back on.
		expect(logoCandidates(`${a}/en/base/base1/logo`)).toEqual([`${a}/en/base/base1/logo.webp`, `${a}/en/base/base1/logo.png`])
		expect(logoCandidates(`${a}/ja/SV/SV2a/logo`)).toEqual([`${a}/ja/SV/SV2a/logo.webp`, `${a}/ja/SV/SV2a/logo.png`])
		expect(logoCandidates(undefined, `${a}/univ/base/base1/symbol`)).toEqual([`${a}/univ/base/base1/symbol.webp`, `${a}/univ/base/base1/symbol.png`])
		expect(logoCandidates()).toEqual([])
	})
	it('etichette', () => {
		expect(cardNumber('4', 102)).toBe('4/102')
		expect(cardNumber('SWSH123', 0)).toBe('SWSH123')
		expect(cardNumber('TG01', 30)).toBe('TG01')
		expect(variantLabel({ type: 'holo', subtype: 'shadowless', stamps: ['1st-edition'] })).toBe('Holo · Shadowless · 1ª edizione')
		expect(variantLabel({ type: 'reverse', foil: 'masterball', stamps: [] })).toBe('Reverse Holo · Master Ball')
	})
})
