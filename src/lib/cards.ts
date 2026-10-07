import { loadSealedCard } from './sealed'
import { getCardLite as tcgCardLite, loadCard as tcgLoadCard } from './tcgdex'
import type { CardInfo, Source } from './types'

/**
 * One way to load anything that can be in the collection: a card from one of the card
 * catalogues, or a sealed product from Cardmarket's list.
 */
export async function loadCard(
	source: Source,
	id: string,
	opts: { force?: boolean } = {},
): Promise<{ card: CardInfo | null; stale: boolean }> {
	return source === 'sealed' ? loadSealedCard(id, opts) : tcgLoadCard(source, id, opts)
}

export async function getCard(source: Source, id: string, opts: { force?: boolean } = {}): Promise<CardInfo | null> {
	return (await loadCard(source, id, opts)).card
}

/** Prices only, with as few requests as possible: for the price tags in lists. */
export async function getCardLite(source: Source, id: string): Promise<CardInfo | null> {
	return source === 'sealed' ? (await loadSealedCard(id)).card : tcgCardLite(source, id)
}
