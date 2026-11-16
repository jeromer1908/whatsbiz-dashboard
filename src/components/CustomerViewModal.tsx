import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Check, Copy, Eye, EyeOff, Loader2, RefreshCw, Send } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/context/ToastContext';
import { fetchRechargesForCustomer, fetchWhatsAppMessages, logSupabaseError, resendWelcomeWhatsApp } from '@/lib/api';
import { formatCustomerId, formatDate, formatDateTime, formatINR, isPlanActive } from '@/lib/format';
import type { Customer, Recharge, WhatsAppMessage } from '@/types';

interface CustomerViewModalProps {
  customer: Customer | null;
  onClose: () => void;
}

/** Read-only view of everything stored for one customer, plus their recharge history. */
export function CustomerViewModal({ customer, onClose }: CustomerViewModalProps) {
  const { show } = useToast();
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [resending, setResending] = useState(false);
  const [recharges, setRecharges] = useState<Recharge[]>([]);
  const [loadingRecharges, setLoadingRecharges] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    setShowPassword(false);
    if (!customer) return;
    let cancelled = false;
    setLoadingRecharges(true);
    setRecharges([]);
    fetchRechargesForCustomer(customer.id)
      .then((data) => !cancelled && setRecharges(data))
      .catch((err) => logSupabaseError('Failed to load recharge history', err))
      .finally(() => !cancelled && setLoadingRecharges(false));
    return () => {
      cancelled = true;
    };
  }, [customer]);

  const loadMessages = useCallback(async (customerId: string) => {
    setLoadingMessages(true);
    try {
      setMessages(await fetchWhatsAppMessages(customerId));
    } catch (err) {
      logSupabaseError('Failed to load WhatsApp messages', err);
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    setMessages([]);
    if (customer) loadMessages(customer.id);
  }, [customer, loadMessages]);

  const handleResend = async () => {
    if (!customer) return;
    setResending(true);
    try {
      await resendWelcomeWhatsApp(customer.id);
      show('success', 'WhatsApp welcome message queued');
      await loadMessages(customer.id);
      // The provider's answer arrives a moment later — refresh once more to pick it up.
      window.setTimeout(() => loadMessages(customer.id), 4000);
    } catch (err) {
      logSupabaseError('Failed to resend WhatsApp message', err);
      show('error', err instanceof Error ? err.message : 'Failed to send WhatsApp message');
    } finally {
      setResending(false);
    }
  };

  if (!customer) return null;

  const status = isPlanActive(customer.valid_till);
  const statusLabel = !customer.is_active
    ? 'Inactive'
    : status === 'active'
      ? 'Active'
      : status === 'expiring'
        ? 'Expiring Soon'
        : 'Expired';
  const statusStyle = !customer.is_active
    ? 'text-gray-500 bg-gray-100'
    : status === 'active'
      ? 'text-[#1EBE5A] bg-[#E8FAEF]'
      : status === 'expiring'
        ? 'text-amber-600 bg-amber-50'
        : 'text-red-500 bg-red-50';
  const totalRecharged = recharges.reduce((sum, r) => sum + r.amount, 0);

  return (
    <Modal open onClose={onClose} title="Customer Details" size="xl">
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-[#E8FAEF] rounded-lg px-4 py-3">
          <div className="min-w-0">
            <p className="text-lg font-bold text-black truncate">{customer.name}</p>
            <p className="text-xs font-semibold text-gray-500">{formatCustomerId(customer.customer_no)}</p>
          </div>
          <span className={`inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-full ${statusStyle}`}>
            {statusLabel}
          </span>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <Section title="Contact">
            <Field label="Mobile" value={customer.mobile} copy />
            <Field label="Email" value={customer.email} copy />
            <Field label="Location" value={customer.location} />
            <Field label="Business" value={customer.business} />
          </Section>

          <Section title="Account">
            <Field label="Username" value={customer.login_username} copy />
            <Field
              label="Password"
              value={customer.login_password}
              display={customer.login_password && !showPassword ? '••••••••' : undefined}
              copy
              extra={
                customer.login_password ? (
                  <IconButton
                    label={showPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPassword((v) => !v)}
                  >
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </IconButton>
                ) : null
              }
            />
            <Field label="Verified Number" value={customer.verified_number} copy />
            <Field
              label="Customer Type"
              value={customer.customer_type ? capitalize(customer.customer_type) : null}
            />
          </Section>

          <Section title="Plan">
            <Field label="Plan" value={customer.plan} />
            <Field label="Plan Amount" value={customer.plan_amount === null ? null : formatINR(customer.plan_amount)} />
            <Field label="Start Date" value={customer.plan_start ? formatDate(customer.plan_start) : null} />
            <Field label="Valid Till" value={customer.valid_till ? formatDate(customer.valid_till) : null} />
            {!customer.is_active && <Field label="Inactive Reason" value={customer.inactive_reason} />}
          </Section>

          <Section title="Quota & Dates">
            <Field label="Quota Type" value={customer.quota_type ? capitalize(customer.quota_type) : null} />
            <Field label="Daily Limit" value={customer.daily_limit?.toLocaleString('en-IN') ?? null} />
            <Field label="Monthly Limit" value={customer.monthly_limit?.toLocaleString('en-IN') ?? null} />
            <Field label="Enquiry Created" value={formatDateTime(customer.created_at)} />
            <Field label="Onboarded On" value={customer.converted_at ? formatDateTime(customer.converted_at) : null} />
          </Section>
        </div>

        {customer.notes && (
          <Section title="Notes">
            <p className="text-sm text-black whitespace-pre-wrap">{customer.notes}</p>
          </Section>
        )}

        {/* WhatsApp */}
        <div className="rounded-lg border border-[#E5E7EB] overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-gray-50 border-b border-[#E5E7EB]">
            <p className="text-sm font-bold text-black">WhatsApp Messages</p>
            <div className="flex items-center gap-1">
              <IconButton label="Refresh status" onClick={() => loadMessages(customer.id)}>
                <RefreshCw size={14} className={loadingMessages ? 'animate-spin' : ''} />
              </IconButton>
              <button
                type="button"
                onClick={handleResend}
                disabled={resending}
                className="inline-flex items-center gap-1 text-xs font-semibold text-white bg-[#25D366] hover:bg-[#1EBE5A] disabled:opacity-60 px-3 py-1.5 rounded-lg transition-all"
              >
                {resending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                {messages.length > 0 ? 'Resend welcome' : 'Send welcome'}
              </button>
            </div>
          </div>
          {loadingMessages && messages.length === 0 ? (
            <div className="flex justify-center py-6">
              <Loader2 size={18} className="animate-spin text-[#25D366]" />
            </div>
          ) : messages.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-gray-500">
              {customer.customer_type === 'existing'
                ? 'Existing customer — no welcome message was sent.'
                : 'No WhatsApp messages sent yet.'}
            </p>
          ) : (
            <ul>
              {messages.map((m) => (
                <li key={m.id} className="px-4 py-3 border-b border-[#E5E7EB] last:border-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-black">
                      {m.template_name || 'Welcome message'}
                      {m.to_number && <span className="font-medium text-gray-500"> → +{m.to_number}</span>}
                    </span>
                    <WhatsAppStatusChip status={m.status} />
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {formatDateTime(m.created_at)}
                    {m.http_status ? ` · HTTP ${m.http_status}` : ''}
                  </p>
                  {m.status === 'failed' && m.response && (
                    <p className="mt-1 text-xs text-red-500 break-all line-clamp-3">{m.response}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Recharge history */}
        <div className="rounded-lg border border-[#E5E7EB] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-[#E5E7EB]">
            <p className="text-sm font-bold text-black">Recharge History</p>
            {!loadingRecharges && recharges.length > 0 && (
              <p className="text-xs font-semibold text-gray-500">
                {recharges.length} recharge{recharges.length === 1 ? '' : 's'} · Total{' '}
                <span className="text-black">{formatINR(totalRecharged)}</span>
              </p>
            )}
          </div>
          {loadingRecharges ? (
            <div className="flex justify-center py-6">
              <Loader2 size={18} className="animate-spin text-[#25D366]" />
            </div>
          ) : recharges.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-gray-500">No recharges recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left border-b border-[#E5E7EB]">
                  <tr>
                    <th className="px-4 py-2 font-semibold text-gray-600">Date</th>
                    <th className="px-4 py-2 font-semibold text-gray-600">Amount</th>
                    <th className="px-4 py-2 font-semibold text-gray-600">Valid Till</th>
                    <th className="px-4 py-2 font-semibold text-gray-600">Mode</th>
                    <th className="px-4 py-2 font-semibold text-gray-600">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {recharges.map((r) => (
                    <tr key={r.id} className="border-b border-[#E5E7EB] last:border-0">
                      <td className="px-4 py-2 whitespace-nowrap">{formatDate(r.recharged_on)}</td>
                      <td className="px-4 py-2 font-semibold whitespace-nowrap">{formatINR(r.amount)}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{formatDate(r.valid_till)}</td>
                      <td className="px-4 py-2 text-gray-500">{r.mode || '—'}</td>
                      <td className="px-4 py-2 text-gray-500">{r.note || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function WhatsAppStatusChip({ status }: { status: WhatsAppMessage['status'] }) {
  const styles = {
    sent: 'text-[#1EBE5A] bg-[#E8FAEF]',
    queued: 'text-amber-600 bg-amber-50',
    failed: 'text-red-500 bg-red-50',
  }[status];
  const label = { sent: 'Sent', queued: 'Sending…', failed: 'Failed' }[status];
  return <span className={`inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-full ${styles}`}>{label}</span>;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-[#E5E7EB] px-4 py-3">
      <p className="text-xs font-bold uppercase tracking-wide text-[#25D366] mb-2">{title}</p>
      <dl className="space-y-2">{children}</dl>
    </div>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="p-1 rounded text-gray-400 hover:text-[#25D366] hover:bg-[#E8FAEF] transition-all"
    >
      {children}
    </button>
  );
}

function Field({
  label,
  value,
  display,
  copy,
  extra,
}: {
  label: string;
  value: string | null | undefined;
  /** Shown instead of value (e.g. a masked password); copy still uses value. */
  display?: string;
  copy?: boolean;
  extra?: ReactNode;
}) {
  const { show } = useToast();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      show('error', 'Could not copy to clipboard');
    }
  };

  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-sm font-medium text-gray-500 shrink-0">{label}</dt>
      <dd className="flex items-center gap-1 min-w-0">
        <span className={`text-sm text-right break-all ${value ? 'font-semibold text-black' : 'text-gray-400'}`}>
          {value ? (display ?? value) : '—'}
        </span>
        {value && extra}
        {value && copy && (
          <IconButton label={copied ? 'Copied' : `Copy ${label.toLowerCase()}`} onClick={handleCopy}>
            {copied ? <Check size={14} className="text-[#25D366]" /> : <Copy size={14} />}
          </IconButton>
        )}
      </dd>
    </div>
  );
}
