import { Children, useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

interface Props {
	/** One name per slide, shown under the deck. */
	labels: string[]
	/** Slide shown first. */
	start?: number
	children: ReactNode
	/** Remembers the slide between visits to the page. */
	onIndex?: (i: number) => void
}

/**
 * The large panels at the top of the collection: swipe sideways between them.
 * The neighbours peek in from both edges; the dots underneath say which one is in front.
 */
export function Deck({ labels, start = 0, children, onIndex }: Props) {
	const box = useRef<HTMLDivElement>(null)
	const [active, setActive] = useState(start)
	const count = Children.count(children)

	const centre = useCallback((i: number, smooth: boolean) => {
		const el = box.current
		const slide = el?.children[i] as HTMLElement | undefined
		if (!el || !slide) return
		const left = slide.offsetLeft - (el.clientWidth - slide.offsetWidth) / 2
		el.scrollTo({ left, behavior: smooth ? 'smooth' : 'auto' })
	}, [])

	useLayoutEffect(() => {
		centre(start, false)
		// Only on first layout: afterwards the reader decides where the deck is.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	const frame = useRef(0)
	const onScroll = () => {
		cancelAnimationFrame(frame.current)
		frame.current = requestAnimationFrame(() => {
			const el = box.current
			if (!el) return
			const mid = el.scrollLeft + el.clientWidth / 2
			let best = 0
			let dist = Infinity
			Array.from(el.children).forEach((c, i) => {
				const s = c as HTMLElement
				const d = Math.abs(s.offsetLeft + s.offsetWidth / 2 - mid)
				if (d < dist) {
					dist = d
					best = i
				}
			})
			if (best !== active) {
				setActive(best)
				onIndex?.(best)
			}
		})
	}

	return (
		<section className="stack" style={{ gap: 16 }} aria-roledescription="carosello" aria-label="Riepilogo della collezione">
			<div className="deck" ref={box} onScroll={onScroll}>
				{children}
			</div>
			<div className="deckcap">
				<b aria-live="polite">{labels[active]}</b>
				<div className="pager">
					{Array.from({ length: count }, (_, i) => (
						<button
							key={i}
							type="button"
							aria-label={labels[i]}
							aria-current={i === active}
							onClick={() => centre(i, true)}
						/>
					))}
				</div>
			</div>
		</section>
	)
}
