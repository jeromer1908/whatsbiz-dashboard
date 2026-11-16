import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarDays, Download, History } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { DayCalendar } from '@/components/ui/DayCalendar';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/context/ToastContext';
import { fetchQuotaHistory, fetchQuotaHistoryDays, logSupabaseError } from '@/lib/api';
import { downloadCSV, formatDate, localDateISO, monthRange, toCSV } from '@/lib/format';
import type { QuotaHistoryEntry } from '@/types';

/** Shifts a YYYY-MM-DD date by whole days, staying in local time. */
function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return localDateISO(new Date(y, m - 1, d + days));
}

interface QuotaHistoryPanelProps {
  /** Bump to reload the current day (e.g. after a limit is saved today). */
  refreshKey?: number;
}

export function QuotaHistoryPanel({ refreshKey = 0 }: QuotaHistoryPanelProps) {
  const { show } = useToast();
  const today = localDateISO();
  const [selected, setSelected] = useState(today);
  const [month, setMonth] = useState(today);
  const [entries, setEntries] = useState<QuotaHistoryEntry[]>([]);
  const [dayCounts, setDayCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const loadDay = useCallback(async () => {
    setLoading(true);
    try {
      setEntries(await fetchQuotaHistory(selected));
    } catch (err) {
      logSupabaseError('Failed to load quota history', err);
      show('error', err instanceof Error ? err.message : 'Failed to load quota history');
    } finally {
      setLoading(false);
    }
  }, [selected, show]);

  const loadMonth = useCallback(async () => {
    try {
      const { from, to } = monthRange(month);
      setDayCounts(await fetchQuotaHistoryDays(from, to));
    } catch (err) {
      logSupabaseError('Failed to load quota history calendar', err);
    }
  }, [month]);

  useEffect(() => {
    loadDay();
  }, [loadDay, refreshKey]);

  useEffect(() => {
    loadMonth();
  }, [loadMonth, refreshKey]);

  const selectDate = (date: string) => {
    setSelected(date);
    setMonth(date);
  };

  const dailyEntries = useMemo(() => entries.filter((e) => e.quota_type === 'daily'), [entries]);
  const monthlyEntries = useMemo(() => entries.filter((e) => e.quota_type === 'monthly'), [entries]);
  const vendorLimit = entries.find((e) => e.vendor_daily_limit != null)?.vendor_daily_limit ?? 0;
  const totalAllocated = dailyEntries.reduce((total, entry) => total + (entry.daily_limit ?? 0), 0);
  const remaining = vendorLimit - totalAllocated;
  const isOverAllocated = remaining < 0;

  const handleExport = () => {
    const rows = entries.map((entry) => ({
      Date: entry.snapshot_date,
      Customer: entry.customer_name,
      Mobile: entry.mobile ?? '',
      Plan: entry.plan ?? '',
      'Quota type': entry.quota_type ?? '',
      'Daily limit': entry.daily_limit ?? '',
      'Monthly limit': entry.monthly_limit ?? '',
      'Valid till': entry.valid_till ?? '',
      'Vendor daily limit': entry.vendor_daily_limit ?? '',
    }));
    downloadCSV(`quota-history-${selected}.csv`, toCSV(rows));
  };

  const isToday = selected === today;
  const isYesterday = selected === shiftDate(today, -1);

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
      <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <label className="relative flex items-center">
          <CalendarDays size={16} className="absolute left-3 text-gray-400 pointer-events-none" />
          <input
            type="date"
            value={selected}
            max={today}
            onChange={(event) => event.target.value && selectDate(event.target.value)}
            className="w-full rounded-lg border border-[#E5E7EB] bg-white pl-9 pr-2 py-2 text-sm font-semibold text-black focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#25D366]"
            aria-label="Select quota history date"
          />
        </label>

        <DayCalendar
          month={month}
          selected={selected}
          onSelect={selectDate}
          onMonthChange={setMonth}
          maxDate={today}
          dot={(date) => (dayCounts[date] ? 'bg-[#25D366]' : null)}
          dayLabel={(date) =>
            dayCounts[date] ? `${date}, ${dayCounts[date]} customers recorded` : `${date}, no quota recorded`
          }
          legend={
            <span className="inline-flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#25D366]" /> Quota recorded
            </span>
          }
        />

        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => selectDate(today)}
            disabled={isToday}
            className="flex-1 justify-center px-3 py-2 text-xs"
          >
            Today
          </Button>
          <Button
            variant="secondary"
            onClick={() => selectDate(shiftDate(today, -1))}
            disabled={isYesterday}
            className="flex-1 justify-center px-3 py-2 text-xs"
          >
            Yesterday
          </Button>
        </div>
      </aside>

      <div className="min-w-0 space-y-4">
        <div className="rounded-xl border border-[#E5E7EB] bg-white p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <History size={20} className="text-[#25D366]" />
              <div>
                <h4 className="text-base font-bold text-black">
                  {isToday ? 'Today' : isYesterday ? 'Yesterday' : formatDate(selected)}
                </h4>
                <p className="text-xs font-medium text-gray-500">
                  {isToday || isYesterday ? formatDate(selected) : 'Quota as recorded on this day'}
                </p>
              </div>
            </div>
            {entries.length > 0 && (
              <Button variant="secondary" onClick={handleExport} className="px-3 py-2 text-xs">
                <Download size={14} />
                Export CSV
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-sm font-medium text-gray-500">Vendor daily limit</p>
              <p className="mt-1 text-2xl font-extrabold text-black">{vendorLimit.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Allocated total</p>
              <p className="mt-1 text-2xl font-extrabold text-[#1EBE5A]">{totalAllocated.toLocaleString()}</p>
            </div>
            <div>
              <p className={`text-sm font-medium ${isOverAllocated ? 'text-red-600' : 'text-gray-500'}`}>Remaining</p>
              <p className={`mt-1 text-2xl font-extrabold ${isOverAllocated ? 'text-red-500' : 'text-black'}`}>
                {remaining.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Customers</p>
              <p className="mt-1 text-2xl font-extrabold text-black">
                {dailyEntries.length.toLocaleString()}
                <span className="ml-1 text-sm font-semibold text-gray-500">daily</span>
                {monthlyEntries.length > 0 && (
                  <span className="ml-2 text-sm font-semibold text-gray-500">
                    + {monthlyEntries.length} monthly
                  </span>
                )}
              </p>
            </div>
          </div>

          {isOverAllocated && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">
              <AlertTriangle size={16} />
              Allocated quota exceeded the vendor daily limit by {Math.abs(remaining).toLocaleString()} on this day.
            </div>
          )}
        </div>

        <div className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white">
          {loading ? (
            <div className="p-6">
              <TableSkeleton cols={5} />
            </div>
          ) : entries.length === 0 ? (
            <EmptyState
              icon={<History size={28} />}
              title="No quota recorded for this day"
              description={
                isToday
                  ? 'Set a quota type and limit for a customer and it will be recorded against today.'
                  : `No snapshot exists for ${formatDate(selected)}. History is recorded from the day the quota page is used onwards.`
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-[#E5E7EB] bg-gray-50 text-left">
                  <tr>
                    <th className="px-4 py-3 font-semibold text-gray-600">Customer</th>
                    <th className="hidden px-4 py-3 font-semibold text-gray-600 md:table-cell">Mobile</th>
                    <th className="hidden px-4 py-3 font-semibold text-gray-600 lg:table-cell">Plan</th>
                    <th className="px-4 py-3 font-semibold text-gray-600">Type</th>
                    <th className="px-4 py-3 font-semibold text-gray-600">Limit</th>
                    <th className="hidden px-4 py-3 font-semibold text-gray-600 lg:table-cell">Valid till</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => {
                    const limit = entry.quota_type === 'monthly' ? entry.monthly_limit : entry.daily_limit;
                    return (
                      <tr
                        key={entry.customer_id}
                        className="border-b border-[#E5E7EB] last:border-0 hover:bg-gray-50"
                      >
                        <td className="px-4 py-3 font-semibold text-black">{entry.customer_name}</td>
                        <td className="hidden px-4 py-3 font-medium text-black md:table-cell">{entry.mobile || '—'}</td>
                        <td className="hidden px-4 py-3 text-gray-500 lg:table-cell">{entry.plan || '—'}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                              entry.quota_type === 'monthly'
                                ? 'bg-blue-50 text-blue-600'
                                : 'bg-[#E8FAEF] text-[#1EBE5A]'
                            }`}
                          >
                            {entry.quota_type === 'monthly' ? 'Monthly' : 'Daily'}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-semibold text-black">
                          {limit == null ? '—' : limit.toLocaleString()}
                        </td>
                        <td className="hidden px-4 py-3 text-gray-500 lg:table-cell">
                          {entry.valid_till ? formatDate(entry.valid_till) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
