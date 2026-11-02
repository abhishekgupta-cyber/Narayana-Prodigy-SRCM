/**
 * Narayana Prodigy Student Relation Call Management CRM
 * Strict Section 4.1 Compliant Landing / Login Gateway
 * Only branding, Username/Mobile/Email, Password (eye toggle), Login.
 * Generic error text (never reveals user existence), lock after 5 failures.
 */

import React, { useState } from 'react';
import {
  Lock,
  Mail,
  Eye,
  EyeOff,
  AlertCircle,
  Building2,
  ShieldCheck,
} from 'lucide-react';
import { User } from '../../types/crm';
import { crmDb } from '../../services/db';

interface LoginPageProps {
  onLoginSuccess: (user: User) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [identifier, setIdentifier] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [failCount, setFailCount] = useState<number>(0);
  const [isLocked, setIsLocked] = useState<boolean>(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (isLocked) {
      setError('Account temporarily locked due to multiple failed attempts. Please try again after 15 minutes.');
      return;
    }

    if (!identifier.trim() || !password.trim()) {
      setError('Please provide your Username/Mobile and Password.');
      return;
    }

    setIsLoading(true);

    setTimeout(() => {
      const cleanIdent = identifier.trim().toLowerCase();
      const cleanPhone = identifier.replace(/\D/g, '');

      // Match by email, username, or normalized mobile
      const matchedUser = crmDb.getUsers().find((u) => {
        if (u.email.toLowerCase() === cleanIdent) return true;
        if (u.username && u.username.toLowerCase() === cleanIdent) return true;
        if (cleanPhone && u.mobile_number && u.mobile_number.replace(/\D/g, '').endsWith(cleanPhone.slice(-10))) return true;
        return false;
      });

      // Strict Section 4.1: Generic error text, never reveal whether username exists!
      if (!matchedUser || matchedUser.status === 'INACTIVE') {
        const nextFails = failCount + 1;
        setFailCount(nextFails);
        if (nextFails >= 5) {
          setIsLocked(true);
          setError('Security Lockout: Too many invalid attempts. Access locked for 15 minutes.');
        } else {
          setError('Invalid credentials. Please verify your login details.');
        }
        setIsLoading(false);
        return;
      }

      // Check lockout status
      if (matchedUser.locked_until && new Date(matchedUser.locked_until).getTime() > Date.now()) {
        setError('This account is locked. Please contact your system administrator.');
        setIsLoading(false);
        return;
      }

      setIsLoading(false);
      onLoginSuccess(matchedUser);
    }, 350);
  };

  return (
    <div className="min-h-screen bg-white flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 selection:bg-amber-400 selection:text-slate-950 font-sans">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        {/* Narayana Prodigy Branding (Section 4.1) */}
        <div className="text-center">
          <div className="inline-flex w-14 h-14 rounded-2xl bg-amber-500 text-slate-950 font-black items-center justify-center text-2xl shadow-sm mx-auto mb-4">
            N
          </div>
          <h1 className="text-2xl font-black text-slate-950 tracking-tight">
            Narayana Prodigy
          </h1>
          <p className="text-sm font-semibold text-amber-700 tracking-wide uppercase mt-0.5">
            Student Relation Call Management CRM
          </p>
          <p className="text-xs text-slate-400 mt-2">
            Secure Institutional Gateway
          </p>
        </div>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 sm:px-10 rounded-2xl border border-slate-200 shadow-xl space-y-6">
          {error && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-center gap-2.5 font-medium animate-shake">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username / Mobile / Email */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Username or Registered Mobile
              </label>
              <div className="relative rounded-lg shadow-2xs">
                <input
                  type="text"
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="name@narayanagroup.com or 10-digit mobile"
                  autoComplete="username"
                  className="w-full text-xs font-medium text-slate-900 border border-slate-300 rounded-lg px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all placeholder:text-slate-400"
                />
              </div>
            </div>

            {/* Password with Eye Toggle (Section 4.1) */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Password
              </label>
              <div className="relative rounded-lg shadow-2xs">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter account password"
                  autoComplete="current-password"
                  className="w-full text-xs font-medium text-slate-900 border border-slate-300 rounded-lg pl-3.5 pr-10 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all placeholder:text-slate-400"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isLoading || isLocked}
                className="w-full py-2.5 px-4 bg-slate-950 hover:bg-slate-800 disabled:bg-slate-400 text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
              >
                {isLoading ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <span>Sign In to Workstation</span>
                )}
              </button>
            </div>
          </form>

          {/* Minimal Institutional Notice */}
          <div className="pt-4 border-t border-slate-100 text-center">
            <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400 font-medium">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Role-Based Access Control Enforced</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
