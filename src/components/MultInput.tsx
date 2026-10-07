import { useEffect, useState } from 'react'
import { numToInput, parseNum } from '../lib/format'

interface Props {
	id: string
	label: string
	value: number
	onSave: (n: number) => void
	hint?: string
}

/** A multiplier field that keeps what is being typed and saves only valid numbers. */
export function MultInput({ id, label, value, onSave, hint }: Props) {
	const [text, setText] = useState(numToInput(value))
	const [focus, setFocus] = useState(false)
	useEffect(() => {
		if (!focus) setText(numToInput(value))
	}, [value, focus])
	const n = parseNum(text)
	const bad = n == null || Number.isNaN(n) || n > 100
	return (
		<div className="field">
			<label htmlFor={id}>{label}</label>
			<input
				id={id}
				inputMode="decimal"
				value={text}
				aria-invalid={bad}
				style={bad ? { borderColor: 'var(--down)' } : undefined}
				onFocus={() => setFocus(true)}
				onBlur={() => setFocus(false)}
				onChange={(e) => {
					setText(e.target.value)
					const v = parseNum(e.target.value)
					if (v != null && !Number.isNaN(v) && v <= 100) onSave(v)
				}}
			/>
			{hint ? <span className="hint">{hint}</span> : null}
		</div>
	)
}
