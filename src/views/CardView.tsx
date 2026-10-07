import { useState } from 'react'
import { DotHalo, DotText, Scale, TriGlyph, dotNumber } from '../components/Dots'
import { HoldingChips, PricePanel } from '../components/HoldingBits'
import { HoldingForm } from '../components/HoldingForm'
import { IconArrowOut, IconBack, IconPlus, IconSwap } from '../components/Icons'
import { ItemImage } from '../components/SealedArt'
import { toast } from '../components/Toast'
import { eur, eurTight, pct } from '../lib/format'
import { loadCard } from '../lib/cards'
import { useCard } from '../lib/hooks'
import { basisName, cardNumber, catalogName, isAsian, shownName, titleSize, variantLabel } from '../lib/labels'
import { cardmarketUrl, ebaySoldUrl, namedOf } from '../lib/links'
import { basePrice, cardKey, figure, priceSource, unitValue } from '../lib/pricing'
import { back, href } from '../lib/router'
import { putCard, useStore } from '../lib/store'
import { defaultVariant } from '../lib/tcgdex'
import type { Source } from '../lib/types'

/**
 * A card of the catalogue, or a sealed product: picture, Cardmarket prices of every version,
 * and the button to add it to the collection.
 */
export function CardView({ catalog, id }: { catalog: Source; id: string }) {
	const res = useCard(catalog, id)
	const settings = useStore((s) => s.settings)
	const holdings = useStore((s) => s.holdings)
	const cards = useStore((s) => s.cards)
	const [adding, setAdding] = useState(false)
	const [busy, setBusy] = useState(false)
	const card = res.data
	const sealed = catalog === 'sealed'
	const mine = holdings.filter((h) => h.catalog === catalog && h.cardId.toLowerCase() === id.toLowerCase())

	const main = card ? defaultVariant(card) : undefined
	const base = card ? basePrice(card, main, settings.basis) : null
	const src = card ? priceSource(card, main) : null
	const a1 = src ? figure(src, 'avg1') : null
	const a7 = src ? figure(src, 'avg7') : null
	const a30 = src ? figure(src, 'avg30') : null
	const move = a7 != null && a30 != null && a30 > 0 ? ((a7 - a30) / a30) * 100 : null

	// Asks the catalogue again instead of using the copy saved a few hours ago.
	const reprice = async () => {
		setBusy(true)
		try {
			const { card: fresh, stale } = await loadCard(catalog, id, { force: true })
			if (fresh && cards[fresh.key]) putCard(fresh)
			res.reload()
			toast(stale || !fresh ? 'Catalogo non raggiungibile: mostro i prezzi salvati' : 'Prezzi ricaricati')
		} catch {
			toast('Catalogo non raggiungibile: riprova tra poco')
		}
		setBusy(false)
	}

	return (
		<>
			<header className="topbar">
				<button className="iconbtn" type="button" aria-label="Indietro" onClick={() => back(href('cerca'))}>
					<IconBack />
				</button>
				<h1 style={{ fontSize: card ? titleSize(shownName(card)) : undefined }}>{card ? shownName(card) : sealed ? 'Prodotto' : 'Carta'}</h1>
				{card ? (
					<a
						className="iconbtn"
						href={cardmarketUrl(card)}
						target="_blank"
						rel="noopener noreferrer"
						aria-label="Apri su Cardmarket"
						title="Apri su Cardmarket"
					>
						<IconArrowOut />
					</a>
				) : (
					<span />
				)}
			</header>
			<main className="page">
				{res.loading && !card ? (
					<div className="stage" aria-busy="true">
						<div className="skel" style={{ height: 18, width: '50%' }} />
						<div className="picture">
							<div className="skel" style={{ aspectRatio: '245 / 337' }} />
						</div>
						<div className="skel" style={{ height: 40, width: '46%' }} />
					</div>
				) : null}
				{res.error && !card ? (
					<div className="empty">
						<p>Non riesco a caricare {sealed ? 'questo prodotto' : 'questa carta'}. Controlla la connessione e riprova.</p>
						<button className="btn" type="button" onClick={res.reload}>
							Riprova
						</button>
					</div>
				) : null}
				{!res.loading && !res.error && card === null ? (
					<div className="empty">
						<p>{sealed ? 'Questo prodotto non è nell’elenco di Cardmarket.' : 'Questa carta non è più nel catalogo.'}</p>
						<a className="btn" href={href('cerca')}>
							{sealed ? 'Cerca un prodotto' : 'Cerca una carta'}
						</a>
					</div>
				) : null}

				{card ? (
					<>
						<section className="stage">
							<div className="meta">
								{card.catalog === 'sealed' ? (
									card.set.id && card.sealed?.setCatalog ? (
										<a href={href('set', card.sealed.setCatalog, card.set.id)}>{card.set.name || card.set.id}</a>
									) : (
										<span>{card.set.name}</span>
									)
								) : (
									<a href={href('set', card.catalog, card.set.id)}>{card.set.name || card.set.id}</a>
								)}
								<span className="small muted num">
									{[
										cardNumber(card.localId, card.set.official),
										card.rarity,
										card.catalog === 'sealed' && card.variants[0]?.type === 'sealed' ? 'prodotto sigillato' : '',
										isAsian(card.catalog) ? `catalogo ${catalogName(card.catalog).toLowerCase()}` : '',
									]
										.filter(Boolean)
										.join(' · ')}
								</span>
							</div>
							<div className="picture">
								<DotHalo />
								<ItemImage
									catalog={card.catalog}
									sealed={card.sealed}
									kind={card.rarity}
									images={card.images}
									quality="high"
									alt={card.name}
									hero
									eager
								/>
							</div>
							<div className="metric">
								<DotText text={dotNumber(base?.value)} testId="card-price" label={eur(base?.value)} />
								<span className="unit">
									{base?.value != null
										? `Euro · ${base.basis ? basisName(base.basis) : ''} Cardmarket`
										: 'Nessun prezzo su Cardmarket'}
								</span>
							</div>
							{move != null && Math.abs(move) >= 0.1 ? (
								<span className={'small num ' + (move >= 0 ? 'up' : 'down')}>
									{move >= 0 ? '▲' : '▼'} {pct(move)} negli ultimi 7 giorni rispetto ai 30
								</span>
							) : null}
						</section>

						<section className="glass t-indigo board">
							<div className="trio num">
								<div>
									<b>{eurTight(a7)}</b>
									<span>7 giorni</span>
								</div>
								<div>
									<TriGlyph />
									<span className="mid-text">
										{sealed ? 'Prezzo di un pezzo' : main && card.variants.length > 1 ? variantLabel(main) : 'Prezzo di una copia'}
									</span>
								</div>
								<div>
									<b>{eurTight(a30)}</b>
									<span>30 giorni</span>
								</div>
							</div>
							{a30 != null || a7 != null || a1 != null ? (
								<>
									<Scale ring={a30} knob={a7} end={a1} />
									<div className="legend num">
										<span>
											<i className="lg k-ring" />
											30 giorni
										</span>
										<span>
											<i className="lg k-knob" />7 giorni
										</span>
										<span>
											<i className="lg k-end" />
											ieri {eurTight(a1)}
										</span>
									</div>
								</>
							) : null}
							<div className="actions">
								<button
									className={'iconbtn' + (busy ? ' spin' : '')}
									type="button"
									aria-label="Ricarica i prezzi"
									title="Ricarica i prezzi"
									disabled={busy}
									onClick={() => void reprice()}
								>
									<IconSwap />
								</button>
								<button className="btn cta" type="button" onClick={() => setAdding(true)} data-testid="add">
									{mine.length ? 'Aggiungi un’altra copia' : 'Aggiungi al portfolio'}
									<span className="knob">
										<IconPlus />
									</span>
								</button>
							</div>
						</section>

						{mine.length ? (
							<section className="glass t-magenta quiet panel">
								<h3>Nel tuo portfolio</h3>
								<ul className="rows">
									{mine.map((h) => {
										const u = unitValue(h, cards[cardKey(h)] ?? card, settings)
										return (
											<li key={h.id}>
												<a
													className="row"
													href={href('copia', h.id)}
													style={{ gridTemplateColumns: 'minmax(0, 1fr) auto', padding: '10px 0' }}
												>
													<HoldingChips h={h} unit={u} />
													<span className="end num">
														<span className="val">{eur(u.value == null ? null : u.value * h.qty)}</span>
													</span>
												</a>
											</li>
										)
									})}
								</ul>
							</section>
						) : null}

						<PricePanel card={card} basis={settings.basis} />

						<section className="stack" style={{ gap: 10 }}>
							<div className="links">
								<a className="btn" href={cardmarketUrl(card)} target="_blank" rel="noopener noreferrer">
									Cardmarket <IconArrowOut />
								</a>
								<a
									className="btn"
									href={ebaySoldUrl(namedOf(card), undefined, settings.ebaySite)}
									target="_blank"
									rel="noopener noreferrer"
								>
									Venduti eBay <IconArrowOut />
								</a>
							</div>
							<p className="small muted center">
								Si aprono in un’altra scheda. Dalla tua copia, gli stessi pulsanti cercano quella esatta: stessa lingua
								{sealed ? '' : ' e condizione'}.
							</p>
						</section>

						{adding ? <HoldingForm card={card} onClose={() => setAdding(false)} /> : null}
					</>
				) : null}
			</main>
		</>
	)
}
