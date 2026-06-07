import { useEffect, useMemo, useRef, useState } from 'react';
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
  Ticket,
  Twitter,
  Youtube,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { EmptyState } from './components/EmptyState';
import { FestivalGrid } from './components/FestivalGrid';
import { ResultsHeader } from './components/ResultsHeader';
import { SearchPanel } from './components/SearchPanel';
import { festivals } from './data';
import { useFestivalFilters } from './hooks/useFestivalFilters';
import type { Festival } from './types';
import { formatFestivalDate, getFallbackStyle } from './utils/festival';

type AppProps = {
  initialUrl?: string;
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
              <a href={ticketUrl} rel="noreferrer" target="_blank">
                <Ticket size={17} />
                Entradas
              </a>
            )}
            {officialUrl && (
              <a href={officialUrl} rel="noreferrer" target="_blank">
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
  const shareResetTimeout = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (shareResetTimeout.current) window.clearTimeout(shareResetTimeout.current);
    };
  }, []);

  async function handleShareResults() {
    const shareData = {
      text: `${filters.filteredFestivals.length} festivales encontrados`,
      title: 'Resultados de festivales',
      url: filters.shareUrl,
    };

    try {
      if (navigator.share && (!navigator.canShare || navigator.canShare(shareData))) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(filters.shareUrl);
      }

      setIsShareCopied(true);
      if (shareResetTimeout.current) window.clearTimeout(shareResetTimeout.current);
      shareResetTimeout.current = window.setTimeout(() => setIsShareCopied(false), 2200);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      await navigator.clipboard.writeText(filters.shareUrl);
      setIsShareCopied(true);
    }
  }

  if (festivalSlug) {
    return selectedFestival ? <FestivalDetail festival={selectedFestival} /> : <NotFoundFestival />;
  }

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

      <SearchPanel
        activeFilters={filters.activeFilters}
        confirmedOnly={filters.confirmedOnly}
        dateFrom={filters.dateFrom}
        dateTo={filters.dateTo}
        hidePast={filters.hidePast}
        maxPrice={filters.maxPrice}
        onConfirmedOnlyChange={filters.setConfirmedOnly}
        onDateFromChange={filters.setDateFrom}
        onDateToChange={filters.setDateTo}
        onHidePastChange={filters.setHidePast}
        onMaxPriceChange={filters.setMaxPrice}
        onQueryChange={filters.setQuery}
        onReset={filters.resetFilters}
        onSelectedMonthsChange={filters.setSelectedMonths}
        onSelectedPlacesChange={filters.setSelectedPlaces}
        onSelectedStylesChange={filters.setSelectedStyles}
        onToggleValue={filters.toggleValue}
        options={filters.options}
        priceRange={filters.priceRange}
        query={filters.query}
        selectedMonths={filters.selectedMonths}
        selectedPlaces={filters.selectedPlaces}
        selectedStyles={filters.selectedStyles}
      />

      <ResultsHeader
        activeFilters={filters.activeFilters}
        isShareCopied={isShareCopied}
        onShare={handleShareResults}
        resultCount={filters.filteredFestivals.length}
      />

      <FestivalGrid festivals={filters.filteredFestivals} />

      {!filters.filteredFestivals.length && <EmptyState onReset={filters.resetFilters} />}
    </main>
  );
}

export default App;
