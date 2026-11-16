import { useState } from 'react';
import type { FormEvent } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/context/ToastContext';
import { addPayment, logSupabaseError, updatePayment } from '@/lib/api';
import { todayISO } from '@/lib/format';
import type { Customer, Recharge } from '@/types';
import { Check, Loader2 } from 'lucide-react';

interface PaymentModalProps {
  customer: Customer;
  /** Pass an existing payment row to edit it */
  payment?: Recharge;
  onClose: () => void;
  onSaved: () => void;
}

const inputClass =
  'w-full rounded-lg border border-[#E5E7EB] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#25D366]';

export function PaymentModal({ customer, payment, onClose, onSaved }: PaymentModalProps) {
  const { show } = useToast();
  const [amount, setAmount] = useState(payment ? String(payment.amount) : '');
  const [paidOn, setPaidOn] = useState(payment?.recharged_on ?? todayISO());
  const [remark, setRemark] = useState(payment?.note ?? '');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = parseFloat(amount);
    if (!Number.isFinite(value) || value <= 0 || !paidOn) {
      show('error', 'Enter a valid payment amount and date');
      return;
    }
    setSaving(true);
    try {
      const input = { amount: value, paid_on: paidOn, note: remark.trim() || null };
      if (payment) await updatePayment(payment.id, input);
      else await addPayment({ customer_id: customer.id, ...input });
      show('success', payment ? 'Payment updated' : 'Payment added');
      onSaved();
    } catch (err) {
      logSupabaseError('Failed to save payment', err);
      show('error', err instanceof Error ? err.message : 'Failed to save payment');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`${payment ? 'Edit' : 'Add'} Payment — ${customer.name}`} size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="payment-amount" className="mb-1.5 block text-sm font-semibold text-black">
              Amount
            </label>
            <input
              id="payment-amount"
              type="number"
              min="0.01"
              step="0.01"
              required
              autoFocus
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="payment-date" className="mb-1.5 block text-sm font-semibold text-black">
              Date
            </label>
            <input
              id="payment-date"
              type="date"
              required
              value={paidOn}
              onChange={(event) => setPaidOn(event.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <label htmlFor="payment-remark" className="mb-1.5 block text-sm font-semibold text-black">
            Remark
          </label>
          <textarea
            id="payment-remark"
            rows={3}
            maxLength={500}
            value={remark}
            onChange={(event) => setRemark(event.target.value)}
            placeholder="What is this payment for?"
            className={`${inputClass} resize-y`}
          />
        </div>

        <p className="text-xs text-gray-500">
          This amount is added to the customer's total. It does not change the plan validity or quota.
        </p>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            {payment ? 'Save Changes' : 'Save Payment'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
