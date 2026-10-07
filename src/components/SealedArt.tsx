import { eur } from '../lib/format'
import { basePrice } from '../lib/pricing'
import { href } from '../lib/router'
import { catInfo, sealedCard, type Glyph, type SealedProduct } from '../lib/sealed'
import { useStore } from '../lib/store'
import type { LangCode, SealedRef, Source } from '../lib/types'
import { CardImage } from './CardImage'

// Outlines drawn as rows of dots, like the rest of the app. Cardmarket's product photos cannot be
// shown outside its own site, so each kind of product gets a drawing instead.
const PATHS: Record<Glyph, string> = {
	pack: 'M13 13H35V53H13Z M13 19H35 M13 47H35 M24 28a5 5 0 1 0 .01 0',
	box: 'M8 30H40V52H8Z M8 30L13 19H35L40 30 M17 30V23 M24 30V22 M31 30V23',
	etb: 'M12 13H36V55H12Z M12 23H36 M24 33a6 6 0 1 0 .01 0',
	gift: 'M7 17H41V51H7Z M11 21H25V47H11Z M29 25H37 M29 31H37 M29 37H37',
	tin: 'M12 18h24a5 5 0 0 1 5 5v22a5 5 0 0 1 -5 5h-24a5 5 0 0 1 -5 -5v-22a5 5 0 0 1 5 -5z M7 28H41',
	deck: 'M11 13H32V55H11Z M11 21H32 M32 18L39 20V51L32 53',
	coin: 'M24 19a14 14 0 1 0 .01 0 M24 25a8 8 0 1 0 .01 0',
	other: 'M10 18H38V52H10Z M10 27H38 M21 27V35H27V27',
}

interface ArtProps {
	cat?: number
	/** Name of the kind of product, for the kinds this app has no Italian name for. */
	kind?: string
	hero?: boolean
	label?: string
}

/** The picture of a sealed product: a drawing of what kind of product it is. */
export function SealedArt({ cat, kind, hero, label }: ArtProps) {
	const info = catInfo(cat, kind)
	return (
		<div className={'cardimg sealedart' + (hero ? ' big' : '')} role="img" aria-label={label ?? info.one}>
			<svg viewBox="0 0 48 66" aria-hidden="true">
				<path d={PATHS[info.glyph]} />
			</svg>
			{hero ? <span className="kind">{info.one}</span> : null}
		</div>
	)
}

interface ImageProps {
	catalog: Source
	sealed?: SealedRef
	/** Kind of product as saved on the entry (its "rarity" line). */
	kind?: string
	images: Record<string, string>
	lang?: LangCode
	quality?: 'low' | 'high'
	alt: string
	hero?: boolean
	eager?: boolean
}

/** Picture of anything that can be in the collection: the card's photo, or the drawing of a sealed product. */
export function ItemImage({ catalog, sealed, kind, images, lang, quality, alt, hero, eager }: ImageProps) {
	if (catalog === 'sealed') return <SealedArt cat={sealed?.cat} kind={kind} hero={hero} label={alt} />
	return <CardImage images={images} lang={lang} catalog={catalog} quality={quality} alt={alt} hero={hero} eager={eager} />
}

/** A sealed product in a list: drawing, name, expansion and kind, Cardmarket price, how many you own. */
export function SealedRow({ product, showExpansion, setName }: { product: SealedProduct; showExpansion?: boolean; setName?: string }) {
	const basis = useStore((s) => s.settings.basis)
	const owned = useStore((s) => s.holdings.reduce((n, h) => (h.catalog === 'sealed' && h.cardId === String(product.id) ? n + h.qty : n), 0))
	const card = sealedCard(product, 0)
	const price = basePrice(card, card.variants[0], basis).value
	// Never sold on Cardmarket: all there is, is what a seller is asking.
	const asking = price == null ? (product.cm.low ?? null) : null
	return (
		<a className="row" href={href('prodotto', String(product.id))} data-testid="sealed-row">
			<SealedArt cat={product.cat} kind={product.kind.one} />
			<span className="mid">
				<span className="name wrap">{product.name}</span>
				<span className="sub">
					{showExpansion && (setName || product.expName) ? `${setName || product.expName} · ${product.kind.one}` : product.kind.one}
				</span>
			</span>
			<span className="end num">
				<span className="val">{price != null ? eur(price) : <span className="muted">—</span>}</span>
				{asking != null ? <span className="pl muted">offerte da {eur(asking)}</span> : null}
				{owned > 0 ? <span className="pl">ne hai {owned}</span> : null}
			</span>
		</a>
	)
}
