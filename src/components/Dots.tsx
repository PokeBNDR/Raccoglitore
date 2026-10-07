import { useLayoutEffect, useMemo, useRef, type CSSProperties } from 'react'

/**
 * Dot-matrix lettering: the app's headline numbers are drawn as round dots on a 5×7 grid,
 * the way an LED display shows them. Only the characters a number needs are defined.
 */

type Glyph = { w: number; d: Array<[number, number]> }

/** Builds a glyph from rows of '#' and '.'. */
function g(...rows: string[]): Glyph {
	const d: Array<[number, number]> = []
	rows.forEach((row, y) => {
		for (let x = 0; x < row.length; x++) if (row[x] === '#') d.push([x, y])
	})
	return { w: Math.max(...rows.map((r) => r.length)), d }
}

const GLYPHS: Record<string, Glyph> = {
	// The zero is an oval with its corners set half a step in, so it reads as round rather than boxy.
	'0': {
		w: 5,
		d: [
			[1.5, 0],
			[2.5, 0],
			[0.5, 1],
			[3.5, 1],
			[0, 2],
			[4, 2],
			[0, 3],
			[4, 3],
			[0, 4],
			[4, 4],
			[0.5, 5],
			[3.5, 5],
			[1.5, 6],
			[2.5, 6],
		],
	},
	'1': g('..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'),
	'2': g('.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'),
	'3': g('#####', '...#.', '..#..', '...#.', '....#', '#...#', '.###.'),
	'4': g('...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'),
	'5': g('#####', '#....', '####.', '....#', '....#', '#...#', '.###.'),
	'6': g('..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'),
	'7': g('#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'),
	'8': g('.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'),
	'9': g('.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'),
	'.': g('..', '..', '..', '..', '..', '##', '##'),
	',': g('..', '..', '..', '..', '..', '##', '.#', '#.'),
	':': g('..', '##', '##', '..', '##', '##', '..'),
	'+': g('.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'),
	'-': g('....', '....', '....', '####', '....', '....', '....'),
	'−': g('....', '....', '....', '####', '....', '....', '....'),
	'%': g('##...', '##..#', '...#.', '..#..', '.#...', '#..##', '...##'),
	'/': g('....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'),
	'€': g('..###', '.#...', '####.', '.#...', '####.', '.#...', '..###'),
	'×': g('.....', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '.....'),
	'—': g('.....', '.....', '.....', '#####', '.....', '.....', '.....'),
	' ': { w: 2, d: [] },
}

const ROWS = 7
const GAP = 1

interface Layout {
	cols: number
	dots: Array<[number, number]>
}

function layout(text: string): Layout {
	const dots: Array<[number, number]> = []
	let x = 0
	for (const ch of text) {
		const glyph = GLYPHS[ch] ?? GLYPHS['—']
		if (x > 0) x += GAP
		for (const [dx, dy] of glyph.d) dots.push([x + dx, dy])
		x += glyph.w
	}
	return { cols: Math.max(x, 1), dots }
}

interface DotTextProps {
	text: string
	/** Distance between dot centres, in px. The reference uses about 5.7 for headline numbers. */
	pitch?: number
	/** What a screen reader says; defaults to the text itself. */
	label?: string
	className?: string
	style?: CSSProperties
	testId?: string
}

/**
 * A number drawn in dots. It shrinks to fit its container when the number is long,
 * and keeps the real text in the page for screen readers and copy-paste.
 */
export function DotText({ text, pitch = 5.7, label, className, style, testId }: DotTextProps) {
	const { cols, dots } = useMemo(() => layout(text), [text])
	return (
		<span
			className={'dots' + (className ? ' ' + className : '')}
			style={{ width: cols * pitch, ...style }}
			data-testid={testId}
		>
			<svg viewBox={`0 0 ${cols} ${ROWS}`} aria-hidden="true" focusable="false">
				{dots.map(([x, y], i) => (
					<circle key={i} cx={x + 0.5} cy={y + 0.5} r={0.43} />
				))}
			</svg>
			<span className="sr">{label ?? text}</span>
		</span>
	)
}

/** Whole-number and money formats for dot lettering (Italian separators, always grouped). */
export function dotNumber(n: number | null | undefined, decimals = 2, signed = false): string {
	if (n == null || !Number.isFinite(n)) return '—'
	const abs = Math.abs(n).toFixed(decimals)
	const [int, frac] = abs.split('.')
	const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
	const sign = n < 0 ? '−' : signed ? '+' : ''
	return sign + grouped + (frac ? ',' + frac : '')
}

/**
 * Keeps a dotted decoration on the same grid as the page background, so lit dots sit exactly
 * on top of the dim ones instead of forming a second, shifted pattern.
 */
export function useGridAlign<T extends HTMLElement>(pitch = 12) {
	const ref = useRef<T>(null)
	useLayoutEffect(() => {
		const el = ref.current
		const app = el?.closest('.app')
		if (!el || !app) return
		const place = () => {
			const a = app.getBoundingClientRect()
			const b = el.getBoundingClientRect()
			const mod = (v: number) => ((v % pitch) + pitch) % pitch
			el.style.setProperty('--gx', `${-mod(b.left - a.left)}px`)
			el.style.setProperty('--gy', `${-mod(b.top - a.top)}px`)
		}
		place()
		const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(place) : null
		ro?.observe(app)
		ro?.observe(el)
		window.addEventListener('resize', place)
		return () => {
			ro?.disconnect()
			window.removeEventListener('resize', place)
		}
	}, [pitch])
	return ref
}

/** A patch of lit dots on the page grid: the soft halo behind a card picture or an empty state. */
export function DotHalo({ className }: { className?: string }) {
	const ref = useGridAlign<HTMLSpanElement>()
	return <span ref={ref} className={'halo' + (className ? ' ' + className : '')} aria-hidden="true" />
}

interface DotBarProps {
	/** Shares that add up to 1, each with a colour. */
	parts: Array<{ share: number; color: string }>
	dots?: number
}

/** A row of dots split by colour: how the collection divides between languages. */
export function DotBar({ parts, dots = 22 }: DotBarProps) {
	const colors: string[] = []
	const total = parts.reduce((s, p) => s + p.share, 0) || 1
	let acc = 0
	parts.forEach((p, i) => {
		acc += p.share / total
		const upTo = i === parts.length - 1 ? dots : Math.round(acc * dots)
		while (colors.length < upTo) colors.push(p.color)
	})
	return (
		<span className="dotbar" aria-hidden="true">
			{colors.map((c, i) => (
				<i key={i} style={{ background: c }} />
			))}
		</span>
	)
}

/** Decorative dotted arcs with a few bright points, the motif at the bottom of the large panels. */
export function DottedArcs({ points = [] as Array<[number, number]> }) {
	return (
		<svg className="arcs" viewBox="0 0 300 130" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
			<g fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeDasharray="0.1 5" opacity="0.34">
				<path d="M10 118 A140 104 0 0 1 290 118" />
				<path d="M44 118 A70 86 0 0 1 184 118" />
				<path d="M116 118 A70 86 0 0 1 256 118" />
				<path d="M82 118 A36 78 0 0 1 154 118" />
				<path d="M146 118 A36 78 0 0 1 218 118" />
				<path d="M10 118 H290" />
			</g>
			{points.map(([x, y], i) => (
				<circle key={i} cx={x} cy={y} r="3.6" fill="currentColor" />
			))}
		</svg>
	)
}

interface ScaleProps {
	/** The reference value, drawn as an empty dotted ring. */
	ring: number | null
	/** The value in focus, drawn as the half-lit knob. */
	knob: number | null
	/** The most recent value, drawn as the lime point at the end of the lime run. */
	end: number | null
}

/**
 * Three prices on one dotted line. Only their order and distance matter, so the line is scaled
 * to fit them; the numbers themselves are written next to it by the caller.
 */
export function Scale({ ring, knob, end }: ScaleProps) {
	const vals = [ring, knob, end].filter((v): v is number => v != null)
	if (!vals.length) return <div className="scale" aria-hidden="true" />
	const lo = Math.min(...vals)
	const hi = Math.max(...vals)
	const pos = (v: number) => (hi === lo ? 50 : 14 + ((v - lo) / (hi - lo)) * 72)
	const a = knob != null ? pos(knob) : null
	const b = end != null ? pos(end) : null
	return (
		<div className="scale" aria-hidden="true">
			{ring != null ? <span className="mk ring" style={{ left: `${pos(ring)}%` }} /> : null}
			{a != null && b != null ? (
				<span className="run" style={{ left: `${Math.min(a, b)}%`, width: `${Math.abs(a - b)}%` }} />
			) : null}
			{a != null ? <span className="mk knob" style={{ left: `${a}%` }} /> : null}
			{b != null ? <span className="mk end" style={{ left: `${b}%` }} /> : null}
		</div>
	)
}

/** The small triangle of dots that sits above a panel's middle caption. */
export function TriGlyph() {
	const dots: Array<[number, number]> = []
	for (let row = 0; row < 4; row++) for (let i = 0; i <= row; i++) dots.push([11 - row * 2.6 + i * 5.2, 2 + row * 4.6])
	return (
		<svg className="glyph-tri" viewBox="0 0 22 18" aria-hidden="true">
			{dots.map(([x, y], i) => (
				<circle key={i} cx={x} cy={y} r="1.25" fill="currentColor" />
			))}
		</svg>
	)
}

/** Thin arcs hopping between lime points on a dotted line: decoration for the prices tile. */
export function MiniArcs() {
	return (
		<svg className="miniarcs" viewBox="0 0 160 34" preserveAspectRatio="xMaxYMax meet" aria-hidden="true">
			<path d="M2 30H158" fill="none" stroke="rgb(255 255 255 / .42)" strokeWidth="1.3" strokeLinecap="round" strokeDasharray="0.1 5" />
			<path d="M74 30a11 11 0 0 1 22 0M96 30a29 29 0 0 1 58 0" fill="none" stroke="rgb(255 255 255 / .85)" strokeWidth="1.2" />
			<circle cx="74" cy="30" r="2.6" fill="#dbea6c" />
			<circle cx="96" cy="30" r="2.6" fill="#dbea6c" />
			<circle cx="108" cy="30" r="2.6" fill="#f3b48a" />
			<circle cx="144" cy="30" r="2.6" fill="#f3b48a" />
			<circle cx="154" cy="30" r="2.6" fill="#f6f0d8" />
		</svg>
	)
}
