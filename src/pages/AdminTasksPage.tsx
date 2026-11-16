import { useCallback, useEffect, useMemo, useState } from 'react';
import { ClipboardList, Eye, ImageIcon, Loader2, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { PriorityBadge, StatusBadge } from '@/components/tasks/TaskBadges';
import { useToast } from '@/context/ToastContext';
import { createTask, fetchLatestTaskUpdates, fetchTasks, logSupabaseError } from '@/lib/api';
import { formatDate, formatDateTime, localDateISO } from '@/lib/format';
import { ASSIGNABLE_USERS, displayName } from '@/auth/users';
import type { Task, TaskPriority, TaskStatus, TaskUpdate, Username } from '@/types';

type StatusTab = 'all' | TaskStatus;
type AssigneeFilter = 'all' | Username;

const inputClass =
  'w-full px-3 py-2.5 rounded-lg border border-[#E5E7EB] text-sm font-medium text-black bg-white focus:outline-none focus:ring-2 focus:ring-[#25D366] focus:border-transparent transition-all';

interface AdminTasksPageProps {
  /** Bump to force a reload (e.g. when a task_completed notification arrives). */
  refreshKey?: number;
  onViewUpdate: (taskId: string) => void;
}

/** Completion message + screenshot thumbnail for a completed task. */
function CompletionSummary({ update, onView }: { update: TaskUpdate | undefined; onView: () => void }) {
  if (!update) return <span className="text-xs text-gray-400">—</span>;
  return (
    <button type="button" onClick={onView} className="flex items-start gap-2 text-left max-w-xs group">
      {update.screenshot_url ? (
        <img
          src={update.screenshot_url}
          alt="Completion screenshot"
          className="w-10 h-10 rounded-md object-cover border border-[#E5E7EB] shrink-0"
        />
      ) : (
        <span className="w-10 h-10 rounded-md bg-gray-50 border border-[#E5E7EB] flex items-center justify-center text-gray-300 shrink-0">
          <ImageIcon size={16} />
        </span>
      )}
      <span className="text-xs text-gray-600 line-clamp-2 group-hover:text-black">
        {update.message || <span className="italic text-gray-400">Screenshot only</span>}
      </span>
    </button>
  );
}

export function AdminTasksPage({ refreshKey = 0, onViewUpdate }: AdminTasksPageProps) {
  const { show } = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [updates, setUpdates] = useState<Record<string, TaskUpdate>>({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<StatusTab>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<AssigneeFilter>('all');
  const [search, setSearch] = useState('');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState(localDateISO());
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [assignee, setAssignee] = useState<Username>(ASSIGNABLE_USERS[0].username);
  const [saving, setSaving] = useState(false);

  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true);
      try {
        const data = await fetchTasks();
        setTasks(data);
        const completedIds = data.filter((t) => t.status === 'completed').map((t) => t.id);
        setUpdates(await fetchLatestTaskUpdates(completedIds));
      } catch (err) {
        logSupabaseError('Failed to load tasks', err);
        show('error', err instanceof Error ? err.message : 'Failed to load tasks');
      } finally {
        setLoading(false);
      }
    },
    [show]
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (refreshKey > 0) load(true);
  }, [refreshKey, load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      show('error', 'Title is required');
      return;
    }
    if (!dueDate) {
      show('error', 'Due date is required');
      return;
    }
    setSaving(true);
    try {
      const task = await createTask({ title: title.trim(), description, due_date: dueDate, priority, assigned_to: assignee });
      setTasks((prev) => [task, ...prev]);
      setTitle('');
      setDescription('');
      setPriority('medium');
      show('success', `Task assigned to ${displayName(task.assigned_to)}`);
    } catch (err) {
      logSupabaseError('Failed to create task', err);
      show('error', err instanceof Error ? err.message : 'Failed to create task');
    } finally {
      setSaving(false);
    }
  };

  const byAssignee = useMemo(
    () => tasks.filter((t) => assigneeFilter === 'all' || t.assigned_to === assigneeFilter),
    [tasks, assigneeFilter]
  );

  const counts = useMemo(
    () => ({
      all: byAssignee.length,
      pending: byAssignee.filter((t) => t.status === 'pending').length,
      completed: byAssignee.filter((t) => t.status === 'completed').length,
    }),
    [byAssignee]
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return byAssignee
      .filter((t) => tab === 'all' || t.status === tab)
      .filter(
        (t) =>
          !q ||
          t.title.toLowerCase().includes(q) ||
          (t.description ?? '').toLowerCase().includes(q) ||
          (updates[t.id]?.message ?? '').toLowerCase().includes(q)
      )
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === 'pending' ? -1 : 1;
        return a.status === 'pending'
          ? a.due_date.localeCompare(b.due_date)
          : (b.completed_at ?? '').localeCompare(a.completed_at ?? '');
      });
  }, [byAssignee, tab, search, updates]);

  const tabs: { key: StatusTab; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'pending', label: 'Pending' },
    { key: 'completed', label: 'Completed' },
  ];

  return (
    <div className="space-y-6">
      {/* Create form */}
      <form onSubmit={handleCreate} className="rounded-xl border border-[#E5E7EB] bg-white p-5">
        <h3 className="text-base font-bold text-black mb-4">Assign a new task</h3>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <div className="md:col-span-2">
            <label className="block text-sm font-semibold text-black mb-1.5">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={inputClass}
              placeholder="e.g. Follow up with new enquiries"
              maxLength={200}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-black mb-1.5">
              Assign to <span className="text-red-500">*</span>
            </label>
            <select value={assignee} onChange={(e) => setAssignee(e.target.value as Username)} className={inputClass}>
              {ASSIGNABLE_USERS.map((u) => (
                <option key={u.username} value={u.username}>
                  {u.displayName} ({u.username})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-black mb-1.5">
              Due date <span className="text-red-500">*</span>
            </label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputClass} required />
          </div>
          <div>
            <label className="block text-sm font-semibold text-black mb-1.5">Priority</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)} className={inputClass}>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
          <div className="md:col-span-2 lg:col-span-5">
            <label className="block text-sm font-semibold text-black mb-1.5">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={`${inputClass} min-h-[80px] resize-y`}
              placeholder="Details, links or steps for the staff member (optional)"
            />
          </div>
        </div>
        <div className="flex justify-end mt-4">
          <Button type="submit" disabled={saving}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            {saving ? 'Assigning…' : 'Assign task'}
          </Button>
        </div>
      </form>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 px-4 py-3 border-b border-[#E5E7EB]">
          <div className="flex gap-2 overflow-x-auto">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold whitespace-nowrap transition-all ${
                  tab === t.key
                    ? 'bg-[#25D366] text-white'
                    : 'border border-[#E5E7EB] bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {t.label} <span className={tab === t.key ? 'text-white/80' : 'text-gray-400'}>{counts[t.key]}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <select
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value as AssigneeFilter)}
              className="px-3 py-2 rounded-lg border border-[#E5E7EB] text-sm font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-[#25D366]"
              aria-label="Filter by assignee"
            >
              <option value="all">Everyone</option>
              {ASSIGNABLE_USERS.map((u) => (
                <option key={u.username} value={u.username}>
                  {u.displayName}
                </option>
              ))}
            </select>
            <div className="relative sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tasks"
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-[#E5E7EB] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#25D366] focus:border-transparent"
              />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="p-4">
            <TableSkeleton rows={5} cols={6} />
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<ClipboardList size={28} />}
            title={tasks.length === 0 ? 'No tasks yet' : 'No matching tasks'}
            description={
              tasks.length === 0
                ? 'Assign a task above and it will show up on that staff member’s Tasks page.'
                : 'Try a different tab, assignee or search term.'
            }
          />
        ) : (
          <>
          {/* Phones: cards */}
          <ul className="md:hidden">
            {visible.map((t) => (
              <li key={t.id} className="px-4 py-4 border-b border-[#E5E7EB] last:border-0">
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <StatusBadge status={t.status} dueDate={t.due_date} />
                  <PriorityBadge priority={t.priority} />
                </div>
                <p className="font-semibold text-black">{t.title}</p>
                {t.description && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{t.description}</p>}
                <p className="text-xs text-gray-500 font-medium mt-1.5">
                  {displayName(t.assigned_to)} · Due {formatDate(t.due_date)}
                  {t.completed_at && <> · Completed {formatDateTime(t.completed_at)}</>}
                </p>
                {t.status === 'completed' && (
                  <div className="mt-3 space-y-3">
                    <CompletionSummary update={updates[t.id]} onView={() => onViewUpdate(t.id)} />
                    <Button variant="secondary" onClick={() => onViewUpdate(t.id)} className="w-full">
                      <Eye size={14} />
                      View update
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>

          {/* Tablet & desktop: table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[#E5E7EB] bg-gray-50 text-left">
                <tr>
                  <th className="px-4 py-3 font-semibold text-gray-600">Task</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Assigned to</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Priority</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Due date</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Status</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Completion</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-600">Action</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((t) => (
                  <tr key={t.id} className="border-b border-[#E5E7EB] last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3 max-w-xs">
                      <p className="font-semibold text-black">{t.title}</p>
                      {t.description && <p className="text-xs text-gray-500 truncate">{t.description}</p>}
                    </td>
                    <td className="px-4 py-3 font-medium text-black whitespace-nowrap">{displayName(t.assigned_to)}</td>
                    <td className="px-4 py-3">
                      <PriorityBadge priority={t.priority} />
                    </td>
                    <td className="px-4 py-3 font-medium text-black whitespace-nowrap">{formatDate(t.due_date)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={t.status} dueDate={t.due_date} />
                      {t.completed_at && (
                        <p className="text-[11px] text-gray-400 mt-1 whitespace-nowrap">{formatDateTime(t.completed_at)}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {t.status === 'completed' ? (
                        <CompletionSummary update={updates[t.id]} onView={() => onViewUpdate(t.id)} />
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="secondary"
                        onClick={() => onViewUpdate(t.id)}
                        disabled={t.status !== 'completed'}
                        title={t.status !== 'completed' ? 'Available once the task is completed' : undefined}
                        className="px-3 py-1.5 whitespace-nowrap"
                      >
                        <Eye size={14} />
                        View update
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>
    </div>
  );
}
