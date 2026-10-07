import { useMemo, useState } from 'react'
import { eur, numToInput, parseNum } from '../lib/format'
import { DotText, dotNumber } from './Dots'
import { ASIAN_CATALOG, CATALOGS, CONDS, GRADERS, LANGS, basisName, catalogName, condName, isAsian, langName, variantLabel } from '../lib/labels'
import { cardmarketUrl } from '../lib/links'
import { unitValue } from '../lib/pricing'
import { href, navAfterSheet } from '../lib/router'
import { presetSearch } from '../lib/searchMemo'
import { addHolding, putCard, setSettings, updateHolding, useStore, type HoldingInput } from '../lib/store'
import { defaultVariant, loadSpecies } from '../lib/tcgdex'
import type { CardInfo, Cond, Holding, LangCode } from '../lib/types'
import { IconArrowOut } from './Icons'
import { MultInput } from './MultInput'
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
	// A card or a product of an Asian release is in that language.
	const asian = isAsian(card.catalog) ? card.catalog : card.sealed?.setCatalog && isAsian(card.sealed.setCatalog) ? card.sealed.setCatalog : null
	if (asian) return CATALOGS.find((c) => c.code === asian)?.lang ?? 'JA'
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
	const sealed = card.catalog === 'sealed'
	const firstVariant = useMemo(() => {
		if (from) return card.variants.find((v) => v.key === from.variantKey) ?? defaultVariant(card)
		return defaultVariant(card)
	}, [card, from])

	const [lang, setLang] = useState<LangCode>(from?.lang ?? startLang(card))
	const [cond, setCond] = useState<Cond>(from?.cond ?? 'NM')
	const [variantKey, setVariantKey] = useState(firstVariant.key)
	const [graded, setGraded] = useState(!!from?.grade && !sealed)
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
		...(card.sealed ? { sealed: card.sealed } : {}),
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
		cond: sealed ? 'NM' : cond,
		variantKey: variant.key,
		variantType: variant.type,
		variantLabel: variantLabel(variant),
		stamps: variant.stamps,
		grade: graded && !sealed ? { company, value: grade.trim() } : null,
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
	const one = sealed ? 'pezzo' : 'copia'
	const many = sealed ? 'pezzi' : 'copie'

	let how: string
	if (badPrice) how = 'Controlla i prezzi: solo numeri, ad esempio 12,50.'
	else if (unit.kind === 'manual') how = 'Prezzo inserito da te.'
	else if (unit.kind === 'none') {
		how = `Cardmarket non ha un prezzo per ${sealed ? 'questo prodotto' : 'questa versione'}: inserisci tu il prezzo qui sotto.`
	} else {
		const base = `${eur(unit.base.value)} (${unit.base.basis ? basisName(unit.base.basis) : ''})`
		how = sealed ? `${base} × ${n(unit.langM)} (${lang})` : `${base} × ${n(unit.condM)} (${graded ? 'gradata' : cond}) × ${n(unit.langM)} (${lang})`
		if (unit.gradedGuess) how += '. È il prezzo della carta non gradata: inserisci quello reale qui sotto.'
		else if (unit.base.approx) how += '. Manca il prezzo della Reverse: uso quello della normale.'
	}

	// A Japanese, Korean or Chinese print of an international card is a different card, sold as a
	// different product: its real price is in that catalogue, not in a correction of this one.
	const asianTarget = card.catalog === 'int' ? ASIAN_CATALOG[lang] : undefined
	const goAsian = async () => {
		if (!asianTarget) return
		let q = card.nameAlt ?? card.name
		if (card.dexId?.length) {
			try {
				q = (await loadSpecies()).find((s) => s[0] === card.dexId![0])?.[1] ?? q
			} catch {
				/* the card's own name is used */
			}
		}
		presetSearch(asianTarget, q)
		navAfterSheet(href('cerca'), onClose)
	}

	const submit = () => {
		if (badPrice) {
			setError('Un prezzo non è valido: usa solo numeri, ad esempio 12,50.')
			return
		}
		if (graded && !sealed && !grade.trim()) {
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
			if (!isAsian(card.catalog) && !['JA', 'KO', 'ZH'].includes(lang)) localStorage.setItem(LAST_LANG, lang)
		} catch {
			/* storage blocked */
		}
		if (initial) {
			updateHolding(initial.id, input)
			putCard(card)
			toast(sealed ? 'Prodotto aggiornato' : 'Copia aggiornata')
		} else {
			addHolding(input, card)
			toast(qtyN > 1 ? `${qtyN} ${many} nel portfolio` : sealed ? 'Aggiunto al portfolio' : 'Aggiunta al portfolio')
		}
		onClose()
	}

	return (
		<Sheet
			title={initial ? (sealed ? 'Modifica prodotto' : 'Modifica copia') : 'Aggiungi al portfolio'}
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
				<span id="f-lang-l">{sealed ? 'Lingua del prodotto' : 'Lingua della carta'}</span>
				<div className="choice" role="group" aria-labelledby="f-lang-l">
					{LANGS.map((l) => (
						<button key={l.code} type="button" aria-pressed={lang === l.code} onClick={() => setLang(l.code)} title={l.name}>
							{l.code}
						</button>
					))}
				</div>
			</div>

			{asianTarget ? (
				<div className="notice" data-testid="asian-note">
					<span>
						Una carta in {langName(lang).toLowerCase()} è un’altra stampa, con un suo listino su Cardmarket. Per il prezzo giusto
						prendila dal catalogo {catalogName(asianTarget).toLowerCase()}.
					</span>
					<button className="btn small" type="button" onClick={() => void goAsian()}>
						Cerca nel catalogo {catalogName(asianTarget).toLowerCase()}
					</button>
				</div>
			) : (
				<div className="langmult">
					<MultInput
						id="f-langmult"
						label={`Correzione di prezzo per ${langName(lang).toLowerCase()}`}
						value={settings.langMult[lang] ?? 1}
						onSave={(v) => setSettings({ langMult: { ...settings.langMult, [lang]: v } })}
					/>
					<p className="hint small muted">
						Cardmarket pubblica un solo prezzo per tutte le lingue: quanto vale in più o in meno questa lingua lo dici tu. 1 =
						uguale, 1,3 = +30%, 0,8 = −20%. Vale per tutto quello che hai in {langName(lang).toLowerCase()}.
					</p>
				</div>
			)}

			{!sealed && card.variants.length > 1 ? (
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

			{sealed ? null : (
				<label className="switch">
					<span>
						Carta gradata
						<br />
						<span className="small muted">In una custodia sigillata con un voto (PSA, BGS…)</span>
					</span>
					<input id="f-graded" type="checkbox" checked={graded} onChange={(e) => setGraded(e.target.checked)} />
				</label>
			)}

			{sealed ? null : graded ? (
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
				<span className="label">Valore per {one}</span>
				<DotText text={badPrice ? '—' : dotNumber(unit.value)} pitch={4.6} label={badPrice ? 'non calcolabile' : eur(unit.value)} />
				<span className="unit">Euro</span>
				<span className="small muted num">{how}</span>
				{!badPrice && unit.value != null && qtyN > 1 ? (
					<span className="small num">
						{qtyN} {many}: <b>{eur(unit.value * qtyN)}</b>
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
					<label htmlFor="f-buy">{sealed ? 'Pagato, per pezzo (€)' : 'Pagata, per copia (€)'}</label>
					<input id="f-buy" inputMode="decimal" placeholder="0,00" value={buy} onChange={(e) => setBuy(e.target.value)} />
				</div>
				<div className="field">
					<label htmlFor="f-date">Data di acquisto</label>
					<input id="f-date" type="date" value={buyDate} onChange={(e) => setBuyDate(e.target.value)} />
				</div>
				<div className="field">
					<label htmlFor="f-manual">Prezzo tuo, per {one} (€)</label>
					<input
						id="f-manual"
						inputMode="decimal"
						placeholder="facoltativo"
						value={manual}
						onChange={(e) => setManual(e.target.value)}
					/>
				</div>
				<p className="hint small muted full">
					«Prezzo tuo» sostituisce il calcolo: usalo quando hai visto il prezzo reale, per esempio tra le offerte Cardmarket
					{sealed ? ' nella tua lingua' : ' nella tua lingua e condizione'} o tra i venduti eBay.
				</p>
				<a className="btn small full" href={cardmarketUrl(card, draft)} target="_blank" rel="noopener noreferrer" data-testid="offers">
					Offerte Cardmarket in {langName(lang).toLowerCase()}
					{sealed || graded ? '' : `, ${condName(cond)} o meglio`} <IconArrowOut />
				</a>
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
