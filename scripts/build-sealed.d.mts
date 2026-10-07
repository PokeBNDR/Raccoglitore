// Types of the parts of build-sealed.mjs that the tests use.
export interface SealedFile {
	v: number
	source?: string
	updated: string | null
	built?: string
	cats: Record<string, string>
	exp: Record<string, { n?: string; s?: string[] }>
	p: Array<[number, string, number, number, number, number, number, number, number, number]>
	lookups?: Record<string, { e: number; d: string }>
	meta?: Record<string, unknown>
}
export function expansionLabel(names: string[]): string
export function majority<T>(list: T[]): T | undefined
export function buildDataset(input: {
	nonsingles: unknown
	prices: unknown
	sets?: Record<string, number>
	names?: Record<string, string>
	lookups?: Record<string, { e: number; d: string }>
	now?: Date
}): SealedFile
export function main(): Promise<SealedFile>
