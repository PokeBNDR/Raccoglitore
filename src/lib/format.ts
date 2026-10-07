const EUR = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })
const EUR0 = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const USD = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'USD' })

export const eur = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? '—' : EUR.format(n))
export const eurShort = (n: number | null | undefined) =>
	n == null || !Number.isFinite(n) ? '—' : Math.abs(n) >= 10000 ? EUR0.format(n) : EUR.format(n)
/** For narrow cells: cents are dropped from a thousand up ("1.168 €"). */
export const eurTight = (n: number | null | undefined) =>
	n == null || !Number.isFinite(n) ? '—' : Math.abs(n) >= 1000 ? EUR0.format(n) : EUR.format(n)
export const usd = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? '—' : USD.format(n))

/** "+12,3%" / "−4%" (true minus sign). */
export function pct(x: number | null | undefined, digits = 1): string {
	if (x == null || !Number.isFinite(x)) return '—'
	const v = Math.abs(x).toLocaleString('it-IT', { maximumFractionDigits: digits })
	return `${x >= 0 ? '+' : '−'}${v}%`
}

export function signedEur(n: number | null | undefined): string {
	if (n == null || !Number.isFinite(n)) return '—'
	return `${n >= 0 ? '+' : '−'}${EUR.format(Math.abs(n))}`
}

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/**
 * Reads a price typed the Italian way ("12,50", "1.250,00", "12.5", "€ 3").
 * Returns null for an empty field and NaN for something that is not a price.
 */
export function parseNum(input: string | number | null | undefined): number | null {
	if (input == null) return null
	if (typeof input === 'number') return Number.isFinite(input) && input >= 0 ? input : NaN
	let s = input.trim().replace(/[\s€]/g, '')
	if (!s) return null
	if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
	// "1.250" with no comma is one thousand two hundred fifty, the way it is written in Italy.
	else if (/^[1-9]\d{0,2}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '')
	if (!/^\d*\.?\d+$|^\d+\.$/.test(s)) return NaN
	const n = Number(s)
	return Number.isFinite(n) && n >= 0 ? n : NaN
}

/** Number → text for an input field, Italian decimal comma. */
export const numToInput = (n: number | null | undefined) => (typeof n === 'number' ? String(n).replace('.', ',') : '')

/** Local calendar day as YYYY-MM-DD. */
export function dayStr(d: Date = new Date()): string {
	const m = String(d.getMonth() + 1).padStart(2, '0')
	const day = String(d.getDate()).padStart(2, '0')
	return `${d.getFullYear()}-${m}-${day}`
}

export function fmtDay(day: string, withYear = false): string {
	const d = new Date(day + 'T12:00:00')
	if (Number.isNaN(d.getTime())) return day
	return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) })
}

/** "oggi alle 23:40", "ieri alle 08:10", "3 ott alle 12:00". */
export function fmtWhen(ts: number | string | null | undefined): string {
	if (ts == null) return '—'
	const d = new Date(ts)
	if (Number.isNaN(d.getTime())) return '—'
	const time = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
	const today = dayStr()
	const that = dayStr(d)
	if (that === today) return `oggi alle ${time}`
	const y = new Date()
	y.setDate(y.getDate() - 1)
	if (that === dayStr(y)) return `ieri alle ${time}`
	return `${d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })} alle ${time}`
}

export function uid(): string {
	if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
	return Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
}

/** Lower-case, accents removed: for forgiving text matching. */
export function fold(s: string): string {
	return s
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.trim()
}
