import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/context/ToastContext';
import {
  fetchAllCustomers,
  fetchAllRecharges,
  fetchQuotaAllocations,
  fetchQuotaSettings,
} from '@/lib/api';
import { formatINR, formatDate, isPlanActive, toCSV, downloadCSV } from '@/lib/format';
import type { Customer, Recharge, QuotaAllocation } from '@/types';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  BarChart3,
  Download,
  Users,
  UserCheck,
  IndianRupee,
  TrendingUp,
  AlertTriangle,
} from 'lucide-react';

type DateRange = 'thisMonth' | 'last30' | 'allTime' | 'custom';
type ReportTab = 'enquiries' | 'onboarded' | 'recharges' | 'quota';

export function ReportsPage() {
  const { show } = useToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [recharges, setRecharges] = useState<Recharge[]>([]);
  const [allocations, setAllocations] = useState<QuotaAllocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange>('thisMonth');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [tab, setTab] = useState<ReportTab>('enquiries');

  const loadData = async () => {
    setLoading(true);
    try {
      const [c, r, a] = await Promise.all([
        fetchAllCustomers(),
        fetchAllRecharges(),
        fetchQuotaAllocations(),
      ]);
      setCustomers(c);
      setRecharges(r);
      setAllocations(a);
    } catch (err) {
      show('error', err instanceof Error ? err.message : 'Failed to load report data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const { startDate, endDate } = useMemo(() => {
    const now = new Date();
    if (dateRange === 'thisMonth') {
      return {
        startDate: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0],
        endDate: now.toISOString().split('T')[0],
      };
    }
    if (dateRange === 'last30') {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      return {
        startDate: d.toISOString().split('T')[0],
        endDate: now.toISOString().split('T')[0],
      };
    }
    if (dateRange === 'custom') {
      return {
        startDate: customStart || '2000-01-01',
        endDate: customEnd || now.toISOString().split('T')[0],
      };
    }
    return { startDate: '2000-01-01', endDate: now.toISOString().split('T')[0] };
  }, [dateRange, customStart, customEnd]);

  const summary = useMemo(() => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const enquiriesInPeriod = customers.filter(
      (c) => c.status === 'enquiry' && new Date(c.created_at) >= start && new Date(c.created_at) <= end
    );
    const convertedInPeriod = customers.filter(
      (c) => c.status === 'onboarded' && c.converted_at && new Date(c.converted_at) >= start && new Date(c.converted_at) <= end
    );
    const rechargeInPeriod = recharges.filter(
      (r) => new Date(r.recharged_on) >= start && new Date(r.recharged_on) <= end
    );
    const activeCustomers = customers.filter(
      (c) => c.status === 'onboarded' && c.is_active && isPlanActive(c.valid_till) === 'active'
    );
    const expiringSoon = customers.filter(
      (c) => c.status === 'onboarded' && c.is_active && isPlanActive(c.valid_till) === 'expiring'
    );
    const inactiveCustomers = customers.filter((c) => c.status === 'onboarded' && !c.is_active);

    const totalEnquiries = customers.filter((c) => c.status === 'enquiry').length;
    const conversionRate = totalEnquiries + convertedInPeriod.length > 0
      ? Math.round((convertedInPeriod.length / (totalEnquiries + convertedInPeriod.length)) * 100)
      : 0;

    return {
      newEnquiries: enquiriesInPeriod.length,
      converted: convertedInPeriod.length,
      conversionRate,
      rechargeCollected: rechargeInPeriod.reduce((s, r) => s + r.amount, 0),
      activeCustomers: activeCustomers.length,
      expiringSoon: expiringSoon.length,
      inactiveCustomers: inactiveCustomers.length,
    };
  }, [customers, recharges, startDate, endDate]);

  // Monthly recharge chart (last 6 months)
  const chartData = useMemo(() => {
    const now = new Date();
    const months: { label: string; total: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const m = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthName = m.toLocaleString('en-US', { month: 'short' });
      const total = recharges
        .filter((r) => {
          const d = new Date(r.recharged_on);
          return d.getFullYear() === m.getFullYear() && d.getMonth() === m.getMonth();
        })
        .reduce((s, r) => s + r.amount, 0);
      months.push({ label: monthName, total });
    }
    return months;
  }, [recharges]);

  const enquiriesInPeriod = useMemo(() => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    return customers.filter(
      (c) => c.status === 'enquiry' && new Date(c.created_at) >= start && new Date(c.created_at) <= end
    );
  }, [customers, startDate, endDate]);

  const onboardedInPeriod = useMemo(() => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    return customers.filter(
      (c) => c.status === 'onboarded' && c.converted_at && new Date(c.converted_at) >= start && new Date(c.converted_at) <= end
    );
  }, [customers, startDate, endDate]);

  const rechargesInPeriod = useMemo(() => {
    return recharges.filter((r) => r.recharged_on >= startDate && r.recharged_on <= endDate);
  }, [recharges, startDate, endDate]);

  const handleExport = () => {
    let rows: Record<string, unknown>[] = [];
    let filename = '';
    if (tab === 'enquiries') {
      rows = enquiriesInPeriod.map((c) => ({
        Name: c.name,
        Mobile: c.mobile,
        Email: c.email || '',
        Location: c.location || '',
        'Date Added': formatDate(c.created_at),
      }));
      filename = 'enquiries_report.csv';
    } else if (tab === 'onboarded') {
      rows = onboardedInPeriod.map((c) => ({
        Name: c.name,
        Mobile: c.mobile,
        Location: c.location || '',
        Plan: c.plan || '',
        'Plan Amount': c.plan_amount || '',
        'Start Date': formatDate(c.plan_start),
        'Valid Till': formatDate(c.valid_till),
      }));
      filename = 'onboarded_report.csv';
    } else if (tab === 'recharges') {
      rows = rechargesInPeriod.map((r) => ({
        Date: formatDate(r.recharged_on),
        Customer: r.customers?.name || '',
        Mobile: r.customers?.mobile || '',
        Amount: r.amount,
        Mode: r.mode || '',
        Note: r.note || '',
      }));
      filename = 'recharges_report.csv';
    } else {
      rows = allocations.map((a) => ({
        Customer: a.customers?.name || '',
        Mobile: a.customers?.mobile || '',
        'Messages/Day': a.messages_per_day,
      }));
      filename = 'quota_report.csv';
    }
    if (rows.length === 0) {
      show('error', 'No data to export for this tab');
      return;
    }
    downloadCSV(filename, toCSV(rows));
    show('success', 'Report exported as CSV');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h3 className="text-2xl font-extrabold text-black">Reports</h3>
        <div className="flex items-center gap-2 flex-wrap">
          {([
            { key: 'thisMonth', label: 'This Month' },
            { key: 'last30', label: 'Last 30 Days' },
            { key: 'allTime', label: 'All Time' },
            { key: 'custom', label: 'Custom' },
          ] as { key: DateRange; label: string }[]).map((r) => (
            <button
              key={r.key}
              onClick={() => setDateRange(r.key)}
              className={`px-3 py-2 rounded-lg text-sm font-semibold transition-all ${
                dateRange === r.key
                  ? 'bg-[#25D366] text-white'
                  : 'bg-white text-gray-600 border border-[#E5E7EB] hover:bg-gray-50'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Custom date pickers */}
      {dateRange === 'custom' && (
        <div className="flex items-center gap-3 bg-white rounded-xl border border-[#E5E7EB] px-4 py-3">
          <div className="flex-1 min-w-0 sm:flex-none">
            <label className="block text-xs font-semibold text-gray-500 mb-1">From</label>
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="w-full sm:w-auto px-3 py-2 rounded-lg border border-[#E5E7EB] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#25D366]"
            />
          </div>
          <div className="flex-1 min-w-0 sm:flex-none">
            <label className="block text-xs font-semibold text-gray-500 mb-1">To</label>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="w-full sm:w-auto px-3 py-2 rounded-lg border border-[#E5E7EB] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#25D366]"
            />
          </div>
        </div>
      )}

      {/* Summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <SummaryStat icon={<Users size={16} />} label="New Enquiries" value={String(summary.newEnquiries)} />
        <SummaryStat icon={<UserCheck size={16} />} label="Converted" value={String(summary.converted)} />
        <SummaryStat icon={<TrendingUp size={16} />} label="Conversion Rate" value={`${summary.conversionRate}%`} />
        <SummaryStat icon={<IndianRupee size={16} />} label="Recharge Collected" value={formatINR(summary.rechargeCollected)} />
        <SummaryStat icon={<UserCheck size={16} />} label="Active Customers" value={String(summary.activeCustomers)} />
        <SummaryStat icon={<AlertTriangle size={16} />} label="Expiring Soon" value={String(summary.expiringSoon)} />
        <SummaryStat icon={<Users size={16} />} label="Inactive" value={String(summary.inactiveCustomers)} />
      </div>

      {/* Chart */}
      <div className="bg-white rounded-xl border border-[#E5E7EB] p-5">
        <h4 className="text-base font-bold text-black mb-4">Monthly Recharge (Last 6 Months)</h4>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#6B7280', fontWeight: 600 }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fontSize: 12, fill: '#6B7280', fontWeight: 600 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `₹${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
            />
            <Tooltip
              formatter={(v) => [formatINR(Number(v)), 'Recharge']}
              contentStyle={{
                borderRadius: '10px',
                border: '1px solid #E5E7EB',
                fontSize: '13px',
                fontWeight: 600,
              }}
            />
            <Bar dataKey="total" fill="#25D366" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Report tabs */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {([
            { key: 'enquiries', label: 'Enquiries' },
            { key: 'onboarded', label: 'Onboarded Customers' },
            { key: 'recharges', label: 'Recharges' },
            { key: 'quota', label: 'Quota Split' },
          ] as { key: ReportTab; label: string }[]).map((t) => (
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
        <Button variant="secondary" onClick={handleExport}>
          <Download size={16} />
          Export CSV
        </Button>
      </div>

      {/* Report table */}
      <div className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden">
        {loading ? (
          <div className="p-6">
            <TableSkeleton />
          </div>
        ) : tab === 'enquiries' ? (
          enquiriesInPeriod.length === 0 ? (
            <EmptyState icon={<BarChart3 size={28} />} title="No enquiries in this period" />
          ) : (
            <ReportTable
              headers={['Name', 'Mobile', 'Email', 'Date Added']}
              rows={enquiriesInPeriod.map((c) => ({
                Name: c.name,
                Mobile: c.mobile,
                Email: c.email || '—',
                'Date Added': formatDate(c.created_at),
              }))}
            />
          )
        ) : tab === 'onboarded' ? (
          onboardedInPeriod.length === 0 ? (
            <EmptyState icon={<BarChart3 size={28} />} title="No customers onboarded in this period" />
          ) : (
            <ReportTable
              headers={['Name', 'Mobile', 'Plan', 'Amount', 'Start Date', 'Valid Till']}
              rows={onboardedInPeriod.map((c) => ({
                Name: c.name,
                Mobile: c.mobile,
                Plan: c.plan || '—',
                Amount: formatINR(c.plan_amount),
                'Start Date': formatDate(c.plan_start),
                'Valid Till': formatDate(c.valid_till),
              }))}
            />
          )
        ) : tab === 'recharges' ? (
          rechargesInPeriod.length === 0 ? (
            <EmptyState icon={<BarChart3 size={28} />} title="No recharges in this period" />
          ) : (
            <ReportTable
              headers={['Date', 'Customer', 'Mobile', 'Amount', 'Mode', 'Note']}
              rows={rechargesInPeriod.map((r) => ({
                Date: formatDate(r.recharged_on),
                Customer: r.customers?.name || 'Unknown',
                Mobile: r.customers?.mobile || '—',
                Amount: formatINR(r.amount),
                Mode: r.mode || '—',
                Note: r.note || '—',
              }))}
            />
          )
        ) : allocations.length === 0 ? (
          <EmptyState icon={<BarChart3 size={28} />} title="No quota allocations to report" />
        ) : (
          <ReportTable
            headers={['Customer', 'Mobile', 'Messages/Day', 'Share']}
            rows={(() => {
              const total = allocations.reduce((s, a) => s + a.messages_per_day, 0);
              return allocations.map((a) => ({
                Customer: a.customers?.name || 'Unknown',
                Mobile: a.customers?.mobile || '—',
                'Messages/Day': String(a.messages_per_day),
                Share: total > 0 ? `${((a.messages_per_day / total) * 100).toFixed(1)}%` : '0%',
              }));
            })()}
          />
        )}
      </div>
    </div>
  );
}

function SummaryStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-[#E5E7EB] p-4">
      <div className="flex items-center gap-1.5 text-gray-400 mb-1">
        {icon}
        <span className="text-xs font-semibold text-gray-500">{label}</span>
      </div>
      <p className="text-xl font-extrabold text-black">{value}</p>
    </div>
  );
}

function ReportTable({ headers, rows }: { headers: string[]; rows: Record<string, string>[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left border-b border-[#E5E7EB]">
          <tr>
            {headers.map((h) => (
              <th key={h} className="px-4 py-3 font-semibold text-gray-600">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-[#E5E7EB] last:border-0 hover:bg-gray-50">
              {headers.map((h) => (
                <td key={h} className="px-4 py-3 text-black font-medium">
                  {row[h]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
