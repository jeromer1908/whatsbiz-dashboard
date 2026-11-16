import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import type { SortDir } from '@/hooks/Usetablecontrols';

const controlClass =
  'py-2 px-3 rounded-lg border border-[#E5E7EB] text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-[#25D366] focus:border-transparent';

/* Clickable column header */
export function SortTh<K extends string | number | symbol>({
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
    <th className={`px-4 py-3 font-semibold text-gray-600 ${className}`}>
      <button
        type="button"
        onClick={() => onSort(field)}
        className={`inline-flex items-center gap-1 hover:text-black ${active ? 'text-black' : ''}`}
      >
        {label}
        <Icon size={13} className={active ? 'text-[#25D366]' : 'opacity-40'} />
      </button>
    </th>
  );
}

/* Dropdown: "All plans" + the options */
export function SelectFilter({
  label,
  allLabel,
  value,
  options,
  onChange,
}: {
  label: string;
  allLabel: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={controlClass}
      aria-label={label}
    >
      <option value="">{allLabel}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

/* From - To date inputs */
export function DateRangeFilter({
  label,
  from,
  to,
  onChange,
}: {
  label: string;
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}) {
  return (
    <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full sm:w-auto">
      <span className="w-full sm:w-auto text-sm font-semibold text-gray-600">{label}</span>
      <input
        type="date"
        value={from}
        max={to || undefined}
        onChange={(e) => onChange(e.target.value, to)}
        className={`${controlClass} flex-1 min-w-0 sm:flex-none`}
        aria-label={`${label} from`}
      />
      <span className="text-sm text-gray-400">to</span>
      <input
        type="date"
        value={to}
        min={from || undefined}
        onChange={(e) => onChange(from, e.target.value)}
        className={`${controlClass} flex-1 min-w-0 sm:flex-none`}
        aria-label={`${label} to`}
      />
    </div>
  );
}

/* Min - Max number inputs */
export function AmountRangeFilter({
  label,
  from,
  to,
  onChange,
}: {
  label: string;
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}) {
  return (
    <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full sm:w-auto">
      <span className="w-full sm:w-auto text-sm font-semibold text-gray-600">{label}</span>
      <input
        type="number"
        min="0"
        value={from}
        placeholder="Min ₹"
        onChange={(e) => onChange(e.target.value, to)}
        className={`${controlClass} flex-1 min-w-0 sm:flex-none sm:w-24`}
        aria-label={`${label} minimum`}
      />
      <span className="text-sm text-gray-400">to</span>
      <input
        type="number"
        min="0"
        value={to}
        placeholder="Max ₹"
        onChange={(e) => onChange(from, e.target.value)}
        className={`${controlClass} flex-1 min-w-0 sm:flex-none sm:w-24`}
        aria-label={`${label} maximum`}
      />
    </div>
  );
}

/* Footer: "Showing 1-20 of 140", rows per page, prev / next */
export function TablePagination({
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
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-[#E5E7EB]">
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-500 font-medium">
          Showing {from}–{to} of {total}
        </span>
        <select
          value={pageSize}
          onChange={(e) => onPageSize(Number(e.target.value))}
          className="py-1.5 px-2 rounded-lg border border-[#E5E7EB] text-sm font-medium bg-white"
          aria-label="Rows per page"
        >
          {[10, 20, 50, 100].map((n) => (
            <option key={n} value={n}>
              {n} / page
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-500 font-medium">
          Page {page} of {pageCount}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onPage(page - 1)}
            disabled={page <= 1}
            className="p-2 rounded-lg border border-[#E5E7EB] text-gray-600 hover:bg-gray-50 disabled:opacity-40"
            aria-label="Previous page"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            onClick={() => onPage(page + 1)}
            disabled={page >= pageCount}
            className="p-2 rounded-lg border border-[#E5E7EB] text-gray-600 hover:bg-gray-50 disabled:opacity-40"
            aria-label="Next page"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}