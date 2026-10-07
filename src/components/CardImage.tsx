import { useEffect, useMemo, useState } from 'react'
import { LANGS } from '../lib/labels'
import { imageCandidates } from '../lib/tcgdex'
import type { Catalog, LangCode } from '../lib/types'

interface Props {
	images: Record<string, string>
	/** Language of the physical card: its own picture is tried first. */
	lang?: LangCode
	catalog?: Catalog
	quality?: 'low' | 'high'
	alt: string
	hero?: boolean
	eager?: boolean
}

/** Card picture with fallbacks: other languages first, then a named placeholder. */
export function CardImage({ images, lang, catalog, quality = 'low', alt, hero, eager }: Props) {
	const key = Object.entries(images)
		.map(([k, v]) => `${k}=${v}`)
		.join('|')
	const urls = useMemo(() => {
		const prefer = lang ? (LANGS.find((l) => l.code === lang)?.img ?? []) : []
		const first = catalog && catalog !== 'int' ? [catalog, ...prefer] : prefer
		return imageCandidates(images, first, quality)
		// `key` stands for the content of `images`
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [key, lang, catalog, quality])
	const [i, setI] = useState(0)
	useEffect(() => setI(0), [urls])
	const src = urls[i]
	return (
		<div className={'cardimg' + (hero ? ' big' : '')}>
			{src ? (
				<img
					src={src}
					alt={alt}
					loading={eager ? 'eager' : 'lazy'}
					decoding="async"
					draggable={false}
					onError={() => setI((n) => n + 1)}
				/>
			) : (
				<div className="ph" role="img" aria-label={alt}>
					{alt}
				</div>
			)}
		</div>
	)
}
