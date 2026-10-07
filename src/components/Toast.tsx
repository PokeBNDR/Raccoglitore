import { useEffect, useState } from 'react'

let current: { id: number; text: string } | null = null
const subs = new Set<() => void>()
let timer: ReturnType<typeof setTimeout> | null = null

/** Shows a short confirmation at the bottom of the screen. */
export function toast(text: string) {
	current = { id: Date.now(), text }
	subs.forEach((s) => s())
	if (timer) clearTimeout(timer)
	timer = setTimeout(() => {
		current = null
		subs.forEach((s) => s())
	}, 2600)
}

export function Toaster() {
	const [, force] = useState(0)
	useEffect(() => {
		const fn = () => force((n) => n + 1)
		subs.add(fn)
		return () => {
			subs.delete(fn)
		}
	}, [])
	if (!current) return null
	return (
		<div className="toast" role="status" key={current.id}>
			{current.text}
		</div>
	)
}
