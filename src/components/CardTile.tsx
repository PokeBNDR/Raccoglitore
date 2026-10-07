import type { RefObject } from 'react'
import { eur } from '../lib/format'
import { useLazyCard } from '../lib/hooks'
import { cardNumber } from '../lib/labels'
import { basePrice } from '../lib/pricing'
import { href } from '../lib/router'
import { useStore } from '../lib/store'
import { defaultVariant } from '../lib/tcgdex'
import type { CardBrief, SetBrief } from '../lib/types'
import { CardImage } from './CardImage'

interface Props {
	brief: CardBrief
	set?: SetBrief
	/** Inside a set page the set name is redundant: show only the number. */
	hideSet?: boolean
}

/** A catalogue card in a grid: picture, name, number, Cardmarket price and how many you own. */
export function CardTile({ brief, set, hideSet }: Props) {
	const basis = useStore((s) => s.settings.basis)
	const holdings = useStore((s) => s.holdings)
	const { ref, card } = useLazyCard(brief.catalog, brief.id)
	const owned = holdings.reduce((n, h) => (h.catalog === brief.catalog && h.cardId === brief.id ? n + h.qty : n), 0)
	const price = card ? basePrice(card, defaultVariant(card), basis).value : null
	// The search may know the card only by its Italian record, which can lack a picture.
	const images = card ? { ...card.images, ...brief.images } : brief.images
	const number = cardNumber(brief.localId, set?.official)
	return (
		<a
			className="tile"
			href={href('carta', brief.catalog, brief.id)}
			ref={ref as RefObject<HTMLAnchorElement>}
			data-testid="tile"
		>
			<CardImage images={images} catalog={brief.catalog} alt={brief.name} />
			{owned > 0 ? (
				<span className="badge" title={`Ne hai ${owned}`}>
					{owned}
				</span>
			) : null}
			<span className="t-name">{brief.name}</span>
			{brief.catalog !== 'int' && brief.nameAlt ? <span className="t-sub">{brief.nameAlt}</span> : null}
			<span className="t-sub">{hideSet || !set ? number : `${number} · ${set.name}`}</span>
			<span className="t-price num">
				{card === undefined ? <span className="muted">…</span> : price != null ? eur(price) : <span className="muted">—</span>}
			</span>
		</a>
	)
}
