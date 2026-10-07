import { useEffect, useMemo, useState } from 'react'
import { CardTile } from '../components/CardTile'
import { IconBack, IconClose, IconSearch } from '../components/Icons'
import { SealedRow } from '../components/SealedArt'
import { fmtDay, fold, ofWhen } from '../lib/format'
import { useAsync } from '../lib/hooks'
import { CATALOGS, catalogName, titleSize } from '../lib/labels'
import { back, href } from '../lib/router'
import { presetSearch } from '../lib/searchMemo'
import { loadSealed, sealedOfSet } from '../lib/sealed'
import { useStore } from '../lib/store'
import { getSet, getSets, logoCandidates } from '../lib/tcgdex'
import type { Catalog, SetBrief } from '../lib/types'

const memo = { catalog: 'int' as Catalog, q: '' }

/** Set logo with fallbacks: another file format, the English logo, the set symbol, then the set code. */
function SetLogo({ set }: { set: Pick<SetBrief, 'logo' | 'symbol' | 'id' | 'name'> }) {
	const urls = useMemo(() => logoCandidates(set.logo, set.symbol), [set.logo, set.symbol])
	const [i, setI] = useState(0)
	useEffect(() => setI(0), [urls])
	const url = urls[i]
	return (
		<span className="setlogo">
			{url ? (
				<img key={url} src={url} alt="" loading="lazy" decoding="async" onError={() => setI((n) => n + 1)} />
			) : (
				<span className="ph">{set.id.toUpperCase().slice(0, 7)}</span>
			)}
		</span>
	)
}

/** Distinct cards of each set that are in the collection. */
function useOwnedBySet(catalog: Catalog) {
	const holdings = useStore((s) => s.holdings)
	return useMemo(() => {
		const map = new Map<string, Set<string>>()
		for (const h of holdings) {
			if (h.catalog !== catalog) continue
			let ids = map.get(h.setId)
			if (!ids) map.set(h.setId, (ids = new Set()))
			ids.add(h.cardId)
		}
		return map
	}, [holdings, catalog])
}

export function SetsView() {
	const [catalog, setCatalog] = useState<Catalog>(memo.catalog)
	const [q, setQ] = useState(memo.q)
	Object.assign(memo, { catalog, q })
	const sets = useAsync(() => getSets(catalog), [catalog])
	const owned = useOwnedBySet(catalog)

	const list = useMemo(() => {
		const fq = fold(q)
		const all = (sets.data ?? []).slice().reverse()
		return fq ? all.filter((s) => fold(s.name).includes(fq) || fold(s.id).includes(fq)) : all
	}, [sets.data, q])

	return (
		<>
			<header className="topbar">
				<h1>Set</h1>
			</header>
			<main className="page">
				<div className="seg" role="group" aria-label="Catalogo">
					{CATALOGS.map((c) => (
						<button key={c.code} type="button" aria-pressed={catalog === c.code} onClick={() => setCatalog(c.code)}>
							{c.name}
						</button>
					))}
				</div>
				<div className="searchbox">
					<IconSearch />
					<input
						id="sets-q"
						type="search"
						placeholder="Filtra i set per nome o sigla"
						aria-label="Filtra i set"
						value={q}
						onChange={(e) => setQ(e.target.value)}
					/>
					{q ? (
						<button className="iconbtn clear" type="button" aria-label="Cancella" onClick={() => setQ('')}>
							<IconClose />
						</button>
					) : null}
				</div>

				{sets.loading && !sets.data ? (
					<div className="stack" aria-busy="true">
						{Array.from({ length: 8 }, (_, i) => (
							<div key={i} className="skel" style={{ height: 56 }} />
						))}
					</div>
				) : null}
				{sets.error && !sets.data ? (
					<div className="empty">
						<p>Non riesco a caricare l’elenco dei set. Controlla la connessione e riprova.</p>
						<button className="btn" type="button" onClick={sets.reload}>
							Riprova
						</button>
					</div>
				) : null}
				{sets.data && !list.length ? <div className="empty">Nessun set con questo nome.</div> : null}

				{list.length ? (
					<>
						<p className="small muted">
							{list.length} set, dal più recente{catalog !== 'int' ? `. Catalogo ${catalogName(catalog).toLowerCase()}` : ''}
						</p>
						<ul className="rows">
							{list.map((s) => {
								const mine = owned.get(s.id)?.size ?? 0
								return (
									<li key={s.id}>
										<a className="setrow" href={href('set', catalog, s.id)}>
											<SetLogo set={s} />
											<span className="mid stack" style={{ gap: 4, minWidth: 0 }}>
												<span style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{s.name}</span>
												<span className="small muted num">
													{s.total} carte{mine ? ` · ne hai ${mine}` : ''}
												</span>
												{mine && s.total ? (
													<span className="progress">
														<i style={{ width: `${Math.min(100, (mine / s.total) * 100)}%` }} />
													</span>
												) : null}
											</span>
											<span className="chip">{s.id.toUpperCase()}</span>
										</a>
									</li>
								)
							})}
						</ul>
					</>
				) : null}
			</main>
		</>
	)
}

type Show = 'all' | 'owned' | 'missing' | 'sealed'

// Which list of a set was open, so that coming back from a card or a product shows the same one.
const setMemo = { key: '', show: 'all' as Show }

export function SetView({ catalog, id }: { catalog: Catalog; id: string }) {
	const set = useAsync(() => getSet(catalog, id), [catalog, id])
	const owned = useOwnedBySet(catalog)
	const memoKey = `${catalog}:${id}`
	const [show, setShow] = useState<Show>(setMemo.key === memoKey ? setMemo.show : 'all')
	Object.assign(setMemo, { key: memoKey, show })
	const [shown, setShown] = useState(90)
	const mine = owned.get(id) ?? new Set<string>()
	const data = set.data
	// The list of sealed products is one file for all sets: a failure here must not hide the cards.
	const sealed = useAsync(() => loadSealed().catch(() => null), [])
	const index = sealed.data?.index ?? null
	const products = useMemo(() => sealedOfSet(index, catalog, id), [index, catalog, id])
	// Coins, lots and complete sets are listed too, at the end, but are not what the button counts.
	const sealedCount = products.filter((p) => !p.kind.extra).length

	const cards = useMemo(() => {
		const all = data?.cards ?? []
		if (show === 'owned') return all.filter((c) => mine.has(c.id))
		if (show === 'missing') return all.filter((c) => !mine.has(c.id))
		return all
		// `mine` is rebuilt on every render; its content follows `owned`
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [data, show, owned, id])

	return (
		<>
			<header className="topbar">
				<button className="iconbtn" type="button" aria-label="Indietro" onClick={() => back(href('set'))}>
					<IconBack />
				</button>
				<h1 style={{ fontSize: data ? titleSize(data.name) : undefined }}>{data?.name ?? 'Set'}</h1>
			</header>
			<main className="page">
				{set.loading && !data ? (
					<div className="grid" aria-busy="true">
						{Array.from({ length: 12 }, (_, i) => (
							<div key={i} className="skel" style={{ aspectRatio: '245 / 337' }} />
						))}
					</div>
				) : null}
				{set.error && !data ? (
					<div className="empty">
						<p>Non riesco a caricare questo set. Controlla la connessione e riprova.</p>
						<button className="btn" type="button" onClick={set.reload}>
							Riprova
						</button>
					</div>
				) : null}
				{!set.loading && !set.error && data === null ? <div className="empty">Questo set non esiste nel catalogo.</div> : null}

				{data ? (
					<>
						<section className="glass t-gold quiet panel">
							<div className="hstack" style={{ gap: 14, flexWrap: 'nowrap' }}>
								<SetLogo set={data} />
								<div className="grow stack" style={{ gap: 2 }}>
									<h2 style={{ overflowWrap: 'anywhere' }}>{data.name}</h2>
									<span className="small muted num">
										{[
											data.serie?.name,
											`${data.cards.length} carte`,
											data.releaseDate ? `uscito il ${fmtDay(data.releaseDate, true)}` : '',
										]
											.filter(Boolean)
											.join(' · ')}
									</span>
								</div>
							</div>
							{data.cards.length ? (
								<div className="stack" style={{ gap: 6 }}>
									<span className="small num">
										Ne hai <b>{mine.size}</b> su {data.cards.length}
									</span>
									<span className="progress">
										<i style={{ width: `${Math.min(100, (mine.size / data.cards.length) * 100)}%` }} />
									</span>
								</div>
							) : null}
						</section>

						<div className="seg" role="group" aria-label="Quali carte mostrare">
							{(
								[
									['all', 'Tutte'],
									['owned', 'Che ho'],
									['missing', 'Mancanti'],
									['sealed', sealedCount ? `Sigillati ${sealedCount}` : 'Sigillati'],
								] as Array<[Show, string]>
							).map(([k, label]) => (
								<button
									key={k}
									type="button"
									aria-pressed={show === k}
									onClick={() => {
										setShow(k)
										setShown(90)
									}}
								>
									{label}
								</button>
							))}
						</div>

						{show === 'sealed' ? (
							sealed.loading && !sealed.data ? (
								<div className="stack" aria-busy="true">
									{Array.from({ length: 5 }, (_, i) => (
										<div key={i} className="skel" style={{ height: 62 }} />
									))}
								</div>
							) : products.length ? (
								<>
									<ul className="rows" data-testid="sealed-list">
										{products.map((p, i) => (
											<li key={p.id} className={i === 0 || products[i - 1].cat !== p.cat ? 'grouped' : undefined}>
												{i === 0 || products[i - 1].cat !== p.cat ? <h3 className="grouphead">{p.kind.many}</h3> : null}
												<SealedRow product={p} />
											</li>
										))}
									</ul>
									<p className="footnote">
										Prodotti e prezzi di Cardmarket{index?.updated ? `, listino ${ofWhen(index.updated)}` : ''}. Un solo prezzo per
										prodotto, senza distinguere la lingua.
									</p>
								</>
							) : (
								<div className="empty" data-testid="sealed-empty">
									<p>
										{index
											? 'Non trovo prodotti sigillati collegati a questo set su Cardmarket. Prova a cercarli per nome.'
											: 'L’elenco dei prodotti sigillati non è disponibile in questo momento.'}
									</p>
									{index ? (
										<a
											className="btn"
											href={href('cerca')}
											onClick={() => presetSearch('sealed', '')}
										>
											Cerca tra i sigillati
										</a>
									) : null}
								</div>
							)
						) : !cards.length ? (
							<div className="empty">
								{show === 'owned' ? 'Non hai ancora carte di questo set.' : show === 'missing' ? 'Le hai tutte.' : 'Nessuna carta.'}
							</div>
						) : (
							<div className="grid">
								{cards.slice(0, shown).map((c) => (
									<CardTile key={c.id} brief={c} set={data} hideSet />
								))}
							</div>
						)}
						{show !== 'sealed' && cards.length > shown ? (
							<button className="btn block" type="button" onClick={() => setShown((n) => n + 90)}>
								Mostra altre {Math.min(90, cards.length - shown)}
							</button>
						) : null}
					</>
				) : null}
			</main>
		</>
	)
}
