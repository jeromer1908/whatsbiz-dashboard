import { formatINR, GST_RATE } from '@/lib/format';

function formatCurrency(amount: number): string {
  const formatted = formatINR(amount);
  return formatted.includes('.')
    ? formatted.replace(/(\.\d)$/, (decimal) => `${decimal}0`)
    : `${formatted}.00`;
}

const GST_PERCENT = Math.round(GST_RATE * 100);

/** On/off switch for adding GST on top of the entered amount. */
export function GstToggle({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 cursor-pointer rounded-lg border border-[#E5E7EB] px-4 py-2.5">
      <span>
        <span className="block text-sm font-semibold text-black">Add GST ({GST_PERCENT}%)</span>
        <span className="block text-xs text-gray-500">
          {checked ? `${GST_PERCENT}% GST is added on top of the amount` : 'Amount is saved as entered, without GST'}
        </span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
          checked ? 'bg-[#25D366]' : 'bg-gray-300'
        }`}
      >
        <span
          className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </button>
    </label>
  );
}

/** Base / GST / total breakdown; shows only the total when GST is off. */
export function GstSummary({ base, gst, total, includeGst }: { base: number; gst: number; total: number; includeGst: boolean }) {
  if (base <= 0) return null;
  return (
    <div className="bg-[#E8FAEF] rounded-lg px-4 py-3 space-y-1.5">
      {includeGst && (
        <>
          <div className="flex items-center justify-between gap-4 text-sm">
            <span className="font-medium text-gray-600">Base amount</span>
            <span className="font-semibold text-black">{formatCurrency(base)}</span>
          </div>
          <div className="flex items-center justify-between gap-4 text-sm">
            <span className="font-medium text-gray-600">GST ({GST_PERCENT}%)</span>
            <span className="font-semibold text-black">{formatCurrency(gst)}</span>
          </div>
        </>
      )}
      <div
        className={`flex items-center justify-between gap-4 text-sm ${
          includeGst ? 'border-t border-[#25D366]/20 pt-1.5' : ''
        }`}
      >
        <span className="font-bold text-black">Total payable{includeGst ? '' : ' (no GST)'}</span>
        <span className="font-bold text-[#1EBE5A]">{formatCurrency(total)}</span>
      </div>
    </div>
  );
}
