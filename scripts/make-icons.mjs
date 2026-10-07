// Renders public/icon.svg into the PNG sizes the installable app needs.
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright-core'

const exe = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const svg = readFileSync(new URL('../public/icon.svg', import.meta.url), 'utf8')
const browser = await chromium.launch({ executablePath: exe })
const page = await browser.newPage()

async function shot(size, file, { maskable = false, flat = false } = {}) {
	await page.setViewportSize({ width: size, height: size })
	// Maskable icons are cropped to a circle by Android: full-bleed background, artwork inside the safe area.
	const inner = maskable ? svg.replaceAll('rx="112"', 'rx="0"') : flat ? svg.replaceAll('rx="112"', 'rx="0"') : svg
	const scale = maskable ? 0.78 : 1
	await page.setContent(
		`<body style="margin:0;background:${maskable || flat ? '#000000' : 'transparent'};display:grid;place-items:center;width:${size}px;height:${size}px">
		   <div style="width:${size * scale}px;height:${size * scale}px">${inner}</div></body>`,
	)
	await page.screenshot({ path: new URL(`../public/${file}`, import.meta.url).pathname, omitBackground: !maskable && !flat })
}

await shot(192, 'icon-192.png')
await shot(512, 'icon-512.png')
await shot(512, 'icon-maskable-512.png', { maskable: true })
await shot(180, 'apple-touch-icon.png', { flat: true })
await browser.close()
console.log('icons written')
