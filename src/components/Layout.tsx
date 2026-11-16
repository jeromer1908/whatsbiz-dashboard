import type { ReactNode } from 'react';
import { useAuth } from '@/context/AuthContext';
import { LOGIN_DOMAIN } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import logo from '@/assets/GWT Logo.png';
import { LogOut, UserCheck, IndianRupee, Gauge, BarChart3, Inbox, ClipboardList } from 'lucide-react';

export type PageKey = 'enquiries' | 'onboarded' | 'recharges' | 'quota' | 'reports' | 'tasks';

interface LayoutProps {
  currentPage: PageKey;
  onNavigate: (page: PageKey) => void;
  pageTitle: string;
  /** Dashboard name shown in the header — differs for admin and staff. */
  dashboardTitle: string;
  /** Signed-in account name shown under the dashboard title. */
  userName?: string;
  /** Extra controls rendered at the right of the top bar (e.g. the notification bell). */
  topBarExtra?: ReactNode;
  children: ReactNode;
}

const NAV_ITEMS: { key: PageKey; label: string; icon: typeof Inbox }[] = [
  { key: 'enquiries', label: 'Enquiries', icon: Inbox },
  { key: 'onboarded', label: 'Onboarded Customers', icon: UserCheck },
  { key: 'recharges', label: 'Recharges', icon: IndianRupee },
  { key: 'quota', label: 'Quota', icon: Gauge },
  { key: 'reports', label: 'Reports', icon: BarChart3 },
  { key: 'tasks', label: 'Tasks', icon: ClipboardList },
];

export function Layout({ currentPage, onNavigate, pageTitle, dashboardTitle, userName, topBarExtra, children }: LayoutProps) {
  const { signOut, session, user, linkError } = useAuth();
  // Staff logins need their linked Supabase user; without it customer data requests return 401.
  const dataUnavailable = !!user && user.role === 'user' && !session;

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-[#E5E7EB] flex flex-col shrink-0 hidden md:flex">
        <div className="px-6 py-5 border-b border-[#E5E7EB]">
          <img src={logo} alt="GWT Logo" className="w-full h-auto" />
          <p className="mt-3 text-sm font-bold text-black">{dashboardTitle}</p>
          {userName && <p className="text-xs font-medium text-gray-500">Signed in as {userName}</p>}
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = currentPage === item.key;
            return (
              <button
                key={item.key}
                onClick={() => onNavigate(item.key)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                  isActive
                    ? 'bg-[#25D366] text-white'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-black'
                }`}
              >
                <Icon size={18} className={isActive ? 'text-white' : 'text-gray-400'} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="px-3 py-4 border-t border-[#E5E7EB]">
          <Button variant="secondary" onClick={signOut} className="w-full">
            <LogOut size={16} />
            Logout
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="bg-white border-b border-[#E5E7EB] px-4 md:px-6 py-3 md:py-4 flex items-center justify-between gap-3 shrink-0">
          <div className="hidden md:block min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#25D366] truncate">{dashboardTitle}</p>
            <h2 className="text-xl font-bold text-black truncate">{pageTitle}</h2>
          </div>
          <div className="flex flex-1 md:flex-none items-center justify-end gap-2 md:gap-3 min-w-0">
            {topBarExtra}
            {/* Mobile nav */}
            <select
              className="md:hidden order-first flex-1 min-w-0 text-sm font-semibold border border-[#E5E7EB] rounded-lg px-3 py-2 bg-white"
              aria-label="Go to page"
              value={currentPage}
              onChange={(e) => onNavigate(e.target.value as PageKey)}
            >
              {NAV_ITEMS.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
            <Button variant="ghost" onClick={signOut} className="md:hidden px-2.5" aria-label="Logout">
              <LogOut size={16} />
            </Button>
          </div>
        </header>

        {/* Mobile: dashboard title (the desktop header shows it beside the page title) */}
        <div className="md:hidden bg-white border-b border-[#E5E7EB] px-4 py-2">
          <p className="text-sm font-bold text-black truncate">
            {dashboardTitle}
            {userName && <span className="font-medium text-gray-500"> · {userName}</span>}
          </p>
        </div>

        {dataUnavailable && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 md:px-6 py-2.5 text-sm font-medium text-amber-800">
            Customer data can't load: the Supabase user <span className="font-bold">{user!.supabaseLogin ?? user!.username}@{LOGIN_DOMAIN}</span> isn't
            signed in.{' '}
            {linkError ? (
              <>
                Supabase said: <span className="font-bold">{linkError}</span>.{' '}
              </>
            ) : null}
            Check that user in Supabase Auth (same password as in users.ts, confirmed), then log out and log in again.
          </div>
        )}

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
