import { CONDS, LANGS, cardNumber } from './labels'
import { pickVariant } from './pricing'
import type { CardInfo, Holding } from './types'

type Copy = Pick<Holding, 'lang' | 'cond' | 'grade' | 'variantKey' | 'variantType' | 'stamps'>

/**
 * Cardmarket page of the card. With a copy, the offers are narrowed to its language and to its
 * condition or better, which is where the real price of that exact copy can be read.
 */
export function cardmarketUrl(card: CardInfo, copy?: Copy): string {
	const variant = copy ? pickVariant(card, copy) : undefined
	const id = variant?.cmId ?? card.cm?.idProduct ?? card.variants.find((v) => v.cmId)?.cmId
	if (!id) return cardmarketSearchUrl(card)
	const p = new URLSearchParams({ idProduct: String(id) })
	if (copy) {
		const lang = LANGS.find((l) => l.code === copy.lang)
		if (lang) p.set('language', lang.cm.join(','))
		if (!copy.grade) {
			const cond = CONDS.find((c) => c.code === copy.cond)
			if (cond) p.set('minCondition', String(cond.cm))
		}
		if (copy.variantType === 'reverse') p.set('isReverseHolo', 'Y')
		if (copy.stamps.includes('1st-edition')) p.set('isFirstEd', 'Y')
	}
	return `https://www.cardmarket.com/it/Pokemon/Products?${p.toString().replace(/%2C/g, ',')}`
}

export function cardmarketSearchUrl(card: Pick<CardInfo, 'name' | 'nameAlt' | 'catalog'>): string {
	const q = card.catalog === 'int' ? (card.nameAlt ?? card.name) : (card.nameAlt ?? card.name)
	return `https://www.cardmarket.com/it/Pokemon/Products/Search?searchString=${encodeURIComponent(q)}`
}

type Named = Pick<CardInfo, 'name' | 'nameAlt' | 'catalog' | 'localId'> & { official?: number }

/** Search words for marketplaces: name, printed number and, for a copy, its language and grade. */
export function marketQuery(card: Named, copy?: Pick<Holding, 'lang' | 'grade'>): string {
	// Italian copies are listed under the Italian name; everything else under the English or species name.
	const name = card.catalog === 'int' && copy?.lang === 'IT' ? card.name : (card.nameAlt ?? card.name)
	const parts = [name, cardNumber(card.localId, card.official)]
	if (copy) {
		const lang = LANGS.find((l) => l.code === copy.lang)
		if (lang) parts.push(`(${lang.ebay.join(',')})`)
		if (copy.grade) parts.push(`${copy.grade.company} ${copy.grade.value}`.trim())
	}
	return parts.filter(Boolean).join(' ')
}

/** eBay search of the listings that actually sold. */
export function ebaySoldUrl(card: Named, copy: Pick<Holding, 'lang' | 'grade'> | undefined, site: string): string {
	const p = new URLSearchParams({ _nkw: marketQuery(card, copy), LH_Sold: '1', LH_Complete: '1' })
	return `https://${site}/sch/i.html?${p.toString()}`
}

export const namedOf = (card: CardInfo): Named => ({
	name: card.name,
	nameAlt: card.nameAlt,
	catalog: card.catalog,
	localId: card.localId,
	official: card.set.official,
})
