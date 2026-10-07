import { useEffect, useMemo, useState } from 'react'
import { CardImage } from '../components/CardImage'
import { LineChart } from '../components/Chart'
import { DotHalo, DotText, TriGlyph, dotNumber } from '../components/Dots'
import { HoldingChips, PricePanel, ValueFormula } from '../components/HoldingBits'
import { HoldingForm } from '../components/HoldingForm'
import { IconArrowOut, IconBack, IconCopy, IconEdit, IconTrash } from '../components/Icons'
import { toast } from '../components/Toast'
import { eur, eurTight, fmtDay, pct, signedEur } from '../lib/format'
import { basisName, cardNumber, catalogName, condName, langName, shownName, titleSize } from '../lib/labels'
import { cardmarketUrl, ebaySoldUrl, namedOf } from '../lib/links'
import { cardKey, pickVariant, unitValue } from '../lib/pricing'
import { back, href } from '../lib/router'
import { putCard, removeHolding, useStore } from '../lib/store'
import { getCard } from '../lib/tcgdex'

/** One entry of the collection: what the copy is, what it is worth and why. */
export function HoldingView({ id }: { id: string }) {
	const ready = useStore((s) => s.ready)
	const h = useStore((s) => s.holdings.find((x) => x.id === id))
	const cards = useStore((s) => s.cards)
	const settings = useStore((s) => s.settings)
	const hist = useStore((s) => s.hist[id])
	const [sheet, setSheet] = useState<'edit' | 'copy' | null>(null)
	const [armed, setArmed] = useState(false)
	const card = h ? cards[cardKey(h)] : undefined

	// The prices of a card can be missing right after restoring a backup: fetch them.
	const [missing, setMissing] = useState(false)
	useEffect(() => {
		if (!h || card) return
		let alive = true
		getCard(h.catalog, h.cardId).then(
			(c) => {
				if (!alive) return
				if (c) putCard(c)
				else setMissing(true)
			},
			() => alive && setMissing(true),
		)
		return () => {
			alive = false
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [h?.catalog, h?.cardId, !!card])

	const points = useMemo(
		() =>
			Object.entries(hist ?? {})
				.map(([day, v]) => ({ day, v }))
				.sort((a, b) => (a.day < b.day ? -1 : 1)),
		[hist],
	)

	if (!h) {
		return (
			<>
				<header className="topbar">
					<button className="iconbtn" type="button" aria-label="Indietro" onClick={() => back()}>
						<IconBack />
					</button>
					<h1>Copia</h1>
				</header>
				<main className="page">
					{ready ? (
						<div className="empty">
							<p>Questa copia non è più nella collezione.</p>
							<a className="btn" href={href()}>
								Torna al portfolio
							</a>
						</div>
					) : null}
				</main>
			</>
		)
	}

	const unit = unitValue(h, card, settings)
	const variant = pickVariant(card, h)
	const total = unit.value == null ? null : unit.value * h.qty
	const pl = unit.value != null && typeof h.buyPrice === 'number' ? (unit.value - h.buyPrice) * h.qty : null
	const plPct = pl != null && h.buyPrice ? (pl / (h.buyPrice * h.qty)) * 100 : null
	const named = card
		? namedOf(card)
		: { name: h.name, nameAlt: h.nameAlt, catalog: h.catalog, localId: h.localId, official: h.setOfficial }

	return (
		<>
			<header className="topbar">
				<button className="iconbtn" type="button" aria-label="Indietro" onClick={() => back()}>
					<IconBack />
				</button>
				<h1 style={{ fontSize: titleSize(shownName(h)) }}>{shownName(h)}</h1>
				<button className="iconbtn" type="button" aria-label="Modifica" title="Modifica" disabled={!card} onClick={() => setSheet('edit')}>
					<IconEdit />
				</button>
			</header>
			<main className="page">
				<section className="stage">
					<div className="meta">
						<a href={href('set', h.catalog, h.setId)}>{h.setName || h.setId}</a>
						<span className="small muted num">{[cardNumber(h.localId, h.setOfficial), h.rarity].filter(Boolean).join(' · ')}</span>
						<HoldingChips h={h} unit={unit} />
					</div>
					<div className="picture">
						<DotHalo />
						<CardImage images={card?.images ?? h.images} lang={h.lang} catalog={h.catalog} quality="high" alt={h.name} hero eager />
					</div>
					<div className="metric">
						<DotText text={dotNumber(total)} testId="holding-value" label={eur(total)} />
						<span className="unit">
							Euro{h.qty > 1 && unit.value != null ? ` · ${eur(unit.value)} l’una` : ''}
						</span>
					</div>
					{pl != null ? (
						<span className={'small num ' + (pl >= 0 ? 'up' : 'down')}>
							{signedEur(pl)} ({pct(plPct)}) sul pagato
						</span>
					) : null}
				</section>

				<section className="glass t-magenta board">
					<div className="trio num">
						<div>
							<b>{eurTight(h.buyPrice)}</b>
							<span>pagata{h.qty > 1 ? ', l’una' : ''}</span>
						</div>
						<div>
							<TriGlyph />
							<span className="mid-text">Come è calcolato</span>
						</div>
						<div>
							<b>{eurTight(unit.base.value)}</b>
							<span>{unit.base.basis ? basisName(unit.base.basis).toLowerCase() : 'Cardmarket'}</span>
						</div>
					</div>
					{!card && !missing ? <div className="skel" style={{ height: 22 }} /> : <ValueFormula h={h} unit={unit} variant={variant} />}
					<div className="actions">
						<button
							className="iconbtn"
							type="button"
							disabled={!card}
							onClick={() => setSheet('copy')}
							aria-label="Aggiungi un’altra copia"
							title="Aggiungi un’altra copia con lingua o condizione diverse"
						>
							<IconCopy />
						</button>
						<button className="btn cta" type="button" disabled={!card} onClick={() => setSheet('edit')}>
							Modifica la copia
							<span className="knob">
								<IconEdit />
							</span>
						</button>
					</div>
				</section>

				{card ? (
					<section className="stack" style={{ gap: 10 }}>
						<div className="links">
							<a className="btn" href={cardmarketUrl(card, h)} target="_blank" rel="noopener noreferrer">
								Cardmarket <IconArrowOut />
							</a>
							<a className="btn" href={ebaySoldUrl(named, h, settings.ebaySite)} target="_blank" rel="noopener noreferrer">
								Venduti eBay <IconArrowOut />
							</a>
						</div>
						<p className="small muted center">
							Cardmarket si apre sulle offerte in {langName(h.lang).toLowerCase()}
							{h.grade ? '' : `, ${condName(h.cond)} o meglio`}; eBay sulle vendite concluse di questa carta. Se il prezzo
							reale è diverso, scrivilo in «Modifica» come «Prezzo tuo».
						</p>
					</section>
				) : null}

				{points.length >= 2 ? (
					<section className="glass t-graphite quiet panel">
						<h3>Valore di una copia nel tempo</h3>
						<LineChart points={points} height={96} label="Valore di una copia nel tempo" />
					</section>
				) : null}

				<section className="glass t-graphite quiet panel">
					<h3>La tua copia</h3>
					<dl className="kv num">
						<dt>Lingua</dt>
						<dd>{langName(h.lang)}</dd>
						{h.grade ? (
							<>
								<dt>Gradazione</dt>
								<dd>
									{h.grade.company} {h.grade.value}
								</dd>
							</>
						) : (
							<>
								<dt>Condizione</dt>
								<dd>
									{condName(h.cond)} ({h.cond})
								</dd>
							</>
						)}
						<dt>Versione</dt>
						<dd>{h.variantLabel}</dd>
						<dt>Quantità</dt>
						<dd>{h.qty}</dd>
						<dt>Pagata</dt>
						<dd>
							{h.buyPrice != null ? `${eur(h.buyPrice)}${h.qty > 1 ? ' l’una' : ''}` : '—'}
							{h.buyDate ? ` · ${fmtDay(h.buyDate, true)}` : ''}
						</dd>
						{h.catalog !== 'int' ? (
							<>
								<dt>Catalogo</dt>
								<dd>{catalogName(h.catalog)}</dd>
							</>
						) : null}
						{h.note ? (
							<>
								<dt>Nota</dt>
								<dd style={{ fontWeight: 500, overflowWrap: 'anywhere' }}>{h.note}</dd>
							</>
						) : null}
					</dl>
				</section>

				{card ? <PricePanel card={card} activeKey={variant?.key} basis={settings.basis} /> : null}
				{missing && !card ? (
					<div className="notice warn">Non riesco a caricare i prezzi di questa carta. Riprova quando sei online.</div>
				) : null}

				<div className="hstack" style={{ justifyContent: 'space-between' }}>
					<a className="btn ghost small" href={href('carta', h.catalog, h.cardId)}>
						Scheda della carta
					</a>
					<button
						className="btn ghost small danger"
						type="button"
						data-testid="delete"
						onClick={() => {
							if (!armed) {
								setArmed(true)
								window.setTimeout(() => setArmed(false), 4000)
								return
							}
							removeHolding(h.id)
							toast('Copia eliminata')
							back()
						}}
					>
						<IconTrash /> {armed ? 'Tocca di nuovo per eliminare' : 'Elimina'}
					</button>
				</div>

				{sheet && card ? (
					<HoldingForm
						card={card}
						initial={sheet === 'edit' ? h : undefined}
						copyFrom={sheet === 'copy' ? h : undefined}
						onClose={() => setSheet(null)}
					/>
				) : null}
			</main>
		</>
	)
}
