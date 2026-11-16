import type { Customer } from '@/types';

export const GST_RATE = 0.18;

/** Splits an amount into base / GST / total. With includeGst false, GST is 0 and total equals base. */
export function withGst(baseAmount: number, includeGst = true): { base: number; gst: number; total: number } {
  const base = Math.round(baseAmount * 100) / 100;
  const gst = includeGst ? Math.round(base * GST_RATE * 100) / 100 : 0;
  const total = Math.round((base + gst) * 100) / 100;
  return { base, gst, total };
}

export function formatCustomerId(customerNo: number | null | undefined): string {
  if (customerNo === null || customerNo === undefined) return '—';
  return `WB-${String(customerNo).padStart(4, '0')}`;
}

export function matchesCustomerSearch(
  customer: Pick<Customer, 'customer_no' | 'name' | 'mobile' | 'location' | 'business'>,
  query: string
): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;

  return [
    customer.name,
    customer.mobile,
    formatCustomerId(customer.customer_no),
    customer.location,
    customer.business,
  ].some((value) => value?.toLowerCase().includes(normalizedQuery));
}

export function formatINR(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '₹0';
  return '₹' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(amount);
}

export function formatDate(date: string | null | undefined): string {
  if (!date) return '—';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '—';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

export function normalizeMobile(raw: string): string | null {
  let digits = raw.replace(/\D/g, '');
  if (digits.length > 10 && digits.startsWith('91')) {
    digits = digits.slice(2);
  } else if (digits.length > 10 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  if (digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) {
    return digits;
  }
  return null;
}

export function isPlanActive(validTill: string | null): 'active' | 'expiring' | 'expired' {
  if (!validTill) return 'active';
  const till = new Date(validTill);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  till.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((till.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'expired';
  if (diffDays <= 7) return 'expiring';
  return 'active';
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

export function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

export function generateBatchId(): string {
  return `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function toCSV(rows: Record<string, unknown>[], headers?: string[]): string {
  if (rows.length === 0) return headers ? headers.join(',') + '\n' : '';
  const cols = headers || Object.keys(rows[0]);
  const escape = (val: unknown) => {
    const s = val === null || val === undefined ? '' : String(val);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };
  const lines = [cols.join(',')];
  for (const row of rows) {
    lines.push(cols.map((c) => escape(row[c])).join(','));
  }
  return lines.join('\n');
}

export function downloadCSV(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Local-date YYYY-MM-DD (todayISO uses UTC, which is the previous day before 5:30 AM IST). */
export function localDateISO(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function timeAgo(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(iso);
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number);
  return { from: localDateISO(new Date(y, m - 1, 1)), to: localDateISO(new Date(y, m, 0)) };
}
