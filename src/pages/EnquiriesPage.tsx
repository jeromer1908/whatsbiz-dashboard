import { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { EnquiryForm } from '@/components/enquiries/EnquiryForm';
import { UploadModal } from '@/components/enquiries/UploadModal';
import { ConvertModal } from '@/components/enquiries/ConvertModal';
import { useToast } from '@/context/ToastContext';
import { fetchCustomersByStatus, deleteCustomers } from '@/lib/api';
import { formatCustomerId, formatDate } from '@/lib/format';
import { useTableControls, type SortDir } from '@/hooks/Usetablecontrols';
import type { Customer } from '@/types';
import {
  Search,
  Plus,
  Upload,
  Trash2,
  Pencil,
  UserCheck,
  Inbox,
  ChevronLeft,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  X,
} from 'lucide-react';

// Customer + the formatted ID text, so searching "ENQ-0012" (or however formatCustomerId prints it) works
type Row = Customer & { display_id: string };

function SortTh({
  label,
  field,
  sortKey,
  sortDir,
  onSort,
  className = '',
}: {
  label: string;
  field: keyof Row;
  sortKey?: keyof Row;
  sortDir: SortDir;
  onSort: (k: keyof Row) => void;
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

const selectClass =
  'py-2.5 px-3 rounded-lg border border-[#E5E7EB] text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-[#25D366] focus:border-transparent';

export function EnquiriesPage() {
  const { show } = useToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showForm, setShowForm] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showConvert, setShowConvert] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [converting, setConverting] = useState<Customer | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const [bulkDelete, setBulkDelete] = useState(false);
  const [lastBatchId, setLastBatchId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchCustomersByStatus('enquiry');
      setCustomers(data);
      if (data.length > 0 && data[0].upload_batch) {
        setLastBatchId(data[0].upload_batch);
      }
    } catch (err) {
      show('error', err instanceof Error ? err.message : 'Failed to load enquiries');
    } finally {
      setLoading(false);
    }
  }, [show]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const rows: Row[] = useMemo(
    () => customers.map((c) => ({ ...c, display_id: formatCustomerId(c.customer_no) })),
    [customers]
  );

  const t = useTableControls<Row>({
    rows,
    searchKeys: ['display_id', 'name', 'mobile', 'email', 'location', 'business'],
    defaultSortKey: 'customer_no', // newest first; change to 'created_at' if you prefer
    defaultSortDir: 'desc',
    defaultPageSize: 20,
  });

  const businessOptions = useMemo(
    () => [...new Set(rows.map((r) => r.business).filter((b): b is string => !!b))].sort(),
    [rows]
  );
  const locationOptions = useMemo(
    () => [...new Set(rows.map((r) => r.location).filter((l): l is string => !!l))].sort(),
    [rows]
  );

  // Never keep hidden rows selected: if search/filters change, start the selection fresh
  useEffect(() => {
    setSelected(new Set());
  }, [t.search, t.filters]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allOnPageSelected =
    t.pageRows.length > 0 && t.pageRows.every((c) => selected.has(c.id));

  const toggleSelectAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) t.pageRows.forEach((c) => next.delete(c.id));
      else t.pageRows.forEach((c) => next.add(c.id));
      return next;
    });
  };

  const handleDelete = async () => {
    const ids = deleteTarget ? [deleteTarget.id] : Array.from(selected);
    try {
      await deleteCustomers(ids);
      show('success', `${ids.length} ${ids.length > 1 ? 'enquiries' : 'enquiry'} deleted`);
      setDeleteTarget(null);
      setBulkDelete(false);
      setSelected(new Set());
      loadData();
    } catch (err) {
      show('error', err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const sortProps = { sortKey: t.sortKey, sortDir: t.sortDir, onSort: t.toggleSort };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h3 className="text-2xl font-extrabold text-black">
            Enquiries{' '}
            <span className="text-[#25D366]">
              ({t.hasActiveFilters ? `${t.total} of ${customers.length}` : customers.length})
            </span>
          </h3>
        </div>
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-3">
          <div className="relative w-full sm:w-auto sm:flex-1 lg:flex-none">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              value={t.search}
              onChange={(e) => t.setSearch(e.target.value)}
              placeholder="Search name, mobile, ID, location or business…"
              className="pl-10 pr-4 py-2.5 rounded-lg border border-[#E5E7EB] text-sm font-medium w-full lg:w-56 focus:outline-none focus:ring-2 focus:ring-[#25D366] focus:border-transparent"
            />
          </div>
          <Button variant="primary" onClick={() => setShowUpload(true)} className="flex-1 sm:flex-none whitespace-nowrap">
            <Upload size={16} />
            Upload File
          </Button>
          <Button
            variant="secondary"
            className="flex-1 sm:flex-none whitespace-nowrap"
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
          >
            <Plus size={16} />
            Add Enquiry
          </Button>
        </div>
      </div>

      {/* Filters */}
      {customers.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={t.filters.business ?? ''}
            onChange={(e) => t.setFilter('business', e.target.value)}
            className={selectClass}
            aria-label="Filter by business"
          >
            <option value="">All businesses</option>
            {businessOptions.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
          <select
            value={t.filters.location ?? ''}
            onChange={(e) => t.setFilter('location', e.target.value)}
            className={selectClass}
            aria-label="Filter by location"
          >
            <option value="">All locations</option>
            {locationOptions.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
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

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between bg-[#E8FAEF] rounded-lg px-4 py-3">
          <span className="text-sm font-semibold text-black">{selected.size} selected</span>
          <Button variant="destructive" onClick={() => setBulkDelete(true)} className="text-sm py-2">
            <Trash2 size={14} />
            Delete Selected
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden">
        {loading ? (
          <div className="p-6">
            <TableSkeleton cols={9} />
          </div>
        ) : customers.length === 0 ? (
          <EmptyState
            icon={<Inbox size={28} />}
            title="No enquiries yet"
            description="Add your first enquiry or upload a file to get started."
            action={
              <Button
                onClick={() => {
                  setEditing(null);
                  setShowForm(true);
                }}
              >
                <Plus size={16} />
                Add Enquiry
              </Button>
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left border-b border-[#E5E7EB]">
                  <tr>
                    <th className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={allOnPageSelected}
                        onChange={toggleSelectAll}
                        className="w-4 h-4 rounded accent-[#25D366]"
                      />
                    </th>
                    <SortTh label="ID" field="customer_no" {...sortProps} />
                    <SortTh label="Name" field="name" {...sortProps} />
                    <SortTh label="Mobile" field="mobile" {...sortProps} />
                    <SortTh label="Email" field="email" className="hidden lg:table-cell" {...sortProps} />
                    <SortTh label="Location" field="location" className="hidden xl:table-cell" {...sortProps} />
                    <SortTh label="Business" field="business" className="hidden xl:table-cell" {...sortProps} />
                    <SortTh label="Date Added" field="created_at" {...sortProps} />
                    <th className="px-4 py-3 font-semibold text-gray-600 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {t.total === 0 && (
                    <tr>
                      <td colSpan={9} className="px-4 py-10 text-center text-sm text-gray-500">
                        No enquiries match your search or filters.{' '}
                        <button onClick={t.clearAll} className="font-semibold text-[#25D366] underline">
                          Clear filters
                        </button>
                      </td>
                    </tr>
                  )}
                  {t.pageRows.map((c) => (
                    <tr key={c.id} className="border-b border-[#E5E7EB] last:border-0 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selected.has(c.id)}
                          onChange={() => toggleSelect(c.id)}
                          className="w-4 h-4 rounded accent-[#25D366]"
                        />
                      </td>
                      <td className="px-4 py-3 text-gray-600 font-medium">{c.display_id}</td>
                      <td className="px-4 py-3 font-semibold text-black">{c.name}</td>
                      <td className="px-4 py-3 text-black font-medium">{c.mobile}</td>
                      <td className="px-4 py-3 text-gray-500 hidden lg:table-cell">{c.email || '—'}</td>
                      <td className="px-4 py-3 text-gray-500 hidden xl:table-cell max-w-[200px] truncate">
                        {c.location || '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-500 hidden xl:table-cell max-w-[200px] truncate">
                        {c.business || '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{formatDate(c.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="primary"
                            className="text-xs px-3 py-1.5"
                            onClick={() => {
                              setConverting(c);
                              setShowConvert(true);
                            }}
                          >
                            <UserCheck size={14} />
                            Convert
                          </Button>
                          <button
                            onClick={() => {
                              setEditing(c);
                              setShowForm(true);
                            }}
                            className="p-2 text-gray-400 hover:text-[#25D366] hover:bg-[#E8FAEF] rounded-lg transition-all"
                            title="Edit"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(c)}
                            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                            title="Delete"
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

            {/* Pagination */}
            {t.total > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-[#E5E7EB]">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-500 font-medium">
                    Showing {t.from}–{t.to} of {t.total}
                  </span>
                  <select
                    value={t.pageSize}
                    onChange={(e) => t.setPageSize(Number(e.target.value))}
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
                    Page {t.page} of {t.pageCount}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => t.setPage(t.page - 1)}
                      disabled={t.page <= 1}
                      className="p-2 rounded-lg border border-[#E5E7EB] text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                      aria-label="Previous page"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <button
                      onClick={() => t.setPage(t.page + 1)}
                      disabled={t.page >= t.pageCount}
                      className="p-2 rounded-lg border border-[#E5E7EB] text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                      aria-label="Next page"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modals */}
      <EnquiryForm
        open={showForm}
        onClose={() => setShowForm(false)}
        onSaved={loadData}
        editing={editing}
      />
      <UploadModal
        open={showUpload}
        onClose={() => setShowUpload(false)}
        onUploaded={loadData}
        lastBatchId={lastBatchId}
        onUndo={() => setLastBatchId(null)}
      />
      <ConvertModal
        open={showConvert}
        onClose={() => setShowConvert(false)}
        customer={converting}
        onConverted={loadData}
      />
      <ConfirmDialog
        open={!!deleteTarget || bulkDelete}
        title="Delete Enquiry"
        message={
          deleteTarget
            ? `Are you sure you want to delete "${deleteTarget.name}"? This action cannot be undone.`
            : `Are you sure you want to delete ${selected.size} selected enquiries? This action cannot be undone.`
        }
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => {
          setDeleteTarget(null);
          setBulkDelete(false);
        }}
      />
    </div>
  );
}