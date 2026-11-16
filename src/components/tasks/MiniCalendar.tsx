import { DayCalendar } from '@/components/ui/DayCalendar';
import { localDateISO } from '@/lib/format';

export interface DayMarker {
  pending: number;
  completed: number;
}

interface MiniCalendarProps {
  /** Any date inside the month to show (YYYY-MM-DD). */
  month: string;
  selected: string;
  markers: Record<string, DayMarker>;
  onSelect: (date: string) => void;
  onMonthChange: (month: string) => void;
}

export function MiniCalendar({ month, selected, markers, onSelect, onMonthChange }: MiniCalendarProps) {
  const today = localDateISO();

  return (
    <DayCalendar
      month={month}
      selected={selected}
      onSelect={onSelect}
      onMonthChange={onMonthChange}
      dot={(date) => {
        const marker = markers[date];
        if (!marker) return null;
        if (marker.pending === 0) return 'bg-[#25D366]';
        return date < today ? 'bg-red-500' : 'bg-amber-500';
      }}
      dayLabel={(date) => {
        const marker = markers[date];
        return marker ? `${date}, ${marker.pending} pending, ${marker.completed} completed` : date;
      }}
      legend={
        <>
          <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Pending</span>
          <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-500" /> Overdue</span>
          <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#25D366]" /> All done</span>
        </>
      }
    />
  );
}
