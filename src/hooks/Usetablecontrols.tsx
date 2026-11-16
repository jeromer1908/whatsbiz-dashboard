import { useEffect, useMemo, useState } from 'react';

export type SortDir = 'asc' | 'desc';
/** from / to as strings straight from <input type="date"> or <input type="number">. '' = no limit */
export type Range = { from: string; to: string };
const EMPTY_RANGE: Range = { from: '', to: '' };

interface Options<T> {
  rows: T[];
  /** Fields the search box looks into. Pass [] if you search outside the hook. */
  searchKeys: (keyof T)[];
  defaultSortKey?: keyof T;
  defaultSortDir?: SortDir;
  defaultPageSize?: number;
}

function isEmpty(v: unknown) {
  return v == null || v === '';
}

function compare(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  // ISO dates (2026-10-10) sort correctly as strings; numeric:true handles "10" vs "9"
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

export function useTableControls<T extends Record<string, any>>({
  rows,
  searchKeys,
  defaultSortKey,
  defaultSortDir = 'asc',
  defaultPageSize = 25,
}: Options<T>) {
  const [search, setSearch] = useState('');
  // dropdown filters: { plan: 'Gold', mode: 'UPI' } -> '' / missing = "All"
  const [filters, setFilters] = useState<Record<string, string>>({});
  // range filters (dates or numbers): { valid_till: { from: '2026-10-01', to: '2026-10-31' } }
  const [ranges, setRanges] = useState<Record<string, Range>>({});
  const [sortKey, setSortKey] = useState<keyof T | undefined>(defaultSortKey);
  const [sortDir, setSortDir] = useState<SortDir>(defaultSortDir);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);

  const setFilter = (key: string, value: string) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  const setRange = (key: string, from: string, to: string) =>
    setRanges((prev) => ({ ...prev, [key]: { from, to } }));

  const getRange = (key: string): Range => ranges[key] ?? EMPTY_RANGE;

  const toggleSort = (key: keyof T) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const clearAll = () => {
    setSearch('');
    setFilters({});
    setRanges({});
  };

  // 1) search + dropdown filters + range filters
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      for (const [key, value] of Object.entries(filters)) {
        if (value && String(row[key] ?? '') !== value) return false;
      }
      for (const [key, r] of Object.entries(ranges)) {
        if (!r.from && !r.to) continue;
        const v = row[key];
        if (typeof v === 'number') {
          if (r.from !== '' && v < Number(r.from)) return false;
          if (r.to !== '' && v > Number(r.to)) return false;
        } else {
          const s = String(v ?? '').slice(0, 10); // works for date and timestamp strings
          if (!s) return false; // rows with no value can't be inside a range
          if (r.from && s < r.from) return false;
          if (r.to && s > r.to) return false;
        }
      }
      if (!q) return true;
      return searchKeys.some((k) => String(row[k] ?? '').toLowerCase().includes(q));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, search, filters, ranges]);

  // 2) sort (empty values always go last, in both directions)
  const sortedRows = useMemo(() => {
    if (!sortKey) return filteredRows;
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filteredRows].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const ae = isEmpty(av);
      const be = isEmpty(bv);
      if (ae && be) return 0;
      if (ae) return 1;
      if (be) return -1;
      return dir * compare(av, bv);
    });
  }, [filteredRows, sortKey, sortDir]);

  // 3) paginate
  const total = sortedRows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    setPage(1);
  }, [search, filters, ranges, sortKey, sortDir, pageSize]);

  // if rows shrink (delete/convert), don't stay on a page that no longer exists
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const start = (page - 1) * pageSize;
  const pageRows = sortedRows.slice(start, start + pageSize);

  return {
    pageRows,
    /** everything after search/filter/sort, ignoring pagination - use for Excel/CSV export */
    allFilteredRows: sortedRows,
    total,
    from: total === 0 ? 0 : start + 1,
    to: Math.min(start + pageSize, total),
    search,
    setSearch,
    filters,
    setFilter,
    ranges,
    setRange,
    getRange,
    clearAll,
    hasActiveFilters:
      search.trim() !== '' ||
      Object.values(filters).some(Boolean) ||
      Object.values(ranges).some((r) => r.from || r.to),
    sortKey,
    sortDir,
    toggleSort,
    page,
    setPage,
    pageCount,
    pageSize,
    setPageSize,
  };
}