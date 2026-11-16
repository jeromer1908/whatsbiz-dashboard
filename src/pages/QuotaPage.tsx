import { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { QuotaHistoryPanel } from '@/components/quota/QuotaHistoryPanel';
import { useToast } from '@/context/ToastContext';
import {
  fetchCustomersByStatus,
  fetchQuotaSettings,
  logSupabaseError,
  snapshotQuota,
  updateCustomer,
  updateQuotaSettings,
} from '@/lib/api';
import { formatDate } from '@/lib/format';
import type { Customer, QuotaSettings } from '@/types';
import { AlertTriangle, Gauge, History, Loader2, Save } from 'lucide-react';

type QuotaTab = 'daily' | 'monthly' | 'history';

export function QuotaPage() {
  const { show } = useToast();
  const [settings, setSettings] = useState<QuotaSettings | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<QuotaTab>('daily');
  const [limitInput, setLimitInput] = useState('');
  const [dailyLimitInputs, setDailyLimitInputs] = useState<Record<string, string>>({});
  const [savingLimit, setSavingLimit] = useState(false);
  const [savingCustomerId, setSavingCustomerId] = useState<string | null>(null);
  const [historyKey, setHistoryKey] = useState(0);

  /** Writes today's quota into the day-wise history so it can be reviewed later. */
  const recordSnapshot = useCallback(async (vendorDailyLimit: number, list: Customer[]) => {
    try {
      await snapshotQuota(vendorDailyLimit, list);
      setHistoryKey((key) => key + 1);
    } catch (err) {
      // History is a side record — a failure here must not look like the save failed.
      logSupabaseError('Failed to record quota history', err);
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [quotaSettings, onboardedCustomers] = await Promise.all([
        fetchQuotaSettings(),
        fetchCustomersByStatus('onboarded'),
      ]);
      setSettings(quotaSettings);
      setLimitInput(String(quotaSettings.vendor_daily_limit));
      setCustomers(onboardedCustomers);
      setDailyLimitInputs(Object.fromEntries(
        onboardedCustomers
          .filter((customer) => customer.quota_type === 'daily')
          .map((customer) => [customer.id, customer.daily_limit == null ? '' : String(customer.daily_limit)])
      ));
      void recordSnapshot(quotaSettings.vendor_daily_limit, onboardedCustomers);
    } catch (err) {
      logSupabaseError('Failed to load quota data', err);
      show('error', err instanceof Error ? err.message : 'Failed to load quota data');
    } finally {
      setLoading(false);
    }
  }, [show, recordSnapshot]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const dailyCustomers = useMemo(
    () => customers.filter((customer) => customer.quota_type === 'daily'),
    [customers]
  );
  const monthlyCustomers = useMemo(
    () => customers.filter((customer) => customer.quota_type === 'monthly'),
    [customers]
  );
  const totalAllocated = dailyCustomers.reduce((total, customer) => total + (customer.daily_limit ?? 0), 0);
  const remaining = (settings?.vendor_daily_limit ?? 0) - totalAllocated;
  const isOverAllocated = remaining < 0;

  const handleSaveVendorLimit = async () => {
    const value = Number(limitInput);
    if (!Number.isFinite(value) || value < 0) {
      show('error', 'Daily limit must be a valid non-negative number');
      return;
    }
    setSavingLimit(true);
    try {
      const updated = await updateQuotaSettings(value);
      setSettings(updated);
      void recordSnapshot(updated.vendor_daily_limit, customers);
      show('success', 'Daily limit updated');
    } catch (err) {
      logSupabaseError('Failed to update vendor quota limit', err);
      show('error', err instanceof Error ? err.message : 'Failed to update limit');
    } finally {
      setSavingLimit(false);
    }
  };

  const handleSaveDailyLimit = async (customer: Customer) => {
    const value = Number(dailyLimitInputs[customer.id]);
    if (!Number.isInteger(value) || value < 0) {
      show('error', 'Daily limit must be a non-negative whole number');
      return;
    }
    setSavingCustomerId(customer.id);
    try {
      const updated = await updateCustomer(customer.id, { daily_limit: value });
      const nextCustomers = customers.map((item) => item.id === customer.id ? updated : item);
      setCustomers(nextCustomers);
      setDailyLimitInputs((current) => ({ ...current, [customer.id]: String(value) }));
      void recordSnapshot(settings?.vendor_daily_limit ?? 0, nextCustomers);
      show('success', `Daily limit saved for ${customer.name}`);
    } catch (err) {
      logSupabaseError(`Failed to save daily quota for ${customer.name}`, err);
      show('error', err instanceof Error ? err.message : 'Failed to save daily limit');
    } finally {
      setSavingCustomerId(null);
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-2xl font-extrabold text-black">Quota Management</h3>

      <div className="flex flex-wrap items-center gap-2">
        {([
          { key: 'daily', label: 'Daily Quota' },
          { key: 'monthly', label: 'Paid Quota' },
          { key: 'history', label: 'History', icon: <History size={14} /> },
        ] as const).map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
              activeTab === tab.key
                ? 'bg-[#25D366] text-white'
                : 'border border-[#E5E7EB] bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            {'icon' in tab ? tab.icon : null}
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'daily' ? (
        <>
          <div className="rounded-xl border border-[#E5E7EB] bg-white p-5">
            <div className="mb-4 flex items-center gap-2">
              <Gauge size={20} className="text-[#25D366]" />
              <h4 className="text-base font-bold text-black">Vendor Daily Limit</h4>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="number"
                value={limitInput}
                onChange={(event) => setLimitInput(event.target.value)}
                className="w-full min-w-0 flex-1 sm:w-40 sm:flex-none rounded-lg border border-[#E5E7EB] px-4 py-2.5 text-sm font-semibold text-black focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#25D366]"
                min="0"
              />
              <Button onClick={handleSaveVendorLimit} disabled={savingLimit}>
                {savingLimit ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Save Limit
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-[#E5E7EB] bg-white p-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <p className="text-sm font-medium text-gray-500">Vendor daily limit</p>
                <p className="mt-1 text-2xl font-extrabold text-black">
                  {(settings?.vendor_daily_limit ?? 0).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Allocated total</p>
                <p className="mt-1 text-2xl font-extrabold text-[#1EBE5A]">{totalAllocated.toLocaleString()}</p>
              </div>
              <div>
                <p className={`text-sm font-medium ${isOverAllocated ? 'text-red-600' : 'text-gray-500'}`}>
                  Remaining
                </p>
                <p className={`mt-1 text-2xl font-extrabold ${isOverAllocated ? 'text-red-500' : 'text-black'}`}>
                  {remaining.toLocaleString()}
                </p>
              </div>
            </div>
            {isOverAllocated && (
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">
                <AlertTriangle size={16} />
                Allocated quota exceeds the vendor daily limit by {Math.abs(remaining).toLocaleString()}.
              </div>
            )}
          </div>

          <div className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white">
            {loading ? (
              <div className="p-6">
                <TableSkeleton cols={5} />
              </div>
            ) : dailyCustomers.length === 0 ? (
              <EmptyState
                icon={<Gauge size={28} />}
                title="No daily quota customers"
                description="Customers with the Daily limit quota type will appear here."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-[#E5E7EB] bg-gray-50 text-left">
                    <tr>
                      <th className="px-4 py-3 font-semibold text-gray-600">Customer</th>
                      <th className="hidden px-4 py-3 font-semibold text-gray-600 md:table-cell">Mobile</th>
                      <th className="hidden px-4 py-3 font-semibold text-gray-600 lg:table-cell">Plan</th>
                      <th className="px-4 py-3 font-semibold text-gray-600">Daily limit</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-600">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailyCustomers.map((customer) => (
                      <tr key={customer.id} className="border-b border-[#E5E7EB] last:border-0 hover:bg-gray-50">
                        <td className="px-4 py-3 font-semibold text-black">{customer.name}</td>
                        <td className="hidden px-4 py-3 font-medium text-black md:table-cell">{customer.mobile}</td>
                        <td className="hidden px-4 py-3 text-gray-500 lg:table-cell">{customer.plan || '—'}</td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={dailyLimitInputs[customer.id] ?? ''}
                            onChange={(event) => setDailyLimitInputs((current) => ({
                              ...current,
                              [customer.id]: event.target.value,
                            }))}
                            aria-label={`Daily limit for ${customer.name}`}
                            className="w-24 sm:w-32 rounded-lg border border-[#E5E7EB] px-3 py-2 text-sm font-semibold text-black focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#25D366]"
                          />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            onClick={() => handleSaveDailyLimit(customer)}
                            disabled={savingCustomerId === customer.id}
                            className="px-3 py-2 text-xs"
                          >
                            {savingCustomerId === customer.id && <Loader2 size={14} className="animate-spin" />}
                            Save
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : activeTab === 'monthly' ? (
        <div className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white">
          {loading ? (
            <div className="p-6">
              <TableSkeleton cols={5} />
            </div>
          ) : monthlyCustomers.length === 0 ? (
            <EmptyState
              icon={<Gauge size={28} />}
              title="No monthly quota customers"
              description="Customers with the Monthly quota limit type will appear here."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-[#E5E7EB] bg-gray-50 text-left">
                  <tr>
                    <th className="px-4 py-3 font-semibold text-gray-600">Customer</th>
                    <th className="px-4 py-3 font-semibold text-gray-600">Mobile</th>
                    <th className="px-4 py-3 font-semibold text-gray-600">Plan</th>
                    <th className="px-4 py-3 font-semibold text-gray-600">Monthly limit</th>
                    <th className="px-4 py-3 font-semibold text-gray-600">Valid till</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyCustomers.map((customer) => (
                    <tr key={customer.id} className="border-b border-[#E5E7EB] last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-3 font-semibold text-black">{customer.name}</td>
                      <td className="px-4 py-3 font-medium text-black">{customer.mobile}</td>
                      <td className="px-4 py-3 text-gray-500">{customer.plan || '—'}</td>
                      <td className="px-4 py-3 font-semibold text-black">
                        {customer.monthly_limit == null ? '—' : customer.monthly_limit.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {customer.valid_till ? formatDate(customer.valid_till) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <QuotaHistoryPanel refreshKey={historyKey} />
      )}
    </div>
  );
}
