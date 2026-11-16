import { useState, useEffect, useMemo, useCallback } from 'react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { RechargeModal } from '@/components/RechargeModal';
import { PaymentModal } from '@/components/PaymentModal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/Skeleton';
import {
  SortTh,
  SelectFilter,
  DateRangeFilter,
  AmountRangeFilter,
  TablePagination,
} from '@/components/ui/Tableparts';
import { useTableControls } from '@/hooks/Usetablecontrols';
import { useToast } from '@/context/ToastContext';
import {
  fetchAllRecharges,
  deleteRecharge,
  isPaymentEntry,
  fetchCustomersByStatus,
  logSupabaseError,
} from '@/lib/api';
import { formatCustomerId, formatINR, formatDate, isPlanActive, matchesCustomerSearch } from '@/lib/format';
import type { Recharge, Customer } from '@/types';
import {
  IndianRupee,
  Plus,
  Search,
  Trash2,
  Pencil,
  TrendingUp,
  Calendar,
  Hash,
  Wallet,
  X,
} from 'lucide-react';

type CustomerFilter = 'all' | 'active' | 'expiring' | 'expired' | 'yetToRecharge';

// Flat row shapes so every column can be sorted and filtered by the table controls
type HistoryRow = Recharge & {
  display_id: string;
  customer_no: number | null;
  customer_name: string;
  customer_mobile: string;
};

type CustomerRow = {
  key: string;
  customer: Customer | undefined;
  display_id: string;
  customer_no: number | null;
  name: string;
  mobile: string;
  plan: string;
  valid_till: string | null;
  count: number;
  total: number;
  lastDate: string;
};

function matchesRechargeFilter(
  customer: Pick<Customer, 'is_active' | 'valid_till'> | null | undefined,
  filter: CustomerFilter
): boolean {
  return Boolean(
    customer?.is_active &&
    (
      filter === 'all' ||
      (filter === 'yetToRecharge' && !customer.valid_till) ||
      (filter !== 'yetToRecharge' && !!customer.valid_till && isPlanActive(customer.valid_till) === filter)
    )
  );
}

function RechargeStatusChip({
  customer,
}: {
  customer: Pick<Customer, 'is_active' | 'valid_till'> | undefined;
}) {
  if (!customer) return <span className="text-gray-400">—</span>;
  if (!customer.is_active) {
    return (
      <span className="inline-flex items-center text-xs font-bold text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
        Inactive
      </span>
    );
  }
  if (!customer.valid_till) {
    return (
      <span className="inline-flex items-center text-xs font-bold text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
        Yet to recharge
      </span>
    );
  }
  const status = isPlanActive(customer.valid_till);
  const styles = status === 'active'
    ? 'text-[#1EBE5A] bg-[#E8FAEF]'
    : status === 'expiring'
      ? 'text-amber-600 bg-amber-50'
      : 'text-red-500 bg-red-50';
  const label = status === 'active' ? 'Active' : status === 'expiring' ? 'Expiring Soon' : 'Expired';

  return (
    <span className={`inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-full ${styles}`}>
      {label}
    </span>
  );
}

function formatOptionalDate(date: string | null | undefined): string {
  if (!date) return '-';
  const formatted = formatDate(date);
  return formatted === '—' ? '-' : formatted;
}

function displayValue(value: string | null | undefined): string {
  return value?.trim() || '-';
}

function dateTimestamp(date: string | null | undefined): number {
  if (!date) return 0;
  const timestamp = new Date(date).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function SummaryCard({
  icon,
  label,
  value,
  color,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  color: 'green' | 'blue' | 'gray';
}) {
  const colorClasses = {
    green: 'bg-[#E8FAEF] text-[#1EBE5A]',
    blue: 'bg-blue-50 text-blue-600',
    gray: 'bg-gray-100 text-gray-600',
  };

  return (
    <div className="flex items-center gap-4 rounded-xl border border-[#E5E7EB] bg-white p-5">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${colorClasses[color]}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-500">{label}</p>
        <p className="mt-1 truncate text-xl font-extrabold text-black">{value}</p>
      </div>
    </div>
  );
}

function RechargeDetailStatus({
  customer,
}: {
  customer: Pick<Customer, 'is_active' | 'valid_till'>;
}) {
  return <RechargeStatusChip customer={customer} />;
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 break-words text-sm font-medium text-black">{value}</p>
    </div>
  );
}

function RechargeMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#E5E7EB] bg-white p-3">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="mt-1 text-sm font-bold text-black">{value}</p>
    </div>
  );
}

export function RechargesPage() {
  const { show } = useToast();
  const [recharges, setRecharges] = useState<Recharge[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'history' | 'byCustomer'>('history');
  const [customerFilter, setCustomerFilter] = useState<CustomerFilter>('all');
  const [showForm, setShowForm] = useState(false);
  const [editingRecharge, setEditingRecharge] = useState<Recharge | null>(null);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [editingPayment, setEditingPayment] = useState<Recharge | null>(null);
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);
  const [pickerCustomerId, setPickerCustomerId] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Recharge | null>(null);
  const [search, setSearch] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  // date range inside the customer detail panel
  const [drawerFrom, setDrawerFrom] = useState('');
  const [drawerTo, setDrawerTo] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [rechData, custData] = await Promise.all([
        fetchAllRecharges(),
        fetchCustomersByStatus('onboarded'),
      ]);
      setRecharges(rechData);
      setCustomers(custData);
    } catch (err) {
      logSupabaseError('Failed to load recharges', err);
      show('error', err instanceof Error ? err.message : 'Failed to load recharges');
    } finally {
      setLoading(false);
    }
  }, [show]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === selectedCustomerId) ?? null,
    [customers, selectedCustomerId]
  );

  const selectedCustomerRecharges = useMemo(
    () => recharges
      .filter((recharge) => recharge.customer_id === selectedCustomerId)
      .sort((a, b) => dateTimestamp(b.recharged_on) - dateTimestamp(a.recharged_on)
        || dateTimestamp(b.created_at) - dateTimestamp(a.created_at)),
    [recharges, selectedCustomerId]
  );

  // Plan recharges only (no payments) for the count / first / last metrics
  const selectedCustomerPlanRecharges = useMemo(
    () => selectedCustomerRecharges.filter((recharge) => !isPaymentEntry(recharge)),
    [selectedCustomerRecharges]
  );

  // Recharges shown in the panel table (summary cards above it still use all of them)
  const visibleDrawerRecharges = useMemo(
    () =>
      selectedCustomerRecharges.filter((recharge) => {
        const day = (recharge.recharged_on || '').slice(0, 10);
        if (drawerFrom && (!day || day < drawerFrom)) return false;
        if (drawerTo && (!day || day > drawerTo)) return false;
        return true;
      }),
    [selectedCustomerRecharges, drawerFrom, drawerTo]
  );

  useEffect(() => {
    setDrawerFrom('');
    setDrawerTo('');
  }, [selectedCustomerId]);

  useEffect(() => {
    if (!selectedCustomerId) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (showForm) {
        setShowForm(false);
        setEditingRecharge(null);
      } else if (showPaymentForm) {
        setShowPaymentForm(false);
        setEditingPayment(null);
      }
      else setSelectedCustomerId(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedCustomerId, showForm, showPaymentForm]);

  const summary = useMemo(() => {
    const total = recharges.reduce((s, r) => s + r.amount, 0);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonth = recharges
      .filter((r) => new Date(r.recharged_on) >= monthStart)
      .reduce((s, r) => s + r.amount, 0);
    return { total, thisMonth, count: recharges.filter((r) => !isPaymentEntry(r)).length };
  }, [recharges]);

  const byCustomer = useMemo(() => {
    const map: Record<
      string,
      {
        customer: Customer | undefined;
        count: number;
        total: number;
        lastDate: string;
      }
    > = {};

    for (const r of recharges) {
      const existing = map[r.customer_id] ?? (map[r.customer_id] = {
        customer: customers.find((c) => c.id === r.customer_id),
        count: 0,
        total: 0,
        lastDate: '',
      });
      // Payments add to the total amount but are not counted as recharges
      existing.total += r.amount;
      if (!isPaymentEntry(r)) {
        existing.count++;
        if (r.recharged_on > existing.lastDate) existing.lastDate = r.recharged_on;
      }
    }
    for (const customer of customers) {
      if (customer.is_active && !customer.valid_till && !map[customer.id]) {
        map[customer.id] = {
          customer,
          count: 0,
          total: 0,
          lastDate: '',
        };
      }
    }
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [recharges, customers]);

  const filterCounts = useMemo(() => {
    const activeCustomers = customers.filter((customer) => customer.is_active);
    return {
      all: activeCustomers.length,
      active: activeCustomers.filter((customer) => !!customer.valid_till && isPlanActive(customer.valid_till) === 'active').length,
      expiring: activeCustomers.filter((customer) => !!customer.valid_till && isPlanActive(customer.valid_till) === 'expiring').length,
      expired: activeCustomers.filter((customer) => !!customer.valid_till && isPlanActive(customer.valid_till) === 'expired').length,
      yetToRecharge: activeCustomers.filter((customer) => !customer.valid_till).length,
    };
  }, [customers]);

  // ---- Rows for the two tables: status buttons + search narrow them first,
  // ---- then the table controls (filters, sort, pagination) work on the result.
  const historyRows: HistoryRow[] = useMemo(() => {
    const q = search.trim().toLowerCase();
    return recharges
      .filter(
        (r) =>
          matchesRechargeFilter(r.customers, customerFilter) &&
          (!q || (r.customers && matchesCustomerSearch(r.customers, q)))
      )
      .map((r) => ({
        ...r,
        display_id: formatCustomerId(r.customers?.customer_no),
        customer_no: r.customers?.customer_no ?? null,
        customer_name: r.customers?.name ?? '',
        customer_mobile: r.customers?.mobile ?? '',
      }));
  }, [recharges, search, customerFilter]);

  const customerRows: CustomerRow[] = useMemo(() => {
    const q = search.trim().toLowerCase();
    return byCustomer
      .filter(
        (row) =>
          matchesRechargeFilter(row.customer, customerFilter) &&
          (!q || (row.customer && matchesCustomerSearch(row.customer, q)))
      )
      .map((row) => ({
        key: row.customer?.id || 'unknown',
        customer: row.customer,
        display_id: formatCustomerId(row.customer?.customer_no),
        customer_no: row.customer?.customer_no ?? null,
        name: row.customer?.name ?? '',
        mobile: row.customer?.mobile ?? '',
        plan: row.customer?.plan ?? '',
        valid_till: row.customer?.valid_till ?? null,
        count: row.count,
        total: row.total,
        lastDate: row.lastDate,
      }));
  }, [byCustomer, search, customerFilter]);

  const h = useTableControls<HistoryRow>({
    rows: historyRows,
    searchKeys: [], // search is handled above with matchesCustomerSearch
    defaultSortKey: 'recharged_on',
    defaultSortDir: 'desc',
    defaultPageSize: 20,
  });

  const c = useTableControls<CustomerRow>({
    rows: customerRows,
    searchKeys: [],
    defaultSortKey: 'total',
    defaultSortDir: 'desc',
    defaultPageSize: 20,
  });

  // Back to page 1 whenever the search box or a status button changes
  const { setPage: setHistoryPage } = h;
  const { setPage: setCustomerPage } = c;
  useEffect(() => {
    setHistoryPage(1);
    setCustomerPage(1);
  }, [search, customerFilter, setHistoryPage, setCustomerPage]);

  const planOptions = useMemo(
    () => [...new Set(customers.map((cu) => cu.plan).filter((p): p is string => !!p))].sort(),
    [customers]
  );

  const active = tab === 'history' ? h : c;
  const hasActiveFilters = search.trim() !== '' || active.hasActiveFilters;
  const clearAllFilters = () => {
    setSearch('');
    active.clearAll();
  };

  const hSort = { sortKey: h.sortKey, sortDir: h.sortDir, onSort: h.toggleSort };
  const cSort = { sortKey: c.sortKey, sortDir: c.sortDir, onSort: c.toggleSort };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteRecharge(deleteTarget.id);
      show('success', 'Recharge deleted');
      setDeleteTarget(null);
      loadData();
    } catch (err) {
      logSupabaseError('Failed to delete recharge', err);
      show('error', err instanceof Error ? err.message : 'Failed to delete recharge');
    }
  };

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard
          icon={<IndianRupee size={20} />}
          label="Total Recharged"
          value={formatINR(summary.total)}
          color="green"
        />
        <SummaryCard
          icon={<TrendingUp size={20} />}
          label="This Month"
          value={formatINR(summary.thisMonth)}
          color="blue"
        />
        <SummaryCard
          icon={<Hash size={20} />}
          label="Total Recharges"
          value={String(summary.count)}
          color="gray"
        />
      </div>

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <h3 className="text-2xl font-extrabold text-black">Recharges</h3>
        <div className="flex items-center gap-3">
          <div className="relative flex-1 min-w-0 lg:flex-none">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search customer…"
              className="pl-10 pr-4 py-2.5 rounded-lg border border-[#E5E7EB] text-sm font-medium w-full sm:w-48 focus:outline-none focus:ring-2 focus:ring-[#25D366] focus:border-transparent"
            />
          </div>
          <Button
            onClick={() => {
              if (customers.length === 0) {
                show('error', 'No onboarded customers are available for recharge');
                return;
              }
              setPickerCustomerId(customers[0].id);
              setShowCustomerPicker(true);
            }}
            disabled={loading}
            className="shrink-0 whitespace-nowrap"
          >
            <Plus size={16} />
            Add Recharge
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2">
        {([
          { key: 'history', label: 'History' },
          { key: 'byCustomer', label: 'By Customer' },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              tab === t.key
                ? 'bg-[#25D366] text-white'
                : 'bg-white text-gray-600 border border-[#E5E7EB] hover:bg-gray-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {([
          { key: 'all', label: `All (${filterCounts.all})` },
          { key: 'active', label: `Active (${filterCounts.active})` },
          { key: 'expiring', label: `Expiring Soon (${filterCounts.expiring})` },
          { key: 'expired', label: `Expired (${filterCounts.expired})` },
          { key: 'yetToRecharge', label: `Yet to recharge (${filterCounts.yetToRecharge})` },
        ] as { key: CustomerFilter; label: string }[]).map((filterOption) => (
          <button
            key={filterOption.key}
            onClick={() => {
              setCustomerFilter(filterOption.key);
              if (filterOption.key === 'yetToRecharge') setTab('byCustomer');
            }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              customerFilter === filterOption.key
                ? 'bg-[#25D366] text-white'
                : 'bg-white text-gray-600 border border-[#E5E7EB] hover:bg-gray-50'
            }`}
          >
            {filterOption.label}
          </button>
        ))}
      </div>

      {/* Filters for the current tab */}
      {!loading && (
        <div className="flex items-center gap-x-4 gap-y-3 flex-wrap">
          {tab === 'history' ? (
            <>
              <DateRangeFilter
                label="Recharge date"
                from={h.getRange('recharged_on').from}
                to={h.getRange('recharged_on').to}
                onChange={(from, to) => h.setRange('recharged_on', from, to)}
              />
              <DateRangeFilter
                label="Valid till"
                from={h.getRange('valid_till').from}
                to={h.getRange('valid_till').to}
                onChange={(from, to) => h.setRange('valid_till', from, to)}
              />
              <AmountRangeFilter
                label="Amount"
                from={h.getRange('amount').from}
                to={h.getRange('amount').to}
                onChange={(from, to) => h.setRange('amount', from, to)}
              />
            </>
          ) : (
            <>
              <SelectFilter
                label="Plan"
                allLabel="All plans"
                value={c.filters.plan ?? ''}
                options={planOptions}
                onChange={(v) => c.setFilter('plan', v)}
              />
              <DateRangeFilter
                label="Valid till"
                from={c.getRange('valid_till').from}
                to={c.getRange('valid_till').to}
                onChange={(from, to) => c.setRange('valid_till', from, to)}
              />
              <DateRangeFilter
                label="Last recharge"
                from={c.getRange('lastDate').from}
                to={c.getRange('lastDate').to}
                onChange={(from, to) => c.setRange('lastDate', from, to)}
              />
              <AmountRangeFilter
                label="Total amount"
                from={c.getRange('total').from}
                to={c.getRange('total').to}
                onChange={(from, to) => c.setRange('total', from, to)}
              />
            </>
          )}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="inline-flex items-center gap-1 text-sm font-semibold text-gray-500 hover:text-black"
            >
              <X size={14} />
              Clear search &amp; filters
            </button>
          )}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden">
        {loading ? (
          <div className="p-6">
            <TableSkeleton cols={9} />
          </div>
        ) : tab === 'history' ? (
          recharges.length === 0 ? (
            <EmptyState
              icon={<IndianRupee size={28} />}
              title="No recharges yet"
              description="Add a recharge to an onboarded customer to see it here."
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-left border-b border-[#E5E7EB]">
                    <tr>
                      <SortTh label="ID" field="customer_no" {...hSort} />
                      <SortTh label="Date" field="recharged_on" {...hSort} />
                      <SortTh label="Valid Till" field="valid_till" {...hSort} />
                      <SortTh label="Customer" field="customer_name" {...hSort} />
                      <SortTh label="Mobile" field="customer_mobile" className="hidden md:table-cell" {...hSort} />
                      <SortTh label="Amount" field="amount" {...hSort} />
                      <th className="px-4 py-3 font-semibold text-gray-600">Status</th>
                      <th className="px-4 py-3 font-semibold text-gray-600 hidden xl:table-cell">Note</th>
                      <th className="px-4 py-3 font-semibold text-gray-600 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {h.total === 0 && (
                      <tr>
                        <td colSpan={9} className="px-4 py-10 text-center text-sm text-gray-500">
                          No recharges match the current search or filters.{' '}
                          <button onClick={clearAllFilters} className="font-semibold text-[#25D366] underline">
                            Clear filters
                          </button>
                        </td>
                      </tr>
                    )}
                    {h.pageRows.map((r) => (
                      <tr key={r.id} className="border-b border-[#E5E7EB] last:border-0 hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-gray-600 font-medium">{r.display_id}</td>
                        <td className="px-4 py-3 text-gray-500">{formatDate(r.recharged_on)}</td>
                        <td className="px-4 py-3 text-gray-500">
                          {isPaymentEntry(r) ? (
                            <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-600">
                              Payment
                            </span>
                          ) : r.valid_till ? formatDate(r.valid_till) : '-'}
                        </td>
                        <td className="px-4 py-3 font-semibold text-black">{r.customers?.name || 'Unknown'}</td>
                        <td className="px-4 py-3 text-black font-medium hidden md:table-cell">
                          {r.customers?.mobile || '—'}
                        </td>
                        <td className="px-4 py-3 font-bold text-[#1EBE5A]">{formatINR(r.amount)}</td>
                        <td className="px-4 py-3">
                          <RechargeStatusChip customer={r.customers} />
                        </td>
                        <td className="px-4 py-3 text-gray-500 hidden xl:table-cell max-w-[200px] truncate">
                          {r.note || '—'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end">
                            <button
                              onClick={() => setDeleteTarget(r)}
                              className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {h.total > 0 && (
                <TablePagination
                  page={h.page}
                  pageCount={h.pageCount}
                  pageSize={h.pageSize}
                  from={h.from}
                  to={h.to}
                  total={h.total}
                  onPage={h.setPage}
                  onPageSize={h.setPageSize}
                />
              )}
            </>
          )
        ) : byCustomer.length === 0 ? (
          <EmptyState
            icon={<Calendar size={28} />}
            title="No customer data yet"
            description="Recharge data grouped by customer will appear here."
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left border-b border-[#E5E7EB]">
                  <tr>
                    <SortTh label="ID" field="customer_no" {...cSort} />
                    <SortTh label="Customer" field="name" {...cSort} />
                    <SortTh label="Mobile" field="mobile" className="hidden md:table-cell" {...cSort} />
                    <SortTh label="Plan" field="plan" className="hidden lg:table-cell" {...cSort} />
                    <SortTh label="Valid Till" field="valid_till" {...cSort} />
                    <th className="px-4 py-3 font-semibold text-gray-600">Status</th>
                    <SortTh label="Recharges" field="count" {...cSort} />
                    <SortTh label="Total Amount" field="total" {...cSort} />
                    <SortTh label="Last Recharge" field="lastDate" className="hidden xl:table-cell" {...cSort} />
                  </tr>
                </thead>
                <tbody>
                  {c.total === 0 && (
                    <tr>
                      <td colSpan={9} className="px-4 py-10 text-center text-sm text-gray-500">
                        No customers match the current search or filters.{' '}
                        <button onClick={clearAllFilters} className="font-semibold text-[#25D366] underline">
                          Clear filters
                        </button>
                      </td>
                    </tr>
                  )}
                  {c.pageRows.map((row) => (
                    <tr
                      key={row.key}
                      onClick={() => row.customer && setSelectedCustomerId(row.customer.id)}
                      onKeyDown={(event) => {
                        if (row.customer && (event.key === 'Enter' || event.key === ' ')) {
                          event.preventDefault();
                          setSelectedCustomerId(row.customer.id);
                        }
                      }}
                      role={row.customer ? 'button' : undefined}
                      tabIndex={row.customer ? 0 : undefined}
                      className={`border-b border-[#E5E7EB] last:border-0 transition-colors ${
                        row.customer ? 'cursor-pointer hover:bg-[#F7FCF8] focus:bg-[#F7FCF8] focus:outline-none' : 'hover:bg-gray-50'
                      }`}
                    >
                      <td className="px-4 py-3 text-gray-600 font-medium">{row.display_id}</td>
                      <td className="px-4 py-3 font-semibold text-black">{row.customer?.name || 'Unknown'}</td>
                      <td className="px-4 py-3 text-black font-medium hidden md:table-cell">
                        {row.customer?.mobile || '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-500 hidden lg:table-cell">{row.customer?.plan || '—'}</td>
                      <td className="px-4 py-3 text-gray-500">{row.customer?.valid_till ? formatDate(row.customer.valid_till) : '-'}</td>
                      <td className="px-4 py-3"><RechargeStatusChip customer={row.customer} /></td>
                      <td className="px-4 py-3 text-gray-600 font-semibold">{row.count}</td>
                      <td className="px-4 py-3 font-bold text-[#1EBE5A]">{formatINR(row.total)}</td>
                      <td className="px-4 py-3 text-gray-500 hidden xl:table-cell">{formatDate(row.lastDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {c.total > 0 && (
              <TablePagination
                page={c.page}
                pageCount={c.pageCount}
                pageSize={c.pageSize}
                from={c.from}
                to={c.to}
                total={c.total}
                onPage={c.setPage}
                onPageSize={c.setPageSize}
              />
            )}
          </>
        )}
      </div>

      {selectedCustomer && (
        <div
          className="fixed inset-0 z-40 bg-black/40"
          onClick={() => setSelectedCustomerId(null)}
        >
          <aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="customer-detail-title"
            className="absolute right-0 top-0 flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl animate-modal-in"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#E5E7EB] px-6 py-4">
              <div>
                <h2 id="customer-detail-title" className="text-lg font-bold text-black">Customer Details</h2>
                <p className="text-sm text-gray-500">{displayValue(selectedCustomer.name)}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCustomerId(null)}
                aria-label="Close customer details"
                className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 space-y-6 overflow-y-auto p-6">
              <section className="rounded-xl border border-[#E5E7EB] bg-gray-50 p-4">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Customer ID</p>
                    <p className="mt-1 font-bold text-black">
                      {selectedCustomer.customer_no == null ? '-' : formatCustomerId(selectedCustomer.customer_no)}
                    </p>
                  </div>
                  <RechargeDetailStatus customer={selectedCustomer} />
                </div>
                <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                  <DetailField label="Name" value={displayValue(selectedCustomer.name)} />
                  <DetailField label="Mobile" value={displayValue(selectedCustomer.mobile)} />
                  <DetailField label="Business" value={displayValue(selectedCustomer.business)} />
                  <DetailField label="Location" value={displayValue(selectedCustomer.location)} />
                  <DetailField label="Current Plan" value={displayValue(selectedCustomer.plan)} />
                  <DetailField label="Valid Till" value={formatOptionalDate(selectedCustomer.valid_till)} />
                </div>
              </section>

              <section>
                <h3 className="mb-3 text-base font-bold text-black">Recharge Summary</h3>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <RechargeMetric label="Total Recharges" value={String(selectedCustomerPlanRecharges.length)} />
                  <RechargeMetric
                    label="Total Amount"
                    value={formatINR(selectedCustomerRecharges.reduce(
                      (total, recharge) => total + (Number.isFinite(recharge.amount) ? recharge.amount : 0),
                      0
                    ))}
                  />
                  <RechargeMetric
                    label="First Recharge"
                    value={formatOptionalDate(selectedCustomerPlanRecharges[selectedCustomerPlanRecharges.length - 1]?.recharged_on)}
                  />
                  <RechargeMetric
                    label="Last Recharge"
                    value={formatOptionalDate(selectedCustomerPlanRecharges[0]?.recharged_on)}
                  />
                </div>
              </section>

              <section>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-base font-bold text-black">Recharge History</h3>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setEditingPayment(null);
                        setShowPaymentForm(true);
                      }}
                    >
                      <Wallet size={16} />
                      Payment
                    </Button>
                    <Button onClick={() => {
                      setEditingRecharge(null);
                      setShowForm(true);
                    }}>
                      <Plus size={16} />
                      Add Recharge
                    </Button>
                  </div>
                </div>
                {selectedCustomerRecharges.length > 0 && (
                  <div className="mb-3 flex flex-wrap items-center gap-3">
                    <DateRangeFilter
                      label="Date"
                      from={drawerFrom}
                      to={drawerTo}
                      onChange={(from, to) => {
                        setDrawerFrom(from);
                        setDrawerTo(to);
                      }}
                    />
                    {(drawerFrom || drawerTo) && (
                      <button
                        type="button"
                        onClick={() => {
                          setDrawerFrom('');
                          setDrawerTo('');
                        }}
                        className="inline-flex items-center gap-1 text-sm font-semibold text-gray-500 hover:text-black"
                      >
                        <X size={14} />
                        Clear
                      </button>
                    )}
                  </div>
                )}
                {visibleDrawerRecharges.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-[#E5E7EB] px-4 py-8 text-center text-sm font-medium text-gray-500">
                    {selectedCustomerRecharges.length === 0
                      ? 'No recharges yet'
                      : 'No recharges in this date range'}
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-[#E5E7EB]">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-left">
                        <tr>
                          <th className="px-4 py-3 font-semibold text-gray-600">Date</th>
                          <th className="px-4 py-3 font-semibold text-gray-600">Plan</th>
                          <th className="px-4 py-3 font-semibold text-gray-600">Amount</th>
                          <th className="px-4 py-3 font-semibold text-gray-600">Valid Till</th>
                          <th className="px-4 py-3 font-semibold text-gray-600">Remark</th>
                          <th className="px-4 py-3 text-right font-semibold text-gray-600">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleDrawerRecharges.map((recharge) => (
                          <tr key={recharge.id} className="border-t border-[#E5E7EB]">
                            <td className="px-4 py-3 text-gray-600">{formatOptionalDate(recharge.recharged_on)}</td>
                            <td className="px-4 py-3 text-gray-600">
                              {isPaymentEntry(recharge) ? (
                                <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-600">
                                  Payment
                                </span>
                              ) : (
                                displayValue(selectedCustomer.plan)
                              )}
                            </td>
                            <td className="px-4 py-3 font-semibold text-[#1EBE5A]">
                              {formatINR(Number.isFinite(recharge.amount) ? recharge.amount : 0)}
                            </td>
                            <td className="px-4 py-3 text-gray-600">{formatOptionalDate(recharge.valid_till)}</td>
                            <td className="max-w-[220px] whitespace-pre-wrap break-words px-4 py-3 text-gray-600">{displayValue(recharge.note)}</td>
                            <td className="px-4 py-3 text-right">
                              <button
                                type="button"
                                onClick={() => {
                                  if (isPaymentEntry(recharge)) {
                                    setEditingPayment(recharge);
                                    setShowPaymentForm(true);
                                  } else {
                                    setEditingRecharge(recharge);
                                    setShowForm(true);
                                  }
                                }}
                                aria-label={`Edit recharge from ${formatDate(recharge.recharged_on)}`}
                                className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-[#E8FAEF] hover:text-[#1EBE5A]"
                              >
                                <Pencil size={16} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
          </aside>
        </div>
      )}

      {showCustomerPicker && (
        <Modal
          open
          onClose={() => setShowCustomerPicker(false)}
          title="Select Customer"
          size="sm"
        >
          <div className="space-y-4">
            <div>
              <label htmlFor="new-recharge-customer" className="mb-1.5 block text-sm font-semibold text-black">
                Customer
              </label>
              <select
                id="new-recharge-customer"
                value={pickerCustomerId}
                onChange={(event) => setPickerCustomerId(event.target.value)}
                className="w-full rounded-lg border border-[#E5E7EB] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#25D366]"
              >
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name} — {customer.mobile}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => setShowCustomerPicker(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={!pickerCustomerId}
                onClick={() => {
                  setSelectedCustomerId(pickerCustomerId);
                  setEditingRecharge(null);
                  setShowCustomerPicker(false);
                  setShowForm(true);
                }}
              >
                Continue
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {showForm && selectedCustomer && (
        <RechargeModal
          customer={selectedCustomer}
          recharge={editingRecharge ?? undefined}
          onClose={() => {
            setShowForm(false);
            setEditingRecharge(null);
          }}
          onSaved={() => {
            setShowForm(false);
            setEditingRecharge(null);
            loadData();
          }}
        />
      )}

      {showPaymentForm && selectedCustomer && (
        <PaymentModal
          customer={selectedCustomer}
          payment={editingPayment ?? undefined}
          onClose={() => {
            setShowPaymentForm(false);
            setEditingPayment(null);
          }}
          onSaved={() => {
            setShowPaymentForm(false);
            setEditingPayment(null);
            loadData();
          }}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Recharge"
        message={`Delete this recharge of ${formatINR(deleteTarget?.amount || 0)}? This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}