import { useMemo, useRef, useState } from 'react'
import { eur, fmtDay } from '../lib/format'

export interface Point {
	/** Calendar day, YYYY-MM-DD. */
	day: string
	v: number
}

interface Props {
	points: Point[]
	height?: number
	label?: string
}

/**
 * Value over time, drawn as a dotted line with bright points at the start, the low, the high
 * and today. Drag a finger (or the mouse) across it to read the value of a single day.
 */
export function LineChart({ points, height = 112, label = 'Andamento del valore' }: Props) {
	const box = useRef<HTMLDivElement>(null)
	const [picked, setHover] = useState<number | null>(null)
	// The period can change while a day is selected: a selection past the new end is dropped.
	const hover = picked != null && picked < points.length ? picked : null

	const geo = useMemo(() => {
		const ts = points.map((p) => new Date(p.day + 'T12:00:00').getTime())
		const vs = points.map((p) => p.v)
		const t0 = ts[0]
		const t1 = ts[ts.length - 1]
		const lo = Math.min(...vs)
		const hi = Math.max(...vs)
		const span = hi - lo || Math.max(1, hi * 0.02)
		const x = (t: number) => (t1 === t0 ? 50 : 2 + ((t - t0) / (t1 - t0)) * 96)
		const y = (v: number) => 10 + (1 - (v - lo) / span) * 74
		const xy = points.map((p, i) => ({ x: x(ts[i]), y: hi === lo ? 50 : y(p.v) }))
		const iLo = vs.indexOf(lo)
		const iHi = vs.indexOf(hi)
		return { xy, marks: [...new Set([0, iLo, iHi, points.length - 1])] }
	}, [points])

	if (points.length < 2) return null
	const { xy, marks } = geo
	const first = points[0]
	const last = points[points.length - 1]
	const line = xy.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')

	const pick = (clientX: number) => {
		const r = box.current?.getBoundingClientRect()
		if (!r || r.width === 0) return
		const px = ((clientX - r.left) / r.width) * 100
		let best = 0
		for (let i = 1; i < xy.length; i++) if (Math.abs(xy[i].x - px) < Math.abs(xy[best].x - px)) best = i
		setHover(best)
	}

	return (
		<div className="chartbox">
			<div
				className="chart"
				ref={box}
				style={{ height }}
				role="img"
				aria-label={`${label}: da ${eur(first.v)} il ${fmtDay(first.day)} a ${eur(last.v)} il ${fmtDay(last.day)}`}
				onPointerDown={(e) => pick(e.clientX)}
				onPointerMove={(e) => pick(e.clientX)}
				onPointerLeave={() => setHover(null)}
				onPointerCancel={() => setHover(null)}
			>
				<svg viewBox="0 0 100 100" preserveAspectRatio="none">
					<line x1="0" y1="96" x2="100" y2="96" className="base" vectorEffect="non-scaling-stroke" />
					<polyline points={line} className="trace" vectorEffect="non-scaling-stroke" />
				</svg>
				{hover != null ? <span className="cursor" style={{ left: `${xy[hover].x}%` }} /> : null}
				{marks.map((i) => (
					<span
						key={i}
						className={'dot' + (i === points.length - 1 ? ' last' : '')}
						style={{ left: `${xy[i].x}%`, top: `${xy[i].y}%` }}
					/>
				))}
				{hover != null ? <span className="dot pick" style={{ left: `${xy[hover].x}%`, top: `${xy[hover].y}%` }} /> : null}
			</div>
			<div className="chartcap num">
				{hover != null ? (
					<>
						<span>{fmtDay(points[hover].day, true)}</span>
						<b>{eur(points[hover].v)}</b>
					</>
				) : (
					<>
						<span>{fmtDay(first.day)}</span>
						<span>{fmtDay(last.day)}</span>
					</>
				)}
			</div>
		</div>
	)
}
