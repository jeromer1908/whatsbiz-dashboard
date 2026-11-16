// =====================================================================
// REPLACE the top of src/pages/OnboardedPage.tsx with this file's content:
// everything from line 1 down to the closing brace of `export function OnboardedPage()`
// (stop just above `function StatusChip`).
// KEEP as-is: StatusChip, InactiveStatusChip, EditPlanModal, RechargeModal.
// =====================================================================
import { useState, useEffect, useMemo } from 'react';
import type { FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { Modal } from '@/components/ui/Modal';
import { RechargeModal } from '@/components/RechargeModal';
import { CustomerViewModal } from '@/components/CustomerViewModal';
import { SortTh, SelectFilter, DateRangeFilter, TablePagination } from '@/components/ui/Tableparts';
import { useTableControls } from '@/hooks/Usetablecontrols';
import { useToast } from '@/context/ToastContext';
import {
  fetchCustomersByStatus,
  updateCustomer,
  fetchRechargesForCustomer,
  logSupabaseError,
} from '@/lib/api';
import { formatCustomerId, formatDate, formatINR, isPlanActive, todayISO } from '@/lib/format';
import type { Customer } from '@/types';
import {
  Search,
  Plus,
  Pencil,
  Power,
  IndianRupee,
  Loader2,
  Check,
  AlertTriangle,
  X,
  Eye,
} from 'lucide-react';

type Filter = 'all' | 'active' | 'inactive';
type Row = Customer & { display_id: string; recharged_total: number };

export function OnboardedPage() {
  const { show } = useToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [rechargeMap, setRechargeMap] = useState<Record<string, number>>({});
  const [editPlanCustomer, setEditPlanCustomer] = useState<Customer | null>(null);
  const [rechargeCustomer, setRechargeCustomer] = useState<Customer | null>(null);
  const [viewCustomer, setViewCustomer] = useState<Customer | null>(null);
  const [inactiveCustomer, setInactiveCustomer] = useState<Customer | null>(null);
  const [inactiveReason, setInactiveReason] = useState('');
  const [savingActiveState, setSavingActiveState] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await fetchCustomersByStatus('onboarded');
      setCustomers(data);
      // Fetch recharge totals
      const totals: Record<string, number> = {};
      for (const c of data) {
        const recharges = await fetchRechargesForCustomer(c.id);
        totals[c.id] = recharges.reduce((sum, r) => sum + r.amount, 0);
      }
      setRechargeMap(totals);
    } catch (err) {
      logSupabaseError('Failed to load onboarded customers and recharge totals', err);
      show('error', err instanceof Error ? err.message : 'Failed to load customers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Customer + formatted ID (searchable) + total recharged (sortable)
  const rows: Row[] = useMemo(
    () =>
      customers.map((c) => ({
        ...c,
        display_id: formatCustomerId(c.customer_no),
        recharged_total: rechargeMap[c.id] || 0,
      })),
    [customers, rechargeMap]
  );

  // The All / Active / Inactive tabs narrow the rows first, then the table controls work on that
  const tabRows = useMemo(() => {
    if (filter === 'all') return rows;
    return rows.filter((c) => (filter === 'active' ? c.is_active : !c.is_active));
  }, [rows, filter]);

  const t = useTableControls<Row>({
    rows: tabRows,
    searchKeys: ['display_id', 'name', 'mobile', 'location', 'business'],
    defaultSortKey: 'customer_no', // newest first
    defaultSortDir: 'desc',
    defaultPageSize: 20,
  });

  const planOptions = useMemo(
    () => [...new Set(customers.map((c) => c.plan).filter((p): p is string => !!p))].sort(),
    [customers]
  );
  const startRange = t.getRange('plan_start');

  const counts = useMemo(() => {
    return {
      all: customers.length,
      active: customers.filter((customer) => customer.is_active).length,
      inactive: customers.filter((customer) => !customer.is_active).length,
    };
  }, [customers]);

  const handleMarkInactive = async () => {
    if (!inactiveCustomer) return;
    setSavingActiveState(true);
    try {
      await updateCustomer(inactiveCustomer.id, {
        is_active: false,
        inactive_reason: inactiveReason.trim() || null,
      });
      show('success', `${inactiveCustomer.name} marked inactive`);
      setInactiveCustomer(null);
      setInactiveReason('');
      await loadData();
    } catch (err) {
      show('error', err instanceof Error ? err.message : 'Failed to update customer status');
    } finally {
      setSavingActiveState(false);
    }
  };

  const handleMarkActive = async (customer: Customer) => {
    try {
      await updateCustomer(customer.id, { is_active: true, inactive_reason: null });
      show('success', `${customer.name} marked active`);
      await loadData();
    } catch (err) {
      show('error', err instanceof Error ? err.message : 'Failed to update customer status');
    }
  };

  const sortProps = { sortKey: t.sortKey, sortDir: t.sortDir, onSort: t.toggleSort };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h3 className="text-2xl font-extrabold text-black">
          Onboarded Customers{' '}
          <span className="text-[#25D366]">
            ({t.hasActiveFilters ? `${t.total} of ${customers.length}` : customers.length})
          </span>
        </h3>
        <div className="relative w-full sm:w-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            value={t.search}
            onChange={(e) => t.setSearch(e.target.value)}
            placeholder="Search name, mobile, ID, location or business…"
            className="pl-10 pr-4 py-2.5 rounded-lg border border-[#E5E7EB] text-sm font-medium w-full sm:w-56 focus:outline-none focus:ring-2 focus:ring-[#25D366] focus:border-transparent"
          />
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        {([
          { key: 'all', label: `All (${counts.all})` },
          { key: 'active', label: `Active (${counts.active})` },
          { key: 'inactive', label: `Inactive (${counts.inactive})` },
        ] as { key: Filter; label: string }[]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              filter === tab.key
                ? 'bg-[#25D366] text-white'
                : 'bg-white text-gray-600 border border-[#E5E7EB] hover:bg-gray-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Plan + start date filters */}
      {customers.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <SelectFilter
            label="Plan"
            allLabel="All plans"
            value={t.filters.plan ?? ''}
            options={planOptions}
            onChange={(v) => t.setFilter('plan', v)}
          />
          <DateRangeFilter
            label="Start date"
            from={startRange.from}
            to={startRange.to}
            onChange={(from, to) => t.setRange('plan_start', from, to)}
          />
          {t.hasActiveFilters && (
            <button
              type="button"
              onClick={t.clearAll}
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
            <TableSkeleton cols={12} />
          </div>
        ) : customers.length === 0 ? (
          <EmptyState
            icon={<IndianRupee size={28} />}
            title="No onboarded customers"
            description="Convert enquiries to customers to see them here."
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left border-b border-[#E5E7EB]">
                  <tr>
                    <SortTh label="ID" field="customer_no" {...sortProps} />
                    <SortTh label="Name" field="name" {...sortProps} />
                    <SortTh label="Location" field="location" className="hidden xl:table-cell" {...sortProps} />
                    <SortTh label="Business" field="business" className="hidden xl:table-cell" {...sortProps} />
                    <SortTh label="Mobile" field="mobile" className="hidden md:table-cell" {...sortProps} />
                    <SortTh label="Plan" field="plan" className="hidden lg:table-cell" {...sortProps} />
                    <SortTh label="Amount" field="plan_amount" {...sortProps} />
                    <SortTh label="Start" field="plan_start" className="hidden md:table-cell" {...sortProps} />
                    <SortTh label="Valid Till" field="valid_till" {...sortProps} />
                    <th className="px-4 py-3 font-semibold text-gray-600">Status</th>
                    <SortTh label="Recharged" field="recharged_total" className="hidden xl:table-cell" {...sortProps} />
                    <th className="px-4 py-3 font-semibold text-gray-600 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {t.total === 0 && (
                    <tr>
                      <td colSpan={12} className="px-4 py-10 text-center text-sm text-gray-500">
                        No customers match your search or filters.{' '}
                        <button onClick={t.clearAll} className="font-semibold text-[#25D366] underline">
                          Clear filters
                        </button>
                      </td>
                    </tr>
                  )}
                  {t.pageRows.map((c) => {
                    const status = isPlanActive(c.valid_till);
                    return (
                      <tr key={c.id} className="border-b border-[#E5E7EB] last:border-0 hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-gray-600 font-medium">{c.display_id}</td>
                        <td className="px-4 py-3 font-semibold text-black">{c.name}</td>
                        <td className="px-4 py-3 text-gray-500 hidden xl:table-cell">{c.location || '—'}</td>
                        <td className="px-4 py-3 text-gray-500 hidden xl:table-cell">{c.business || '—'}</td>
                        <td className="px-4 py-3 text-black font-medium hidden md:table-cell">{c.mobile}</td>
                        <td className="px-4 py-3 text-gray-500 hidden lg:table-cell">{c.plan || '—'}</td>
                        <td className="px-4 py-3 font-semibold text-black">{formatINR(c.plan_amount)}</td>
                        <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{formatDate(c.plan_start)}</td>
                        <td className="px-4 py-3 text-gray-500">{formatDate(c.valid_till)}</td>
                        <td className="px-4 py-3">
                          {c.is_active ? <StatusChip status={status} /> : <InactiveStatusChip />}
                        </td>
                        <td className="px-4 py-3 font-semibold text-black hidden xl:table-cell">
                          {formatINR(c.recharged_total)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => setViewCustomer(c)}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 border border-[#E5E7EB] hover:bg-gray-50 hover:text-black px-3 py-1.5 rounded-lg transition-all"
                              title="View full details"
                            >
                              <Eye size={14} />
                              View
                            </button>
                            <button
                              onClick={() => setRechargeCustomer(c)}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-white bg-[#25D366] hover:bg-[#1EBE5A] px-3 py-1.5 rounded-lg transition-all"
                            >
                              <Plus size={14} />
                              Recharge
                            </button>
                            <button
                              onClick={() => setEditPlanCustomer(c)}
                              className="p-2 text-gray-400 hover:text-[#25D366] hover:bg-[#E8FAEF] rounded-lg transition-all"
                              title="Edit Plan"
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              onClick={() => {
                                if (c.is_active) {
                                  setInactiveCustomer(c);
                                  setInactiveReason('');
                                } else {
                                  handleMarkActive(c);
                                }
                              }}
                              className="px-2 py-1.5 text-xs font-semibold text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-all"
                              title={c.is_active ? 'Mark inactive' : 'Mark active'}
                            >
                              <Power size={14} className="inline mr-1" />
                              {c.is_active ? 'Mark inactive' : 'Mark active'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {t.total > 0 && (
              <TablePagination
                page={t.page}
                pageCount={t.pageCount}
                pageSize={t.pageSize}
                from={t.from}
                to={t.to}
                total={t.total}
                onPage={t.setPage}
                onPageSize={t.setPageSize}
              />
            )}
          </>
        )}
      </div>

      {/* Edit Plan Modal */}
      {editPlanCustomer && (
        <EditPlanModal
          customer={editPlanCustomer}
          onClose={() => setEditPlanCustomer(null)}
          onSaved={() => {
            setEditPlanCustomer(null);
            loadData();
          }}
        />
      )}

      <CustomerViewModal customer={viewCustomer} onClose={() => setViewCustomer(null)} />

      {/* Recharge Modal */}
      {rechargeCustomer && (
        <RechargeModal
          customer={rechargeCustomer}
          onClose={() => setRechargeCustomer(null)}
          onSaved={() => {
            setRechargeCustomer(null);
            loadData();
          }}
        />
      )}

      <Modal
        open={!!inactiveCustomer}
        onClose={() => setInactiveCustomer(null)}
        title="Mark Customer Inactive"
        size="sm"
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            handleMarkInactive();
          }}
          className="space-y-4"
        >
          <p className="text-sm text-gray-600">
            Mark {inactiveCustomer?.name} as inactive? You can add an optional reason.
          </p>
          <div>
            <label className="block text-sm font-semibold text-black mb-1.5" htmlFor="inactive-reason">
              Reason (optional)
            </label>
            <textarea
              id="inactive-reason"
              value={inactiveReason}
              onChange={(event) => setInactiveReason(event.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-[#E5E7EB] text-sm font-medium text-black focus:outline-none focus:ring-2 focus:ring-[#25D366] focus:border-transparent transition-all"
              rows={3}
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setInactiveCustomer(null)} type="button">
              Cancel
            </Button>
            <Button type="submit" disabled={savingActiveState}>
              {savingActiveState ? <Loader2 size={16} className="animate-spin" /> : null}
              Mark Inactive
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function StatusChip({ status }: { status: ReturnType<typeof isPlanActive> }) {
  const styles =
    status === 'active'
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

function InactiveStatusChip() {
  return (
    <span className="inline-flex items-center text-xs font-bold text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
      Inactive
    </span>
  );
}

function EditPlanModal({
  customer,
  onClose,
  onSaved,
}: {
  customer: Customer;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { show } = useToast();
  const [plan, setPlan] = useState(customer.plan ?? '');
  const [amount, setAmount] = useState(
    customer.plan_amount === null ? '' : String(customer.plan_amount)
  );
  const [planStart, setPlanStart] = useState(customer.plan_start ?? '');
  const [validTill, setValidTill] = useState(customer.valid_till ?? '');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const numericAmount = amount === '' ? null : Number(amount);
    if (numericAmount !== null && (!Number.isFinite(numericAmount) || numericAmount < 0)) {
      show('error', 'Enter a valid plan amount');
      return;
    }

    setSaving(true);
    try {
      await updateCustomer(customer.id, {
        plan: plan.trim() || null,
        plan_amount: numericAmount,
        plan_start: planStart || null,
        valid_till: validTill || null,
      });
      show('success', 'Plan updated successfully');
      onSaved();
    } catch (err) {
      show('error', err instanceof Error ? err.message : 'Failed to update plan');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Edit Plan — ${customer.name}`} size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="edit-plan-name" className="mb-1.5 block text-sm font-semibold text-black">
            Plan
          </label>
          <input
            id="edit-plan-name"
            type="text"
            value={plan}
            onChange={(event) => setPlan(event.target.value)}
            className="w-full rounded-lg border border-[#E5E7EB] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#25D366]"
          />
        </div>
        <div>
          <label htmlFor="edit-plan-amount" className="mb-1.5 block text-sm font-semibold text-black">
            Plan amount
          </label>
          <input
            id="edit-plan-amount"
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className="w-full rounded-lg border border-[#E5E7EB] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#25D366]"
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="edit-plan-start" className="mb-1.5 block text-sm font-semibold text-black">
              Plan start
            </label>
            <input
              id="edit-plan-start"
              type="date"
              value={planStart}
              onChange={(event) => setPlanStart(event.target.value)}
              className="w-full rounded-lg border border-[#E5E7EB] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#25D366]"
            />
          </div>
          <div>
            <label htmlFor="edit-plan-valid-till" className="mb-1.5 block text-sm font-semibold text-black">
              Valid till
            </label>
            <input
              id="edit-plan-valid-till"
              type="date"
              value={validTill}
              onChange={(event) => setValidTill(event.target.value)}
              className="w-full rounded-lg border border-[#E5E7EB] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#25D366]"
            />
          </div>
        </div>
        {validTill && validTill < todayISO() && (
          <p className="flex items-center gap-2 text-sm text-amber-700">
            <AlertTriangle size={16} />
            This plan end date is in the past.
          </p>
        )}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            Save Plan
          </Button>
        </div>
      </form>
    </Modal>
  );
}