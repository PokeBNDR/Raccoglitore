import { useEffect, useMemo, useRef, useState } from 'react'
import { CardTile } from '../components/CardTile'
import { IconClose, IconSearch } from '../components/Icons'
import { useAsync, useDebounced } from '../lib/hooks'
import { CATALOGS } from '../lib/labels'
import { href } from '../lib/router'
import { getSets, searchCards, type SearchResult } from '../lib/tcgdex'
import type { Catalog } from '../lib/types'

// Remembered while the app is open, so coming back from a card shows the same results.
const memo = { q: '', catalog: 'int' as Catalog, setId: '', shown: 60 }
const PAGE = 60

export function SearchView() {
	const [q, setQ] = useState(memo.q)
	const [catalog, setCatalog] = useState<Catalog>(memo.catalog)
	const [setId, setSetId] = useState(memo.setId)
	const [shown, setShown] = useState(memo.shown)
	Object.assign(memo, { q, catalog, setId, shown })

	const input = useRef<HTMLInputElement>(null)
	useEffect(() => {
		if (!memo.q) input.current?.focus()
	}, [])

	const term = useDebounced(q.trim(), 350)
	const sets = useAsync(() => getSets(catalog), [catalog])
	const setById = useMemo(() => new Map((sets.data ?? []).map((s) => [s.id, s])), [sets.data])

	const [res, setRes] = useState<{ key: string; data: SearchResult } | null>(null)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState(false)
	const [attempt, setAttempt] = useState(0)
	const key = `${catalog}|${term}`
	useEffect(() => {
		if (term.length < 2) {
			setRes(null)
			setLoading(false)
			setError(false)
			return
		}
		const ctl = new AbortController()
		setLoading(true)
		setError(false)
		searchCards(catalog, term, ctl.signal).then(
			(data) => {
				if (ctl.signal.aborted) return
				setRes({ key, data })
				setLoading(false)
			},
			(err) => {
				if (ctl.signal.aborted || (err as Error)?.name === 'AbortError') return
				setError(true)
				setLoading(false)
			},
		)
		return () => ctl.abort()
		// `key` is catalog + term
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [key, attempt])

	// A new search starts again from the first page and without the set filter.
	const lastKey = useRef(memo.q ? key : '')
	useEffect(() => {
		if (lastKey.current === key) return
		lastKey.current = key
		setSetId('')
		setShown(PAGE)
	}, [key])

	const all = res?.key === key ? res.data.cards : []
	const setsInResults = useMemo(() => {
		const count = new Map<string, number>()
		for (const c of all) count.set(c.setId, (count.get(c.setId) ?? 0) + 1)
		return [...count.entries()]
			.map(([id, n]) => ({ id, n, name: setById.get(id)?.name ?? id, order: setById.get(id)?.order ?? -1 }))
			.sort((a, b) => b.order - a.order)
	}, [all, setById])
	const cards = setId ? all.filter((c) => c.setId === setId) : all
	const asian = catalog !== 'int'

	return (
		<>
			<header className="topbar">
				<h1>Cerca</h1>
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
						id="search-q"
						ref={input}
						type="search"
						enterKeyHint="search"
						autoComplete="off"
						autoCorrect="off"
						spellCheck={false}
						placeholder={asian ? 'Nome del Pokémon, es. Charizard' : 'Nome, o nome e numero: pikachu 58/102'}
						aria-label="Cerca una carta nel catalogo"
						value={q}
						onChange={(e) => setQ(e.target.value)}
					/>
					{q ? (
						<button
							className="iconbtn clear"
							type="button"
							aria-label="Cancella"
							onClick={() => {
								setQ('')
								input.current?.focus()
							}}
						>
							<IconClose />
						</button>
					) : null}
				</div>

				{term.length < 2 ? (
					<div className="glass t-graphite quiet panel">
						<h3>Come cercare</h3>
						{asian ? (
							<ul className="small muted" style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
								<li>
									Scrivi il nome del Pokémon in lettere latine, per esempio <b>Charizard</b>: trovo tutte le sue carte di questo
									catalogo.
								</li>
								<li>
									Aggiungi il numero per restringere: <b>charizard 6/165</b>.
								</li>
								<li>
									Per Allenatori ed Energie, <a href={href('set')}>sfoglia i set</a>: i nomi sono nella lingua originale.
								</li>
							</ul>
						) : (
							<ul className="small muted" style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
								<li>
									Il nome, in italiano o in inglese: <b>charizard</b>
								</li>
								<li>
									Nome e numero stampato sulla carta: <b>pikachu 58/102</b>
								</li>
								<li>
									Solo il numero, con il totale del set: <b>4/102</b>
								</li>
								<li>
									Le carte uscite solo in Giappone, Corea o Cina stanno nei loro cataloghi, qui sopra.
								</li>
							</ul>
						)}
					</div>
				) : null}

				{term.length >= 2 && loading && !all.length ? (
					<div className="grid" aria-busy="true" aria-label="Ricerca in corso">
						{Array.from({ length: 9 }, (_, i) => (
							<div key={i} className="skel" style={{ aspectRatio: '245 / 337' }} />
						))}
					</div>
				) : null}

				{error && !loading ? (
					<div className="empty">
						<p>Non riesco a raggiungere il catalogo. Controlla la connessione e riprova.</p>
						<button className="btn" type="button" onClick={() => setAttempt((n) => n + 1)}>
							Riprova
						</button>
					</div>
				) : null}

				{res?.key === key && !loading && !error ? (
					<>
						{res.data.needMore ? (
							<div className="empty">
								Con il solo numero servono anche il nome o il totale del set, per esempio <b>charizard 4</b> oppure <b>4/102</b>.
							</div>
						) : !all.length ? (
							<div className="empty">
								<p>
									Nessuna carta trovata per «{term}» nel catalogo {CATALOGS.find((c) => c.code === catalog)?.name.toLowerCase()}.
								</p>
								<a className="btn" href={href('set')}>
									Sfoglia i set
								</a>
							</div>
						) : (
							<div className="hstack" style={{ justifyContent: 'space-between' }}>
								<span className="small muted num" data-testid="result-count">
									{cards.length} {cards.length === 1 ? 'carta' : 'carte'}
									{res.data.numberIgnored ? ' · nessuna con quel numero, le mostro tutte' : ''}
								</span>
								{setsInResults.length > 1 ? (
									<select
										id="search-set"
										aria-label="Filtra per set"
										value={setId}
										onChange={(e) => {
											setSetId(e.target.value)
											setShown(PAGE)
										}}
										style={{ width: 'auto', maxWidth: '62%', minHeight: 40, padding: '4px 34px 4px 16px', fontSize: 15 }}
									>
										<option value="">Tutti i set</option>
										{setsInResults.map((s) => (
											<option key={s.id} value={s.id}>
												{s.name} ({s.n})
											</option>
										))}
									</select>
								) : null}
							</div>
						)}
					</>
				) : null}

				{cards.length ? (
					<>
						<div className="grid">
							{cards.slice(0, shown).map((c) => (
								<CardTile key={c.id} brief={c} set={setById.get(c.setId)} />
							))}
						</div>
						{cards.length > shown ? (
							<button className="btn block" type="button" onClick={() => setShown((n) => n + PAGE)}>
								Mostra altre {Math.min(PAGE, cards.length - shown)}
							</button>
						) : null}
					</>
				) : null}
			</main>
		</>
	)
}
