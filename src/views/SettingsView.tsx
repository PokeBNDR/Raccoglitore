import { useEffect, useRef, useState } from 'react'
import { toast } from '../components/Toast'
import { dayStr, fmtWhen, numToInput, ofWhen, parseNum } from '../lib/format'
import { BASIS, CONDS, DEFAULT_SETTINGS, LANGS } from '../lib/labels'
import {
	exportData,
	flush,
	importData,
	latestPriceTime,
	markBackedUp,
	refreshPrices,
	setSettings,
	useStore,
	wipeAll,
} from '../lib/store'
import { loadCard } from '../lib/tcgdex'
import type { Cond, LangCode, PriceBasis } from '../lib/types'

declare const __BUILD_TIME__: string

interface InstallEvent extends Event {
	prompt: () => Promise<void>
}
let installEvent: InstallEvent | null = null
const installSubs = new Set<() => void>()
if (typeof window !== 'undefined') {
	window.addEventListener('beforeinstallprompt', (e) => {
		e.preventDefault()
		installEvent = e as InstallEvent
		installSubs.forEach((f) => f())
	})
}

const EBAY_SITES = [
	['www.ebay.it', 'eBay Italia'],
	['www.ebay.de', 'eBay Germania'],
	['www.ebay.fr', 'eBay Francia'],
	['www.ebay.es', 'eBay Spagna'],
	['www.ebay.co.uk', 'eBay Regno Unito'],
	['www.ebay.com', 'eBay USA'],
]

/** A multiplier field that keeps what is being typed and saves only valid numbers. */
function MultInput({ id, label, value, onSave }: { id: string; label: string; value: number; onSave: (n: number) => void }) {
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
		</div>
	)
}

export function SettingsView() {
	const settings = useStore((s) => s.settings)
	const holdings = useStore((s) => s.holdings)
	const refresh = useStore((s) => s.refresh)
	const cards = useStore((s) => s.cards)
	const lastBackup = useStore((s) => s.lastBackup)
	const storageOk = useStore((s) => s.storageOk)
	const file = useRef<HTMLInputElement>(null)
	const [pending, setPending] = useState<unknown>(null)
	const [importError, setImportError] = useState('')
	const [wipeArmed, setWipeArmed] = useState(false)
	const [persisted, setPersisted] = useState<boolean | null>(null)
	const [, bump] = useState(0)
	const [probe, setProbe] = useState<{ ok: boolean; text: string } | 'running' | null>(null)

	useEffect(() => {
		const f = () => bump((n) => n + 1)
		installSubs.add(f)
		navigator.storage
			?.persisted?.()
			.then(setPersisted)
			.catch(() => setPersisted(null))
		return () => {
			installSubs.delete(f)
		}
	}, [])

	const standalone =
		window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
	const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)

	const doExport = async () => {
		await flush()
		const data = exportData()
		const name = `raccoglitore-backup-${dayStr()}.json`
		const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' })
		try {
			const f = new File([blob], name, { type: 'application/json' })
			// On phones the share sheet is the reliable way to save a file ("Salva su File", Drive, mail…).
			if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [f] })) {
				await navigator.share({ files: [f], title: 'Backup Raccoglitore' })
				markBackedUp()
				toast('Backup creato')
				return
			}
		} catch (err) {
			if ((err as Error)?.name === 'AbortError') return
		}
		const url = URL.createObjectURL(blob)
		const a = document.createElement('a')
		a.href = url
		a.download = name
		document.body.appendChild(a)
		a.click()
		a.remove()
		setTimeout(() => URL.revokeObjectURL(url), 5000)
		markBackedUp()
		toast('Backup scaricato')
	}

	const onFile = async (f: File | undefined) => {
		setImportError('')
		setPending(null)
		if (!f) return
		try {
			const parsed = JSON.parse(await f.text()) as { holdings?: unknown }
			if (!parsed || !Array.isArray(parsed.holdings)) throw new Error('Questo file non è un backup di Raccoglitore.')
			setPending(parsed)
		} catch (err) {
			setImportError(err instanceof SyntaxError ? 'Non riesco a leggere il file: non è un backup valido.' : (err as Error).message)
		}
		if (file.current) file.current.value = ''
	}

	const doImport = (mode: 'replace' | 'merge') => {
		try {
			const r = importData(pending, mode)
			toast(mode === 'replace' ? `Collezione ripristinata: ${r.total} voci` : `${r.added} voci aggiunte`)
			setPending(null)
		} catch (err) {
			setImportError((err as Error).message)
			setPending(null)
		}
	}

	// Asks the catalogue for one well-known card, to tell a connection problem from an app problem.
	const runProbe = async () => {
		setProbe('running')
		const t0 = performance.now()
		try {
			const { card, stale } = await loadCard('int', 'base1-4', { force: true })
			const ms = Math.round(performance.now() - t0)
			const cm = card?.cm ?? card?.variants.find((v) => v.cm)?.cm
			if (!card || stale) setProbe({ ok: false, text: 'Il catalogo non risponde. Controlla la connessione e riprova tra poco.' })
			else if (!cm?.updated) setProbe({ ok: false, text: `Il catalogo risponde (${ms} ms) ma senza i prezzi Cardmarket.` })
			else setProbe({ ok: true, text: `Catalogo raggiungibile in ${ms} ms. Listino Cardmarket ${ofWhen(cm.updated)}.` })
		} catch {
			setProbe({ ok: false, text: 'Non riesco a raggiungere il catalogo. Controlla la connessione e riprova tra poco.' })
		}
	}

	const priced = latestPriceTime({ holdings, cards, refresh })
	const setCond = (c: Cond, n: number) => setSettings({ condMult: { ...settings.condMult, [c]: n } })
	const setLang = (l: LangCode, n: number) => setSettings({ langMult: { ...settings.langMult, [l]: n } })
	const pendingCount = Array.isArray((pending as { holdings?: unknown[] } | null)?.holdings)
		? (pending as { holdings: unknown[] }).holdings.length
		: 0

	return (
		<>
			<header className="topbar">
				<h1>Altro</h1>
			</header>
			<main className="page">
				<section className="glass t-graphite quiet panel">
					<h2>Prezzi</h2>
					<div className="field">
						<label htmlFor="set-basis">Prezzo Cardmarket da cui partire</label>
						<select id="set-basis" value={settings.basis} onChange={(e) => setSettings({ basis: e.target.value as PriceBasis })}>
							{BASIS.map((b) => (
								<option key={b.code} value={b.code}>
									{b.name}
								</option>
							))}
						</select>
						<span className="hint">{BASIS.find((b) => b.code === settings.basis)?.hint}.</span>
					</div>
					<p className="small muted">
						Valore di una copia = prezzo Cardmarket × condizione × lingua. Un «Prezzo tuo» scritto sulla copia sostituisce il
						calcolo. Per le gradate la condizione non conta.
					</p>
					<div className="hstack" style={{ justifyContent: 'space-between' }}>
						<span className="small muted">
							{priced ? `Ultimo aggiornamento ${fmtWhen(priced)}` : 'Nessun prezzo scaricato finora'}
						</span>
						<button
							className="btn small"
							type="button"
							disabled={refresh.running || !holdings.length}
							onClick={() => void refreshPrices({ force: true })}
						>
							{refresh.running ? `Aggiorno ${refresh.done}/${refresh.total}` : 'Aggiorna adesso'}
						</button>
					</div>
				</section>

				<section className="glass t-graphite quiet panel">
					<div className="hstack" style={{ justifyContent: 'space-between' }}>
						<h2>Condizione</h2>
						<button className="btn small ghost" type="button" onClick={() => setSettings({ condMult: DEFAULT_SETTINGS.condMult })}>
							Ripristina
						</button>
					</div>
					<p className="small muted">
						Quanto vale una copia rispetto a una Near Mint. Sono valori di partenza: regolali su quello che vedi davvero tra
						le offerte.
					</p>
					<div className="mults">
						{CONDS.map((c) => (
							<MultInput
								key={c.code}
								id={`mult-cond-${c.code}`}
								label={`${c.code} · ${c.name}`}
								value={settings.condMult[c.code]}
								onSave={(n) => setCond(c.code, n)}
							/>
						))}
					</div>
				</section>

				<section className="glass t-graphite quiet panel">
					<div className="hstack" style={{ justifyContent: 'space-between' }}>
						<h2>Lingua</h2>
						<button className="btn small ghost" type="button" onClick={() => setSettings({ langMult: DEFAULT_SETTINGS.langMult })}>
							Ripristina
						</button>
					</div>
					<p className="small muted">
						Partono tutte da 1, cioè nessuna correzione. Scrivi 0,7 se nella tua esperienza una lingua vale il 30% in meno
						del prezzo Cardmarket, 1,5 se vale la metà in più.
					</p>
					<div className="mults">
						{LANGS.map((l) => (
							<MultInput
								key={l.code}
								id={`mult-lang-${l.code}`}
								label={`${l.code} · ${l.name}`}
								value={settings.langMult[l.code]}
								onSave={(n) => setLang(l.code, n)}
							/>
						))}
					</div>
				</section>

				<section className="glass t-graphite quiet panel">
					<h2>Copia di sicurezza</h2>
					<p className="small muted">
						La collezione è salvata su questo dispositivo, dentro il browser. Un backup è un file che puoi tenere dove vuoi e
						ricaricare qui o su un altro dispositivo.
					</p>
					<p className="small num">
						{lastBackup ? `Ultimo backup ${fmtWhen(lastBackup)}.` : 'Nessun backup fatto finora.'}{' '}
						{!storageOk
							? 'Attenzione: questo browser non sta salvando i dati.'
							: persisted === true
								? 'Il browser ha confermato che non cancellerà i dati per fare spazio.'
								: persisted === false
									? 'Il browser potrebbe cancellare i dati se resta a lungo inutilizzato: installa l’app e fai backup regolari.'
									: ''}
					</p>
					<div className="hstack">
						<button className="btn grow" type="button" onClick={() => void doExport()} disabled={!holdings.length}>
							Crea backup
						</button>
						<button className="btn grow" type="button" onClick={() => file.current?.click()}>
							Carica backup
						</button>
						<input
							id="backup-file"
							ref={file}
							type="file"
							accept="application/json,.json"
							hidden
							onChange={(e) => void onFile(e.target.files?.[0])}
						/>
					</div>
					{importError ? (
						<p className="small down" role="alert">
							{importError}
						</p>
					) : null}
					{pending ? (
						<div className="notice warn" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
							<span>
								Il backup contiene {pendingCount} voci. Vuoi sostituire la collezione attuale ({holdings.length} voci) o
								aggiungere quelle che mancano?
							</span>
							<div className="hstack">
								<button className="btn small grow" type="button" onClick={() => doImport('merge')}>
									Aggiungi le mancanti
								</button>
								<button className="btn small grow danger" type="button" onClick={() => doImport('replace')}>
									Sostituisci tutto
								</button>
								<button className="btn small ghost" type="button" onClick={() => setPending(null)}>
									Annulla
								</button>
							</div>
						</div>
					) : null}
				</section>

				{!standalone ? (
					<section className="glass t-graphite quiet panel">
						<h2>Installa sul telefono</h2>
						{installEvent ? (
							<>
								<p className="small muted">Si apre a tutto schermo dalla schermata Home, come le altre app.</p>
								<button
									className="btn primary"
									type="button"
									onClick={() => {
										void installEvent?.prompt()
										installEvent = null
										bump((n) => n + 1)
									}}
								>
									Installa Raccoglitore
								</button>
							</>
						) : (
							<p className="small muted">
								{ios
									? 'Su iPhone: apri questa pagina in Safari, tocca Condividi e poi «Aggiungi alla schermata Home».'
									: 'Su Android: apri il menu del browser e scegli «Installa app» o «Aggiungi a schermata Home». Su iPhone: in Safari, Condividi e poi «Aggiungi alla schermata Home».'}
							</p>
						)}
					</section>
				) : null}

				<section className="glass t-graphite quiet panel">
					<h2>Link ai mercati</h2>
					<div className="field">
						<label htmlFor="set-ebay">Sito eBay per i venduti</label>
						<select id="set-ebay" value={settings.ebaySite} onChange={(e) => setSettings({ ebaySite: e.target.value })}>
							{EBAY_SITES.map(([v, label]) => (
								<option key={v} value={v}>
									{label}
								</option>
							))}
						</select>
					</div>
				</section>

				<section className="glass t-graphite quiet panel">
					<h2>Da dove arrivano i dati</h2>
					<p className="small muted">
						Catalogo e immagini: <a href="https://tcgdex.dev" target="_blank" rel="noopener noreferrer">TCGdex</a>, un
						database aperto. Prezzi: il listino che Cardmarket pubblica ogni giorno, letto tramite TCGdex. I prezzi sono
						indicativi e non sostituiscono una valutazione.
					</p>
					<p className="small muted">
						Raccoglitore è un progetto personale, non affiliato a The Pokémon Company, Nintendo, Cardmarket o eBay.
					</p>
					<div className="hstack">
						<button className="btn small" type="button" disabled={probe === 'running'} onClick={() => void runProbe()} data-testid="probe">
							{probe === 'running' ? 'Verifico…' : 'Verifica il collegamento'}
						</button>
						{probe && probe !== 'running' ? (
							<span className={'small num ' + (probe.ok ? 'up' : 'down')} role="status" data-testid="probe-result">
								{probe.text}
							</span>
						) : null}
					</div>
					<p className="small muted num" data-testid="build">
						Versione {ofWhen(__BUILD_TIME__)}.
					</p>
				</section>

				{holdings.length ? (
					<button
						className="btn ghost danger"
						type="button"
						onClick={() => {
							if (!wipeArmed) {
								setWipeArmed(true)
								window.setTimeout(() => setWipeArmed(false), 5000)
								return
							}
							wipeAll()
							setWipeArmed(false)
							toast('Collezione svuotata')
						}}
					>
						{wipeArmed ? `Tocca di nuovo: elimino ${holdings.length} voci e lo storico` : 'Svuota la collezione'}
					</button>
				) : null}
			</main>
		</>
	)
}
