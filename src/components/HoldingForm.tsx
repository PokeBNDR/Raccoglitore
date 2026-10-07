import { useMemo, useState } from 'react'
import { eur, numToInput, parseNum } from '../lib/format'
import { DotText, dotNumber } from './Dots'
import { CATALOGS, CONDS, GRADERS, LANGS, basisName, variantLabel } from '../lib/labels'
import { unitValue } from '../lib/pricing'
import { addHolding, putCard, updateHolding, useStore, type HoldingInput } from '../lib/store'
import { defaultVariant } from '../lib/tcgdex'
import type { CardInfo, Cond, Holding, LangCode } from '../lib/types'
import { Sheet } from './Sheet'
import { toast } from './Toast'

interface Props {
	card: CardInfo
	/** Present when editing an existing entry. */
	initial?: Holding
	/** Start from this entry's values but save as a new one. */
	copyFrom?: Holding
	onClose: () => void
}

const LAST_LANG = 'raccoglitore:lastLang'

function startLang(card: CardInfo): LangCode {
	if (card.catalog !== 'int') return CATALOGS.find((c) => c.code === card.catalog)?.lang ?? 'JA'
	try {
		const v = localStorage.getItem(LAST_LANG)
		if (v && LANGS.some((l) => l.code === v) && !['JA', 'KO', 'ZH'].includes(v)) return v as LangCode
	} catch {
		/* storage blocked */
	}
	return 'IT'
}

/** Add or edit one entry of the collection: which copy it is, how many, what was paid. */
export function HoldingForm({ card, initial, copyFrom, onClose }: Props) {
	const settings = useStore((s) => s.settings)
	const from = initial ?? copyFrom
	const firstVariant = useMemo(() => {
		if (from) return card.variants.find((v) => v.key === from.variantKey) ?? defaultVariant(card)
		return defaultVariant(card)
	}, [card, from])

	const [lang, setLang] = useState<LangCode>(from?.lang ?? startLang(card))
	const [cond, setCond] = useState<Cond>(from?.cond ?? 'NM')
	const [variantKey, setVariantKey] = useState(firstVariant.key)
	const [graded, setGraded] = useState(!!from?.grade)
	const [company, setCompany] = useState(from?.grade?.company ?? 'PSA')
	const [grade, setGrade] = useState(from?.grade?.value ?? '')
	const [qty, setQty] = useState(String(initial?.qty ?? 1))
	const [buy, setBuy] = useState(numToInput(from?.buyPrice))
	const [buyDate, setBuyDate] = useState(from?.buyDate ?? '')
	const [manual, setManual] = useState(numToInput(from?.manualPrice))
	const [note, setNote] = useState(initial?.note ?? '')
	const [error, setError] = useState('')

	const variant = card.variants.find((v) => v.key === variantKey) ?? firstVariant
	const buyN = parseNum(buy)
	const manualN = parseNum(manual)
	const qtyN = Math.max(1, Math.min(9999, parseInt(qty, 10) || 1))
	const badPrice = Number.isNaN(buyN) || Number.isNaN(manualN)

	const draft: Holding = {
		id: initial?.id ?? 'draft',
		catalog: card.catalog,
		cardId: card.id,
		name: card.name,
		nameAlt: card.nameAlt,
		setId: card.set.id,
		setName: card.set.name,
		localId: card.localId,
		setOfficial: card.set.official,
		images: card.images,
		rarity: card.rarity,
		lang,
		cond,
		variantKey: variant.key,
		variantType: variant.type,
		variantLabel: variantLabel(variant),
		stamps: variant.stamps,
		grade: graded ? { company, value: grade.trim() } : null,
		qty: qtyN,
		buyPrice: Number.isNaN(buyN) ? null : buyN,
		buyDate: buyDate || null,
		manualPrice: Number.isNaN(manualN) ? null : manualN,
		manualAt: null,
		note: note.trim(),
		createdAt: initial?.createdAt ?? 0,
		updatedAt: 0,
	}
	const unit = unitValue(draft, card, settings)
	const n = (x: number) => x.toLocaleString('it-IT', { maximumFractionDigits: 2 })

	let how: string
	if (badPrice) how = 'Controlla i prezzi: solo numeri, ad esempio 12,50.'
	else if (unit.kind === 'manual') how = 'Prezzo inserito da te.'
	else if (unit.kind === 'none') how = 'Cardmarket non ha un prezzo per questa versione: inserisci tu il prezzo qui sotto.'
	else {
		how = `${eur(unit.base.value)} (${unit.base.basis ? basisName(unit.base.basis) : ''}) × ${n(unit.condM)} (${graded ? 'gradata' : cond}) × ${n(unit.langM)} (${lang})`
		if (unit.gradedGuess) how += '. È il prezzo della carta non gradata: inserisci quello reale qui sotto.'
		else if (unit.base.approx) how += '. Manca il prezzo della Reverse: uso quello della normale.'
	}

	const submit = () => {
		if (badPrice) {
			setError('Un prezzo non è valido: usa solo numeri, ad esempio 12,50.')
			return
		}
		if (graded && !grade.trim()) {
			setError('Scrivi il voto della gradazione, ad esempio 9.')
			return
		}
		// The draft carries an id and timestamps only so its value can be previewed: they are dropped here.
		const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, manualAt: _manualAt, ...fields } = draft
		const keepDate = initial && initial.manualPrice === fields.manualPrice
		const input: HoldingInput = {
			...fields,
			manualAt: fields.manualPrice == null ? null : keepDate ? (initial.manualAt ?? Date.now()) : Date.now(),
		}
		try {
			if (card.catalog === 'int') localStorage.setItem(LAST_LANG, lang)
		} catch {
			/* storage blocked */
		}
		if (initial) {
			updateHolding(initial.id, input)
			putCard(card)
			toast('Copia aggiornata')
		} else {
			addHolding(input, card)
			toast(qtyN > 1 ? `${qtyN} copie aggiunte al portfolio` : 'Aggiunta al portfolio')
		}
		onClose()
	}

	return (
		<Sheet
			title={initial ? 'Modifica copia' : 'Aggiungi al portfolio'}
			onClose={onClose}
			footer={
				<>
					<button className="btn" type="button" onClick={onClose}>
						Annulla
					</button>
					<button className="btn primary" type="button" onClick={submit}>
						{initial ? 'Salva' : 'Aggiungi'}
					</button>
				</>
			}
		>
			<div className="field">
				<span id="f-lang-l">Lingua della carta</span>
				<div className="choice" role="group" aria-labelledby="f-lang-l">
					{LANGS.map((l) => (
						<button key={l.code} type="button" aria-pressed={lang === l.code} onClick={() => setLang(l.code)} title={l.name}>
							{l.code}
						</button>
					))}
				</div>
			</div>

			{card.variants.length > 1 ? (
				<div className="field">
					<label htmlFor="f-variant">Versione</label>
					{card.variants.length <= 5 ? (
						<div className="choice" role="group" aria-label="Versione">
							{card.variants.map((v) => (
								<button key={v.key} type="button" aria-pressed={variant.key === v.key} onClick={() => setVariantKey(v.key)}>
									{variantLabel(v)}
								</button>
							))}
						</div>
					) : (
						<select id="f-variant" value={variant.key} onChange={(e) => setVariantKey(e.target.value)}>
							{card.variants.map((v) => (
								<option key={v.key} value={v.key}>
									{variantLabel(v)}
								</option>
							))}
						</select>
					)}
				</div>
			) : null}

			<label className="switch">
				<span>
					Carta gradata
					<br />
					<span className="small muted">In una custodia sigillata con un voto (PSA, BGS…)</span>
				</span>
				<input id="f-graded" type="checkbox" checked={graded} onChange={(e) => setGraded(e.target.checked)} />
			</label>

			{graded ? (
				<div className="grid2">
					<div className="field">
						<label htmlFor="f-company">Gradata da</label>
						<select id="f-company" value={company} onChange={(e) => setCompany(e.target.value)}>
							{GRADERS.map((g) => (
								<option key={g}>{g}</option>
							))}
						</select>
					</div>
					<div className="field">
						<label htmlFor="f-grade">Voto</label>
						<input id="f-grade" inputMode="decimal" placeholder="es. 9" value={grade} onChange={(e) => setGrade(e.target.value)} />
					</div>
				</div>
			) : (
				<div className="field">
					<span id="f-cond-l">Condizione</span>
					<div className="choice cond" role="group" aria-labelledby="f-cond-l">
						{CONDS.map((c) => (
							<button
								key={c.code}
								type="button"
								style={cond === c.code ? { color: `var(--c-${c.code.toLowerCase()})` } : undefined}
								aria-pressed={cond === c.code}
								onClick={() => setCond(c.code)}
							>
								<b>{c.code}</b>
								<small>{c.name}</small>
							</button>
						))}
					</div>
				</div>
			)}

			<div className="calc">
				<span className="label">Valore per copia</span>
				<DotText text={badPrice ? '—' : dotNumber(unit.value)} pitch={4.6} label={badPrice ? 'non calcolabile' : eur(unit.value)} />
				<span className="unit">Euro</span>
				<span className="small muted num">{how}</span>
				{!badPrice && unit.value != null && qtyN > 1 ? (
					<span className="small num">
						{qtyN} copie: <b>{eur(unit.value * qtyN)}</b>
					</span>
				) : null}
			</div>

			<div className="grid2">
				<div className="field">
					<label htmlFor="f-qty">Quantità</label>
					<div className="stepper">
						<button type="button" aria-label="Una in meno" onClick={() => setQty(String(Math.max(1, qtyN - 1)))}>
							−
						</button>
						<input
							id="f-qty"
							type="number"
							inputMode="numeric"
							min={1}
							value={qty}
							onChange={(e) => setQty(e.target.value)}
							onBlur={() => setQty(String(qtyN))}
						/>
						<button type="button" aria-label="Una in più" onClick={() => setQty(String(qtyN + 1))}>
							+
						</button>
					</div>
				</div>
				<div className="field">
					<label htmlFor="f-buy">Pagata, per copia (€)</label>
					<input id="f-buy" inputMode="decimal" placeholder="0,00" value={buy} onChange={(e) => setBuy(e.target.value)} />
				</div>
				<div className="field">
					<label htmlFor="f-date">Data di acquisto</label>
					<input id="f-date" type="date" value={buyDate} onChange={(e) => setBuyDate(e.target.value)} />
				</div>
				<div className="field">
					<label htmlFor="f-manual">Prezzo tuo, per copia (€)</label>
					<input
						id="f-manual"
						inputMode="decimal"
						placeholder="facoltativo"
						value={manual}
						onChange={(e) => setManual(e.target.value)}
					/>
				</div>
				<p className="hint small muted full">
					«Prezzo tuo» sostituisce il calcolo: usalo quando hai visto il prezzo reale della tua copia, per esempio tra le
					offerte Cardmarket nella tua lingua e condizione o tra i venduti eBay.
				</p>
				<div className="field full">
					<label htmlFor="f-note">Nota</label>
					<input id="f-note" placeholder="facoltativa" value={note} onChange={(e) => setNote(e.target.value)} />
				</div>
			</div>

			{error ? (
				<p className="down small" role="alert">
					{error}
				</p>
			) : null}
		</Sheet>
	)
}
