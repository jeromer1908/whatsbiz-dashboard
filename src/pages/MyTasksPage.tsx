import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, ClipboardList, Eye } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { MiniCalendar, type DayMarker } from '@/components/tasks/MiniCalendar';
import { CompleteTaskModal } from '@/components/tasks/CompleteTaskModal';
import { TaskUpdateModal } from '@/components/tasks/TaskUpdateModal';
import { PriorityBadge, StatusBadge } from '@/components/tasks/TaskBadges';
import { useToast } from '@/context/ToastContext';
import { fetchTask, fetchTasks, logSupabaseError } from '@/lib/api';
import { formatDate, formatDateTime, localDateISO, monthRange } from '@/lib/format';
import type { Task, Username } from '@/types';

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 } as const;

function dayBounds(date: string): { from: string; to: string } {
  const [y, m, d] = date.split('-').map(Number);
  return { from: new Date(y, m - 1, d).toISOString(), to: new Date(y, m - 1, d + 1).toISOString() };
}

function ListSkeleton() {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}

interface MyTasksPageProps {
  /** Signed-in user — only their tasks are shown. */
  username: Username;
  /** Bump to reload (e.g. when a task_assigned notification arrives). */
  refreshKey?: number;
  /** Task to jump to and highlight (from a notification click). */
  focusTaskId?: string | null;
  onFocusHandled?: () => void;
}

export function MyTasksPage({ username, refreshKey = 0, focusTaskId, onFocusHandled }: MyTasksPageProps) {
  const { show } = useToast();
  const today = localDateISO();
  const [selected, setSelected] = useState(today);
  const [month, setMonth] = useState(today);

  const [dayTasks, setDayTasks] = useState<Task[]>([]);
  const [completedTasks, setCompletedTasks] = useState<Task[]>([]);
  const [monthTasks, setMonthTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState<Task | null>(null);
  const [viewTaskId, setViewTaskId] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const loadDay = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true);
      try {
        const { from, to } = dayBounds(selected);
        const [due, done] = await Promise.all([
          fetchTasks({ assignedTo: username, dueDate: selected }),
          fetchTasks({ assignedTo: username, status: 'completed', completedFrom: from, completedTo: to }),
        ]);
        setDayTasks(due);
        setCompletedTasks(done);
      } catch (err) {
        logSupabaseError('Failed to load tasks', err);
        show('error', err instanceof Error ? err.message : 'Failed to load tasks');
      } finally {
        setLoading(false);
      }
    },
    [selected, username, show]
  );

  const loadMonth = useCallback(async () => {
    try {
      const { from, to } = monthRange(month);
      setMonthTasks(await fetchTasks({ assignedTo: username, dueFrom: from, dueTo: to }));
    } catch (err) {
      logSupabaseError('Failed to load calendar', err);
    }
  }, [month, username]);

  useEffect(() => {
    loadDay();
  }, [loadDay]);

  useEffect(() => {
    loadMonth();
  }, [loadMonth]);

  useEffect(() => {
    if (refreshKey > 0) {
      loadDay(true);
      loadMonth();
    }
    // Only react to refreshKey bumps, not to date changes (those reload on their own).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const selectDate = (date: string) => {
    setSelected(date);
    setMonth(date);
  };

  // Jump to a task opened from a notification
  useEffect(() => {
    if (!focusTaskId) return;
    let cancelled = false;
    fetchTask(focusTaskId)
      .then((task) => {
        if (cancelled) return;
        if (!task || task.assigned_to !== username) {
          show('warning', 'That task no longer exists');
          return;
        }
        setSelected(task.due_date);
        setMonth(task.due_date);
        setHighlightId(task.id);
        window.setTimeout(() => setHighlightId(null), 2500);
      })
      .catch((err) => logSupabaseError('Failed to open task', err))
      .finally(() => !cancelled && onFocusHandled?.());
    return () => {
      cancelled = true;
    };
  }, [focusTaskId, username, show, onFocusHandled]);

  const markers = useMemo(() => {
    const map: Record<string, DayMarker> = {};
    for (const t of monthTasks) {
      const m = (map[t.due_date] ??= { pending: 0, completed: 0 });
      if (t.status === 'pending') m.pending++;
      else m.completed++;
    }
    return map;
  }, [monthTasks]);

  const sortedDayTasks = useMemo(
    () =>
      [...dayTasks].sort((a, b) => {
        if (a.status !== b.status) return a.status === 'pending' ? -1 : 1;
        return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      }),
    [dayTasks]
  );

  const pendingCount = dayTasks.filter((t) => t.status === 'pending').length;

  const handleCompleted = (task: Task) => {
    setCompleting(null);
    setDayTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
    setMonthTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
    if (selected === localDateISO(new Date(task.completed_at ?? Date.now()))) {
      setCompletedTasks((prev) => [task, ...prev.filter((t) => t.id !== task.id)]);
    }
  };

  const isToday = selected === today;
  const heading = isToday ? "Today's Tasks" : `Tasks for ${formatDate(selected)}`;

  return (
    <>
      <div className="max-w-6xl mx-auto grid gap-6 lg:grid-cols-[300px_1fr]">
        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <label className="relative flex items-center">
            <CalendarDays size={16} className="absolute left-3 text-gray-400 pointer-events-none" />
            <input
              type="date"
              value={selected}
              onChange={(e) => e.target.value && selectDate(e.target.value)}
              className="w-full pl-9 pr-2 py-2 rounded-lg border border-[#E5E7EB] text-sm font-semibold text-black bg-white focus:outline-none focus:ring-2 focus:ring-[#25D366] focus:border-transparent"
              aria-label="Select date"
            />
          </label>
          <MiniCalendar month={month} selected={selected} markers={markers} onSelect={selectDate} onMonthChange={setMonth} />
          {!isToday && (
            <Button variant="secondary" onClick={() => selectDate(today)} className="w-full">
              <CalendarDays size={16} />
              Jump to today
            </Button>
          )}
        </aside>

        <div className="space-y-6 min-w-0">
          {/* Today's / selected day's tasks */}
          <section className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E7EB]">
              <div>
                <h2 className="text-base font-bold text-black">{heading}</h2>
                {!loading && (
                  <p className="text-xs text-gray-500 font-medium mt-0.5">
                    {pendingCount} pending · {dayTasks.length - pendingCount} completed
                  </p>
                )}
              </div>
              <ClipboardList size={20} className="text-[#25D366]" />
            </div>

            {loading ? (
              <ListSkeleton />
            ) : sortedDayTasks.length === 0 ? (
              <EmptyState
                icon={<ClipboardList size={28} />}
                title="No tasks due"
                description={isToday ? 'Nothing is due today. Enjoy the breather!' : 'No tasks are due on this day.'}
              />
            ) : (
              <ul>
                {sortedDayTasks.map((t) => (
                  <li
                    key={t.id}
                    className={`flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-4 border-b border-[#E5E7EB] last:border-0 transition-colors ${
                      highlightId === t.id ? 'bg-[#E8FAEF]' : t.status === 'completed' ? 'bg-gray-50/60' : ''
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <StatusBadge status={t.status} dueDate={t.due_date} />
                        <PriorityBadge priority={t.priority} />
                      </div>
                      <p className={`font-semibold ${t.status === 'completed' ? 'text-gray-500 line-through' : 'text-black'}`}>
                        {t.title}
                      </p>
                      {t.description && <p className="text-sm text-gray-500 mt-0.5 whitespace-pre-wrap">{t.description}</p>}
                    </div>
                    {t.status === 'pending' ? (
                      <Button onClick={() => setCompleting(t)} className="shrink-0">
                        <CheckCircle2 size={16} />
                        Complete
                      </Button>
                    ) : (
                      <Button variant="secondary" onClick={() => setViewTaskId(t.id)} className="shrink-0">
                        <Eye size={16} />
                        My update
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Completed on the selected day */}
          <section className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E7EB]">
              <div>
                <h2 className="text-base font-bold text-black">Completed Tasks</h2>
                <p className="text-xs text-gray-500 font-medium mt-0.5">
                  Completed {isToday ? 'today' : `on ${formatDate(selected)}`}
                </p>
              </div>
              <CheckCircle2 size={20} className="text-[#25D366]" />
            </div>

            {loading ? (
              <ListSkeleton />
            ) : completedTasks.length === 0 ? (
              <EmptyState
                icon={<CheckCircle2 size={28} />}
                title="Nothing completed yet"
                description="Tasks you complete on this day will show up here."
              />
            ) : (
              <ul>
                {completedTasks.map((t) => (
                  <li
                    key={t.id}
                    className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-4 border-b border-[#E5E7EB] last:border-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-black">{t.title}</p>
                      <p className="text-xs text-gray-500 font-medium mt-0.5">
                        Due {formatDate(t.due_date)} · Completed {formatDateTime(t.completed_at)}
                      </p>
                    </div>
                    <Button variant="secondary" onClick={() => setViewTaskId(t.id)} className="shrink-0">
                      <Eye size={16} />
                      View update
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <CompleteTaskModal task={completing} onClose={() => setCompleting(null)} onCompleted={handleCompleted} />
      <TaskUpdateModal taskId={viewTaskId} onClose={() => setViewTaskId(null)} />
    </>
  );
}
