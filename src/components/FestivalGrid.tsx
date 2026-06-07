import type { Festival } from '../types';
import { FestivalCard } from './FestivalCard';

type FestivalGridProps = {
  festivals: Festival[];
};

export function FestivalGrid({ festivals }: FestivalGridProps) {
  return (
    <section className="festival-grid">
      {festivals.map((festival) => (
        <FestivalCard festival={festival} key={festival.slug} />
      ))}
    </section>
  );
}
