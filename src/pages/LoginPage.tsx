import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { Button } from '@/components/ui/Button';
import logo from '@/assets/GWT Logo.png';
import hero from '@/assets/Hero.webp';
import { Lock, User, AlertCircle, Eye, EyeOff } from 'lucide-react';

const MAX_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 30;

export function LoginPage() {
  const { signIn } = useAuth();
  const { show } = useToast();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutRemaining, setLockoutRemaining] = useState(0);

  useEffect(() => {
    if (lockoutRemaining <= 0) return;
    const interval = setInterval(() => {
      setLockoutRemaining((prev) => {
        if (prev <= 1) {
          setFailedAttempts(0);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [lockoutRemaining]);

  const isLocked = lockoutRemaining > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked) return;
    setError(null);
    setLoading(true);

    const { error: signInError, warning } = await signIn(username, password);
    setLoading(false);
    if (warning) show('warning', warning);

    if (signInError) {
      const nextAttempts = failedAttempts + 1;
      setFailedAttempts(nextAttempts);
      if (nextAttempts >= MAX_ATTEMPTS) {
        setLockoutRemaining(LOCKOUT_SECONDS);
        setError(`Too many failed attempts. Please wait ${LOCKOUT_SECONDS} seconds.`);
      } else {
        setError(signInError);
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#E8FAEF] via-white to-gray-50 flex items-center justify-center p-4 lg:p-10">
      <div className="w-full max-w-sm lg:max-w-6xl lg:grid lg:grid-cols-2 lg:items-center lg:gap-12">
        <div className="hidden lg:flex items-center justify-center">
          <img src={hero} alt="WhatsBiz dashboard illustration" className="w-full max-h-[80vh] object-contain" />
        </div>

        <div className="w-full max-w-sm mx-auto">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <img src={logo} alt="GWT Logo" className="w-64 max-w-full h-auto mb-4" />
          <p className="text-sm text-gray-500 mt-1 font-medium">Customer Management Dashboard</p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-[#E5E7EB] p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-black mb-1.5">Username</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-lg border border-[#E5E7EB] text-sm font-medium text-black focus:outline-none focus:ring-2 focus:ring-[#25D366] focus:border-transparent transition-all"
                  placeholder="Enter your username"
                  required
                  autoFocus
                  disabled={isLocked}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-black mb-1.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-3 rounded-lg border border-[#E5E7EB] text-sm font-medium text-black focus:outline-none focus:ring-2 focus:ring-[#25D366] focus:border-transparent transition-all"
                  placeholder="Enter your password"
                  required
                  disabled={isLocked}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 text-red-500 text-sm bg-red-50 rounded-lg px-3 py-2.5">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <span className="font-medium">{error}</span>
              </div>
            )}

            {isLocked && (
              <p className="text-center text-sm font-semibold text-amber-600">
                Try again in <span className="text-black">{lockoutRemaining}s</span>
              </p>
            )}

            <Button
              type="submit"
              disabled={loading || isLocked}
              className="w-full py-3 text-base"
            >
              {loading ? 'Signing in…' : isLocked ? 'Locked' : 'Login'}
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6 font-medium">
          Authorized personnel only
        </p>
        </div>
      </div>
    </div>
  );
}
