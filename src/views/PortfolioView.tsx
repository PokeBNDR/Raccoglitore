import { useMemo, useRef, useState } from 'react'
import { CardImage } from '../components/CardImage'
import { LineChart, type Point } from '../components/Chart'
import { Deck } from '../components/Deck'
import { DotBar, DotHalo, DotText, DottedArcs, MiniArcs, Scale, dotNumber } from '../components/Dots'
import { HoldingChips } from '../components/HoldingBits'
import { IconClose, IconPlus, IconSearch, IconSwap } from '../components/Icons'
import { dayStr, eur, fmtDay, fold, pct, signedEur } from '../lib/format'
import { CONDS, LANGS, cardNumber, shownName } from '../lib/labels'
import { cardKey, totals, unitValue, type UnitResult } from '../lib/pricing'
import { href } from '../lib/router'
import { latestPriceTime, refreshPrices, setSettings, useStore } from '../lib/store'
import type { Holding } from '../lib/types'

type Sort = 'value' | 'pl' | 'name' | 'recent' | 'set'
type Range = '7G' | '1M' | '3M' | '1A' | 'MAX'
const RANGE_DAYS: Record<Range, number> = { '7G': 7, '1M': 31, '3M': 92, '1A': 366, MAX: 100000 }

// Remembered while the app is open, so coming back from a card keeps the same filters.
const memo = { q: '', lang: '', cond: '', sort: 'value' as Sort, range: '1M' as Range, slide: 1 }
// Long collections are drawn a page at a time to keep scrolling smooth on a phone.
const PAGE = 150
const LANG_COLORS = ['#ffffff', '#d9f25f', '#a3a8ff', '#ff9280', 'rgb(255 255 255 / 0.4)']

interface Row {
	h: Holding
	unit: UnitResult
	total: number | null
	pl: number | null
}

export function PortfolioView() {
	const ready = useStore((s) => s.ready)
	const holdings = useStore((s) => s.holdings)
	const cards = useStore((s) => s.cards)
	const settings = useStore((s) => s.settings)
	const snapshots = useStore((s) => s.snapshots)
	const hist = useStore((s) => s.hist)
	const refresh = useStore((s) => s.refresh)
	const offline = useStore((s) => s.offline)
	const storageOk = useStore((s) => s.storageOk)
	const lastBackup = useStore((s) => s.lastBackup)

	const [q, setQ] = useState(memo.q)
	const [lang, setLang] = useState(memo.lang)
	const [cond, setCond] = useState(memo.cond)
	const [sort, setSort] = useState<Sort>(memo.sort)
	const [range, setRange] = useState<Range>(memo.range)
	const [limit, setLimit] = useState(PAGE)
	Object.assign(memo, { q, lang, cond, sort, range })
	const searchRef = useRef<HTMLInputElement>(null)

	const t = useMemo(() => totals(holdings, cards, settings), [holdings, cards, settings])
	const market = useMemo(
		() => ({
			a30: totals(holdings, cards, settings, 'avg30').value,
			a7: totals(holdings, cards, settings, 'avg7').value,
			a1: totals(holdings, cards, settings, 'avg1').value,
		}),
		[holdings, cards, settings],
	)

	const rows: Row[] = useMemo(
		() =>
			holdings.map((h) => {
				const unit = unitValue(h, cards[cardKey(h)], settings)
				const total = unit.value == null ? null : unit.value * h.qty
				const pl = unit.value != null && typeof h.buyPrice === 'number' ? (unit.value - h.buyPrice) * h.qty : null
				return { h, unit, total, pl }
			}),
		[holdings, cards, settings],
	)

	// Price movement since the last day on record, for the copies held on both days.
	const since = useMemo(() => {
		const today = dayStr()
		let prev = ''
		for (const days of Object.values(hist)) for (const d of Object.keys(days)) if (d < today && d > prev) prev = d
		if (!prev) return null
		let delta = 0
		let basis = 0
		for (const r of rows) {
			const before = hist[r.h.id]?.[prev]
			if (before == null || r.unit.value == null) continue
			delta += (r.unit.value - before) * r.h.qty
			basis += before * r.h.qty
		}
		return basis > 0 ? { day: prev, delta } : null
	}, [hist, rows])

	const points: Point[] = useMemo(() => {
		const all = snapshots.map((s) => ({ day: s.date, v: s.value }))
		const limitDay = new Date()
		limitDay.setDate(limitDay.getDate() - RANGE_DAYS[range])
		const from = dayStr(limitDay)
		const cut = all.filter((p) => p.day >= from)
		return cut.length >= 2 ? cut : all
	}, [snapshots, range])

	// How the copies divide between languages, largest first; the small ones are grouped.
	const langs = useMemo(() => {
		const count = new Map<string, number>()
		for (const h of holdings) count.set(h.lang, (count.get(h.lang) ?? 0) + h.qty)
		const sorted = [...count.entries()].sort((a, b) => b[1] - a[1])
		const top = sorted.slice(0, 4)
		const rest = sorted.slice(4).reduce((s, [, n]) => s + n, 0)
		if (rest > 0) top.push(['altre', rest])
		const all = top.reduce((s, [, n]) => s + n, 0) || 1
		return top.map(([code, n], i) => ({ code, share: n / all, color: LANG_COLORS[Math.min(i, LANG_COLORS.length - 1)] }))
	}, [holdings])

	const shown = useMemo(() => {
		const fq = fold(q)
		const list = rows.filter(
			(r) =>
				(!lang || r.h.lang === lang) &&
				(!cond || (cond === 'GRADED' ? !!r.h.grade : !r.h.grade && r.h.cond === cond)) &&
				(!fq ||
					fold([r.h.name, r.h.nameAlt ?? '', r.h.setName, r.h.localId, r.h.note].join(' ')).includes(fq)),
		)
		const by: Record<Sort, (a: Row, b: Row) => number> = {
			value: (a, b) => (b.total ?? -1) - (a.total ?? -1),
			pl: (a, b) => (b.pl ?? -1e12) - (a.pl ?? -1e12),
			name: (a, b) => shownName(a.h).localeCompare(shownName(b.h), 'it'),
			recent: (a, b) => b.h.createdAt - a.h.createdAt,
			set: (a, b) =>
				a.h.setName.localeCompare(b.h.setName, 'it') ||
				(parseInt(a.h.localId, 10) || 0) - (parseInt(b.h.localId, 10) || 0) ||
				a.h.localId.localeCompare(b.h.localId),
		}
		return list.slice().sort(by[sort])
	}, [rows, q, lang, cond, sort])

	const langsUsed = LANGS.filter((l) => holdings.some((h) => h.lang === l.code))
	const condsUsed = CONDS.filter((c) => holdings.some((h) => !h.grade && h.cond === c.code))
	const anyGraded = holdings.some((h) => h.grade)
	const filtered = !!(q || lang || cond)
	const backupOld = holdings.length >= 5 && (!lastBackup || Date.now() - lastBackup > 21 * 24 * 3_600_000)
	const move = market.a30 > 0 ? ((market.a7 - market.a30) / market.a30) * 100 : null
	const grid = settings.view === 'grid'

	// "23:40" and the day it refers to, for the prices tile: the most recent time a price arrived.
	const stamp = useMemo(() => {
		const latest = latestPriceTime({ holdings, cards, refresh })
		if (!latest) return { time: '—', day: 'mai' }
		const d = new Date(latest)
		const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
		const that = dayStr(d)
		const y = new Date()
		y.setDate(y.getDate() - 1)
		return { time, day: that === dayStr() ? 'oggi' : that === dayStr(y) ? 'ieri' : fmtDay(that) }
	}, [refresh, holdings, cards])

	const focusSearch = () => {
		searchRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
		searchRef.current?.focus({ preventScroll: true })
	}

	return (
		<>
			<header className="topbar">
				{holdings.length ? (
					<button className="iconbtn" type="button" aria-label="Cerca nella collezione" title="Cerca nella collezione" onClick={focusSearch}>
						<IconSearch />
					</button>
				) : (
					<span />
				)}
				<h1>Portfolio</h1>
				<a className="iconbtn" href={href('cerca')} aria-label="Aggiungi una carta" title="Aggiungi una carta">
					<IconPlus />
				</a>
			</header>

			<main className="page">
				{!storageOk ? (
					<div className="notice warn">
						Questo browser non mi lascia salvare i dati (succede in navigazione privata): quello che aggiungi andrà perso
						alla chiusura.
					</div>
				) : null}

				{!holdings.length ? (
					<section className="stage" style={{ paddingTop: 150 }}>
						<DotHalo className="orb" />
						<div className="metric">
							<DotText text={ready ? dotNumber(0) : '—'} testId="total" label={ready ? '0,00' : 'In caricamento'} />
							<span className="unit">Euro</span>
						</div>
						<DotHalo className="stem" />
						{ready ? (
							<div className="empty">
								<h2>La tua collezione parte da qui</h2>
								<p>Cerca una carta, scegli lingua e condizione della tua copia e il valore si calcola da solo.</p>
								<a className="btn primary" href={href('cerca')}>
									<IconSearch /> Cerca una carta
								</a>
								<a className="btn ghost" href={href('set')}>
									Sfoglia i set
								</a>
							</div>
						) : null}
					</section>
				) : null}

				{holdings.length ? (
					<>
						<Deck
							labels={['Guadagno sul pagato', 'Valore della collezione', 'Andamento dei prezzi']}
							start={memo.slide}
							onIndex={(i) => (memo.slide = i)}
						>
							<article className="glass t-gold slide">
								<header>
									<h2>Guadagno</h2>
								</header>
								<div className="body">
									{t.withCost > 0 ? (
										<>
											<div className="metric">
												<DotText text={dotNumber(t.pl, 2, true)} label={signedEur(t.pl)} />
												<span className="unit">Euro{t.plPct != null ? ` · ${pct(t.plPct)}` : ''}</span>
											</div>
											<div className="foot stack">
												<hr className="dotrule" />
												<dl className="statlist num">
													<dt>Pagato</dt>
													<dd>{eur(t.cost)}</dd>
													<dt>Vale oggi</dt>
													<dd>{eur(t.cost + t.pl)}</dd>
													<dt>Con prezzo pagato</dt>
													<dd>
														{t.withCost} di {t.entries}
													</dd>
												</dl>
											</div>
										</>
									) : (
										<>
											<p className="sub">Scrivi quanto hai pagato le tue copie: qui compare il guadagno.</p>
											<div className="foot">
												<DottedArcs points={[[150, 14]]} />
											</div>
										</>
									)}
								</div>
							</article>

							<article className="glass t-magenta slide">
								<header>
									<h2>Valore</h2>
									<button
										className={'iconbtn sm' + (refresh.running ? ' spin' : '')}
										type="button"
										aria-label="Aggiorna i prezzi"
										title="Aggiorna i prezzi"
										disabled={refresh.running}
										onClick={() => void refreshPrices({ force: true })}
									>
										<IconSwap />
									</button>
								</header>
								<div className="body">
									<div className="metric">
										<DotText text={dotNumber(t.value)} testId="total" label={eur(t.value)} />
										<span className="unit">Euro</span>
									</div>
									<p className="sub num">
										{t.withCost > 0 ? (
											<span className={t.pl >= 0 ? 'up' : 'down'}>
												{t.pl >= 0 ? '▲' : '▼'} {eur(Math.abs(t.pl))} ({pct(t.plPct)}) sul pagato
											</span>
										) : null}
										{since ? (
											<span className={since.delta >= 0 ? 'up' : 'down'}>
												{signedEur(since.delta)} dal {fmtDay(since.day)}
											</span>
										) : null}
										{t.unpriced > 0 ? <span className="warn">{t.unpriced} da prezzare</span> : null}
									</p>
									<div className="foot">
										{snapshots.length >= 2 ? (
											<>
												<LineChart points={points} height={104} />
												<div className="seg tiny" role="group" aria-label="Periodo del grafico" style={{ marginTop: 6 }}>
													{(Object.keys(RANGE_DAYS) as Range[]).map((r) => (
														<button key={r} type="button" aria-pressed={range === r} onClick={() => setRange(r)}>
															{r === 'MAX' ? 'Max' : r}
														</button>
													))}
												</div>
											</>
										) : (
											<>
												<DottedArcs
													points={[
														[84, 46],
														[196, 28],
													]}
												/>
												<p className="chartcap" style={{ justifyContent: 'center' }}>
													Il grafico si riempie giorno dopo giorno, da domani.
												</p>
											</>
										)}
									</div>
								</div>
							</article>

							<article className="glass t-indigo slide">
								<header>
									<h2>Mercato</h2>
								</header>
								<div className="body">
									{market.a30 > 0 && move != null ? (
										<>
											<div className="metric">
												<DotText
													text={dotNumber(move, 1, true) + '%'}
													label={`${pct(move)} negli ultimi 7 giorni rispetto ai 30`}
												/>
												<span className="unit">ultimi 7 giorni rispetto ai 30</span>
											</div>
											<div className="foot stack" style={{ gap: 10 }}>
												<Scale ring={market.a30} knob={market.a7} end={market.a1} />
												<dl className="statlist num">
													<dt>
														<i className="lg k-ring" />
														Media 30 giorni
													</dt>
													<dd>{eur(market.a30)}</dd>
													<dt>
														<i className="lg k-knob" />
														Media 7 giorni
													</dt>
													<dd>{eur(market.a7)}</dd>
													<dt>
														<i className="lg k-end" />
														Media di ieri
													</dt>
													<dd>{eur(market.a1)}</dd>
												</dl>
											</div>
										</>
									) : (
										<>
											<p className="sub">Qui compare l’andamento dei prezzi Cardmarket delle tue carte.</p>
											<div className="foot">
												<DottedArcs points={[[150, 14]]} />
											</div>
										</>
									)}
								</div>
							</article>
						</Deck>

						<div className="tiles">
							<article className="glass t-graphite tile-card tall">
								<h3>Carte</h3>
								<div className="push">
									<div className="inline-metric">
										<DotText text={String(t.copies)} pitch={3.1} />
										<span className="unit">{t.copies === 1 ? 'copia' : 'copie'}</span>
									</div>
									<DotBar parts={langs} />
									<span className="minilegend num">
										{langs.map((l) => `${l.code} ${Math.round(l.share * 100)}%`).join(' · ')}
									</span>
								</div>
							</article>

							<label className="glass t-navy tile-card toggle switch">
								<h3>Griglia</h3>
								<input
									id="pf-grid"
									type="checkbox"
									checked={grid}
									onChange={(e) => setSettings({ view: e.target.checked ? 'grid' : 'list' })}
								/>
							</label>

							<button
								className="glass t-orange rise tile-card"
								type="button"
								disabled={refresh.running}
								onClick={() => void refreshPrices({ force: true })}
								aria-label={`Prezzi aggiornati ${stamp.day} alle ${stamp.time}. Tocca per aggiornarli ora.`}
							>
								<h3>Prezzi</h3>
								<div className="push">
									<div className="inline-metric">
										<DotText text={refresh.running ? `${refresh.done}/${refresh.total}` : stamp.time} pitch={3.1} />
										<span className="unit">{refresh.running ? 'aggiorno' : stamp.day}</span>
									</div>
								</div>
								<MiniArcs />
							</button>
						</div>

						{refresh.running ? (
							<div className="loadbar" aria-hidden="true">
								<i style={{ width: `${refresh.total ? (refresh.done / refresh.total) * 100 : 0}%` }} />
							</div>
						) : null}
						{!refresh.running && refresh.failed > 0 ? (
							<div className="notice warn">
								<span>
									{offline ? 'Sei offline: ' : ''}
									{refresh.failed === refresh.total ? 'non sono riuscito ad aggiornare i prezzi' : `${refresh.failed} prezzi non aggiornati`}
									. Mostro gli ultimi salvati.
								</span>
								<button className="btn small" type="button" onClick={() => void refreshPrices({ force: true })}>
									Riprova
								</button>
							</div>
						) : null}

						<div className="sectionhead">
							<h2>Le tue carte</h2>
							<span className="small muted num">
								{filtered
									? `${shown.length} di ${rows.length} · ${eur(shown.reduce((s, r) => s + (r.total ?? 0), 0))}`
									: `${rows.length} ${rows.length === 1 ? 'voce' : 'voci'}`}
							</span>
						</div>

						<div className="toolbar">
							<div className="searchbox">
								<IconSearch />
								<input
									id="pf-search"
									ref={searchRef}
									type="search"
									placeholder="Cerca nella collezione"
									aria-label="Cerca nella collezione"
									value={q}
									onChange={(e) => setQ(e.target.value)}
								/>
								{q ? (
									<button className="iconbtn clear" type="button" aria-label="Cancella" onClick={() => setQ('')}>
										<IconClose />
									</button>
								) : null}
							</div>
							<div className="filters">
								<select id="pf-lang" aria-label="Lingua" value={lang} onChange={(e) => setLang(e.target.value)}>
									<option value="">Lingue</option>
									{langsUsed.map((l) => (
										<option key={l.code} value={l.code}>
											{l.name}
										</option>
									))}
								</select>
								<select id="pf-cond" aria-label="Condizione" value={cond} onChange={(e) => setCond(e.target.value)}>
									<option value="">Condizioni</option>
									{condsUsed.map((c) => (
										<option key={c.code} value={c.code}>
											{c.code} · {c.name}
										</option>
									))}
									{anyGraded ? <option value="GRADED">Gradate</option> : null}
								</select>
								<select id="pf-sort" aria-label="Ordina" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
									<option value="value">Valore</option>
									<option value="pl">Guadagno</option>
									<option value="name">Nome</option>
									<option value="set">Set e numero</option>
									<option value="recent">Ultime aggiunte</option>
								</select>
							</div>
						</div>

						{!shown.length ? (
							<div className="empty">Nessuna carta corrisponde a questi filtri.</div>
						) : grid ? (
							<div className="grid">
								{shown.slice(0, limit).map((r) => (
									<a className="tile" key={r.h.id} href={href('copia', r.h.id)}>
										<CardImage images={r.h.images} lang={r.h.lang} catalog={r.h.catalog} alt={r.h.name} />
										{r.h.qty > 1 ? <span className="badge">×{r.h.qty}</span> : null}
										<span className="t-price num">{eur(r.total)}</span>
										<HoldingChips h={{ ...r.h, qty: 1 }} compact />
									</a>
								))}
							</div>
						) : (
							<ul className="rows">
								{shown.slice(0, limit).map((r) => (
									<li key={r.h.id}>
										<a className="row" href={href('copia', r.h.id)}>
											<CardImage images={r.h.images} lang={r.h.lang} catalog={r.h.catalog} alt="" />
											<span className="mid">
												<span className="name">{shownName(r.h)}</span>
												<span className="sub">
													{r.h.setName} · {cardNumber(r.h.localId, r.h.setOfficial)}
												</span>
												<HoldingChips h={r.h} unit={r.unit} />
											</span>
											<span className="end num">
												<span className="val">{eur(r.total)}</span>
												{r.pl != null ? (
													<span className={'pl ' + (r.pl >= 0 ? 'up' : 'down')}>{signedEur(r.pl)}</span>
												) : r.h.qty > 1 && r.unit.value != null ? (
													<span className="pl muted">{eur(r.unit.value)} l’una</span>
												) : null}
											</span>
										</a>
									</li>
								))}
							</ul>
						)}

						{shown.length > limit ? (
							<button className="btn block" type="button" onClick={() => setLimit((n) => n + PAGE)}>
								Mostra altre {Math.min(PAGE, shown.length - limit)}
							</button>
						) : null}

						<p className="footnote">Prezzi Cardmarket: il listino cambia una volta al giorno.</p>
						{backupOld ? (
							<div className="notice">
								<span>La collezione è salvata solo su questo dispositivo. Tieni una copia di sicurezza.</span>
								<a className="btn small" href={href('altro')}>
									Fai un backup
								</a>
							</div>
						) : null}
					</>
				) : null}
			</main>
		</>
	)
}
