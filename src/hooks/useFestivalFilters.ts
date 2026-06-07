import { useEffect, useMemo, useState } from 'react';
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

const filterParamKeys = ['q', 'place', 'style', 'month', 'from', 'to', 'price', 'confirmed', 'past'];

function getInitialSearchParams() {
  if (typeof window === 'undefined') return new URLSearchParams();
  return new URLSearchParams(window.location.search);
}

function getParamList(params: URLSearchParams, key: string) {
  return params
    .getAll(key)
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean);
}

function getInitialMaxPrice(params: URLSearchParams) {
  if (!params.has('price')) return null;
  const value = Number(params.get('price'));
  return Number.isFinite(value) ? value : null;
}

function setParamList(params: URLSearchParams, key: string, values: string[]) {
  params.delete(key);
  values.forEach((value) => {
    params.append(key, value);
  });
}

function buildShareUrl({
  confirmedOnly,
  dateFrom,
  dateTo,
  hidePast,
  maxPrice,
  priceRange,
  query,
  selectedMonths,
  selectedPlaces,
  selectedStyles,
}: {
  confirmedOnly: boolean;
  dateFrom: string;
  dateTo: string;
  hidePast: boolean;
  maxPrice: number;
  priceRange: PriceRange;
  query: string;
  selectedMonths: string[];
  selectedPlaces: string[];
  selectedStyles: string[];
}) {
  if (typeof window === 'undefined') return '';

  const url = new URL(window.location.href);
  filterParamKeys.forEach((key) => url.searchParams.delete(key));

  if (query.trim()) url.searchParams.set('q', query.trim());
  setParamList(url.searchParams, 'place', selectedPlaces);
  setParamList(url.searchParams, 'style', selectedStyles);
  setParamList(url.searchParams, 'month', selectedMonths);
  if (dateFrom) url.searchParams.set('from', dateFrom);
  if (dateTo) url.searchParams.set('to', dateTo);
  if (maxPrice < priceRange.max) url.searchParams.set('price', String(maxPrice));
  if (confirmedOnly) url.searchParams.set('confirmed', '1');
  if (!hidePast) url.searchParams.set('past', 'show');

  return url.toString();
}

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
  const initialParams = useMemo(getInitialSearchParams, []);
  const [query, setQuery] = useState(() => initialParams.get('q') ?? '');
  const [selectedPlaces, setSelectedPlaces] = useState<string[]>(() =>
    getParamList(initialParams, 'place'),
  );
  const [selectedStyles, setSelectedStyles] = useState<string[]>(() =>
    getParamList(initialParams, 'style'),
  );
  const [selectedMonths, setSelectedMonths] = useState<string[]>(() =>
    getParamList(initialParams, 'month'),
  );
  const [dateFrom, setDateFrom] = useState(() => initialParams.get('from') ?? '');
  const [dateTo, setDateTo] = useState(() => initialParams.get('to') ?? '');
  const [confirmedOnly, setConfirmedOnly] = useState(() => initialParams.get('confirmed') === '1');
  const [hidePast, setHidePast] = useState(() => initialParams.get('past') !== 'show');

  const priceRange = useMemo<PriceRange>(() => {
    const prices = festivals
      .map(getFestivalMinPrice)
      .filter((price): price is number => price !== null);

    return {
      min: 0,
      max: Math.ceil(Math.max(0, ...prices)),
    };
  }, [festivals]);

  const [maxPrice, setMaxPrice] = useState<number | null>(() => getInitialMaxPrice(initialParams));
  const selectedMaxPrice = Math.min(
    Math.max(maxPrice ?? priceRange.max, priceRange.min),
    priceRange.max,
  );

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

  const shareUrl = useMemo(
    () =>
      buildShareUrl({
        confirmedOnly,
        dateFrom,
        dateTo,
        hidePast,
        maxPrice: selectedMaxPrice,
        priceRange,
        query,
        selectedMonths,
        selectedPlaces,
        selectedStyles,
      }),
    [
      confirmedOnly,
      dateFrom,
      dateTo,
      hidePast,
      priceRange,
      query,
      selectedMaxPrice,
      selectedMonths,
      selectedPlaces,
      selectedStyles,
    ],
  );

  useEffect(() => {
    if (!shareUrl || typeof window === 'undefined') return;
    window.history.replaceState(null, '', shareUrl);
  }, [shareUrl]);

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
    shareUrl,
    toggleValue,
  };
}
