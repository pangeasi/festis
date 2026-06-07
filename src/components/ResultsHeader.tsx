import { Filter } from 'lucide-react';

type ResultsHeaderProps = {
  activeFilters: number;
  resultCount: number;
};

export function ResultsHeader({ activeFilters, resultCount }: ResultsHeaderProps) {
  return (
    <section className="results-head">
      <div>
        <p className="eyebrow">Resultados</p>
        <h2>{resultCount} festivales</h2>
      </div>
      <div className="filter-count">
        <Filter size={16} />
        {activeFilters} filtros activos
      </div>
    </section>
  );
}
