import type { TaskPriority, TaskStatus } from '@/types';
import { localDateISO } from '@/lib/format';

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  const styles: Record<TaskPriority, string> = {
    high: 'bg-red-50 text-red-600',
    medium: 'bg-amber-50 text-amber-600',
    low: 'bg-gray-100 text-gray-500',
  };
  return (
    <span className={`inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-full capitalize ${styles[priority]}`}>
      {priority}
    </span>
  );
}

export function StatusBadge({ status, dueDate }: { status: TaskStatus; dueDate?: string }) {
  if (status === 'completed') {
    return (
      <span className="inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-full bg-[#E8FAEF] text-[#1EBE5A]">
        Completed
      </span>
    );
  }
  const overdue = dueDate ? dueDate < localDateISO() : false;
  return (
    <span
      className={`inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-full ${
        overdue ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'
      }`}
    >
      {overdue ? 'Overdue' : 'Pending'}
    </span>
  );
}
