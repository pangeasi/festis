import { EmptyState } from './components/EmptyState';
import { FestivalGrid } from './components/FestivalGrid';
import { ResultsHeader } from './components/ResultsHeader';
import { SearchPanel } from './components/SearchPanel';
import { festivals } from './data';
import { useFestivalFilters } from './hooks/useFestivalFilters';

function App() {
  const filters = useFestivalFilters(festivals);

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
        resultCount={filters.filteredFestivals.length}
      />

      <FestivalGrid festivals={filters.filteredFestivals} />

      {!filters.filteredFestivals.length && <EmptyState onReset={filters.resetFilters} />}
    </main>
  );
}

export default App;
