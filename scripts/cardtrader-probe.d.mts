// Types of the parts of cardtrader-probe.mjs that the tests use.
type Json = Record<string, unknown>
export interface Quantiles {
	n: number
	min: number
	q25: number
	med: number
	q75: number
	max: number
}
export function listOf(x: unknown): any[]
export function tally(values: unknown[], max?: number): Record<string, number>
export function quantiles(numbers: unknown[]): Quantiles | null
export function centsOf(product: unknown): number | null
export function currencyOf(product: unknown): string | null
export function languageKey(products: unknown[]): string | null
export function describeOffers(products: unknown[]): Json & { n: number; langKey: string | null; languages: Record<string, number>; flags: Record<string, Record<string, number>> }
export function specialFlags(products: unknown[]): string[]
export function isPlain(product: unknown, flags?: string[]): boolean
export function byLanguageAndCondition(products: unknown[], opts?: { keep?: number; flags?: string[] }): Record<string, Record<string, number[]>>
export function coverage(
	lists: unknown[][],
	flags?: string[],
): {
	cards: number
	languagesPerCard: Quantiles | null
	cardsWithLanguage: Record<string, number>
	cardsWithNearMint: Record<string, number>
	cardsWith3NearMint: Record<string, number>
}
export function trimBlueprint(b: unknown): Json | null
export function trimOffer(p: unknown): Json | null
export function pickTargets(expansions: unknown[]): Array<{ why: string; exp: { id: number; code?: string; name?: string } }>
export function pickCards(market: unknown, kindOf?: (id: number) => string): Array<{ id: number; n: number; low: number; name: string; kind: string }>
export function probe(): Promise<{ report: Json; targets: Json[] | null; expansions: unknown[] | null }>
export function main(): Promise<Json | null>
