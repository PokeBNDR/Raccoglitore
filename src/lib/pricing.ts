import { round2 } from './format'
import type { CardInfo, CmField, CmPrice, Holding, PriceBasis, Settings, VariantOpt } from './types'

const ALL: PriceBasis[] = ['trend', 'avg7', 'avg30', 'avg1', 'avg', 'low']

/** Cardmarket writes a missing figure as 0 or null. */
const pos = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null)

export const cardKey = (x: { catalog: string; cardId?: string; id?: string }) => `${x.catalog}:${x.cardId ?? x.id}`

type VariantRef = Pick<Holding, 'variantKey' | 'variantType' | 'stamps'>

/** Finds the catalogue version a collection entry refers to, tolerating catalogue changes. */
export function pickVariant(card: CardInfo | undefined, h: VariantRef): VariantOpt | undefined {
	if (!card) return undefined
	const vs = card.variants
	const sameStamps = (v: VariantOpt) => v.stamps.length === h.stamps.length && v.stamps.every((s) => h.stamps.includes(s))
	return (
		vs.find((v) => v.key === h.variantKey) ??
		vs.find((v) => v.type === h.variantType && sameStamps(v)) ??
		vs.find((v) => v.type === h.variantType)
	)
}

export interface PriceSource {
	cm: CmPrice | null
	/** Read the "-holo" columns of the price guide instead of the plain ones. */
	holo: boolean
	/** A Reverse Holo shown with the normal card's prices because Cardmarket lists none for the reverse. */
	approx: boolean
}

/**
 * Where the prices of one version of a card are read from.
 *
 * Cardmarket's price guide has two groups of columns per product: the plain ones and the "-holo" ones,
 * which for Pokémon hold the Reverse Holo prices. A reverse that shares its product with the normal
 * card reads the "-holo" columns; a version that is its own product reads the plain ones.
 */
export function priceSource(card: CardInfo | undefined, variant: VariantOpt | undefined): PriceSource {
	const cm = variant?.cm ?? card?.cm ?? null
	if (!card || !cm) return { cm: null, holo: false, approx: false }
	const has = (holo: boolean) => ALL.some((b) => pos(cm[(holo ? `${b}-holo` : b) as CmField]) != null)
	if (variant?.type !== 'reverse') return { cm, holo: false, approx: false }
	const ownProduct =
		variant.cmId != null && !card.variants.some((o) => o !== variant && o.type !== 'reverse' && o.cmId === variant.cmId)
	const preferHolo = !ownProduct
	if (has(preferHolo)) return { cm, holo: preferHolo, approx: false }
	if (has(!preferHolo)) return { cm, holo: !preferHolo, approx: preferHolo }
	return { cm, holo: preferHolo, approx: false }
}

/** One figure of the price guide for a version, or null when Cardmarket has none. */
export function figure(src: PriceSource, basis: PriceBasis): number | null {
	if (!src.cm) return null
	return pos(src.cm[(src.holo ? `${basis}-holo` : basis) as CmField])
}

export interface BaseResult {
	value: number | null
	basis: PriceBasis | null
	/** The requested figure was missing, another one was used. */
	substituted: boolean
	approx: boolean
	cm: CmPrice | null
}

/** Starting price of one version of a card, before condition and language. */
export function basePrice(card: CardInfo | undefined, variant: VariantOpt | undefined, basis: PriceBasis): BaseResult {
	const src = priceSource(card, variant)
	for (const b of [basis, ...ALL.filter((x) => x !== basis)]) {
		const v = figure(src, b)
		if (v != null) return { value: v, basis: b, substituted: b !== basis, approx: src.approx, cm: src.cm }
	}
	return { value: null, basis: null, substituted: false, approx: false, cm: src.cm }
}

export interface UnitResult {
	/** Value of one copy. */
	value: number | null
	kind: 'manual' | 'auto' | 'none'
	base: BaseResult
	condM: number
	langM: number
	/** Graded copy valued from the ungraded price because no price was typed in. */
	gradedGuess: boolean
}

export function unitValue(h: Holding, card: CardInfo | undefined, s: Settings, basis: PriceBasis = s.basis): UnitResult {
	const base = basePrice(card, pickVariant(card, h), basis)
	// A graded card and a sealed product have no condition to correct for.
	const condM = h.grade || h.catalog === 'sealed' ? 1 : (s.condMult[h.cond] ?? 1)
	const langM = s.langMult[h.lang] ?? 1
	if (typeof h.manualPrice === 'number' && Number.isFinite(h.manualPrice)) {
		return { value: h.manualPrice, kind: 'manual', base, condM, langM, gradedGuess: false }
	}
	if (base.value == null) return { value: null, kind: 'none', base, condM, langM, gradedGuess: false }
	return { value: round2(base.value * condM * langM), kind: 'auto', base, condM, langM, gradedGuess: !!h.grade }
}

export interface Totals {
	value: number
	/** What was paid, counting only entries with a purchase price. */
	cost: number
	/** Gain or loss on the entries that have both a value and a purchase price. */
	pl: number
	plPct: number | null
	copies: number
	entries: number
	unpriced: number
	/** How many entries have a purchase price. */
	withCost: number
}

export function totals(
	holdings: Holding[],
	cards: Record<string, CardInfo>,
	s: Settings,
	basis: PriceBasis = s.basis,
): Totals {
	let value = 0
	let cost = 0
	let plBase = 0
	let copies = 0
	let unpriced = 0
	let withCost = 0
	for (const h of holdings) {
		const q = h.qty || 1
		copies += q
		const u = unitValue(h, cards[cardKey(h)], s, basis).value
		if (u == null) {
			unpriced++
			continue
		}
		value += u * q
		if (typeof h.buyPrice === 'number') {
			withCost++
			cost += h.buyPrice * q
			plBase += u * q
		}
	}
	const pl = plBase - cost
	return {
		value: round2(value),
		cost: round2(cost),
		pl: round2(pl),
		plPct: cost > 0 ? (pl / cost) * 100 : null,
		copies,
		entries: holdings.length,
		unpriced,
		withCost,
	}
}
