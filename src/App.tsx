import { IconPortfolio, IconSearch, IconSets, IconSettings } from './components/Icons'
import { Toaster } from './components/Toast'
import { href, useRoute } from './lib/router'
import type { Catalog } from './lib/types'
import { CardView } from './views/CardView'
import { HoldingView } from './views/HoldingView'
import { PortfolioView } from './views/PortfolioView'
import { SearchView } from './views/SearchView'
import { SettingsView } from './views/SettingsView'
import { SetView, SetsView } from './views/SetsView'

const CATALOG_CODES = ['int', 'ja', 'ko', 'zh-tw', 'zh-cn']
const asCatalog = (s: string | undefined): Catalog => (s && CATALOG_CODES.includes(s) ? (s as Catalog) : 'int')

export function App() {
	const route = useRoute()
	const [page, a, b] = route
	let view
	let tab: 'portfolio' | 'cerca' | 'set' | 'altro' = 'portfolio'
	if (page === 'cerca') {
		view = <SearchView />
		tab = 'cerca'
	} else if (page === 'carta' && a && b) {
		view = <CardView key={`${a}:${b}`} catalog={asCatalog(a)} id={b} />
		tab = 'cerca'
	} else if (page === 'prodotto' && a) {
		view = <CardView key={`sealed:${a}`} catalog="sealed" id={a} />
		tab = 'cerca'
	} else if (page === 'set' && a && b) {
		view = <SetView key={`${a}:${b}`} catalog={asCatalog(a)} id={b} />
		tab = 'set'
	} else if (page === 'set') {
		view = <SetsView />
		tab = 'set'
	} else if (page === 'copia' && a) {
		view = <HoldingView key={a} id={a} />
	} else if (page === 'altro') {
		view = <SettingsView />
		tab = 'altro'
	} else {
		view = <PortfolioView />
	}

	const tabs = [
		{ key: 'portfolio', label: 'Portfolio', to: href(), icon: <IconPortfolio /> },
		{ key: 'cerca', label: 'Cerca', to: href('cerca'), icon: <IconSearch /> },
		{ key: 'set', label: 'Set', to: href('set'), icon: <IconSets /> },
		{ key: 'altro', label: 'Altro', to: href('altro'), icon: <IconSettings /> },
	]

	return (
		<div className="app">
			{view}
			<nav className="tabs" aria-label="Sezioni">
				<div className="inner">
					{tabs.map((t) => (
						<a key={t.key} className="tab" href={t.to} title={t.label} aria-current={tab === t.key ? 'page' : undefined}>
							{t.icon}
							<span className="sr">{t.label}</span>
						</a>
					))}
				</div>
			</nav>
			<Toaster />
		</div>
	)
}
