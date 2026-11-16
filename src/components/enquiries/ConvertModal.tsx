import { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/context/ToastContext';
import { convertToCustomer } from '@/lib/api';
import { todayISO, withGst, normalizeMobile } from '@/lib/format';
import { GstSummary, GstToggle } from '@/components/ui/GstFields';
import type { Customer, CustomerType } from '@/types';
import { Eye, EyeOff, Loader2, MessageCircle } from 'lucide-react';

const PLAN_OPTIONS = ['Basic', 'Premium'];

interface ConvertModalProps {
  open: boolean;
  onClose: () => void;
  customer: Customer | null;
  onConverted: () => void;
}

export function ConvertModal({ open, onClose, customer, onConverted }: ConvertModalProps) {
  const { show } = useToast();
  const [plan, setPlan] = useState('');
  const [planAmount, setPlanAmount] = useState('');
  const [planStart, setPlanStart] = useState(todayISO());
  const [validTill, setValidTill] = useState('');
  const [alsoRecharge, setAlsoRecharge] = useState(false);
  const [includeGst, setIncludeGst] = useState(true);
  const [customerType, setCustomerType] = useState<CustomerType>('new');
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [verifiedNumber, setVerifiedNumber] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setPlan('');
      setPlanAmount('');
      return;
    }
    if (customer) {
      setPlan('');
      setPlanAmount('');
      setPlanStart(customer.plan_start || todayISO());
      setValidTill('');
      setAlsoRecharge(false);
      setIncludeGst(true);
      setCustomerType('new');
      setLoginUsername(customer.login_username ?? '');
      setLoginPassword(customer.login_password ?? '');
      setShowPassword(false);
      // Usually the WhatsApp number is the enquiry mobile — prefilled, but editable.
      setVerifiedNumber(customer.verified_number ?? customer.mobile ?? '');
    }
  }, [open, customer]);

  const { base, gst, total } = withGst(parseFloat(planAmount) || 0, includeGst);

  const handleClose = () => {
    setPlan('');
    setPlanAmount('');
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customer) return;
    if (!plan) {
      show('error', 'Please select a plan');
      return;
    }
    if (base <= 0) {
      show('error', 'Plan amount must be greater than 0');
      return;
    }
    // Account details are optional; a verified number is only checked when one is entered.
    const verified = verifiedNumber.trim() ? normalizeMobile(verifiedNumber) : null;
    if (verifiedNumber.trim() && !verified) {
      show('error', 'Enter a valid 10-digit verified number or leave it empty');
      return;
    }
    if (alsoRecharge && (!validTill || validTill < planStart)) {
      show('error', 'Valid Till cannot be earlier than the start date');
      return;
    }
    setSaving(true);
    try {
      await convertToCustomer(
        customer.id,
        plan,
        total,
        planStart,
        alsoRecharge ? validTill : null,
        alsoRecharge,
        base,
        gst,
        { login_username: loginUsername.trim() || null, login_password: loginPassword || null, verified_number: verified, customer_type: customerType }
      );
      show(
        'success',
        customerType === 'new'
          ? `${customer.name} has been onboarded — WhatsApp welcome message is on its way`
          : `${customer.name} has been onboarded successfully`
      );
      onConverted();
      handleClose();
    } catch (err) {
      show('error', err instanceof Error ? err.message : 'Failed to convert customer');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={handleClose} title="Convert to Customer" size="md">
      {customer && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="bg-[#E8FAEF] rounded-lg px-4 py-3 mb-2">
            <p className="text-sm font-semibold text-black">
              Converting <span className="text-[#1EBE5A]">{customer.name}</span> ({customer.mobile})
            </p>
          </div>

          <FormField label="Customer Type" required>
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-gray-100 p-1" role="radiogroup" aria-label="Customer type">
              {([
                { key: 'new', label: 'New' },
                { key: 'existing', label: 'Existing' },
              ] as { key: CustomerType; label: string }[]).map((option) => (
                <button
                  key={option.key}
                  type="button"
                  role="radio"
                  aria-checked={customerType === option.key}
                  onClick={() => setCustomerType(option.key)}
                  className={`rounded-md py-2 text-sm font-semibold transition-all ${
                    customerType === option.key ? 'bg-white text-black shadow' : 'text-gray-500 hover:text-black'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-gray-500">
              <MessageCircle size={13} className={customerType === 'new' ? 'text-[#25D366]' : 'text-gray-400'} />
              {customerType === 'new'
                ? `A WhatsApp welcome message will be sent to ${verifiedNumber.trim() || customer.mobile}`
                : 'No WhatsApp message will be sent'}
            </p>
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Plan Name" required>
              <select
                value={plan}
                onChange={(e) => setPlan(e.target.value)}
                className={inputClass}
                required
              >
                <option value="" disabled>
                  Select plan
                </option>
                {PLAN_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Plan Amount (₹)" required>
              <input
                type="number"
                value={planAmount}
                onChange={(e) => setPlanAmount(e.target.value)}
                className={inputClass}
                required
                min="0"
                step="0.01"
                placeholder="0.00"
              />
            </FormField>

            <FormField label="Start Date" required>
              <input
                type="date"
                value={planStart}
                onChange={(e) => setPlanStart(e.target.value)}
                className={inputClass}
                required
              />
            </FormField>

          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Username">
              <input
                type="text"
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                className={inputClass}
                autoComplete="off"
                placeholder="Account username"
              />
            </FormField>

            <FormField label="Password">
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className={`${inputClass} pr-10`}
                  autoComplete="new-password"
                  placeholder="Account password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </FormField>

            <FormField label="Verified Number">
              <input
                type="tel"
                value={verifiedNumber}
                onChange={(e) => setVerifiedNumber(e.target.value)}
                className={inputClass}
                inputMode="numeric"
                placeholder="10-digit WhatsApp number"
              />
            </FormField>
          </div>

          <GstToggle checked={includeGst} onChange={setIncludeGst} />
          <GstSummary base={base} gst={gst} total={total} includeGst={includeGst} />

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={alsoRecharge}
              onChange={(e) => setAlsoRecharge(e.target.checked)}
              className="w-4 h-4 rounded accent-[#25D366]"
            />
            <span className="text-sm font-medium text-black">
              Also record this amount as a recharge
            </span>
          </label>

          {alsoRecharge && (
            <FormField label="Valid Till" required>
              <input
                type="date"
                value={validTill}
                onChange={(e) => setValidTill(e.target.value)}
                className={inputClass}
                required
                min={planStart}
              />
            </FormField>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={handleClose} type="button">
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 size={16} className="animate-spin" /> : null}
              Confirm & Onboard
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

const inputClass =
  'w-full px-4 py-2.5 rounded-lg border border-[#E5E7EB] text-sm font-medium text-black focus:outline-none focus:ring-2 focus:ring-[#25D366] focus:border-transparent transition-all';


function FormField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-semibold text-black mb-1.5">
        {label} {required && <span className="text-[#25D366]">*</span>}
      </label>
      {children}
    </div>
  );
}
