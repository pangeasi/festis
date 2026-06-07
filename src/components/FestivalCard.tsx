import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode, RefObject, WheelEvent } from 'react';
import {
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
  Share2,
  ShieldCheck,
  Ticket,
  Twitter,
  Youtube,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Festival } from '../types';
import {
  formatFestivalDate,
  getCountdownLabel,
  getFallbackStyle,
} from '../utils/festival';

type FestivalCardProps = {
  festival: Festival;
};

type TooltipPlacement = 'top' | 'bottom';

type TooltipStyle = CSSProperties & {
  '--tooltip-arrow-left'?: string;
};

type FloatingTooltipProps<T extends HTMLElement> = {
  ariaLabel?: string;
  children: ReactNode;
  className?: string;
  id: string;
  isOpen: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onPosition?: () => void;
  onWheel?: (event: WheelEvent<HTMLSpanElement>) => void;
  triggerRef: RefObject<T | null>;
};

type TooltipScrollbarStyle = CSSProperties & {
  '--tooltip-scroll-thumb-height'?: string;
  '--tooltip-scroll-thumb-top'?: string;
};

type OfficialIconLinkProps = {
  href: string;
  icon: LucideIcon;
  id: string;
  label: string;
};

function pointsToModoFestival(url: string) {
  try {
    const { hostname } = new URL(url);
    return hostname === 'modofestival.es' || hostname === 'www.modofestival.es';
  } catch {
    return false;
  }
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

function getSocialIcon(platform: string) {
  const normalizedPlatform = platform.trim().toLowerCase();

  const socialIcons: Record<string, LucideIcon> = {
    facebook: Facebook,
    instagram: Instagram,
    tiktok: Music2,
    twitter: Twitter,
    x: Twitter,
    youtube: Youtube,
  };

  return socialIcons[normalizedPlatform] ?? Share2;
}

function getConfidenceLabel(confidence: Festival['official_enrichment_confidence']) {
  if (confidence === 'high') return 'Alta';
  if (confidence === 'medium') return 'Media';
  if (confidence === 'low') return 'Baja';

  return null;
}

function formatProgramDate(date: string | null) {
  if (!date) return null;

  const parsedDate = new Date(`${date}T00:00:00`);

  if (Number.isNaN(parsedDate.getTime())) return date;

  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'short',
  }).format(parsedDate);
}

function getProgramTitle(item: NonNullable<Festival['program']>[number]) {
  return item.artist || item.title || 'Actuacion pendiente';
}

function getSourceLabel(source: string, index: number) {
  try {
    const { hostname } = new URL(source);
    return hostname.replace(/^www\./, '');
  } catch {
    return `Fuente ${index + 1}`;
  }
}

function FloatingTooltip<T extends HTMLElement>({
  ariaLabel,
  children,
  className = '',
  id,
  isOpen,
  onMouseEnter,
  onMouseLeave,
  onPosition,
  onWheel,
  triggerRef,
}: FloatingTooltipProps<T>) {
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const [placement, setPlacement] = useState<TooltipPlacement>('bottom');
  const [style, setStyle] = useState<TooltipStyle>();

  const positionTooltip = useCallback(() => {
    const trigger = triggerRef.current;
    const tooltip = tooltipRef.current;

    if (!trigger || !tooltip) return;

    const triggerRect = trigger.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const margin = 12;
    const gap = 8;
    const triggerCenter = triggerRect.left + triggerRect.width / 2;
    const tooltipWidth = Math.min(tooltipRect.width, viewportWidth - margin * 2);
    const left = Math.min(
      Math.max(triggerCenter - tooltipWidth / 2, margin),
      viewportWidth - tooltipWidth - margin,
    );
    const spaceBelow = viewportHeight - triggerRect.bottom;
    const spaceAbove = triggerRect.top;
    const nextPlacement =
      spaceBelow < tooltipRect.height + gap + margin && spaceAbove > spaceBelow ? 'top' : 'bottom';
    const top =
      nextPlacement === 'top'
        ? Math.max(triggerRect.top - tooltipRect.height - gap, margin)
        : Math.min(triggerRect.bottom + gap, viewportHeight - tooltipRect.height - margin);
    const arrowLeft = Math.min(Math.max(triggerCenter - left, 14), tooltipWidth - 14);

    setPlacement(nextPlacement);
    setStyle({
      '--tooltip-arrow-left': `${arrowLeft}px`,
      left,
      top,
    });
    onPosition?.();
  }, [onPosition, triggerRef]);

  useLayoutEffect(() => {
    if (isOpen) {
      positionTooltip();
    }
  }, [isOpen, positionTooltip]);

  useEffect(() => {
    if (!isOpen) return undefined;

    window.addEventListener('resize', positionTooltip);
    window.addEventListener('scroll', positionTooltip, true);

    return () => {
      window.removeEventListener('resize', positionTooltip);
      window.removeEventListener('scroll', positionTooltip, true);
    };
  }, [isOpen, positionTooltip]);

  return (
    <span
      aria-label={ariaLabel}
      className={`floating-tooltip${className ? ` ${className}` : ''}${isOpen ? ' is-open' : ''}`}
      data-placement={placement}
      id={id}
      ref={tooltipRef}
      role="tooltip"
      style={style}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onWheel={onWheel}
    >
      {children}
    </span>
  );
}

function OfficialIconLink({ href, icon: Icon, id, label }: OfficialIconLinkProps) {
  const triggerRef = useRef<HTMLAnchorElement>(null);
  const closeTooltipTimeoutRef = useRef<number | undefined>(undefined);
  const [isTooltipOpen, setIsTooltipOpen] = useState(false);

  const closeTooltip = useCallback(() => {
    window.clearTimeout(closeTooltipTimeoutRef.current);
    setIsTooltipOpen(false);
  }, []);

  const openTooltip = useCallback(() => {
    window.clearTimeout(closeTooltipTimeoutRef.current);
    setIsTooltipOpen(true);
  }, []);

  const scheduleCloseTooltip = useCallback(() => {
    window.clearTimeout(closeTooltipTimeoutRef.current);
    closeTooltipTimeoutRef.current = window.setTimeout(() => {
      setIsTooltipOpen(false);
    }, 180);
  }, []);

  useEffect(() => {
    return () => {
      window.clearTimeout(closeTooltipTimeoutRef.current);
    };
  }, []);

  return (
    <span
      className="official-icon-tooltip-wrap"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          closeTooltip();
        }
      }}
      onFocus={openTooltip}
      onMouseEnter={openTooltip}
      onMouseLeave={scheduleCloseTooltip}
    >
      <a
        aria-describedby={id}
        aria-label={label}
        className="official-icon-link"
        href={href}
        ref={triggerRef}
        rel="noreferrer"
        target="_blank"
      >
        <Icon size={16} />
      </a>
      <FloatingTooltip
        ariaLabel={label}
        className="social-link-tooltip"
        id={id}
        isOpen={isTooltipOpen}
        onMouseEnter={openTooltip}
        onMouseLeave={scheduleCloseTooltip}
        triggerRef={triggerRef}
      >
        {label}
      </FloatingTooltip>
    </span>
  );
}

export function FestivalCard({ festival }: FestivalCardProps) {
  const overflowTriggerRef = useRef<HTMLButtonElement>(null);
  const tooltipListRef = useRef<HTMLSpanElement>(null);
  const closeTooltipTimeoutRef = useRef<number | undefined>(undefined);
  const descriptionRef = useRef<HTMLParagraphElement>(null);
  const closeDescriptionTooltipTimeoutRef = useRef<number | undefined>(undefined);
  const priceTriggerRef = useRef<HTMLButtonElement>(null);
  const closePriceTooltipTimeoutRef = useRef<number | undefined>(undefined);
  const programTriggerRef = useRef<HTMLButtonElement>(null);
  const closeProgramTooltipTimeoutRef = useRef<number | undefined>(undefined);
  const confidenceTriggerRef = useRef<HTMLButtonElement>(null);
  const closeConfidenceTooltipTimeoutRef = useRef<number | undefined>(undefined);
  const [isTooltipOpen, setIsTooltipOpen] = useState(false);
  const [tooltipScrollbarStyle, setTooltipScrollbarStyle] = useState<TooltipScrollbarStyle>();
  const [isDescriptionOverflowing, setIsDescriptionOverflowing] = useState(false);
  const [isDescriptionTooltipOpen, setIsDescriptionTooltipOpen] = useState(false);
  const [isPriceTooltipOpen, setIsPriceTooltipOpen] = useState(false);
  const [isProgramTooltipOpen, setIsProgramTooltipOpen] = useState(false);
  const [isConfidenceTooltipOpen, setIsConfidenceTooltipOpen] = useState(false);
  const ticketUrl =
    festival.ticket_url && !pointsToModoFestival(festival.ticket_url) ? festival.ticket_url : null;
  const festivalUrl =
    festival.festival_url && !pointsToModoFestival(festival.festival_url)
      ? festival.festival_url
      : null;
  const officialUrl =
    festival.official_url && !pointsToModoFestival(festival.official_url)
      ? festival.official_url
      : null;
  const socialUrls = festival.social_urls ?? [];
  const ticketPrices = festival.ticket_prices ?? [];
  const program = festival.program ?? [];
  const officialSources = festival.official_sources ?? [];
  const confidenceLabel = getConfidenceLabel(festival.official_enrichment_confidence);
  const visibleSources = officialSources.slice(0, 2);
  const hiddenSourcesCount = officialSources.length - visibleSources.length;
  const visibleArtists = festival.artists.slice(0, 6);
  const hiddenArtists = festival.artists.slice(visibleArtists.length);
  const hiddenArtistCount = hiddenArtists.length;
  const hasOfficialDetails =
    Boolean(festival.ticket_price_summary) ||
    ticketPrices.length > 0 ||
    program.length > 0 ||
    officialUrl ||
    socialUrls.length > 0 ||
    officialSources.length > 0 ||
    confidenceLabel;

  const closeTooltip = useCallback(() => {
    window.clearTimeout(closeTooltipTimeoutRef.current);
    setIsTooltipOpen(false);
  }, []);

  const openTooltip = useCallback(() => {
    window.clearTimeout(closeTooltipTimeoutRef.current);
    setIsTooltipOpen(true);
  }, []);

  const scheduleCloseTooltip = useCallback(() => {
    window.clearTimeout(closeTooltipTimeoutRef.current);
    closeTooltipTimeoutRef.current = window.setTimeout(() => {
      setIsTooltipOpen(false);
    }, 180);
  }, []);

  const closeDescriptionTooltip = useCallback(() => {
    window.clearTimeout(closeDescriptionTooltipTimeoutRef.current);
    setIsDescriptionTooltipOpen(false);
  }, []);

  const openDescriptionTooltip = useCallback(() => {
    if (!isDescriptionOverflowing) return;

    window.clearTimeout(closeDescriptionTooltipTimeoutRef.current);
    setIsDescriptionTooltipOpen(true);
  }, [isDescriptionOverflowing]);

  const scheduleCloseDescriptionTooltip = useCallback(() => {
    window.clearTimeout(closeDescriptionTooltipTimeoutRef.current);
    closeDescriptionTooltipTimeoutRef.current = window.setTimeout(() => {
      setIsDescriptionTooltipOpen(false);
    }, 180);
  }, []);

  const closePriceTooltip = useCallback(() => {
    window.clearTimeout(closePriceTooltipTimeoutRef.current);
    setIsPriceTooltipOpen(false);
  }, []);

  const openPriceTooltip = useCallback(() => {
    window.clearTimeout(closePriceTooltipTimeoutRef.current);
    setIsPriceTooltipOpen(true);
  }, []);

  const scheduleClosePriceTooltip = useCallback(() => {
    window.clearTimeout(closePriceTooltipTimeoutRef.current);
    closePriceTooltipTimeoutRef.current = window.setTimeout(() => {
      setIsPriceTooltipOpen(false);
    }, 180);
  }, []);

  const closeProgramTooltip = useCallback(() => {
    window.clearTimeout(closeProgramTooltipTimeoutRef.current);
    setIsProgramTooltipOpen(false);
  }, []);

  const openProgramTooltip = useCallback(() => {
    window.clearTimeout(closeProgramTooltipTimeoutRef.current);
    setIsProgramTooltipOpen(true);
  }, []);

  const scheduleCloseProgramTooltip = useCallback(() => {
    window.clearTimeout(closeProgramTooltipTimeoutRef.current);
    closeProgramTooltipTimeoutRef.current = window.setTimeout(() => {
      setIsProgramTooltipOpen(false);
    }, 180);
  }, []);

  const closeConfidenceTooltip = useCallback(() => {
    window.clearTimeout(closeConfidenceTooltipTimeoutRef.current);
    setIsConfidenceTooltipOpen(false);
  }, []);

  const openConfidenceTooltip = useCallback(() => {
    window.clearTimeout(closeConfidenceTooltipTimeoutRef.current);
    setIsConfidenceTooltipOpen(true);
  }, []);

  const scheduleCloseConfidenceTooltip = useCallback(() => {
    window.clearTimeout(closeConfidenceTooltipTimeoutRef.current);
    closeConfidenceTooltipTimeoutRef.current = window.setTimeout(() => {
      setIsConfidenceTooltipOpen(false);
    }, 180);
  }, []);

  const positionTooltipScrollbar = useCallback(() => {
    const list = tooltipListRef.current;

    if (!list) return;

    const { clientHeight, scrollHeight, scrollTop } = list;
    const maxScrollTop = scrollHeight - clientHeight;

    if (maxScrollTop <= 1) {
      setTooltipScrollbarStyle(undefined);
      return;
    }

    const thumbHeight = Math.max((clientHeight / scrollHeight) * clientHeight, 34);
    const thumbTop = (scrollTop / maxScrollTop) * (clientHeight - thumbHeight);

    setTooltipScrollbarStyle({
      '--tooltip-scroll-thumb-height': `${thumbHeight}px`,
      '--tooltip-scroll-thumb-top': `${thumbTop}px`,
    });
  }, []);

  const scrollArtistTooltip = useCallback(
    (event: WheelEvent<HTMLSpanElement>) => {
      const list = tooltipListRef.current;

      if (!list) return;

      const { clientHeight, scrollHeight, scrollTop } = list;
      const maxScrollTop = scrollHeight - clientHeight;

      if (maxScrollTop <= 1) return;

      const deltaY = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      const nextScrollTop = Math.min(Math.max(scrollTop + deltaY, 0), maxScrollTop);

      if (nextScrollTop === scrollTop) return;

      event.preventDefault();
      list.scrollTop = nextScrollTop;
      positionTooltipScrollbar();
    },
    [positionTooltipScrollbar],
  );

  useEffect(() => {
    const description = descriptionRef.current;

    if (!description) {
      setIsDescriptionOverflowing(false);
      setIsDescriptionTooltipOpen(false);
      return undefined;
    }

    const checkDescriptionOverflow = () => {
      const isOverflowing = description.scrollHeight > description.clientHeight + 1;

      setIsDescriptionOverflowing(isOverflowing);

      if (!isOverflowing) {
        setIsDescriptionTooltipOpen(false);
      }
    };

    checkDescriptionOverflow();

    const resizeObserver = new ResizeObserver(checkDescriptionOverflow);
    resizeObserver.observe(description);
    window.addEventListener('resize', checkDescriptionOverflow);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', checkDescriptionOverflow);
    };
  }, [festival.description]);

  useEffect(() => {
    return () => {
      window.clearTimeout(closeTooltipTimeoutRef.current);
      window.clearTimeout(closeDescriptionTooltipTimeoutRef.current);
      window.clearTimeout(closePriceTooltipTimeoutRef.current);
      window.clearTimeout(closeProgramTooltipTimeoutRef.current);
      window.clearTimeout(closeConfidenceTooltipTimeoutRef.current);
    };
  }, []);

  return (
    <article className="festival-card">
      <div className="poster">
        {festival.image_full_url || festival.image_url ? (
          <img
            alt={festival.image_alt || festival.name}
            loading="lazy"
            src={festival.image_full_url || festival.image_url || ''}
          />
        ) : (
          <div className="poster-fallback" style={getFallbackStyle(festival.name)}>
            <span className="fallback-mark">{festival.name.slice(0, 2)}</span>
            <span className="fallback-title">{festival.name}</span>
            <span className="fallback-meta">{festival.city || festival.region || 'Festival'}</span>
          </div>
        )}
        <span className="countdown-badge">{getCountdownLabel(festival)}</span>
      </div>
      <div className="card-body">
        <div>
          <h3>{festival.name}</h3>
          <p className="location">
            <MapPin size={16} />
            {festival.location || festival.city || 'Lugar pendiente'}
          </p>
        </div>
        <p className="date-line">
          <CalendarDays size={16} />
          {formatFestivalDate(festival)}
        </p>
        {visibleArtists.length > 0 && (
          <div className="artist-list" aria-label="Artistas confirmados">
            <span className="artist-list-title">
              <Mic2 size={15} />
              Cartel
            </span>
            <div>
              {visibleArtists.map((artist) => (
                <span className="artist-chip" key={artist}>
                  {artist}
                </span>
              ))}
              {hiddenArtistCount > 0 && (
                <span
                  className="artist-overflow"
                  onBlur={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget)) {
                      closeTooltip();
                    }
                  }}
                  onFocus={openTooltip}
                  onMouseEnter={openTooltip}
                  onMouseLeave={scheduleCloseTooltip}
                >
                  <button
                    aria-describedby={`hidden-artists-${festival.slug}`}
                    className="artist-chip artist-overflow-trigger"
                    ref={overflowTriggerRef}
                    type="button"
                  >
                    +{hiddenArtistCount}
                  </button>
                  <FloatingTooltip
                    ariaLabel={`Artistas restantes de ${festival.name}`}
                    className={tooltipScrollbarStyle ? 'is-scrollable' : ''}
                    id={`hidden-artists-${festival.slug}`}
                    isOpen={isTooltipOpen}
                    onMouseEnter={openTooltip}
                    onMouseLeave={scheduleCloseTooltip}
                    onPosition={positionTooltipScrollbar}
                    onWheel={scrollArtistTooltip}
                    triggerRef={overflowTriggerRef}
                  >
                    <span
                      className="artist-tooltip-list"
                      onScroll={positionTooltipScrollbar}
                      ref={tooltipListRef}
                    >
                      {hiddenArtists.map((artist) => (
                        <span key={artist}>{artist}</span>
                      ))}
                    </span>
                    {tooltipScrollbarStyle && (
                      <span
                        aria-hidden="true"
                        className="artist-tooltip-scrollbar"
                        style={tooltipScrollbarStyle}
                      />
                    )}
                  </FloatingTooltip>
                </span>
              )}
            </div>
          </div>
        )}
        {festival.description && (
          <div
            className="description-wrap"
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) {
                closeDescriptionTooltip();
              }
            }}
            onFocus={openDescriptionTooltip}
            onMouseEnter={openDescriptionTooltip}
            onMouseLeave={scheduleCloseDescriptionTooltip}
          >
            <p
              aria-describedby={
                isDescriptionOverflowing ? `festival-description-${festival.slug}` : undefined
              }
              className={`description${isDescriptionOverflowing ? ' has-tooltip' : ''}`}
              ref={descriptionRef}
              tabIndex={isDescriptionOverflowing ? 0 : undefined}
            >
              {festival.description}
            </p>
            {isDescriptionOverflowing && (
              <FloatingTooltip
                ariaLabel={`Descripcion completa de ${festival.name}`}
                className="description-tooltip"
                id={`festival-description-${festival.slug}`}
                isOpen={isDescriptionTooltipOpen}
                onMouseEnter={openDescriptionTooltip}
                onMouseLeave={scheduleCloseDescriptionTooltip}
                triggerRef={descriptionRef}
              >
                <span className="description-tooltip-content">{festival.description}</span>
              </FloatingTooltip>
            )}
          </div>
        )}
        <div className="style-list">
          {festival.styles.length ? (
            festival.styles.map((style) => <span key={style}>{style}</span>)
          ) : (
            <span>Estilo pendiente</span>
          )}
        </div>
        {hasOfficialDetails && (
          <div className="official-details">
            {(festival.ticket_price_summary || ticketPrices.length > 0) && (
              <span
                className="detail-tooltip-wrap"
                onBlur={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) {
                    closePriceTooltip();
                  }
                }}
                onFocus={openPriceTooltip}
                onMouseEnter={openPriceTooltip}
                onMouseLeave={scheduleClosePriceTooltip}
              >
                <button
                  aria-describedby={`price-tooltip-${festival.slug}`}
                  className="detail-trigger"
                  ref={priceTriggerRef}
                  type="button"
                >
                  <ReceiptText size={15} />
                  {festival.ticket_price_summary || `${ticketPrices.length} precios`}
                </button>
                <FloatingTooltip
                  ariaLabel={`Precios de ${festival.name}`}
                  className="detail-tooltip"
                  id={`price-tooltip-${festival.slug}`}
                  isOpen={isPriceTooltipOpen}
                  onMouseEnter={openPriceTooltip}
                  onMouseLeave={scheduleClosePriceTooltip}
                  triggerRef={priceTriggerRef}
                >
                  <span className="detail-tooltip-content">
                    <span className="detail-tooltip-title">Precios</span>
                    {festival.ticket_price_summary && (
                      <span className="price-summary">{festival.ticket_price_summary}</span>
                    )}
                    {ticketPrices.length > 0 && (
                      <span className="price-list" aria-label="Precios disponibles">
                        {ticketPrices.map((price, index) => (
                          <span
                            key={[
                              price.label ?? 'precio',
                              price.price_text ?? 'sin-precio',
                              price.amount ?? 'sin-importe',
                              price.currency ?? 'sin-moneda',
                              price.source_url ?? 'sin-fuente',
                              index,
                            ].join('-')}
                          >
                            <span>{price.label || 'Entrada'}</span>
                            <strong>{price.price_text || 'Precio pendiente'}</strong>
                          </span>
                        ))}
                      </span>
                    )}
                  </span>
                </FloatingTooltip>
              </span>
            )}
            {program.length > 0 && (
              <span
                className="detail-tooltip-wrap"
                onBlur={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) {
                    closeProgramTooltip();
                  }
                }}
                onFocus={openProgramTooltip}
                onMouseEnter={openProgramTooltip}
                onMouseLeave={scheduleCloseProgramTooltip}
              >
                <button
                  aria-describedby={`program-tooltip-${festival.slug}`}
                  className="detail-trigger"
                  ref={programTriggerRef}
                  type="button"
                >
                  <ListMusic size={15} />
                  Programacion ({program.length})
                </button>
                <FloatingTooltip
                  ariaLabel={`Programacion de ${festival.name}`}
                  className="detail-tooltip program-tooltip"
                  id={`program-tooltip-${festival.slug}`}
                  isOpen={isProgramTooltipOpen}
                  onMouseEnter={openProgramTooltip}
                  onMouseLeave={scheduleCloseProgramTooltip}
                  triggerRef={programTriggerRef}
                >
                  <span className="detail-tooltip-content">
                    <span className="detail-tooltip-title">Programacion</span>
                    <span className="program-list">
                      {program.map((item, index) => {
                        const programDate = formatProgramDate(item.date);

                        return (
                          <span
                            key={`${item.date ?? 'fecha'}-${item.time ?? 'hora'}-${getProgramTitle(item)}-${index}`}
                          >
                            <span className="program-time">
                              {[programDate, item.time].filter(Boolean).join(' · ') ||
                                'Horario pendiente'}
                            </span>
                            <span className="program-title">{getProgramTitle(item)}</span>
                            {item.stage && <span className="program-stage">{item.stage}</span>}
                          </span>
                        );
                      })}
                    </span>
                  </span>
                </FloatingTooltip>
              </span>
            )}
            {(officialUrl || socialUrls.length > 0) && (
              <div className="official-links" aria-label="Enlaces oficiales y redes">
                {officialUrl && (
                  <OfficialIconLink
                    href={officialUrl}
                    icon={Globe2}
                    id={`official-link-${festival.slug}`}
                    label="Web oficial"
                  />
                )}
                {socialUrls.map((social, index) => (
                  <OfficialIconLink
                    href={social.url}
                    icon={getSocialIcon(social.platform)}
                    id={`social-link-${festival.slug}-${social.platform}-${index}`}
                    key={`${social.platform}-${social.url}`}
                    label={getSocialLabel(social.platform)}
                  />
                ))}
              </div>
            )}
            {(visibleSources.length > 0 || confidenceLabel) && (
              <div className="source-row">
                {confidenceLabel && (
                  <span
                    className="confidence-tooltip-wrap"
                    onBlur={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget)) {
                        closeConfidenceTooltip();
                      }
                    }}
                    onFocus={openConfidenceTooltip}
                    onMouseEnter={openConfidenceTooltip}
                    onMouseLeave={scheduleCloseConfidenceTooltip}
                  >
                    <button
                      aria-describedby={`confidence-tooltip-${festival.slug}`}
                      className={`confidence-pill confidence-pill-${festival.official_enrichment_confidence}`}
                      ref={confidenceTriggerRef}
                      type="button"
                    >
                      <ShieldCheck size={14} />
                      Confianza {confidenceLabel}
                    </button>
                    <FloatingTooltip
                      ariaLabel={`Fuentes y confianza de ${festival.name}`}
                      className="confidence-tooltip"
                      id={`confidence-tooltip-${festival.slug}`}
                      isOpen={isConfidenceTooltipOpen}
                      onMouseEnter={openConfidenceTooltip}
                      onMouseLeave={scheduleCloseConfidenceTooltip}
                      triggerRef={confidenceTriggerRef}
                    >
                      <span className="confidence-tooltip-content">
                        <span>
                          Datos extraidos con un modelo de IA
                          {festival.official_enrichment_model
                            ? ` (${festival.official_enrichment_model})`
                            : ''}
                          . La confianza indica la consistencia de la informacion encontrada.
                        </span>
                        {officialSources.length > 0 && (
                          <span className="confidence-source-list">
                            {officialSources.map((source, index) => (
                              <a href={source} key={source} rel="noreferrer" target="_blank">
                                <ExternalLink size={13} />
                                {getSourceLabel(source, index)}
                              </a>
                            ))}
                          </span>
                        )}
                      </span>
                    </FloatingTooltip>
                  </span>
                )}
                {!confidenceLabel &&
                  visibleSources.map((source, index) => (
                    <a href={source} key={source} rel="noreferrer" target="_blank">
                      <ExternalLink size={14} />
                      Fuente {index + 1}
                    </a>
                  ))}
                {!confidenceLabel && hiddenSourcesCount > 0 && (
                  <span className="detail-more">+{hiddenSourcesCount} fuentes</span>
                )}
              </div>
            )}
          </div>
        )}
        <div className="card-actions">
          {ticketUrl && (
            <a href={ticketUrl} rel="noreferrer" target="_blank">
              <Ticket size={16} />
              Entradas
            </a>
          )}
          {festivalUrl && (
            <a href={festivalUrl} rel="noreferrer" target="_blank">
              Ver ficha
            </a>
          )}
        </div>
      </div>
    </article>
  );
}
