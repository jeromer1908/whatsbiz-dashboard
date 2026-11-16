import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import type { SortDir } from './Usetablecontrols';

/* ---------- Search box ---------- */
export function SearchBox({
  value,
  onChange,
  placeholder = 'Search name, mobile, email...',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative w-full sm:w-72">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-8 text-sm text-black outline-none focus:border-green-500 focus:ring-2 focus:ring-green-200"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-black"
          aria-label="Clear search"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

/* ---------- Dropdown filter ("All" + options) ---------- */
export function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-black outline-none focus:border-green-500 focus:ring-2 focus:ring-green-200"
    >
      <option value="">{`All ${label}`}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

/* ---------- Clickable column header ---------- */
export function SortableTh<K extends string | number | symbol>({
  label,
  field,
  sortKey,
  sortDir,
  onSort,
  className = '',
}: {
  label: string;
  field: K;
  sortKey?: K;
  sortDir: SortDir;
  onSort: (k: K) => void;
  className?: string;
}) {
  const active = sortKey === field;
  const Icon = !active ? ArrowUpDown : sortDir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th className={`px-4 py-3 text-left text-sm font-semibold ${className}`}>
      <button
        onClick={() => onSort(field)}
        className={`inline-flex items-center gap-1 ${active ? 'text-green-700' : 'text-gray-700'} hover:text-green-700`}
      >
        {label}
        <Icon className={`h-3.5 w-3.5 ${active ? '' : 'opacity-40'}`} />
      </button>
    </th>
  );
}

/* ---------- Footer: "Showing 1-25 of 140" + page buttons ---------- */
export function Pagination({
  page,
  pageCount,
  pageSize,
  from,
  to,
  total,
  onPage,
  onPageSize,
}: {
  page: number;
  pageCount: number;
  pageSize: number;
  from: number;
  to: number;
  total: number;
  onPage: (p: number) => void;
  onPageSize: (n: number) => void;
}) {
  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-gray-200 px-4 py-3 text-sm text-gray-600 sm:flex-row">
      <div className="flex items-center gap-3">
        <span>{total === 0 ? 'No results' : `Showing ${from}-${to} of ${total}`}</span>
        <select
          value={pageSize}
          onChange={(e) => onPageSize(Number(e.target.value))}
          className="rounded-md border border-gray-300 px-2 py-1 text-sm"
          aria-label="Rows per page"
        >
          {[10, 25, 50, 100].map((n) => (
            <option key={n} value={n}>
              {n} / page
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          className="rounded-md border border-gray-300 p-1.5 disabled:opacity-40"
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span>
          Page {page} of {pageCount}
        </span>
        <button
          onClick={() => onPage(page + 1)}
          disabled={page >= pageCount}
          className="rounded-md border border-gray-300 p-1.5 disabled:opacity-40"
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/* ---------- Empty state row for when filters hide everything ---------- */
export function NoMatches({ colSpan, onClear }: { colSpan: number; onClear: () => void }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-10 text-center text-sm text-gray-500">
        No records match your search or filters.{' '}
        <button onClick={onClear} className="font-medium text-green-700 underline">
          Clear filters
        </button>
      </td>
    </tr>
  );
}