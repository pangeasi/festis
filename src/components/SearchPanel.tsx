import { useId, useState } from 'react';
import { ChevronDown, RotateCcw, Search, SlidersHorizontal } from 'lucide-react';
import type { FilterOptions, PriceRange } from '../hooks/useFestivalFilters';
import { MultiSelectDropdown } from './MultiSelectDropdown';

type SearchPanelProps = {
  activeFilters: number;
  confirmedOnly: boolean;
  dateFrom: string;
  dateTo: string;
  hidePast: boolean;
  maxPrice: number;
  options: FilterOptions;
  priceRange: PriceRange;
  query: string;
  selectedMonths: string[];
  selectedPlaces: string[];
  selectedStyles: string[];
  onConfirmedOnlyChange: (value: boolean) => void;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  onHidePastChange: (value: boolean) => void;
  onMaxPriceChange: (value: number) => void;
  onQueryChange: (value: string) => void;
  onReset: () => void;
  onSelectedMonthsChange: (updater: (current: string[]) => string[]) => void;
  onSelectedPlacesChange: (updater: (current: string[]) => string[]) => void;
  onSelectedStylesChange: (updater: (current: string[]) => string[]) => void;
  onToggleValue: (values: string[], value: string) => string[];
};

export function SearchPanel({
  activeFilters,
  confirmedOnly,
  dateFrom,
  dateTo,
  hidePast,
  maxPrice,
  options,
  priceRange,
  query,
  selectedMonths,
  selectedPlaces,
  selectedStyles,
  onConfirmedOnlyChange,
  onDateFromChange,
  onDateToChange,
  onHidePastChange,
  onMaxPriceChange,
  onQueryChange,
  onReset,
  onSelectedMonthsChange,
  onSelectedPlacesChange,
  onSelectedStylesChange,
  onToggleValue,
}: SearchPanelProps) {
  const advancedFiltersId = useId();
  const [isFiltersExpanded, setIsFiltersExpanded] = useState(false);
  const priceFormatter = new Intl.NumberFormat('es-ES', {
    currency: 'EUR',
    maximumFractionDigits: 0,
    style: 'currency',
  });
  const priceLabel = maxPrice <= 0 ? 'Gratuito' : `Hasta ${priceFormatter.format(maxPrice)}`;

  return (
    <section className="search-panel">
      <div className="search-row">
        <label className="search-box">
          <Search size={20} />
          <input
            aria-label="Buscar festivales"
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Buscar por festival, artista, ciudad, region o descripcion"
            value={query}
          />
        </label>
        <button
          className="reset-button"
          disabled={!activeFilters && !query}
          onClick={onReset}
          type="button"
        >
          <RotateCcw size={18} />
          Limpiar
        </button>
      </div>

      <button
        aria-controls={advancedFiltersId}
        aria-expanded={isFiltersExpanded}
        className="filters-toggle"
        onClick={() => setIsFiltersExpanded((current) => !current)}
        type="button"
      >
        <span>
          <SlidersHorizontal size={18} />
          Filtros
          {activeFilters > 0 && <small>{activeFilters} activos</small>}
        </span>
        <ChevronDown size={18} />
      </button>

      <div className="advanced-filters" hidden={!isFiltersExpanded} id={advancedFiltersId}>
        <div className="date-controls">
          <label>
            Desde
            <input onChange={(event) => onDateFromChange(event.target.value)} type="date" value={dateFrom} />
          </label>
          <label>
            Hasta
            <input onChange={(event) => onDateToChange(event.target.value)} type="date" value={dateTo} />
          </label>
          <label className="switch">
            <input
              checked={confirmedOnly}
              onChange={(event) => onConfirmedOnlyChange(event.target.checked)}
              type="checkbox"
            />
            <span />
            Solo fechas confirmadas
          </label>
          <label className="switch">
            <input
              checked={hidePast}
              onChange={(event) => onHidePastChange(event.target.checked)}
              type="checkbox"
            />
            <span />
            Ocultar ya pasados
          </label>
        </div>

        <div className="filter-grid">
          <MultiSelectDropdown
            onClear={() => onSelectedPlacesChange(() => [])}
            onToggle={(place) => onSelectedPlacesChange((current) => onToggleValue(current, place))}
            options={options.places}
            placeholder="Todas las ubicaciones"
            selected={selectedPlaces}
            title="Lugar"
          />
          <MultiSelectDropdown
            onClear={() => onSelectedStylesChange(() => [])}
            onToggle={(style) => onSelectedStylesChange((current) => onToggleValue(current, style))}
            options={options.styles}
            placeholder="Todos los estilos"
            selected={selectedStyles}
            title="Estilos"
          />
          <MultiSelectDropdown
            onClear={() => onSelectedMonthsChange(() => [])}
            onToggle={(month) => onSelectedMonthsChange((current) => onToggleValue(current, month))}
            options={options.months}
            placeholder="Todos los meses"
            selected={selectedMonths}
            title="Meses"
          />
          <label className="price-range-filter">
            <span>
              <strong>Precio</strong>
              <small>{priceLabel}</small>
            </span>
            <input
              aria-label="Precio maximo"
              max={priceRange.max}
              min={priceRange.min}
              onChange={(event) => onMaxPriceChange(Number(event.target.value))}
              step="1"
              type="range"
              value={maxPrice}
            />
            <span className="price-range-values">
              <small>Gratuito</small>
              <small>{priceFormatter.format(priceRange.max)}</small>
            </span>
          </label>
        </div>
      </div>
    </section>
  );
}
