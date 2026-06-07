import { useMemo, useState } from 'react';
import Fuse from 'fuse.js';
import type { IFuseOptions } from 'fuse.js';
import type { Festival, SelectOption } from '../types';
import {
  getFestivalMonthNumbers,
  getPlace,
  isConfirmedDate,
  isPastFestival,
  monthName,
  overlapsDateRange,
  toggleValue,
} from '../utils/festival';

export type FilterOptions = {
  places: SelectOption[];
  styles: SelectOption[];
  months: SelectOption[];
};

export type PriceRange = {
  max: number;
  min: number;
};

const fuseOptions: IFuseOptions<Festival> = {
  ignoreLocation: true,
  keys: [
    { name: 'name', weight: 0.4 },
    { name: 'artists', weight: 0.2 },
    { name: 'city', weight: 0.12 },
    { name: 'region', weight: 0.1 },
    { name: 'location', weight: 0.08 },
    { name: 'styles', weight: 0.06 },
    { name: 'description', weight: 0.04 },
  ],
  threshold: 0.35,
};

function sortByDateAndName(a: Festival, b: Festival) {
  const aDate = a.start_date ?? '9999-12-31';
  const bDate = b.start_date ?? '9999-12-31';
  return aDate.localeCompare(bDate) || a.name.localeCompare(b.name, 'es');
}

function isFreePriceText(value: string | null | undefined) {
  return Boolean(value && /gratis|gratuit|entrada libre/i.test(value));
}

function getFestivalMinPrice(festival: Festival) {
  const amounts = (festival.ticket_prices ?? [])
    .map((price) => price.amount)
    .filter((amount): amount is number => typeof amount === 'number' && Number.isFinite(amount));

  if (amounts.length) return Math.min(...amounts);

  if (
    isFreePriceText(festival.ticket_price_summary) ||
    (festival.ticket_prices ?? []).some((price) => isFreePriceText(price.price_text))
  ) {
    return 0;
  }

  return null;
}

export function useFestivalFilters(festivals: Festival[]) {
  const [query, setQuery] = useState('');
  const [selectedPlaces, setSelectedPlaces] = useState<string[]>([]);
  const [selectedStyles, setSelectedStyles] = useState<string[]>([]);
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [confirmedOnly, setConfirmedOnly] = useState(false);
  const [hidePast, setHidePast] = useState(true);

  const priceRange = useMemo<PriceRange>(() => {
    const prices = festivals
      .map(getFestivalMinPrice)
      .filter((price): price is number => price !== null);

    return {
      min: 0,
      max: Math.ceil(Math.max(0, ...prices)),
    };
  }, [festivals]);

  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const selectedMaxPrice = maxPrice ?? priceRange.max;

  const options = useMemo(() => {
    const places = [...new Set(festivals.map(getPlace))]
      .sort((a, b) => a.localeCompare(b, 'es'))
      .map((place) => ({ label: place, value: place }));
    const styles = [...new Set(festivals.flatMap((festival) => festival.styles))]
      .sort((a, b) => a.localeCompare(b, 'es'))
      .map((style) => ({ label: style, value: style }));
    const months = Array.from({ length: 12 }, (_, index) => index + 1).map((month) => ({
      label: monthName(month),
      value: String(month),
    }));

    return { places, styles, months };
  }, [festivals]);

  const festivalSearch = useMemo(() => new Fuse(festivals, fuseOptions), [festivals]);

  const filteredFestivals = useMemo(() => {
    const normalizedQuery = query.trim();
    const searchableFestivals = normalizedQuery
      ? festivalSearch.search(normalizedQuery).map((result) => result.item)
      : festivals;

    const filtered = searchableFestivals
      .filter((festival) => {
        if (selectedPlaces.length && !selectedPlaces.includes(getPlace(festival))) return false;
        if (
          selectedStyles.length &&
          !selectedStyles.some((style) => festival.styles.includes(style))
        ) {
          return false;
        }
        if (
          selectedMonths.length &&
          !getFestivalMonthNumbers(festival).some((month) => selectedMonths.includes(String(month)))
        ) {
          return false;
        }
        if (!overlapsDateRange(festival, dateFrom, dateTo)) return false;
        if (confirmedOnly && !isConfirmedDate(festival)) return false;
        if (hidePast && isPastFestival(festival)) return false;
        if (selectedMaxPrice < priceRange.max) {
          const festivalPrice = getFestivalMinPrice(festival);
          if (festivalPrice === null || festivalPrice > selectedMaxPrice) return false;
        }
        return true;
      });

    return normalizedQuery ? filtered : filtered.sort(sortByDateAndName);
  }, [
    confirmedOnly,
    dateFrom,
    dateTo,
    festivalSearch,
    festivals,
    hidePast,
    priceRange.max,
    query,
    selectedMonths,
    selectedPlaces,
    selectedStyles,
    selectedMaxPrice,
  ]);

  const activeFilters =
    selectedPlaces.length +
    selectedStyles.length +
    selectedMonths.length +
    Number(Boolean(dateFrom)) +
    Number(Boolean(dateTo)) +
    Number(selectedMaxPrice < priceRange.max) +
    Number(confirmedOnly) +
    Number(hidePast);

  function resetFilters() {
    setQuery('');
    setSelectedPlaces([]);
    setSelectedStyles([]);
    setSelectedMonths([]);
    setDateFrom('');
    setDateTo('');
    setMaxPrice(null);
    setConfirmedOnly(false);
    setHidePast(true);
  }

  return {
    activeFilters,
    confirmedOnly,
    dateFrom,
    dateTo,
    filteredFestivals,
    hidePast,
    maxPrice: selectedMaxPrice,
    options,
    priceRange,
    query,
    resetFilters,
    selectedMonths,
    selectedPlaces,
    selectedStyles,
    setConfirmedOnly,
    setDateFrom,
    setDateTo,
    setHidePast,
    setMaxPrice,
    setQuery,
    setSelectedMonths,
    setSelectedPlaces,
    setSelectedStyles,
    toggleValue,
  };
}
