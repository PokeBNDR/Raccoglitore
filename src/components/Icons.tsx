import type { ReactNode } from 'react'

const svg = (children: ReactNode) => (
	<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
		{children}
	</svg>
)

export const IconPortfolio = () =>
	svg(
		<>
			<rect x="8" y="3.5" width="11.5" height="15.5" rx="2" />
			<path d="M4.5 7v11.5a2 2 0 0 0 2 2H15" />
		</>,
	)
export const IconSearch = () =>
	svg(
		<>
			<circle cx="11" cy="11" r="6.5" />
			<path d="M20 20l-4.2-4.2" />
		</>,
	)
export const IconSets = () =>
	svg(
		<>
			<rect x="4" y="4" width="7" height="7" rx="1.5" />
			<rect x="13" y="4" width="7" height="7" rx="1.5" />
			<rect x="4" y="13" width="7" height="7" rx="1.5" />
			<rect x="13" y="13" width="7" height="7" rx="1.5" />
		</>,
	)
export const IconSettings = () =>
	svg(
		<>
			<path d="M4 7h9M19 7h1M4 17h1M11 17h9" />
			<circle cx="16" cy="7" r="2.5" />
			<circle cx="8" cy="17" r="2.5" />
		</>,
	)
export const IconRefresh = () =>
	svg(
		<>
			<path d="M19.5 12a7.5 7.5 0 0 1-13.2 4.9" />
			<path d="M4.5 12a7.5 7.5 0 0 1 13.2-4.9" />
			<path d="M17.5 3.5v4h-4" />
			<path d="M6.5 20.5v-4h4" />
		</>,
	)
export const IconBack = () => svg(<path d="M19 12H5.5M11 6.5 5.5 12l5.5 5.5" />)
export const IconPlus = () => svg(<path d="M12 5v14M5 12h14" />)
export const IconClose = () => svg(<path d="M6 6l12 12M18 6L6 18" />)
export const IconExternal = () =>
	svg(
		<>
			<path d="M14 5h5v5" />
			<path d="M19 5l-8 8" />
			<path d="M18 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4" />
		</>,
	)
export const IconEdit = () =>
	svg(
		<>
			<path d="M4 20h4l10.5-10.5-4-4L4 16v4z" />
			<path d="M13 7l4 4" />
		</>,
	)
export const IconTrash = () =>
	svg(
		<>
			<path d="M5 7h14" />
			<path d="M9 7V4.5h6V7" />
			<path d="M7 7l1 12.5h8L17 7" />
		</>,
	)
export const IconList = () => svg(<path d="M9 7h11M9 12h11M9 17h11M4.5 7h.01M4.5 12h.01M4.5 17h.01" />)
export const IconGrid = () =>
	svg(
		<>
			<rect x="5" y="4" width="6" height="8" rx="1" />
			<rect x="13" y="4" width="6" height="8" rx="1" />
			<path d="M5 15.5h6M13 15.5h6M5 19h4M13 19h4" />
		</>,
	)
export const IconCopy = () =>
	svg(
		<>
			<rect x="8" y="8" width="11" height="12" rx="2" />
			<path d="M5 16V6a2 2 0 0 1 2-2h8" />
		</>,
	)
export const IconArrowOut = () => svg(<path d="M8 16 16.5 7.5M9.5 7.5h7v7" />)
export const IconInfo = () =>
	svg(
		<>
			<path d="M12 3.2 19.6 7.6v8.8L12 20.8 4.4 16.4V7.6z" />
			<path d="M12 11v5M12 8.2v.01" />
		</>,
	)
export const IconSwap = () =>
	svg(
		<>
			<path d="M5 9.5A7.5 7.5 0 0 1 18.4 7.6L20 9.5" />
			<path d="M20 5.5v4h-4" />
			<path d="M19 14.5A7.5 7.5 0 0 1 5.6 16.4L4 14.5" />
			<path d="M4 18.5v-4h4" />
		</>,
	)
