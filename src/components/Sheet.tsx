import { useEffect, useRef, type ReactNode } from 'react'
import { IconClose } from './Icons'

interface Props {
	title: string
	onClose: () => void
	children: ReactNode
	footer?: ReactNode
}

let openSheets = 0

/**
 * Bottom sheet. It adds a step to the browser history while open, so the phone's back
 * button closes the sheet instead of leaving the page.
 */
export function Sheet({ title, onClose, children, footer }: Props) {
	const closeRef = useRef(onClose)
	closeRef.current = onClose
	const boxRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		const marker = `sheet-${Date.now()}-${Math.random()}`
		let closedByBack = false
		openSheets++
		document.body.classList.add('locked')
		window.history.pushState({ sheet: marker }, '')
		const onPop = () => {
			closedByBack = true
			closeRef.current()
		}
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') closeRef.current()
		}
		window.addEventListener('popstate', onPop)
		window.addEventListener('keydown', onKey)
		boxRef.current?.focus()
		return () => {
			window.removeEventListener('popstate', onPop)
			window.removeEventListener('keydown', onKey)
			openSheets--
			if (openSheets <= 0) {
				openSheets = 0
				document.body.classList.remove('locked')
			}
			if (!closedByBack && (window.history.state as { sheet?: string } | null)?.sheet === marker) {
				window.history.back()
			}
		}
	}, [])

	return (
		<div
			className="scrim"
			onMouseDown={(e) => {
				if (e.target === e.currentTarget) onClose()
			}}
		>
			<div className="sheet" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={boxRef}>
				<header>
					<h2 className="grow">{title}</h2>
					<button className="iconbtn" type="button" onClick={onClose} aria-label="Chiudi">
						<IconClose />
					</button>
				</header>
				<div className="body">{children}</div>
				{footer ? <footer>{footer}</footer> : null}
			</div>
		</div>
	)
}
