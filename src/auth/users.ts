/**
 * Dashboard accounts — the single place where logins, roles and passwords live.
 *
 * - `admin` signs in through Supabase Auth (admin@<VITE_LOGIN_DOMAIN>); its password is managed in Supabase,
 *   so it is `null` here.
 * - `staff` and `staff2` are static logins checked against the passwords below. After a successful check the app
 *   also signs in to the matching Supabase Auth user (<supabaseLogin>@<VITE_LOGIN_DOMAIN>, same password) so that
 *   customer, recharge and quota data — which is closed to the anon key — stays readable.
 *
 * `username` is the stable id stored in tasks.assigned_to and notifications.recipient. Don't rename it.
 */

export type UserRole = 'super_admin' | 'user';
export type Username = 'admin' | 'staff' | 'staff2';

export interface AppUser {
  username: Username;
  role: UserRole;
  /** Shown in the UI (assignee pickers, notifications, header). */
  displayName: string;
  /** Static password, or null when the password is managed by Supabase Auth. */
  password: string | null;
  /** Extra login names that also sign in as this account. */
  aliases?: string[];
  /** Local part of the linked Supabase Auth email (<supabaseLogin>@<VITE_LOGIN_DOMAIN>); defaults to username. */
  supabaseLogin?: string;
}

export const USERS: AppUser[] = [
  { username: 'admin', role: 'super_admin', displayName: 'Admin', password: null },
  // Log in as user1 (or 'user', the original login name) / user2; stored as staff / staff2.
  { username: 'staff', role: 'user', displayName: 'Niranjani', password: 'whatsbiz2026', aliases: ['user1', 'user'], supabaseLogin: 'user1' },
  { username: 'staff2', role: 'user', displayName: 'Priyanka', password: 'whatsbiz2026', aliases: ['user2'], supabaseLogin: 'user2' },
];

export const DASHBOARD_TITLES: Record<UserRole, string> = {
  super_admin: 'Admin Dashboard',
  user: 'User Dashboard',
};

/** Accounts that tasks can be assigned to. */
export const ASSIGNABLE_USERS = USERS.filter((u) => u.role === 'user');

export function getUser(username: string | null | undefined): AppUser | null {
  return USERS.find((u) => u.username === username) ?? null;
}

/** Matches what was typed in the login form against usernames and aliases. */
export function findUserByLogin(login: string): AppUser | null {
  const name = login.trim();
  return USERS.find((u) => u.username === name || u.aliases?.includes(name)) ?? null;
}

/** The account a Supabase email local part belongs to. */
export function findUserBySupabaseLogin(local: string | null | undefined): AppUser | null {
  return USERS.find((u) => (u.supabaseLogin ?? u.username) === local) ?? null;
}

export function displayName(username: string | null | undefined): string {
  return getUser(username)?.displayName ?? username ?? 'Unknown';
}
