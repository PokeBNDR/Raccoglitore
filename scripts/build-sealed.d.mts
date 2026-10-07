// Types of the parts of build-sealed.mjs that the tests use.
export interface SealedFile {
	v: number
	source?: string
	updated: string | null
	built?: string
	cats: Record<string, string>
	exp: Record<string, { n?: string; s?: string[] }>
	p: Array<[number, string, number, number, number, number, number, number, number, number]>
	lookups?: Record<string, Lookup>
	meta?: Record<string, unknown>
}
export function expansionLabel(names: string[]): string
export function majority<T>(list: T[]): T | undefined
export function buildDataset(input: {
	nonsingles: unknown
	prices: unknown
	sets?: Record<string, number>
	names?: Record<string, string>
	lookups?: Record<string, Lookup>
	now?: Date
}): SealedFile
/** How complete the list is, set by set (sealed-report.json). */
export interface SealedReport {
	v: number
	built: string | null
	updated: string | null
	stale: boolean
	products: number
	priced: number
	expansions: number
	linked: number
	catCounts: Record<string, number>
	sets: Record<
		string,
		{ total: number; linked: number; withProducts: number; products: number; empty: string[]; unmatched: string[]; pending: string[] }
	>
	orphans: { expansions: number; products: number; unnamed: number; top: Array<[number, string, number]> }
	lookups: { tried: number; resolved: number; left: number }
	links?: Links['stats'] & { conflicts: unknown[]; shared: unknown[] }
	keys: Record<string, string[]>
	errors: string[]
}
export function buildReport(input: {
	data: SealedFile
	sets?: Record<string, number>
	catalog?: Record<string, Array<{ id: string; name: string }>>
	lookups?: Record<string, Lookup>
	keys?: Record<string, string[]>
	links?: Links | null
}): SealedReport
export interface Lookup {
	e: number
	d: string
	n?: number
	t?: number
}
export interface Links {
	sets: Record<string, number>
	conflicts: Array<[string, number, number]>
	shared: Array<[number, string[]]>
	stats: { seed: number; confirmed: number; corrected: number; unverified: number; weak: number; fromCards: number }
}
export function resolveLinks(input: { known?: Record<string, number>; lookups?: Record<string, Lookup> }): Links
export function listOrphans(data: SealedFile): Array<[number, string, number, string]>
export function main(): Promise<SealedFile>
