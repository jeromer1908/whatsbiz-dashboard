import { useEffect, useState } from 'react';
import { CalendarDays, Clock, ImageOff, MessageSquare, UserRound, X, ZoomIn } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { LoadingSpinner } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { fetchTask, fetchTaskUpdates, logSupabaseError } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/format';
import type { Task, TaskUpdate } from '@/types';
import { displayName } from '@/auth/users';
import { PriorityBadge, StatusBadge } from './TaskBadges';

interface TaskUpdateModalProps {
  taskId: string | null;
  onClose: () => void;
}

export function TaskUpdateModal({ taskId, onClose }: TaskUpdateModalProps) {
  const [task, setTask] = useState<Task | null>(null);
  const [updates, setUpdates] = useState<TaskUpdate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enlarged, setEnlarged] = useState<string | null>(null);

  useEffect(() => {
    if (!taskId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setTask(null);
    setUpdates([]);
    Promise.all([fetchTask(taskId), fetchTaskUpdates(taskId)])
      .then(([t, u]) => {
        if (cancelled) return;
        setTask(t);
        setUpdates(u);
        if (!t) setError('This task no longer exists.');
      })
      .catch((err) => {
        logSupabaseError('Failed to load task update', err);
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load task update');
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  useEffect(() => {
    if (!enlarged) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setEnlarged(null);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [enlarged]);

  return (
    <>
      <Modal open={!!taskId} onClose={onClose} title="Task update" size="lg">
        {loading ? (
          <LoadingSpinner label="Loading update…" />
        ) : error ? (
          <p className="text-sm font-medium text-red-500 bg-red-50 rounded-lg px-3 py-2.5">{error}</p>
        ) : task ? (
          <div className="space-y-5">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <StatusBadge status={task.status} dueDate={task.due_date} />
                <PriorityBadge priority={task.priority} />
              </div>
              <h3 className="text-base font-bold text-black">{task.title}</h3>
              {task.description && (
                <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{task.description}</p>
              )}
              <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3 text-xs font-medium text-gray-500">
                <span className="inline-flex items-center gap-1.5">
                  <UserRound size={14} /> {displayName(task.assigned_to)}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays size={14} /> Due {formatDate(task.due_date)}
                </span>
                {task.completed_at && (
                  <span className="inline-flex items-center gap-1.5">
                    <Clock size={14} /> Completed {formatDateTime(task.completed_at)}
                  </span>
                )}
              </div>
            </div>

            <div className="border-t border-[#E5E7EB] pt-5">
              {updates.length === 0 ? (
                <EmptyState
                  icon={<MessageSquare size={24} />}
                  title="No update yet"
                  description={`${displayName(task.assigned_to)} hasn't submitted an update for this task.`}
                />
              ) : (
                <div className="space-y-5">
                  {updates.map((u) => (
                    <div key={u.id} className="space-y-3">
                      <p className="text-xs font-semibold text-gray-400">{displayName(task.assigned_to)}'s update · {formatDateTime(u.created_at)}</p>
                      {u.message ? (
                        <div className="rounded-lg bg-gray-50 border border-[#E5E7EB] px-4 py-3">
                          <p className="text-sm text-black whitespace-pre-wrap">{u.message}</p>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-400 italic">No message</p>
                      )}
                      {u.screenshot_url ? (
                        <button
                          type="button"
                          onClick={() => setEnlarged(u.screenshot_url)}
                          className="group relative block w-full rounded-lg border border-[#E5E7EB] overflow-hidden bg-gray-50"
                          aria-label="Enlarge screenshot"
                        >
                          <img src={u.screenshot_url} alt="Task screenshot" className="w-full max-h-80 object-contain" />
                          <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-all">
                            <span className="opacity-0 group-hover:opacity-100 inline-flex items-center gap-1.5 bg-white text-black text-xs font-bold px-3 py-1.5 rounded-full shadow">
                              <ZoomIn size={14} /> Click to enlarge
                            </span>
                          </span>
                        </button>
                      ) : (
                        <p className="inline-flex items-center gap-1.5 text-xs text-gray-400 font-medium">
                          <ImageOff size={14} /> No screenshot
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </Modal>

      {enlarged && (
        <div className="fixed inset-0 z-[60] bg-black/85 flex items-center justify-center p-4" onClick={() => setEnlarged(null)}>
          <button
            type="button"
            onClick={() => setEnlarged(null)}
            className="absolute top-4 right-4 text-white/80 hover:text-white p-2 rounded-lg hover:bg-white/10"
            aria-label="Close"
          >
            <X size={24} />
          </button>
          <img
            src={enlarged}
            alt="Task screenshot (enlarged)"
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
