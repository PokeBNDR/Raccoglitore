import type { Source } from './types'

/**
 * What the search page was showing, remembered while the app is open: coming back from a card
 * shows the same results. Other pages can also set it, to open the search already filled in.
 */
export const SEARCH_PAGE = 60
export const searchMemo = { q: '', catalog: 'int' as Source, setId: '', shown: SEARCH_PAGE }

/** Makes the search page open on this catalogue with this text. */
export function presetSearch(catalog: Source, q: string) {
	Object.assign(searchMemo, { q, catalog, setId: '', shown: SEARCH_PAGE })
}
