// Checks the real data sources: run it from any computer with internet access.
//
//   node tests/live.mjs
//
// It asks the public catalogue for a few well-known cards and verifies that the answers have the
// shape the app relies on (names, pictures, Cardmarket prices, browser access).
const API = process.env.API_BASE || 'https://api.tcgdex.net/v2'
let failed = 0
const ok = (name, cond, detail = '') => {
	if (!cond) failed++
	console.log(`${cond ? 'OK  ' : 'KO  '} ${name}${detail ? '  — ' + detail : ''}`)
}
const get = async (path) => {
	const res = await fetch(`${API}/${path}`, { headers: { Origin: 'https://example.org' } })
	return { res, data: res.ok ? await res.json() : null }
}
const num = (v) => typeof v === 'number' && v > 0

try {
	const sets = await get('en/sets')
	ok('elenco dei set', Array.isArray(sets.data) && sets.data.length > 100 && sets.data[0].id && sets.data[0].cardCount, `${sets.data?.length} set`)
	ok('il catalogo accetta richieste dal browser (CORS)', sets.res.headers.get('access-control-allow-origin') === '*', sets.res.headers.get('access-control-allow-origin') ?? 'intestazione assente')
	const last = sets.data?.[sets.data.length - 1]
	ok('i set sono in ordine di uscita, il più recente in fondo', !!last, last ? `${last.id} · ${last.name}` : '')

	const it = await get('it/cards?name=charizard')
	const en = await get('en/cards?name=charizard')
	ok('ricerca per nome in italiano', Array.isArray(it.data) && it.data.length > 10 && it.data[0].id && it.data[0].localId, `${it.data?.length} carte`)
	ok('ricerca per nome in inglese', Array.isArray(en.data) && en.data.length >= (it.data?.length ?? 0), `${en.data?.length} carte`)

	const card = await get('en/cards/base1-4')
	const c = card.data
	ok('scheda carta: Charizard del Set Base', c?.name === 'Charizard' && c?.set?.id === 'base1' && c?.localId === '4')
	ok('scheda carta: elenco delle versioni', Array.isArray(c?.variants_detailed) && c.variants_detailed.length > 0, (c?.variants_detailed ?? []).map((v) => [v.type, v.subtype, ...(v.stamp ?? [])].filter(Boolean).join('/')).join(', '))
	const cm = c?.pricing?.cardmarket ?? (c?.variants_detailed ?? []).find((v) => v.pricing?.cardmarket)?.pricing?.cardmarket
	ok('prezzi Cardmarket presenti', !!cm && cm.unit === 'EUR' && (num(cm.trend) || num(cm.avg30)), cm ? `tendenza ${cm.trend} €, 7 gg ${cm.avg7} €, 30 gg ${cm.avg30} €, listino del ${cm.updated}` : 'assenti')
	ok('prezzi Cardmarket: id del prodotto per il link', Number.isInteger(cm?.idProduct), String(cm?.idProduct))
	const perVariant = (c?.variants_detailed ?? []).filter((v) => v.pricing?.cardmarket).length
	ok('prezzi separati per versione', perVariant > 0, `${perVariant} versioni con un loro listino`)
	const age = cm?.updated ? (Date.now() - new Date(cm.updated).getTime()) / 3_600_000 : NaN
	ok('il listino è recente (meno di 3 giorni)', age < 72, Number.isFinite(age) ? `${age.toFixed(0)} ore fa` : 'data assente')

	const modern = await get('en/cards/sv03.5-001')
	const m = modern.data?.pricing?.cardmarket
	ok('carta moderna: prezzi della Reverse Holo nelle colonne "-holo"', !!m && 'trend-holo' in m, m ? `normale ${m.trend} €, reverse ${m['trend-holo']} €` : 'assenti')

	const itCard = await get('it/cards/base1-4')
	ok('scheda in italiano', itCard.data?.set?.name?.length > 0, `${itCard.data?.name} · ${itCard.data?.set?.name}`)

	const byNumber = await get('en/sets/base1/4')
	ok('ricerca per set e numero', byNumber.data?.id === 'base1-4')

	const ja = await get('ja/dex-ids/6')
	ok('catalogo giapponese: carte per numero di Pokédex', Array.isArray(ja.data?.cards) && ja.data.cards.length > 5, `${ja.data?.cards?.length} carte di Charizard`)

	const pocket = await get('en/series/tcgp')
	ok('elenco delle carte solo digitali da escludere', Array.isArray(pocket.data?.sets) && pocket.data.sets.length > 0, `${pocket.data?.sets?.length} set`)

	for (const q of ['low', 'high']) {
		const img = await fetch(`${c?.image}/${q}.webp`, { method: 'GET' })
		ok(`immagine ${q === 'low' ? 'piccola' : 'grande'}`, img.ok && /image/.test(img.headers.get('content-type') ?? ''), `${img.status} ${img.headers.get('content-type')}`)
	}
	const logo = await fetch(`${last?.logo ?? sets.data?.find((s) => s.logo)?.logo}.webp`)
	ok('logo di un set', logo.ok, String(logo.status))
} catch (err) {
	ok('collegamento al catalogo', false, String(err?.message ?? err))
}

console.log(failed ? `\n${failed} controlli non superati` : '\nTutte le fonti rispondono come previsto')
process.exit(failed ? 1 : 0)
