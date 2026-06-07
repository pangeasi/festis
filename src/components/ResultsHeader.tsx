import { Check, Filter, Share2 } from 'lucide-react';

type ResultsHeaderProps = {
  activeFilters: number;
  isShareCopied: boolean;
  onShare: () => void;
  resultCount: number;
};

export function ResultsHeader({
  activeFilters,
  isShareCopied,
  onShare,
  resultCount,
}: ResultsHeaderProps) {
  return (
    <section className="results-head">
      <div>
        <p className="eyebrow">Resultados</p>
        <h2>{resultCount} festivales</h2>
      </div>
      <div className="results-actions">
        <button className="share-results-button" onClick={onShare} type="button">
          {isShareCopied ? <Check size={16} /> : <Share2 size={16} />}
          {isShareCopied ? 'Enlace copiado' : 'Compartir resultados'}
        </button>
        <div className="filter-count">
          <Filter size={16} />
          {activeFilters} filtros activos
        </div>
      </div>
    </section>
  );
}
