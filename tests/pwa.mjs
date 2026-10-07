// Checks the two ways of running outside a normal web page:
//  1. installed app: the service worker caches the app, which then opens with no network at all;
//  2. single file: the one-file build opened straight from disk works and keeps its data.
import { chromium } from 'playwright-core'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const exe = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const APP = process.env.APP_URL || 'http://localhost:4174/'
const REPLICA = process.env.REPLICA_URL || 'http://127.0.0.1:3111'
let failed = 0
const ok = (name, cond, detail = '') => {
	if (!cond) failed++
	console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
}

async function wire(context) {
	await context.route('https://assets.tcgdex.net/**', (r) =>
		r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 245 337"><rect width="245" height="337" fill="#2b4f8f"/></svg>' }),
	)
	await context.route('https://api.tcgdex.net/**', async (route) => {
		const u = new URL(route.request().url())
		try {
			await route.fulfill({ response: await context.request.get(REPLICA + u.pathname + u.search) })
		} catch {
			await route.abort('failed')
		}
	})
}

async function addOne(page) {
	await page.locator('.tabs a', { hasText: 'Cerca' }).click()
	await page.fill('#search-q', 'pikachu 58/102')
	await page.waitForFunction(() => document.querySelectorAll('[data-testid=tile]').length === 1, null, { timeout: 20000 })
	await page.locator('[data-testid=tile]').first().click()
	await page.locator('[data-testid=add]').click()
	await page.locator('.sheet footer .btn.primary').click()
	await page.waitForSelector('.sheet', { state: 'detached' })
	await page.locator('.tabs a', { hasText: 'Portfolio' }).click()
	await page.waitForSelector('.rows .row')
}

const browser = await chromium.launch({ executablePath: exe })

// ---------- 1. installed app, offline
{
	const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'it-IT' })
	await wire(context)
	const page = await context.newPage()
	await page.goto(APP)
	const sw = await page.evaluate(async () => {
		if (!('serviceWorker' in navigator)) return 'unsupported'
		const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(() => r(null), 15000))])
		return reg ? 'ready' : 'timeout'
	})
	ok('service worker attivo', sw === 'ready', sw)
	const manifest = await page.evaluate(async () => {
		const link = document.querySelector('link[rel=manifest]')
		if (!link) return null
		return (await fetch(link.href)).json()
	})
	ok('manifest: nome, avvio e icone per l’installazione', manifest?.name === 'Raccoglitore' && manifest?.display === 'standalone' && manifest?.icons?.length === 3, JSON.stringify(manifest?.icons?.map((i) => i.sizes)))
	await addOne(page)
	await page.waitForTimeout(800)
	await context.setOffline(true)
	await context.unroute('https://api.tcgdex.net/**')
	await context.route('https://api.tcgdex.net/**', (r) => r.abort('internetdisconnected'))
	await page.reload()
	await page.waitForSelector('.rows .row', { timeout: 15000 })
	ok('senza rete: l’app si apre e mostra la collezione con i prezzi salvati', /\d,\d{2}/.test(await page.locator('[data-testid=total]').innerText()))
	await context.close()
}

// ---------- 2. single file opened from disk
{
	const file = pathToFileURL(resolve('dist-single/index.html')).href
	const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'it-IT' })
	await wire(context)
	const page = await context.newPage()
	const errors = []
	page.on('pageerror', (e) => errors.push(e.message))
	await page.goto(file)
	await page.waitForSelector('.empty')
	await addOne(page)
	await page.waitForTimeout(800)
	await page.goto(file)
	await page.waitForSelector('.rows .row', { timeout: 15000 })
	ok('file singolo aperto dal disco: ricerca, aggiunta e salvataggio funzionano', errors.length === 0, errors.join(' | '))
	const w = await page.evaluate(() => document.querySelector('.app').getBoundingClientRect().width)
	ok('su schermo grande il contenuto resta in una colonna leggibile', w <= 680, `${w}px`)
	await page.screenshot({ path: (process.env.SHOTS_DIR || 'test-shots') + '/20-desktop.png' })
	await context.close()
}

await browser.close()
process.exit(failed ? 1 : 0)
