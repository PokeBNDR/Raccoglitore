import type { Catalog, Cond, LangCode, PriceBasis, Settings, Source, VariantOpt } from './types'

export const CONDS: Array<{ code: Cond; name: string; cm: number }> = [
	{ code: 'MT', name: 'Mint', cm: 1 },
	{ code: 'NM', name: 'Near Mint', cm: 2 },
	{ code: 'EX', name: 'Excellent', cm: 3 },
	{ code: 'GD', name: 'Good', cm: 4 },
	{ code: 'LP', name: 'Light Played', cm: 5 },
	{ code: 'PL', name: 'Played', cm: 6 },
	{ code: 'PO', name: 'Poor', cm: 7 },
]

/**
 * `cm` = Cardmarket language ids, `img` = catalogue language folders to try for the picture,
 * `ebay` = the words sellers use for that language in listing titles.
 */
export const LANGS: Array<{ code: LangCode; name: string; cm: number[]; img: string[]; ebay: string[] }> = [
	{ code: 'IT', name: 'Italiano', cm: [5], img: ['it'], ebay: ['ita', 'italiano', 'italiana', 'italian'] },
	{ code: 'EN', name: 'Inglese', cm: [1], img: ['en'], ebay: ['eng', 'inglese', 'english'] },
	{ code: 'JA', name: 'Giapponese', cm: [7], img: ['ja'], ebay: ['jap', 'jpn', 'giapponese', 'japanese'] },
	{ code: 'DE', name: 'Tedesco', cm: [3], img: ['de'], ebay: ['ted', 'tedesco', 'deu', 'german', 'deutsch'] },
	{ code: 'FR', name: 'Francese', cm: [2], img: ['fr'], ebay: ['fra', 'francese', 'french'] },
	{ code: 'ES', name: 'Spagnolo', cm: [4], img: ['es', 'es-mx'], ebay: ['spa', 'esp', 'spagnolo', 'spanish'] },
	{ code: 'PT', name: 'Portoghese', cm: [8], img: ['pt-br', 'pt'], ebay: ['por', 'portoghese', 'portuguese'] },
	{ code: 'KO', name: 'Coreano', cm: [10], img: ['ko'], ebay: ['kor', 'coreano', 'korean'] },
	{ code: 'ZH', name: 'Cinese', cm: [6, 11], img: ['zh-tw', 'zh-cn'], ebay: ['chi', 'cinese', 'chinese'] },
]

export const CATALOGS: Array<{ code: Catalog; name: string; short: string; lang: LangCode }> = [
	{ code: 'int', name: 'Internazionale', short: 'Internaz.', lang: 'IT' },
	{ code: 'ja', name: 'Giapponese', short: 'Giapp.', lang: 'JA' },
	{ code: 'ko', name: 'Coreano', short: 'Coreano', lang: 'KO' },
	{ code: 'zh-tw', name: 'Cinese tradizionale', short: 'Cinese trad.', lang: 'ZH' },
	{ code: 'zh-cn', name: 'Cinese semplificato', short: 'Cinese sempl.', lang: 'ZH' },
]

export const BASIS: Array<{ code: PriceBasis; name: string; hint: string }> = [
	{ code: 'trend', name: 'Tendenza', hint: 'Il prezzo di tendenza di Cardmarket' },
	{ code: 'avg7', name: 'Media 7 giorni', hint: 'Media delle vendite degli ultimi 7 giorni' },
	{ code: 'avg30', name: 'Media 30 giorni', hint: 'Media delle vendite degli ultimi 30 giorni' },
	{ code: 'avg1', name: 'Media di ieri', hint: 'Media delle vendite dell’ultimo giorno' },
	{ code: 'avg', name: 'Media di vendita', hint: 'Prezzo medio di vendita' },
	{ code: 'low', name: 'Prezzo minimo', hint: 'L’offerta più bassa in vendita' },
]

export const GRADERS = ['PSA', 'BGS', 'CGC', 'GRAAD', 'AiGrading', 'SGC', 'ACE', 'TAG', 'Altro']

export const DEFAULT_SETTINGS: Settings = {
	basis: 'trend',
	condMult: { MT: 1.1, NM: 1, EX: 0.8, GD: 0.6, LP: 0.45, PL: 0.3, PO: 0.2 },
	langMult: { IT: 1, EN: 1, JA: 1, DE: 1, FR: 1, ES: 1, PT: 1, KO: 1, ZH: 1 },
	ebaySite: 'www.ebay.it',
	theme: 'system',
	view: 'list',
}

export const condName = (c: Cond) => CONDS.find((x) => x.code === c)?.name ?? c
export const langName = (l: LangCode) => LANGS.find((x) => x.code === l)?.name ?? l
export const basisName = (b: PriceBasis) => BASIS.find((x) => x.code === b)?.name ?? b
export const catalogName = (c: Catalog) => CATALOGS.find((x) => x.code === c)?.name ?? c

/** The Asian releases: different sets, their own card ids and their own Cardmarket products. */
export const isAsian = (c: Source): c is Exclude<Catalog, 'int'> => c !== 'int' && c !== 'sealed'
export const isSealed = (x: { catalog: Source }) => x.catalog === 'sealed'

/** The Asian catalogue a language belongs to, for the languages that have one. */
export const ASIAN_CATALOG: Partial<Record<LangCode, Exclude<Catalog, 'int'>>> = { JA: 'ja', KO: 'ko', ZH: 'zh-tw' }

const TYPE: Record<string, string> = {
	normal: 'Normale',
	holo: 'Holo',
	reverse: 'Reverse Holo',
	metal: 'Metallo',
	lenticular: 'Lenticolare',
	sealed: 'Sigillato',
}

const SUBTYPE: Record<string, string> = {
	unlimited: 'Unlimited',
	shadowless: 'Shadowless',
	'1999-2000-copyright': 'Copyright 1999-2000',
	'1999-copyright': 'Copyright 1999',
	'no-e-reader': 'Senza e-Reader',
	'missing-expansion-symbol': 'Senza simbolo espansione',
	'blue-border': 'Bordo blu',
	'gold-border': 'Bordo oro',
	'japanese-back': 'Retro giapponese',
	glossy: 'Lucida',
	cosmos: 'Cosmos',
}

const STAMP: Record<string, string> = {
	'1st-edition': '1ª edizione',
	'set-logo': 'Timbro del set',
	'pre-release': 'Prerelease',
	staff: 'Staff',
	'pokemon-center': 'Pokémon Center',
	'w-promo': 'W Promo',
	'w-Promo': 'W Promo',
	winner: 'Winner',
	snowflake: 'Fiocco di neve',
	'trick-or-trade': 'Trick or Trade',
	'player-rewards-program': 'Player Rewards',
	'professor-program': 'Professor Program',
	'25th-celebration': '25° anniversario',
	'30th-anniversary': '30° anniversario',
}

const FOIL: Record<string, string> = {
	pokeball: 'Poké Ball',
	greatball: 'Great Ball',
	ultraball: 'Ultra Ball',
	masterball: 'Master Ball',
	loveball: 'Love Ball',
	friendball: 'Friend Ball',
	quickball: 'Quick Ball',
	duskball: 'Dusk Ball',
	gold: 'Oro',
	cosmos: 'Cosmos',
	galaxy: 'Galaxy',
	starlight: 'Starlight',
	energy: 'Energia',
	'cracked-ice': 'Cracked Ice',
	rainbow: 'Rainbow',
	mirror: 'Mirror',
	league: 'League',
	'team-rocket': 'Team Rocket',
}

/** "missing-hp" → "Missing hp" for the values we have no Italian label for. */
function pretty(s: string): string {
	const t = s.replace(/-/g, ' ').trim()
	return t.charAt(0).toUpperCase() + t.slice(1)
}

export const typeLabel = (t: string) => TYPE[t] ?? pretty(t)
export const stampLabel = (s: string) => STAMP[s] ?? pretty(s)

export function variantLabel(v: Pick<VariantOpt, 'type' | 'subtype' | 'stamps' | 'foil' | 'size'>): string {
	const parts = [typeLabel(v.type)]
	if (v.foil) parts.push(FOIL[v.foil] ?? pretty(v.foil))
	if (v.subtype) parts.push(SUBTYPE[v.subtype] ?? pretty(v.subtype))
	for (const s of v.stamps) parts.push(stampLabel(s))
	if (v.size && v.size !== 'standard') parts.push(pretty(v.size))
	return parts.join(' · ')
}

/** "4/102" for a numbered card, the bare code for promos such as "SWSH123". */
export function cardNumber(localId: string, official?: number): string {
	return /^\d+$/.test(localId) && official ? `${localId}/${official}` : localId
}

/** Name to show for a card: Asian cards lead with the Latin species name when it is known. */
export function shownName(x: { catalog: Source; name: string; nameAlt?: string }): string {
	return isAsian(x.catalog) && x.nameAlt ? `${x.nameAlt} · ${x.name}` : x.name
}

/** Font size for a page title: long card and set names step down so they stay on one or two lines. */
export function titleSize(text: string): number | undefined {
	const n = [...text].length
	if (n <= 11) return undefined
	if (n <= 16) return 26
	if (n <= 26) return 21
	return 18
}
