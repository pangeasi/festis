import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentProps } from 'react';
import {
  ArrowLeft,
  CalendarDays,
  ExternalLink,
  Facebook,
  Globe2,
  Instagram,
  ListMusic,
  MapPin,
  Mic2,
  Music2,
  ReceiptText,
  SlidersHorizontal,
  Ticket,
  Twitter,
  X,
  Youtube,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { EmptyState } from './components/EmptyState';
import { FestivalGrid } from './components/FestivalGrid';
import { ResultsHeader } from './components/ResultsHeader';
import { SearchPanel } from './components/SearchPanel';
import { trackEvent } from './analytics';
import { festivals } from './data';
import { useFestivalFilters } from './hooks/useFestivalFilters';
import type { Festival } from './types';
import { formatFestivalDate, getFallbackStyle } from './utils/festival';

type AppProps = {
  initialUrl?: string;
};

type SearchPanelSharedProps = ComponentProps<typeof SearchPanel>;

type FiltersDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  searchPanelProps: SearchPanelSharedProps;
};

function getInitialUrl(initialUrl?: string) {
  if (initialUrl) return initialUrl;
  if (typeof window === 'undefined') return '/';
  return `${window.location.pathname}${window.location.search}`;
}

function getFestivalSlug(initialUrl?: string) {
  const pathname = new URL(getInitialUrl(initialUrl), 'http://localhost').pathname;
  const match = pathname.match(/^\/festival\/([^/]+)\/?$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function FiltersDrawer({ isOpen, onClose, searchPanelProps }: FiltersDrawerProps) {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="filters-drawer-overlay" onClick={onClose}>
      <aside
        aria-label="Buscador y filtros"
        className="filters-drawer"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="filters-drawer-header">
          <div>
            <h2>Buscar festivales</h2>
            {searchPanelProps.activeFilters > 0 && (
              <small>{searchPanelProps.activeFilters} filtros activos</small>
            )}
          </div>
          <button aria-label="Cerrar filtros" onClick={onClose} type="button">
            <X size={20} />
          </button>
        </div>
        <SearchPanel {...searchPanelProps} forceExpanded />
      </aside>
    </div>
  );
}

function getExternalUrl(value: string | null | undefined) {
  if (!value) return null;

  try {
    const { hostname } = new URL(value);
    if (hostname === 'modofestival.es' || hostname === 'www.modofestival.es') return null;
    return value;
  } catch {
    return null;
  }
}

function getProgramTitle(item: NonNullable<Festival['program']>[number]) {
  return item.artist || item.title || 'Actuacion pendiente';
}

function getSocialLabel(platform: string) {
  const normalizedPlatform = platform.trim().toLowerCase();
  const socialLabels: Record<string, string> = {
    facebook: 'Facebook',
    instagram: 'Instagram',
    tiktok: 'TikTok',
    twitter: 'X',
    x: 'X',
    youtube: 'YouTube',
  };

  return socialLabels[normalizedPlatform] ?? platform;
}

function getSocialIcon(platform: string): LucideIcon {
  const normalizedPlatform = platform.trim().toLowerCase();
  const socialIcons: Record<string, LucideIcon> = {
    facebook: Facebook,
    instagram: Instagram,
    tiktok: Music2,
    twitter: Twitter,
    x: Twitter,
    youtube: Youtube,
  };

  return socialIcons[normalizedPlatform] ?? ExternalLink;
}

function BackToDirectoryButton() {
  function handleBackClick() {
    if (typeof window === 'undefined') return;

    if (window.history.length <= 1) {
      window.location.href = '/';
      return;
    }

    window.history.back();
  }

  return (
    <button className="back-link" type="button" onClick={handleBackClick}>
      <ArrowLeft size={18} />
      Directorio de festivales
    </button>
  );
}

function FestivalDetail({ festival }: { festival: Festival }) {
  const ticketUrl = getExternalUrl(festival.ticket_url);
  const officialUrl = getExternalUrl(festival.official_url || festival.festival_url);
  const socialUrls = (festival.social_urls ?? [])
    .map((social) => ({ ...social, url: getExternalUrl(social.url) }))
    .filter((social): social is { platform: string; url: string } => Boolean(social.url));
  const posterUrl = festival.image_full_url || festival.image_url;
  const ticketPrices = festival.ticket_prices ?? [];
  const program = festival.program ?? [];

  return (
    <main className="app-shell detail-shell">
      <BackToDirectoryButton />

      <article className="festival-detail">
        <div className="detail-poster">
          {posterUrl ? (
            <img alt={festival.image_alt || festival.name} src={posterUrl} />
          ) : (
            <div className="poster-fallback" style={getFallbackStyle(festival.name)}>
              <span className="fallback-mark">{festival.name.slice(0, 2)}</span>
              <span className="fallback-title">{festival.name}</span>
              <span className="fallback-meta">
                {festival.city || festival.region || 'Festival'}
              </span>
            </div>
          )}
        </div>

        <div className="detail-content">
          <p className="eyebrow">Ficha del festival</p>
          <h1>{festival.name}</h1>
          <div className="detail-facts">
            <span>
              <CalendarDays size={18} />
              {formatFestivalDate(festival)}
            </span>
            <span>
              <MapPin size={18} />
              {festival.location || festival.city || festival.region || 'Lugar pendiente'}
            </span>
          </div>

          {festival.description && <p className="detail-description">{festival.description}</p>}

          {festival.artists.length > 0 && (
            <section className="detail-section" aria-labelledby="detail-artists">
              <h2 id="detail-artists">
                <Mic2 size={18} />
                Cartel
              </h2>
              <div className="detail-chip-list">
                {festival.artists.map((artist) => (
                  <span key={artist}>{artist}</span>
                ))}
              </div>
            </section>
          )}

          {festival.styles.length > 0 && (
            <section className="detail-section" aria-labelledby="detail-styles">
              <h2 id="detail-styles">Estilos</h2>
              <div className="style-list">
                {festival.styles.map((style) => (
                  <span key={style}>{style}</span>
                ))}
              </div>
            </section>
          )}

          {(festival.ticket_price_summary || ticketPrices.length > 0) && (
            <section className="detail-section" aria-labelledby="detail-prices">
              <h2 id="detail-prices">
                <ReceiptText size={18} />
                Entradas
              </h2>
              {festival.ticket_price_summary && (
                <p className="detail-muted">{festival.ticket_price_summary}</p>
              )}
              {ticketPrices.length > 0 && (
                <div className="detail-price-list">
                  {ticketPrices.map((price, index) => (
                    <span
                      key={`${price.label ?? 'entrada'}-${price.price_text ?? 'precio'}-${index}`}
                    >
                      <span>{price.label || 'Entrada'}</span>
                      <strong>{price.price_text || 'Precio pendiente'}</strong>
                    </span>
                  ))}
                </div>
              )}
            </section>
          )}

          {program.length > 0 && (
            <section className="detail-section" aria-labelledby="detail-program">
              <h2 id="detail-program">
                <ListMusic size={18} />
                Programacion
              </h2>
              <div className="detail-program-list">
                {program.map((item, index) => (
                  <span
                    key={`${item.date ?? 'fecha'}-${item.time ?? 'hora'}-${getProgramTitle(item)}-${index}`}
                  >
                    <small>{[item.date, item.time].filter(Boolean).join(' · ')}</small>
                    <strong>{getProgramTitle(item)}</strong>
                    {item.stage && <em>{item.stage}</em>}
                  </span>
                ))}
              </div>
            </section>
          )}

          {socialUrls.length > 0 && (
            <section className="detail-section" aria-labelledby="detail-socials">
              <h2 id="detail-socials">
                <Globe2 size={18} />
                Redes
              </h2>
              <div className="detail-social-list">
                {socialUrls.map((social, index) => {
                  const Icon = getSocialIcon(social.platform);
                  const label = getSocialLabel(social.platform);

                  return (
                    <a
                      href={social.url}
                      key={`${social.platform}-${social.url}-${index}`}
                      onClick={() =>
                        trackEvent('social_link_click', {
                          festival_slug: festival.slug,
                          platform: social.platform.trim().toLowerCase(),
                          source: 'detail',
                        })
                      }
                      rel="noreferrer"
                      target="_blank"
                    >
                      <Icon size={17} />
                      {label}
                    </a>
                  );
                })}
              </div>
            </section>
          )}

          <div className="detail-actions">
            {ticketUrl && (
              <a
                href={ticketUrl}
                onClick={() =>
                  trackEvent('ticket_click', { festival_slug: festival.slug, source: 'detail' })
                }
                rel="noreferrer"
                target="_blank"
              >
                <Ticket size={17} />
                Entradas
              </a>
            )}
            {officialUrl && (
              <a
                href={officialUrl}
                onClick={() =>
                  trackEvent('official_link_click', {
                    festival_slug: festival.slug,
                    source: 'detail',
                  })
                }
                rel="noreferrer"
                target="_blank"
              >
                <Globe2 size={17} />
                Web oficial
              </a>
            )}
          </div>
        </div>
      </article>
    </main>
  );
}

function NotFoundFestival() {
  return (
    <main className="app-shell detail-shell">
      <BackToDirectoryButton />
      <section className="empty-state">
        <ExternalLink size={26} />
        <h1>Festival no encontrado</h1>
        <p className="summary">La ficha solicitada no existe o ha cambiado de direccion.</p>
      </section>
    </main>
  );
}

function App({ initialUrl }: AppProps) {
  const stableInitialUrl = useMemo(() => getInitialUrl(initialUrl), [initialUrl]);
  const festivalSlug = useMemo(() => getFestivalSlug(stableInitialUrl), [stableInitialUrl]);
  const selectedFestival = festivalSlug
    ? festivals.find((festival) => festival.slug === festivalSlug) ?? null
    : null;
  const filters = useFestivalFilters(festivals, stableInitialUrl);
  const [isShareCopied, setIsShareCopied] = useState(false);
  const [isFiltersDrawerOpen, setIsFiltersDrawerOpen] = useState(false);
  const [isSearchPanelVisible, setIsSearchPanelVisible] = useState(true);
  const searchPanelRef = useRef<HTMLDivElement>(null);
  const hasTrackedFilterChange = useRef(false);
  const shareResetTimeout = useRef<number | null>(null);
  const closeFiltersDrawer = useCallback(() => setIsFiltersDrawerOpen(false), []);

  useEffect(() => {
    return () => {
      if (shareResetTimeout.current) window.clearTimeout(shareResetTimeout.current);
    };
  }, []);

  useEffect(() => {
    const searchPanel = searchPanelRef.current;

    if (!searchPanel || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsSearchPanelVisible(entry.isIntersecting);
      },
      { threshold: 0 },
    );

    observer.observe(searchPanel);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (festivalSlug) return undefined;

    if (!hasTrackedFilterChange.current) {
      hasTrackedFilterChange.current = true;
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      trackEvent('filter_change', {
        active_filters: filters.activeFilters,
        confirmed_only: filters.confirmedOnly,
        has_date_from: Boolean(filters.dateFrom),
        has_date_to: Boolean(filters.dateTo),
        has_price_filter: filters.maxPrice < filters.priceRange.max,
        has_query: Boolean(filters.query.trim()),
        hide_past: filters.hidePast,
        months_count: filters.selectedMonths.length,
        places_count: filters.selectedPlaces.length,
        query_length: filters.query.trim().length,
        result_count: filters.filteredFestivals.length,
        styles_count: filters.selectedStyles.length,
      });
    }, 500);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [
    festivalSlug,
    filters.activeFilters,
    filters.confirmedOnly,
    filters.dateFrom,
    filters.dateTo,
    filters.filteredFestivals.length,
    filters.hidePast,
    filters.maxPrice,
    filters.priceRange.max,
    filters.query,
    filters.selectedMonths.length,
    filters.selectedPlaces.length,
    filters.selectedStyles.length,
  ]);

  function trackFilterReset(source: 'empty_state' | 'search_panel') {
    trackEvent('filter_reset', {
      active_filters: filters.activeFilters,
      result_count: filters.filteredFestivals.length,
      source,
    });
  }

  function resetFilters(source: 'empty_state' | 'search_panel') {
    trackFilterReset(source);
    filters.resetFilters();
  }

  function openFiltersDrawer() {
    trackEvent('filters_drawer_open', { active_filters: filters.activeFilters });
    setIsFiltersDrawerOpen(true);
  }

  function handleToggleFiltersPanel(expanded: boolean) {
    trackEvent('filters_panel_toggle', {
      active_filters: filters.activeFilters,
      expanded,
    });
  }

  async function handleShareResults() {
    const shareData = {
      text: `${filters.filteredFestivals.length} festivales encontrados`,
      title: 'Resultados de festivales',
      url: filters.shareUrl,
    };

    try {
      if (navigator.share && (!navigator.canShare || navigator.canShare(shareData))) {
        await navigator.share(shareData);
        trackEvent('results_share', {
          active_filters: filters.activeFilters,
          method: 'native_share',
          result_count: filters.filteredFestivals.length,
        });
      } else {
        await navigator.clipboard.writeText(filters.shareUrl);
        trackEvent('results_share', {
          active_filters: filters.activeFilters,
          method: 'clipboard',
          result_count: filters.filteredFestivals.length,
        });
      }

      setIsShareCopied(true);
      if (shareResetTimeout.current) window.clearTimeout(shareResetTimeout.current);
      shareResetTimeout.current = window.setTimeout(() => setIsShareCopied(false), 2200);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      await navigator.clipboard.writeText(filters.shareUrl);
      trackEvent('results_share', {
        active_filters: filters.activeFilters,
        method: 'clipboard',
        result_count: filters.filteredFestivals.length,
      });
      setIsShareCopied(true);
    }
  }

  if (festivalSlug) {
    return selectedFestival ? <FestivalDetail festival={selectedFestival} /> : <NotFoundFestival />;
  }

  const searchPanelProps = {
    activeFilters: filters.activeFilters,
    confirmedOnly: filters.confirmedOnly,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    hidePast: filters.hidePast,
    maxPrice: filters.maxPrice,
    onConfirmedOnlyChange: filters.setConfirmedOnly,
    onDateFromChange: filters.setDateFrom,
    onDateToChange: filters.setDateTo,
    onHidePastChange: filters.setHidePast,
    onMaxPriceChange: filters.setMaxPrice,
    onQueryChange: filters.setQuery,
    onReset: () => resetFilters('search_panel'),
    onSelectedMonthsChange: filters.setSelectedMonths,
    onSelectedPlacesChange: filters.setSelectedPlaces,
    onSelectedStylesChange: filters.setSelectedStyles,
    onToggleFiltersPanel: handleToggleFiltersPanel,
    onToggleValue: filters.toggleValue,
    options: filters.options,
    priceRange: filters.priceRange,
    query: filters.query,
    selectedMonths: filters.selectedMonths,
    selectedPlaces: filters.selectedPlaces,
    selectedStyles: filters.selectedStyles,
  } satisfies SearchPanelSharedProps;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="site-brand">
          <a className="site-logo" href="/" aria-label="Directorio de festivales">
            <img src="/logo/logo.svg" alt="" />
          </a>
          <h1>Directorio de festivales</h1>
        </div>
      </header>

      <div ref={searchPanelRef}>
        <SearchPanel {...searchPanelProps} />
      </div>

      <ResultsHeader
        activeFilters={filters.activeFilters}
        isShareCopied={isShareCopied}
        onShare={handleShareResults}
        resultCount={filters.filteredFestivals.length}
      />

      <FestivalGrid festivals={filters.filteredFestivals} />

      {!filters.filteredFestivals.length && <EmptyState onReset={() => resetFilters('empty_state')} />}

      {!isSearchPanelVisible && !isFiltersDrawerOpen && (
        <button
          aria-label="Abrir buscador y filtros"
          className="floating-filters-button"
          onClick={openFiltersDrawer}
          type="button"
        >
          <SlidersHorizontal size={20} />
          <span>Filtros</span>
          {filters.activeFilters > 0 && <small>{filters.activeFilters}</small>}
        </button>
      )}

      <FiltersDrawer
        isOpen={isFiltersDrawerOpen}
        onClose={closeFiltersDrawer}
        searchPanelProps={searchPanelProps}
      />
    </main>
  );
}

export default App;
