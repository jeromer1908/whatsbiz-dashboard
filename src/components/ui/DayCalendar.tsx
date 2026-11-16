import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { localDateISO } from '@/lib/format';

interface DayCalendarProps {
  /** Any date inside the month to show (YYYY-MM-DD). */
  month: string;
  selected: string;
  onSelect: (date: string) => void;
  onMonthChange: (month: string) => void;
  /** Tailwind `bg-*` class for the day's dot, or null for no dot. */
  dot?: (date: string) => string | null;
  /** Accessible label for a day button. Defaults to the date itself. */
  dayLabel?: (date: string) => string;
  /** Days after this date are shown disabled (YYYY-MM-DD). */
  maxDate?: string;
  legend?: ReactNode;
}

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

export function DayCalendar({
  month,
  selected,
  onSelect,
  onMonthChange,
  dot,
  dayLabel,
  maxDate,
  legend,
}: DayCalendarProps) {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const daysInMonth = new Date(y, m, 0).getDate();
  const leading = (first.getDay() + 6) % 7; // Monday-first
  const today = localDateISO();

  const cells: (string | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => localDateISO(new Date(y, m - 1, i + 1))),
  ];

  const shift = (delta: number) => onMonthChange(localDateISO(new Date(y, m - 1 + delta, 1)));

  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={() => shift(-1)}
          className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-black"
          aria-label="Previous month"
        >
          <ChevronLeft size={16} />
        </button>
        <p className="text-sm font-bold text-black">
          {first.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
        </p>
        <button
          type="button"
          onClick={() => shift(1)}
          className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-black"
          aria-label="Next month"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((d) => (
          <div key={d} className="text-[11px] font-semibold text-gray-400 py-1">
            {d}
          </div>
        ))}
        {cells.map((date, i) => {
          if (!date) return <div key={`e${i}`} />;
          const isSelected = date === selected;
          const isToday = date === today;
          const disabled = Boolean(maxDate && date > maxDate);
          const dotColor = dot?.(date) ?? null;
          return (
            <button
              key={date}
              type="button"
              onClick={() => onSelect(date)}
              disabled={disabled}
              className={`relative h-9 rounded-lg text-sm font-semibold transition-all ${
                disabled
                  ? 'text-gray-300 cursor-not-allowed'
                  : isSelected
                  ? 'bg-[#25D366] text-white'
                  : isToday
                  ? 'bg-[#E8FAEF] text-[#1EBE5A]'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
              aria-label={dayLabel?.(date) ?? date}
              aria-pressed={isSelected}
            >
              {Number(date.slice(8))}
              {dotColor && (
                <span
                  className={`absolute bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full ${
                    isSelected ? 'bg-white' : dotColor
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>

      {legend && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 pt-3 border-t border-[#E5E7EB] text-[11px] font-medium text-gray-500">
          {legend}
        </div>
      )}
    </div>
  );
}
