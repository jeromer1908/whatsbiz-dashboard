import { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/context/ToastContext';
import { createCustomer, updateCustomer, getMobileExists } from '@/lib/api';
import { normalizeMobile } from '@/lib/format';
import type { Customer } from '@/types';
import { Loader2 } from 'lucide-react';

interface EnquiryFormProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  editing?: Customer | null;
}

export function EnquiryForm({ open, onClose, onSaved, editing }: EnquiryFormProps) {
  const { show } = useToast();
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [business, setBusiness] = useState('');
  const [email, setEmail] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [mobileError, setMobileError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(editing?.name || '');
      setMobile(editing?.mobile || '');
      setBusiness(editing?.business || '');
      setEmail(editing?.email || '');
      setLocation(editing?.location || '');
      setNotes(editing?.notes || '');
      setMobileError(null);
    }
  }, [open, editing]);

  const validateMobile = async (): Promise<boolean> => {
    const normalized = normalizeMobile(mobile);
    if (!normalized) {
      setMobileError('Enter a valid 10-digit mobile number');
      return false;
    }
    const exists = await getMobileExists(normalized, editing?.id);
    if (exists) {
      setMobileError('This mobile number already exists');
      return false;
    }
    setMobileError(null);
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = normalizeMobile(mobile);
    if (!normalized) {
      setMobileError('Enter a valid 10-digit mobile number');
      return;
    }

    setSaving(true);
    try {
      const exists = await getMobileExists(normalized, editing?.id);
      if (exists) {
        setMobileError('This mobile number already exists');
        setSaving(false);
        return;
      }

      const payload = {
        name: name.trim(),
        mobile: normalized,
        business: business.trim() || null,
        email: email.trim() || null,
        location: location.trim() || null,
        notes: notes.trim() || null,
      };

      if (editing) {
        await updateCustomer(editing.id, payload);
        show('success', 'Enquiry updated successfully');
      } else {
        await createCustomer({ ...payload, status: 'enquiry' });
        show('success', 'Enquiry added successfully');
      }
      onSaved();
      onClose();
    } catch (err) {
      show('error', err instanceof Error ? err.message : 'Failed to save enquiry');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Edit Enquiry' : 'Add Enquiry'} size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Name" required>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            required
            placeholder="Customer name"
          />
        </FormField>

        <FormField label="Mobile" required error={mobileError}>
          <input
            type="tel"
            value={mobile}
            onChange={(e) => {
              setMobile(e.target.value);
              setMobileError(null);
            }}
            onBlur={validateMobile}
            className={`${inputClass} ${mobileError ? 'border-red-400' : ''}`}
            required
            placeholder="10-digit mobile number"
          />
        </FormField>

        <FormField label="Business">
          <input
            type="text"
            value={business}
            onChange={(e) => setBusiness(e.target.value)}
            className={inputClass}
            placeholder="Business name or type"
          />
        </FormField>

        <FormField label="Email">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
            placeholder="email@example.com"
          />
        </FormField>

        <FormField label="Location">
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className={inputClass}
            placeholder="City, state"
          />
        </FormField>

        <FormField label="Notes">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={`${inputClass} min-h-[80px] resize-y`}
            placeholder="Any additional notes"
          />
        </FormField>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : null}
            {editing ? 'Save Changes' : 'Add Enquiry'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

const inputClass =
  'w-full px-4 py-2.5 rounded-lg border border-[#E5E7EB] text-sm font-medium text-black focus:outline-none focus:ring-2 focus:ring-[#25D366] focus:border-transparent transition-all';

function FormField({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-semibold text-black mb-1.5">
        {label} {required && <span className="text-[#25D366]">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-500 font-medium mt-1">{error}</p>}
    </div>
  );
}
