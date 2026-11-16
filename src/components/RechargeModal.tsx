import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/context/ToastContext';
import { addRecharge, fetchRechargesForCustomer, isPaymentEntry, logSupabaseError, updateRecharge } from '@/lib/api';
import { addDays, formatDate, formatINR, todayISO, withGst } from '@/lib/format';
import { GstSummary, GstToggle } from '@/components/ui/GstFields';
import type { Customer, QuotaType, Recharge } from '@/types';
import { Check, Loader2, Pencil, XCircle } from 'lucide-react';

interface RechargeModalProps {
  customer: Customer;
  recharge?: Recharge;
  onClose: () => void;
  onSaved: () => void;
}

const inputClass =
  'w-full rounded-lg border border-[#E5E7EB] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#25D366]';


export function RechargeModal({ customer, recharge, onClose, onSaved }: RechargeModalProps) {
  const { show } = useToast();
  const [recharges, setRecharges] = useState<Recharge[]>([]);
  const [loadingRecharges, setLoadingRecharges] = useState(true);
  const [activeRecharge, setActiveRecharge] = useState<Recharge | undefined>(recharge);
  const [amount, setAmount] = useState('');
  const [includeGst, setIncludeGst] = useState(true);
  const [rechargedOn, setRechargedOn] = useState(todayISO());
  const [validTill, setValidTill] = useState('');
  const [quotaType, setQuotaType] = useState<QuotaType | ''>('');
  const [quotaLimit, setQuotaLimit] = useState('');
  const [quotaTypeUnlocked, setQuotaTypeUnlocked] = useState(!customer.quota_type);
  const [remark, setRemark] = useState('');
  const [saving, setSaving] = useState(false);

  const { base, gst, total } = withGst(parseFloat(amount) || 0, includeGst);
  const quotaTypeLocked = Boolean(
    customer.quota_type && !quotaTypeUnlocked && (!activeRecharge || activeRecharge.quota_type)
  );

  const resetForm = useCallback((target?: Recharge) => {
    setActiveRecharge(target);
    setAmount(String(target?.base_amount ?? target?.amount ?? ''));
    // New recharges default to GST on; an existing one keeps whatever it was saved with.
    setIncludeGst(target ? (target.gst_amount ?? 0) > 0 : true);
    setRechargedOn(target?.recharged_on ?? todayISO());
    setValidTill(target?.valid_till ?? '');
    setRemark(target?.note ?? '');
    setQuotaType(target?.quota_type ?? customer.quota_type ?? '');
    setQuotaTypeUnlocked(!customer.quota_type || Boolean(target && !target.quota_type));
    const targetType = target?.quota_type ?? customer.quota_type;
    const existingLimit = targetType === 'daily'
      ? customer.daily_limit
      : targetType === 'monthly'
        ? customer.monthly_limit
        : null;
    setQuotaLimit(existingLimit == null ? '' : String(existingLimit));
  }, [
    customer.daily_limit,
    customer.monthly_limit,
    customer.quota_type,
  ]);

  useEffect(() => {
    resetForm(recharge);
  }, [customer.id, recharge, resetForm]);

  useEffect(() => {
    let active = true;
    const loadRecharges = async () => {
      setLoadingRecharges(true);
      try {
        const data = await fetchRechargesForCustomer(customer.id);
        if (active) setRecharges(data);
      } catch (err) {
        logSupabaseError('Failed to load recharge history', err);
        if (active) {
          show('error', err instanceof Error ? err.message : 'Failed to load recharge history');
        }
      } finally {
        if (active) setLoadingRecharges(false);
      }
    };
    loadRecharges();
    return () => {
      active = false;
    };
  }, [customer.id, show]);

  const orderedRecharges = useMemo(
    () => recharges.filter((r) => !isPaymentEntry(r)).sort((a, b) => b.recharged_on.localeCompare(a.recharged_on)
      || b.created_at.localeCompare(a.created_at)),
    [recharges]
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const numericBase = parseFloat(amount);
    const numericLimit = quotaLimit === '' ? null : Number(quotaLimit);
    if (!Number.isFinite(numericBase) || numericBase <= 0 || !rechargedOn) {
      show('error', 'Enter a valid recharge amount and date');
      return;
    }
    if (!quotaType) {
      show('error', 'Please select a quota type');
      return;
    }
    if (numericLimit !== null && (!Number.isFinite(numericLimit) || numericLimit < 0)) {
      show('error', 'Enter a valid quota limit');
      return;
    }

    setSaving(true);
    try {
      const input = {
        amount: total,
        base_amount: base,
        gst_amount: gst,
        recharged_on: rechargedOn,
        valid_till: validTill || null,
        quota_type: quotaType,
        daily_limit: quotaType === 'daily' ? numericLimit : null,
        monthly_limit: quotaType === 'monthly' ? numericLimit : null,
        note: remark.trim() || null,
      };
      if (activeRecharge) {
        await updateRecharge(activeRecharge.id, input);
      } else {
        await addRecharge({ customer_id: customer.id, ...input });
      }
      show('success', activeRecharge ? 'Recharge updated successfully' : 'Recharge added successfully');
      onSaved();
    } catch (err) {
      logSupabaseError('Failed to save recharge', err);
      show('error', err instanceof Error ? err.message : 'Failed to save recharge');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`${activeRecharge ? 'Edit' : 'Add'} Recharge — ${customer.name}`}
      size="md"
    >
      <div className="space-y-5">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="shared-recharge-amount" className="mb-1.5 block text-sm font-semibold text-black">
                {includeGst ? 'Amount (before GST)' : 'Amount'}
              </label>
              <input
                id="shared-recharge-amount"
                type="number"
                min="0.01"
                step="0.01"
                required
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="shared-recharge-date" className="mb-1.5 block text-sm font-semibold text-black">
                Recharge date
              </label>
              <input
                id="shared-recharge-date"
                type="date"
                required
                value={rechargedOn}
                onChange={(event) => setRechargedOn(event.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <GstToggle checked={includeGst} onChange={setIncludeGst} />
          <GstSummary base={base} gst={gst} total={total} includeGst={includeGst} />

          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <label htmlFor="shared-recharge-valid-till" className="text-sm font-semibold text-black">
                Valid till (optional)
              </label>
              <button
                type="button"
                onClick={() => setValidTill(addDays(rechargedOn, 30))}
                className="text-xs font-semibold text-[#1EBE5A] hover:underline"
              >
                Set 30 days from recharge
              </button>
            </div>
            <input
              id="shared-recharge-valid-till"
              type="date"
              value={validTill}
              onChange={(event) => setValidTill(event.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="shared-recharge-quota-type" className="text-sm font-semibold text-black">
                Quota type
              </label>
              {customer.quota_type && !quotaTypeUnlocked && (
                <button
                  type="button"
                  onClick={() => setQuotaTypeUnlocked(true)}
                  className="text-xs font-semibold text-[#1EBE5A] hover:underline"
                >
                  Change
                </button>
              )}
            </div>
            <select
              id="shared-recharge-quota-type"
              required
              value={quotaType}
              disabled={quotaTypeLocked}
              onChange={(event) => {
                setQuotaType(event.target.value as QuotaType | '');
                setQuotaLimit('');
              }}
              className={`${inputClass} disabled:bg-gray-100 disabled:text-gray-500`}
            >
              <option value="" disabled>Select quota type</option>
              <option value="daily">Daily limit</option>
              <option value="monthly">Monthly quota limit</option>
            </select>
          </div>

          {quotaType && (
            <div>
              <label htmlFor="shared-recharge-quota-limit" className="mb-1.5 block text-sm font-semibold text-black">
                {quotaType === 'daily' ? 'Daily limit' : 'Monthly quota limit'} (optional)
              </label>
              <input
                id="shared-recharge-quota-limit"
                type="number"
                min="0"
                step="1"
                value={quotaLimit}
                onChange={(event) => setQuotaLimit(event.target.value)}
                className={inputClass}
              />
            </div>
          )}

          <div>
            <label htmlFor="shared-recharge-remark" className="mb-1.5 block text-sm font-semibold text-black">
              Remark (optional)
            </label>
            <textarea
              id="shared-recharge-remark"
              rows={3}
              maxLength={500}
              value={remark}
              onChange={(event) => setRemark(event.target.value)}
              placeholder="Payment mode, offer given, anything to remember…"
              className={`${inputClass} resize-y`}
            />
          </div>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              {activeRecharge ? 'Save Changes' : 'Save Recharge'}
            </Button>
          </div>
        </form>

        <section className="border-t border-[#E5E7EB] pt-4">
          <h3 className="mb-2 text-sm font-semibold text-black">Previous recharges</h3>
          {loadingRecharges ? (
            <p className="text-sm text-gray-500">Loading recharge history…</p>
          ) : orderedRecharges.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-gray-500">
              <XCircle size={16} />
              No previous recharges.
            </p>
          ) : (
            <ul className="max-h-40 space-y-2 overflow-y-auto">
              {orderedRecharges.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-gray-600">
                    {formatDate(item.recharged_on)} · {formatINR(item.amount)}
                  </span>
                  <button
                    type="button"
                    onClick={() => resetForm(item)}
                    aria-label={`Edit recharge from ${formatDate(item.recharged_on)}`}
                    className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-[#E8FAEF] hover:text-[#1EBE5A]"
                  >
                    <Pencil size={15} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {activeRecharge && !recharge && (
            <button
              type="button"
              onClick={() => resetForm()}
              className="mt-2 text-xs font-semibold text-[#1EBE5A] hover:underline"
            >
              Cancel editing and add a recharge
            </button>
          )}
        </section>
      </div>
    </Modal>
  );
}
