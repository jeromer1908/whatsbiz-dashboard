import { useCallback, useState } from 'react';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ToastProvider } from '@/context/ToastContext';
import { LoginPage } from '@/pages/LoginPage';
import { Layout, type PageKey } from '@/components/Layout';
import { EnquiriesPage } from '@/pages/EnquiriesPage';
import { OnboardedPage } from '@/pages/OnboardedPage';
import { RechargesPage } from '@/pages/RechargesPage';
import { QuotaPage } from '@/pages/QuotaPage';
import { ReportsPage } from '@/pages/ReportsPage';
import { AdminTasksPage } from '@/pages/AdminTasksPage';
import { MyTasksPage } from '@/pages/MyTasksPage';
import { NotificationBell } from '@/components/NotificationBell';
import { TaskUpdateModal } from '@/components/tasks/TaskUpdateModal';
import { DASHBOARD_TITLES, type AppUser } from '@/auth/users';
import type { AppNotification } from '@/types';
import { LoadingSpinner } from '@/components/ui/Skeleton';

const PAGE_TITLES: Record<PageKey, string> = {
  enquiries: 'Enquiries',
  onboarded: 'Onboarded Customers',
  recharges: 'Recharges',
  quota: 'Quota',
  reports: 'Reports',
  tasks: 'Tasks',
};

/** One dashboard for every account; only the Tasks page and header differ by role. */
function Dashboard({ user }: { user: AppUser }) {
  const isAdmin = user.role === 'super_admin';
  const [page, setPage] = useState<PageKey>('enquiries');
  const [viewTaskId, setViewTaskId] = useState<string | null>(null);
  const [focusTaskId, setFocusTaskId] = useState<string | null>(null);
  const [tasksRefreshKey, setTasksRefreshKey] = useState(0);

  const handleNotificationSelect = useCallback(
    (n: AppNotification) => {
      if (!n.task_id) return;
      if (isAdmin) {
        setViewTaskId(n.task_id);
      } else {
        setPage('tasks');
        setFocusTaskId(n.task_id);
      }
    },
    [isAdmin]
  );

  const handleNewNotification = useCallback(() => {
    setTasksRefreshKey((k) => k + 1);
  }, []);

  const clearFocus = useCallback(() => setFocusTaskId(null), []);

  return (
    <Layout
      currentPage={page}
      onNavigate={setPage}
      pageTitle={page === 'tasks' && !isAdmin ? 'My Tasks' : PAGE_TITLES[page]}
      dashboardTitle={DASHBOARD_TITLES[user.role]}
      userName={user.displayName}
      topBarExtra={
        <NotificationBell recipient={user.username} onSelect={handleNotificationSelect} onNew={handleNewNotification} />
      }
    >
      {page === 'enquiries' && <EnquiriesPage />}
      {page === 'onboarded' && <OnboardedPage />}
      {page === 'recharges' && <RechargesPage />}
      {page === 'quota' && <QuotaPage />}
      {page === 'reports' && <ReportsPage />}
      {page === 'tasks' &&
        (isAdmin ? (
          <AdminTasksPage refreshKey={tasksRefreshKey} onViewUpdate={setViewTaskId} />
        ) : (
          <MyTasksPage
            username={user.username}
            refreshKey={tasksRefreshKey}
            focusTaskId={focusTaskId}
            onFocusHandled={clearFocus}
          />
        ))}
      <TaskUpdateModal taskId={viewTaskId} onClose={() => setViewTaskId(null)} />
    </Layout>
  );
}

function AppContent() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <LoadingSpinner label="Loading…" />
      </div>
    );
  }

  // Keyed by username so switching accounts never carries state over.
  if (user) return <Dashboard key={user.username} user={user} />;
  return <LoginPage />;
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </AuthProvider>
  );
}
