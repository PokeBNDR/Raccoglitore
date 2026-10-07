// End-to-end check of the main flows in a phone-sized browser.
//
// The catalogue is served by a local copy of the open TCGdex server (same code and card data as the
// public one; prices are stand-ins because Cardmarket's file is not reachable from the build machine).
// Card pictures are replaced by labelled placeholders that say which language file was requested.
//
//   APP_URL=http://127.0.0.1:4173/ node tests/e2e.mjs
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright-core'

const APP = process.env.APP_URL || 'http://127.0.0.1:4173/'
const SHOTS = process.env.SHOTS_DIR || 'test-shots'
const exe = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
mkdirSync(SHOTS, { recursive: true })

const results = []
const ok = (name, cond, detail = '') => {
	results.push({ name, pass: !!cond, detail })
	console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
}
const money = (s) => {
	const m = String(s).replace(/\s/g, ' ').match(/-?[\d.]+,\d{2}/)
	return m ? Number(m[0].replace(/\./g, '').replace(',', '.')) : NaN
}

const browser = await chromium.launch({ executablePath: exe })
const context = await browser.newContext({
	viewport: { width: 390, height: 844 },
	deviceScaleFactor: 2,
	locale: 'it-IT',
	timezoneId: 'Europe/Rome',
	hasTouch: true,
	isMobile: true,
	colorScheme: 'dark',
})

const imageHits = []
let blockApi = false
await context.route('https://assets.tcgdex.net/**', (route) => {
	const url = new URL(route.request().url())
	imageHits.push(url.pathname)
	const parts = url.pathname.split('/').filter(Boolean)
	const lang = parts[0]
	// German pictures do not exist here: the app must fall back to another language.
	if (lang === 'de') return route.fulfill({ status: 404, body: '' })
	// Italian set logos exist only as png here, as happens now and then on the real server:
	// the app must try the other file format before giving up.
	if (lang === 'it' && /\/logo\.webp$/.test(url.pathname)) return route.fulfill({ status: 404, body: '' })
	const label = parts.slice(1).join(' ')
	const isLogo = /logo|symbol/.test(url.pathname)
	const svg = isLogo
		? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 80"><rect width="200" height="80" rx="12" fill="#2b3a6b"/><text x="100" y="48" font-size="22" fill="#fff" text-anchor="middle" font-family="sans-serif">${parts[2] ?? ''}</text></svg>`
		: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 245 337"><rect width="245" height="337" rx="12" fill="${lang === 'it' ? '#1f6b4f' : lang === 'en' ? '#2b4f8f' : '#7a3f8f'}"/><rect x="16" y="40" width="213" height="150" rx="6" fill="rgba(255,255,255,.18)"/><text x="122" y="26" font-size="16" fill="#fff" text-anchor="middle" font-family="sans-serif">${lang.toUpperCase()}</text><text x="122" y="240" font-size="15" fill="#fff" text-anchor="middle" font-family="sans-serif">${label.replace(/[<&]/g, '')}</text></svg>`
	return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg })
})
const REPLICA = process.env.REPLICA_URL || 'http://127.0.0.1:3111'
await context.route(`${REPLICA}/**`, (route) => (blockApi ? route.abort('internetdisconnected') : route.continue()))
// The published build calls the public catalogue address. From the build machine that address is
// answered by the local copy, so the exact files that get published are the ones being checked.
let liveCalls = 0
await context.route('https://api.tcgdex.net/**', async (route) => {
	if (blockApi) return route.abort('internetdisconnected')
	liveCalls++
	const u = new URL(route.request().url())
	try {
		const res = await context.request.get(REPLICA + u.pathname + u.search)
		await route.fulfill({ response: res })
	} catch {
		await route.abort('failed')
	}
})

const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
page.on('console', (m) => {
	if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errors.push('console: ' + m.text())
})
const shot = (name) => page.screenshot({ path: `${SHOTS}/${name}.png` })
const overflow = async (name) => {
	const o = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
	ok(`nessuno scorrimento orizzontale: ${name}`, o <= 1, o > 1 ? `overflow ${o}px` : '')
}

try {
	// ---------- empty state
	await page.goto(APP)
	await page.waitForSelector('.empty')
	ok('stato iniziale: collezione vuota con invito a cercare', await page.locator('.empty a.btn.primary').isVisible())
	ok('totale a zero', money(await page.locator('[data-testid=total]').innerText()) === 0)
	await shot('01-vuoto')
	await overflow('portfolio vuoto')

	// ---------- search (international: Italian + English merged)
	await page.locator('.tabs a', { hasText: 'Cerca' }).click()
	await page.fill('#search-q', 'charizard')
	await page.waitForSelector('[data-testid=tile]')
	await page.waitForTimeout(1500)
	const nTiles = await page.locator('[data-testid=tile]').count()
	ok('ricerca "charizard": risultati', nTiles >= 30, `${nTiles} tessere mostrate`)
	const countText = await page.locator('[data-testid=result-count]').innerText()
	ok('ricerca: conteggio totale', /\d+ carte/.test(countText), countText)
	const priced = await page.locator('[data-testid=tile] .t-price').evaluateAll((els) => els.filter((e) => /\d,\d{2}/.test(e.textContent)).length)
	ok('ricerca: prezzi caricati sulle tessere visibili', priced >= 6, `${priced} con prezzo`)
	const digital = await page.locator('#search-set option').evaluateAll((os) => os.map((o) => o.textContent).filter((t) => /Genetic Apex|Geni Supremi|Mythical Island/i.test(t)))
	ok('ricerca: nessuna carta digitale (TCG Pocket)', digital.length === 0, digital.join(', '))
	await shot('02-ricerca')
	await overflow('ricerca')

	// ---------- search by name + number
	await page.fill('#search-q', 'charizard 4/102')
	await page.waitForFunction(() => document.querySelectorAll('[data-testid=tile]').length === 1, null, { timeout: 15000 })
	const one = await page.locator('[data-testid=tile]').first().innerText()
	ok('ricerca "charizard 4/102": una sola carta, Set Base', /Set Base/.test(one) && /4\/102/.test(one), one.replace(/\n/g, ' | '))

	// ---------- number only
	await page.fill('#search-q', '4/102')
	await page.waitForFunction(() => [...document.querySelectorAll('[data-testid=tile]')].some((t) => /Charizard/.test(t.textContent)), null, { timeout: 15000 })
	ok('ricerca "4/102": trova Charizard dal solo numero', true)

	// ---------- card page
	await page.fill('#search-q', 'charizard 4/102')
	await page.waitForFunction(() => document.querySelectorAll('[data-testid=tile]').length === 1)
	await page.locator('[data-testid=tile]').first().click()
	await page.waitForSelector('[data-testid=card-price]')
	await page.waitForSelector('[data-testid=price-version]')
	const variantRows = await page.locator('[data-testid=price-version]').count()
	ok('scheda carta: una riga di prezzi per versione', variantRows === 4, `${variantRows} versioni`)
	const rowsText = await page.locator('[data-testid=price-version] .pv-name').allInnerTexts()
	ok('scheda carta: versioni in italiano', rowsText.some((t) => /Shadowless · 1ª edizione/.test(t)) && rowsText.some((t) => /Unlimited/.test(t)), rowsText.join(' / '))
	const cmHref = await page.locator('a.btn', { hasText: 'Cardmarket' }).getAttribute('href')
	ok('scheda carta: link Cardmarket con id prodotto', /cardmarket\.com\/it\/Pokemon\/Products\?idProduct=273699/.test(cmHref), cmHref)
	await shot('03-carta')
	await overflow('scheda carta')

	// ---------- add: Italian, Excellent, paid 180
	await page.locator('[data-testid=add]').click()
	await page.waitForSelector('.sheet')
	ok('modulo: lingua predefinita italiano', (await page.locator('.choice button[aria-pressed=true]').first().innerText()) === 'IT')
	await page.locator('.choice.cond button').filter({ has: page.locator('b', { hasText: /^EX$/ }) }).click()
	await page.fill('#f-buy', '180')
	const calcNM = await page.locator('.calc .small').first().innerText()
	ok('modulo: formula visibile', /× 0,8 \(EX\) × 1 \(IT\)/.test(calcNM), calcNM)
	await shot('04-modulo')
	await page.locator('.sheet footer .btn.primary').click()
	await page.waitForSelector('.sheet', { state: 'detached' })
	await page.waitForSelector('.panel h3:has-text("Nel tuo portfolio")')
	ok('dopo l’aggiunta: la scheda mostra la copia posseduta', true)

	// second copy: English, Near Mint, manual price 520
	await page.locator('[data-testid=add]').click()
	await page.locator('.sheet .choice button', { hasText: /^EN$/ }).click()
	await page.fill('#f-manual', '520')
	await page.locator('.sheet footer .btn.primary').click()
	await page.waitForSelector('.sheet', { state: 'detached' })

	// ---------- portfolio
	await page.locator('.tabs a', { hasText: 'Portfolio' }).click()
	await page.waitForSelector('.rows .row')
	const rowCount = await page.locator('.rows .row').count()
	ok('portfolio: due voci distinte per lingua/condizione', rowCount === 2, `${rowCount} voci`)
	const total1 = money(await page.locator('[data-testid=total]').innerText())
	const rowVals = (await page.locator('.rows .row .val').allInnerTexts()).map(money)
	ok('portfolio: il totale è la somma delle voci', Math.abs(total1 - rowVals.reduce((a, b) => a + b, 0)) < 0.011, `${total1} = ${rowVals.join(' + ')}`)
	ok('portfolio: la copia con prezzo manuale vale 520', rowVals.includes(520))
	await shot('05-portfolio')
	await overflow('portfolio')

	// ---------- multipliers change the value
	const autoBefore = rowVals.find((v) => v !== 520)
	await page.locator('.tabs a', { hasText: 'Altro' }).click()
	await page.fill('#mult-lang-IT', '0,5')
	await page.waitForTimeout(400)
	await overflow('impostazioni')
	await shot('06-impostazioni')
	await page.locator('.tabs a', { hasText: 'Portfolio' }).click()
	await page.waitForSelector('.rows .row')
	const rowVals2 = (await page.locator('.rows .row .val').allInnerTexts()).map(money)
	const autoAfter = rowVals2.find((v) => v !== 520)
	ok('moltiplicatore lingua IT 0,5: il valore della copia italiana si dimezza', Math.abs(autoAfter - autoBefore / 2) <= 0.011, `${autoBefore} → ${autoAfter}`)
	ok('moltiplicatore: la copia con prezzo manuale non cambia', rowVals2.includes(520))

	// ---------- holding page, edit, filtered links
	await page.locator('.rows .row').filter({ has: page.locator('.chip', { hasText: /^IT$/ }) }).first().click()
	await page.waitForSelector('[data-testid=holding-value]')
	const cm2 = await page.locator('.links a.btn', { hasText: 'Cardmarket' }).getAttribute('href')
	ok('copia: link Cardmarket filtrato per italiano ed Excellent', /language=5/.test(cm2) && /minCondition=3/.test(cm2), cm2)
	const eb = await page.locator('a.btn', { hasText: 'Venduti eBay' }).getAttribute('href')
	ok('copia: link ai venduti eBay con nome, numero e lingua', /ebay\.it\/sch/.test(eb) && /LH_Sold=1/.test(eb) && /Charizard\+4%2F102/.test(eb) && /ita/.test(eb), decodeURIComponent(eb))
	const heroSrc = await page.locator('.stage img').getAttribute('src')
	// The catalogue says whether an Italian picture exists; without one the English picture is the right answer.
	const itHasPicture = !!(await (await fetch(`${REPLICA}/v2/it/cards/base1-4`)).json()).image
	ok(
		`copia: immagine ${itHasPicture ? 'italiana' : 'inglese, perché quella italiana non esiste'}`,
		new RegExp(`/${itHasPicture ? 'it' : 'en'}/base/base1/4/high\\.webp`).test(heroSrc),
		heroSrc,
	)
	await shot('07-copia')
	await overflow('copia')
	await page.locator('button[aria-label=Modifica]').click()
	await page.waitForSelector('.sheet')
	await page.locator('.sheet .stepper button[aria-label="Una in più"]').click()
	await page.locator('.sheet footer .btn.primary').click()
	await page.waitForSelector('.sheet', { state: 'detached' })
	const qtyText = await page.locator('.kv').innerText()
	ok('modifica: quantità portata a 2', /Quantità\s*2/.test(qtyText.replace(/\n/g, ' ')))

	// ---------- back button closes a sheet, not the page
	await page.locator('button[aria-label=Modifica]').click()
	await page.waitForSelector('.sheet')
	await page.goBack()
	await page.waitForSelector('.sheet', { state: 'detached' })
	ok('tasto indietro: chiude il modulo e resta sulla copia', await page.locator('[data-testid=holding-value]').isVisible())

	// ---------- persistence across reload
	await page.waitForTimeout(600)
	await page.goto(APP)
	await page.waitForSelector('.rows .row')
	ok('dopo la ricarica: la collezione è ancora lì', (await page.locator('.rows .row').count()) === 2)

	// ---------- sets
	await page.locator('.tabs a', { hasText: 'Set' }).click()
	await page.waitForSelector('.setrow')
	const firstSet = await page.locator('.setrow').first().innerText()
	ok('set: elenco dal più recente', /30th|Celebration|Pitch|Classic/i.test(firstSet), firstSet.replace(/\n/g, ' | '))
	const pngLogo = (s) => /\/it\/.+\/logo\.png$/.test(s)
	const logos = await page
		.waitForFunction(
			() => {
				const shown = [...document.querySelectorAll('.setlogo img')].filter((i) => i.complete && i.naturalWidth > 0).map((i) => i.currentSrc)
				return shown.some((s) => /\/it\/.+\/logo\.png$/.test(s)) ? shown : null
			},
			null,
			{ timeout: 10000 },
		)
		.then((h) => h.jsonValue())
		.catch(() => [])
	ok(
		'set: se un logo manca in un formato uso l’altro',
		logos.some(pngLogo) && imageHits.some((p) => /^\/it\/.+\/logo\.webp$/.test(p)),
		`${logos.filter(pngLogo).length} logo italiani caricati come png`,
	)
	await shot('08-set')
	await page.fill('#sets-q', 'set base')
	await page.waitForTimeout(300)
	await page.locator('a.setrow[href="#/set/int/base1"]').click()
	await page.waitForSelector('[data-testid=tile]')
	const ownedLine = await page.locator('.panel .small.num', { hasText: 'Ne hai' }).first().innerText()
	ok('set: conteggio delle carte possedute', /Ne hai\s*1\s*su\s*102/.test(ownedLine.replace(/\n/g, ' ')), ownedLine)
	ok('set: la carta posseduta ha il contatore', (await page.locator('[data-testid=tile] .badge').count()) === 1)
	await page.waitForTimeout(1200)
	await shot('09-set-dettaglio')
	await overflow('dettaglio set')

	// ---------- a card with no Italian picture falls back to the English one
	const fallback = await page.locator('[data-testid=tile] img').evaluateAll((imgs) => imgs.map((i) => i.getAttribute('src')))
	ok('immagini: senza foto italiana uso quella inglese', fallback.some((s) => /\/en\//.test(s)) && fallback.some((s) => /\/it\//.test(s)), `${fallback.filter((s) => /\/en\//.test(s)).length} EN, ${fallback.filter((s) => /\/it\//.test(s)).length} IT`)

	// ---------- Japanese catalogue: Latin name → species → cards
	await page.locator('.tabs a', { hasText: 'Cerca' }).click()
	await page.locator('.seg button', { hasText: 'Giapponese' }).click()
	await page.fill('#search-q', 'charizard')
	await page.waitForSelector('[data-testid=tile]', { timeout: 15000 })
	await page.waitForTimeout(1200)
	const jaFirst = await page.locator('[data-testid=tile]').first().innerText()
	ok('catalogo giapponese: "charizard" trova le carte giapponesi', /リザードン/.test(jaFirst) && /Charizard/.test(jaFirst), jaFirst.replace(/\n/g, ' | '))
	await shot('10-giapponese')
	await page.locator('[data-testid=tile]').first().click()
	await page.waitForSelector('[data-testid=add]')
	await page.locator('[data-testid=add]').click()
	await page.waitForSelector('.sheet')
	ok('carta giapponese: lingua predefinita JA', (await page.locator('.choice button[aria-pressed=true]').first().innerText()) === 'JA')
	await page.locator('.sheet footer .btn.primary').click()
	await page.waitForSelector('.sheet', { state: 'detached' })

	// ---------- a German copy: the German picture is missing, another language is shown
	await page.locator('.tabs a', { hasText: 'Cerca' }).click()
	await page.locator('.seg button', { hasText: 'Internazionale' }).click()
	await page.fill('#search-q', 'pikachu 58/102')
	await page.waitForFunction(() => document.querySelectorAll('[data-testid=tile]').length === 1, null, { timeout: 15000 })
	await page.locator('[data-testid=tile]').first().click()
	await page.locator('[data-testid=add]').click()
	await page.locator('.sheet .choice button', { hasText: /^DE$/ }).click()
	await page.locator('.sheet .choice.cond button').filter({ has: page.locator('b', { hasText: /^PL$/ }) }).click()
	await page.locator('.sheet footer .btn.primary').click()
	await page.waitForSelector('.sheet', { state: 'detached' })
	await page.locator('.tabs a', { hasText: 'Portfolio' }).click()
	await page.waitForSelector('.rows .row')
	await page.locator('.rows .row', { hasText: 'Pikachu' }).click()
	await page.waitForSelector('.stage img')
	await page.waitForFunction(() => document.querySelector('.stage img')?.naturalWidth > 0, null, { timeout: 8000 })
	const deSrc = await page.locator('.stage img').getAttribute('src')
	ok('copia tedesca: foto tedesca assente, mostro un’altra lingua', !/\/de\//.test(deSrc) && imageHits.some((p) => p.startsWith('/de/')), deSrc)

	// ---------- filters and grid view
	await page.locator('.tabs a', { hasText: 'Portfolio' }).click()
	await page.waitForSelector('.rows .row')
	ok('portfolio: quattro voci', (await page.locator('.rows .row').count()) === 4)
	await page.selectOption('#pf-lang', 'JA')
	ok('filtro lingua: solo la giapponese', (await page.locator('.rows .row').count()) === 1)
	await page.selectOption('#pf-lang', '')
	await page.fill('#pf-search', 'pika')
	ok('ricerca nella collezione', (await page.locator('.rows .row').count()) === 1)
	await page.fill('#pf-search', '')
	await page.locator('#pf-grid').check()
	await page.waitForSelector('.grid .tile')
	await shot('11-griglia')
	await overflow('portfolio a griglia')
	await page.locator('#pf-grid').uncheck()

	// ---------- offline: last saved prices stay, with a notice
	const totalOnline = money(await page.locator('[data-testid=total]').innerText())
	blockApi = true
	await page.locator('button[aria-label="Aggiorna i prezzi"]').click()
	await page.waitForSelector('.notice.warn', { timeout: 15000 })
	const totalOffline = money(await page.locator('[data-testid=total]').innerText())
	ok('offline: il totale resta quello salvato e compare l’avviso', totalOffline === totalOnline, `${totalOnline} → ${totalOffline}`)
	await shot('12-offline')
	blockApi = false
	await page.locator('.notice.warn .btn').click()
	await page.waitForSelector('.notice.warn', { state: 'detached', timeout: 15000 })
	ok('di nuovo online: l’aggiornamento riesce e l’avviso sparisce', true)

	// ---------- backup: export, wipe, import
	const backup = await page.evaluate(async () => {
		const open = (name) => new Promise((res, rej) => { const r = indexedDB.open(name); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
		const db = await open('raccoglitore')
		const get = (k) => new Promise((res) => { const r = db.transaction('kv').objectStore('kv').get(k); r.onsuccess = () => res(r.result) })
		return { holdings: await get('holdings'), settings: await get('settings'), snapshots: await get('snapshots') }
	})
	ok('salvataggio: 4 voci e 1 rilevazione giornaliera nel database del telefono', backup.holdings?.length === 4 && backup.snapshots?.length === 1, `${backup.holdings?.length} voci, ${backup.snapshots?.length} rilevazioni`)
	await page.locator('.tabs a', { hasText: 'Altro' }).click()
	const [download] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }).catch(() => null), page.locator('button', { hasText: 'Crea backup' }).click()])
	let file = null
	if (download) {
		file = `${SHOTS}/backup.json`
		await download.saveAs(file)
	}
	ok('backup: il file viene creato', !!file)
	await page.locator('button', { hasText: 'Svuota la collezione' }).click()
	await page.locator('button', { hasText: 'Tocca di nuovo' }).click()
	await page.locator('.tabs a', { hasText: 'Portfolio' }).click()
	await page.waitForSelector('.empty')
	ok('svuota: collezione vuota', true)
	if (file) {
		await page.locator('.tabs a', { hasText: 'Altro' }).click()
		await page.setInputFiles('#backup-file', file)
		await page.locator('button', { hasText: 'Sostituisci tutto' }).click()
		await page.locator('.tabs a', { hasText: 'Portfolio' }).click()
		await page.waitForSelector('.rows .row')
		await page.waitForFunction(() => !document.querySelector('.loadbar'), null, { timeout: 20000 })
		const restored = money(await page.locator('[data-testid=total]').innerText())
		ok('ripristino: stesse voci e stesso totale', (await page.locator('.rows .row').count()) === 4 && Math.abs(restored - totalOnline) < 0.011, `${restored} (prima ${totalOnline})`)
	}

	// ---------- delete a holding
	await page.locator('.rows .row', { hasText: 'Pikachu' }).click()
	await page.locator('[data-testid=delete]').click()
	await page.locator('[data-testid=delete]').click()
	await page.waitForSelector('.rows .row')
	ok('elimina: la voce sparisce e torno al portfolio', (await page.locator('.rows .row').count()) === 3)

	// ---------- connection check
	await page.locator('.tabs a', { hasText: 'Altro' }).click()
	await page.locator('[data-testid=probe]').click()
	await page.waitForSelector('[data-testid=probe-result]', { timeout: 15000 })
	const probe = await page.locator('[data-testid=probe-result]').innerText()
	ok('verifica del collegamento: catalogo e listino raggiunti', /Catalogo raggiungibile/.test(probe) && /Listino Cardmarket (di|del|dell’)/.test(probe), probe)
	const build = (await page.locator('[data-testid=build]').innerText()).trim()
	ok('data della versione scritta in italiano corretto', /^Versione (di oggi|di ieri|del \d|dell’\d)/.test(build), build)
	await page.locator('.tabs a', { hasText: 'Portfolio' }).click()
	await page.waitForSelector('.rows .row')

	// ---------- the three large panels can be reached from the dots under them
	await page.locator('.pager button').nth(2).click()
	await page.waitForFunction(() => /Andamento dei prezzi/.test(document.querySelector('.deckcap b')?.textContent ?? ''), null, { timeout: 5000 })
	await page.locator('.pager button').nth(0).click()
	await page.waitForFunction(() => /Guadagno sul pagato/.test(document.querySelector('.deckcap b')?.textContent ?? ''), null, { timeout: 5000 })
	ok('riepilogo: i tre pannelli si raggiungono dai puntini', true)
	await page.locator('.pager button').nth(1).click()
	await overflow('portfolio con i pannelli')
} catch (err) {
	ok('esecuzione completa', false, String(err?.message ?? err).split('\n')[0])
	await shot('99-errore').catch(() => {})
}

ok('nessun errore JavaScript in pagina', errors.length === 0, errors.slice(0, 3).join(' | '))
if (liveCalls) console.log(`(${liveCalls} richieste all’indirizzo pubblico del catalogo, servite dalla copia locale)`)
await browser.close()
const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} controlli superati`)
process.exit(failed.length ? 1 : 0)
