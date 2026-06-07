import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Festival } from '../types';
import { FestivalCard } from './FestivalCard';

type FestivalGridProps = {
  festivals: Festival[];
};

const ESTIMATED_ROW_HEIGHT = 620;
const GRID_GAP = 18;
const OVERSCAN_PX = 900;
const VIRTUALIZATION_THRESHOLD = 30;

function getColumnCount() {
  if (typeof window === 'undefined') return 3;
  if (window.innerWidth <= 760) return 1;
  if (window.innerWidth <= 1050) return 2;
  return 3;
}

function chunkFestivals(festivals: Festival[], columns: number) {
  const rows: Festival[][] = [];

  for (let index = 0; index < festivals.length; index += columns) {
    rows.push(festivals.slice(index, index + columns));
  }

  return rows;
}

export function FestivalGrid({ festivals }: FestivalGridProps) {
  const gridRef = useRef<HTMLElement>(null);
  const rowHeightsRef = useRef<Map<number, number>>(new Map());
  const rowObserversRef = useRef<Map<number, ResizeObserver>>(new Map());
  const [columns, setColumns] = useState(getColumnCount);
  const [isMounted, setIsMounted] = useState(false);
  const [scrollState, setScrollState] = useState({ viewportBottom: 0, viewportTop: 0 });
  const [measurementVersion, setMeasurementVersion] = useState(0);
  const shouldVirtualize = isMounted && festivals.length > VIRTUALIZATION_THRESHOLD;

  const rows = useMemo(() => chunkFestivals(festivals, columns), [columns, festivals]);

  useEffect(() => {
    setIsMounted(true);

    function updateLayoutState() {
      setColumns(getColumnCount());
      setScrollState({
        viewportBottom: window.scrollY + window.innerHeight,
        viewportTop: window.scrollY,
      });
    }

    updateLayoutState();
    window.addEventListener('resize', updateLayoutState);
    window.addEventListener('scroll', updateLayoutState, { passive: true });

    return () => {
      window.removeEventListener('resize', updateLayoutState);
      window.removeEventListener('scroll', updateLayoutState);
    };
  }, []);

  useEffect(() => {
    rowHeightsRef.current.clear();
    setMeasurementVersion((version) => version + 1);
  }, [columns, festivals]);

  useEffect(() => {
    return () => {
      rowObserversRef.current.forEach((observer) => observer.disconnect());
      rowObserversRef.current.clear();
    };
  }, []);

  const setRowRef = useCallback(
    (rowIndex: number) => (element: HTMLDivElement | null) => {
      rowObserversRef.current.get(rowIndex)?.disconnect();
      rowObserversRef.current.delete(rowIndex);

      if (!element || typeof ResizeObserver === 'undefined') return;

      const measure = () => {
        const nextHeight = element.getBoundingClientRect().height;
        const previousHeight = rowHeightsRef.current.get(rowIndex);

        if (Math.abs((previousHeight ?? 0) - nextHeight) < 1) return;

        rowHeightsRef.current.set(rowIndex, nextHeight);
        setMeasurementVersion((version) => version + 1);
      };

      measure();

      const observer = new ResizeObserver(measure);
      observer.observe(element);
      rowObserversRef.current.set(rowIndex, observer);
    },
    [],
  );

  const virtualRows = useMemo(() => {
    let runningTop = 0;
    const positionedRows = rows.map((row, rowIndex) => {
      const height = rowHeightsRef.current.get(rowIndex) ?? ESTIMATED_ROW_HEIGHT;
      const top = runningTop;
      runningTop += height + (rowIndex < rows.length - 1 ? GRID_GAP : 0);

      return {
        festivals: row,
        height,
        rowIndex,
        top,
      };
    });

    const gridTop = gridRef.current
      ? gridRef.current.getBoundingClientRect().top + window.scrollY
      : 0;
    const visibleTop = Math.max(0, scrollState.viewportTop - gridTop - OVERSCAN_PX);
    const visibleBottom = Math.max(0, scrollState.viewportBottom - gridTop + OVERSCAN_PX);
    const visibleRows = positionedRows.filter(
      (row) => row.top + row.height >= visibleTop && row.top <= visibleBottom,
    );

    return {
      totalHeight: Math.max(0, runningTop),
      visibleRows,
    };
  }, [measurementVersion, rows, scrollState]);

  if (!shouldVirtualize) {
    return (
      <section className="festival-grid">
        {festivals.map((festival) => (
          <FestivalCard festival={festival} key={festival.slug} />
        ))}
      </section>
    );
  }

  return (
    <section
      aria-label="Resultados de festivales"
      className="festival-grid festival-grid--virtual"
      ref={gridRef}
      style={{ height: virtualRows.totalHeight }}
    >
      {virtualRows.visibleRows.map((row) => (
        <div
          className="festival-grid-row"
          key={row.festivals.map((festival) => festival.slug).join('|')}
          ref={setRowRef(row.rowIndex)}
          style={{
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            transform: `translateY(${row.top}px)`,
          }}
        >
          {row.festivals.map((festival) => (
            <FestivalCard festival={festival} key={festival.slug} />
          ))}
        </div>
      ))}
    </section>
  );
}
