/** Language printed on the physical card. */
export type LangCode = 'IT' | 'EN' | 'JA' | 'DE' | 'FR' | 'ES' | 'PT' | 'KO' | 'ZH'

/** Cardmarket condition scale. */
export type Cond = 'MT' | 'NM' | 'EX' | 'GD' | 'LP' | 'PL' | 'PO'

/**
 * Which card catalogue a card comes from.
 * `int` = the international releases (same card ids for IT, EN, DE, FR, ES, PT).
 * The Asian releases are different sets with their own ids.
 */
export type Catalog = 'int' | 'ja' | 'ko' | 'zh-tw' | 'zh-cn'

/** Which Cardmarket figure is used as the starting price. */
export type PriceBasis = 'trend' | 'avg1' | 'avg7' | 'avg30' | 'avg' | 'low'

export type CmField = PriceBasis | `${PriceBasis}-holo`

/** One row of Cardmarket's daily price guide, as served by the catalogue API. */
export type CmPrice = {
	updated?: string
	unit?: string
	idProduct?: number
} & Partial<Record<CmField, number | null>>

/** One printable version of a card (holo, reverse, 1st edition, stamped…). */
export interface VariantOpt {
	key: string
	type: string
	subtype?: string
	stamps: string[]
	foil?: string
	size?: string
	/** Cardmarket product id of this version, when the catalogue knows it. */
	cmId?: number
	cm?: CmPrice | null
}

export interface CardSetRef {
	id: string
	name: string
	official?: number
	total?: number
	symbol?: string
	logo?: string
}

/** A catalogue card with prices, normalised from the API. */
export interface CardInfo {
	key: string
	catalog: Catalog
	id: string
	localId: string
	/** Display name (Italian when it exists). */
	name: string
	/** English name, or the species name for Asian cards. Used for links and search. */
	nameAlt?: string
	/** Image base urls by catalogue language (it, en, ja…). */
	images: Record<string, string>
	set: CardSetRef
	rarity?: string
	category?: string
	illustrator?: string
	hp?: number
	types?: string[]
	dexId?: number[]
	variants: VariantOpt[]
	cm: CmPrice | null
	/** TCGplayer (US) prices, keyed by finish. Shown only as a reference. */
	tcg: Record<string, unknown> | null
	fetchedAt: number
}

export interface CardBrief {
	catalog: Catalog
	id: string
	localId: string
	setId: string
	name: string
	nameAlt?: string
	images: Record<string, string>
}

export interface SetBrief {
	catalog: Catalog
	id: string
	name: string
	logo?: string
	symbol?: string
	official: number
	total: number
	/** Position in release order (0 = oldest). */
	order: number
}

export interface SetFull extends SetBrief {
	releaseDate?: string
	serie?: { id: string; name: string }
	cards: CardBrief[]
}

export interface Grade {
	company: string
	value: string
}

/** One entry of the collection: a card in a given language, condition and version. */
export interface Holding {
	id: string
	catalog: Catalog
	cardId: string
	name: string
	nameAlt?: string
	setId: string
	setName: string
	localId: string
	setOfficial?: number
	images: Record<string, string>
	rarity?: string

	lang: LangCode
	cond: Cond
	variantKey: string
	variantType: string
	variantLabel: string
	stamps: string[]
	grade: Grade | null
	qty: number
	/** Paid per copy. */
	buyPrice: number | null
	buyDate: string | null
	/** Price per copy typed by the user; replaces the calculation. */
	manualPrice: number | null
	manualAt: number | null
	note: string

	createdAt: number
	updatedAt: number
}

export interface Settings {
	basis: PriceBasis
	condMult: Record<Cond, number>
	langMult: Record<LangCode, number>
	ebaySite: string
	theme: 'system' | 'dark' | 'light'
	view: 'list' | 'grid'
}

export interface Snapshot {
	date: string
	value: number
	cost: number
	copies: number
}
