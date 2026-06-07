import { useEffect, useRef, useState } from 'react';
import { EmptyState } from './components/EmptyState';
import { FestivalGrid } from './components/FestivalGrid';
import { ResultsHeader } from './components/ResultsHeader';
import { SearchPanel } from './components/SearchPanel';
import { festivals } from './data';
import { useFestivalFilters } from './hooks/useFestivalFilters';

function App() {
  const filters = useFestivalFilters(festivals);
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

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Agenda</p>
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
