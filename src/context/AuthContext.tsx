import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, LOGIN_DOMAIN } from '@/lib/supabase';
import { findUserByLogin, findUserBySupabaseLogin, getUser, type AppUser, type UserRole, type Username } from '@/auth/users';

interface SignInResult {
  error: string | null;
  role: UserRole | null;
  /** Set when the login worked but data access is limited (no linked Supabase user). */
  warning?: string;
}

interface AuthContextValue {
  /** Supabase session — admin always has one; staff accounts have one when their linked Supabase user exists. */
  session: Session | null;
  /** The signed-in account from src/auth/users.ts, or null when signed out. */
  user: AppUser | null;
  role: UserRole | null;
  username: Username | null;
  loading: boolean;
  /** Supabase's error from the last staff link attempt (e.g. "Invalid login credentials"). */
  linkError: string | null;
  signIn: (username: string, password: string) => Promise<SignInResult>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const STATIC_STORAGE_KEY = 'wb_staff_session';

function readStaticUser(): Username | null {
  try {
    const value = localStorage.getItem(STATIC_STORAGE_KEY);
    // '1' is the flag stored by the original single-staff login.
    if (value === '1') return 'staff';
    const user = getUser(value);
    return user && user.password !== null ? user.username : null;
  } catch {
    return null;
  }
}

function writeStaticUser(username: Username | null): void {
  try {
    if (username) localStorage.setItem(STATIC_STORAGE_KEY, username);
    else localStorage.removeItem(STATIC_STORAGE_KEY);
  } catch {
    /* storage unavailable — stays signed in for this tab only */
  }
}

function emailFor(username: string): string {
  return `${username}@${LOGIN_DOMAIN}`;
}

/** Supabase users map to an account by their email's local part; any other Supabase user is admin, as before. */
function userForSession(session: Session): AppUser {
  const local = session.user.email?.split('@')[0];
  const match = findUserBySupabaseLogin(local);
  return match ?? getUser('admin')!;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [staticUser, setStaticUser] = useState<Username | null>(() => readStaticUser());
  const [loading, setLoading] = useState(true);
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const user: AppUser | null = staticUser ? getUser(staticUser) : session ? userForSession(session) : null;

  const signIn = async (username: string, password: string): Promise<SignInResult> => {
    const account = findUserByLogin(username);

    // Static login (staff / staff2) — checked against src/auth/users.ts
    if (account && account.password !== null) {
      if (password !== account.password) {
        return { error: 'Wrong username or password', role: null };
      }
      // Link to the matching Supabase user so customer data (closed to the anon key) is readable.
      const { error } = await supabase.auth.signInWithPassword({ email: emailFor(account.supabaseLogin ?? account.username), password });
      if (error) {
        console.warn(`Supabase link for ${account.username} failed:`, error.message);
        await supabase.auth.signOut();
      }
      setLinkError(error ? error.message : null);
      writeStaticUser(account.username);
      setStaticUser(account.username);
      return {
        error: null,
        role: account.role,
        warning: error
          ? `Signed in, but Supabase refused ${emailFor(account.supabaseLogin ?? account.username)}: ${error.message}`
          : undefined,
      };
    }

    // Admin login through Supabase Auth — unchanged
    const { data, error } = await supabase.auth.signInWithPassword({ email: emailFor(username.trim()), password });
    if (error || !data.session) {
      return { error: 'Wrong username or password', role: null };
    }
    writeStaticUser(null);
    setStaticUser(null);
    return { error: null, role: userForSession(data.session).role };
  };

  const signOut = async () => {
    writeStaticUser(null);
    setStaticUser(null);
    setLinkError(null);
    if (session) await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{ session, user, role: user?.role ?? null, username: user?.username ?? null, loading, linkError, signIn, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
