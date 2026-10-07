import { eur, eurTight, fmtWhen, ofWhen, usd } from '../lib/format'
import { BASIS, basisName, condName, variantLabel } from '../lib/labels'
import { figure, priceSource, type UnitResult } from '../lib/pricing'
import type { CardInfo, Holding, PriceBasis, VariantOpt } from '../lib/types'

/** The small tags that say what a copy is: language, condition or grade, version, quantity. */
export function HoldingChips({ h, unit, compact }: { h: Holding; unit?: UnitResult; compact?: boolean }) {
	return (
		<span className="chips">
			<span className="chip">{h.lang}</span>
			{h.grade ? (
				<span className="chip accent">
					{h.grade.company} {h.grade.value}
				</span>
			) : (
				<span className={`chip cond c-${h.cond}`} title={condName(h.cond)}>
					{h.cond}
				</span>
			)}
			{!compact && h.variantLabel && h.variantLabel !== 'Normale' ? <span className="chip">{h.variantLabel}</span> : null}
			{h.qty > 1 ? <span className="chip">×{h.qty}</span> : null}
			{unit?.kind === 'manual' ? <span className="chip">Prezzo tuo</span> : null}
			{unit?.kind === 'none' ? <span className="chip warn">Da prezzare</span> : null}
			{unit?.gradedGuess ? <span className="chip warn">Stima da non gradata</span> : null}
		</span>
	)
}

const COLS: PriceBasis[] = ['trend', 'avg1', 'avg7', 'avg30', 'low']
const COL_NAME: Record<string, string> = { trend: 'Tend.', avg1: 'Ieri', avg7: '7 gg', avg30: '30 gg', low: 'Min.' }

/** Cardmarket's price guide for every version of a card. */
export function PricePanel({ card, activeKey, basis }: { card: CardInfo; activeKey?: string; basis: PriceBasis }) {
	const rows = card.variants.map((v) => ({ v, src: priceSource(card, v) }))
	const any = rows.some((r) => COLS.some((b) => figure(r.src, b) != null))
	const updated = rows.find((r) => r.src.cm?.updated)?.src.cm?.updated ?? card.cm?.updated
	const tcg = tcgLines(card)
	return (
		<section className="glass t-graphite quiet panel">
			<div className="hstack" style={{ justifyContent: 'space-between' }}>
				<h3>Prezzi Cardmarket</h3>
				{updated ? <span className="small muted">listino {ofWhen(updated)}</span> : null}
			</div>
			{any ? (
				<div>
					{rows.map(({ v, src }) => (
						<div key={v.key} className={'pv' + (v.key === activeKey ? ' on' : '')} data-testid="price-version">
							<span className="pv-name">
								{variantLabel(v)}
								{v.key === activeKey ? ' · la tua' : ''}
								{src.approx ? <span className="muted"> (prezzo della normale)</span> : null}
							</span>
							<div className="cells num">
								{COLS.map((b) => (
									<div key={b} className={b === basis ? 'main' : undefined} title={BASIS.find((x) => x.code === b)?.name}>
										<span>{COL_NAME[b]}</span>
										<b>{eurTight(figure(src, b))}</b>
									</div>
								))}
							</div>
						</div>
					))}
				</div>
			) : (
				<p className="muted small">
					Cardmarket non pubblica un prezzo per questa carta. Puoi inserire tu il prezzo della tua copia.
				</p>
			)}
			<p className="small muted">
				Cardmarket pubblica un solo listino per carta, senza distinguere lingua e condizione. Nel tuo portfolio il valore
				parte da «{basisName(basis)}» e viene corretto con i tuoi moltiplicatori.
			</p>
			{tcg.length ? (
				<p className="small muted num">
					Negli USA (TCGplayer, prezzo di mercato): {tcg.join(' · ')}
				</p>
			) : null}
		</section>
	)
}

const FINISH: Record<string, string> = {
	normal: 'normale',
	holo: 'holo',
	reverse: 'reverse',
	holofoil: 'holo',
	'reverse-holofoil': 'reverse',
	'1st-edition-holofoil': '1ª ed. holo',
	'1st-edition-normal': '1ª ed.',
	'1st-edition': '1ª ed.',
	'unlimited-holofoil': 'unlimited holo',
	unlimited: 'unlimited',
}

function tcgLines(card: CardInfo): string[] {
	const out: string[] = []
	for (const [k, v] of Object.entries(card.tcg ?? {})) {
		if (!v || typeof v !== 'object') continue
		const p = (v as Record<string, unknown>).marketPrice ?? (v as Record<string, unknown>).midPrice
		if (typeof p === 'number' && p > 0) out.push(`${FINISH[k] ?? k.replace(/-/g, ' ')} ${usd(p)}`)
	}
	return out
}

/** One sentence that says where the value of a copy comes from. */
export function ValueFormula({ h, unit, variant }: { h: Holding; unit: UnitResult; variant?: VariantOpt }) {
	if (unit.kind === 'manual') {
		return (
			<p className="small muted">
				Prezzo inserito da te{h.manualAt ? ` (${fmtWhen(h.manualAt)})` : ''}. Sostituisce il calcolo automatico.
			</p>
		)
	}
	if (unit.kind === 'none') {
		return (
			<p className="small warn">
				Cardmarket non ha un prezzo per {variant ? `la versione «${variantLabel(variant)}»` : 'questa carta'}: apri «Modifica» e
				inserisci il prezzo della tua copia.
			</p>
		)
	}
	const b = unit.base
	const n = (x: number) => x.toLocaleString('it-IT', { maximumFractionDigits: 2 })
	return (
		<div className="stack" style={{ gap: 6 }}>
			<p className="formula num">
				<span>
					<b>{eur(b.value)}</b> <span className="muted">{b.basis ? basisName(b.basis) : ''}</span>
				</span>
				<span className="muted">×</span>
				<span>
					<b>{n(unit.condM)}</b> <span className="muted">{h.grade ? 'gradata' : h.cond}</span>
				</span>
				<span className="muted">×</span>
				<span>
					<b>{n(unit.langM)}</b> <span className="muted">{h.lang}</span>
				</span>
				<span className="muted">=</span>
				<b>{eur(unit.value)}</b>
			</p>
			{b.substituted ? (
				<p className="small muted">Il dato scelto nelle impostazioni manca per questa carta: uso «{b.basis ? basisName(b.basis) : ''}».</p>
			) : null}
			{b.approx ? (
				<p className="small warn">Cardmarket non ha un prezzo per la Reverse Holo: sto usando quello della carta normale.</p>
			) : null}
			{unit.gradedGuess ? (
				<p className="small warn">
					Per le carte gradate non esiste un listino: questo è il prezzo della carta non gradata. Inserisci il prezzo reale in
					«Modifica».
				</p>
			) : null}
		</div>
	)
}
