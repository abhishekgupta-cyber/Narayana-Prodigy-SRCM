/**
 * Narayana Prodigy Student Relation Call Management CRM
 * Root Application Container with Rigid RBAC, Session Authority & Zero Leakage
 */

import React, { useState, useEffect } from 'react';
import { AcademicSession, User } from './types/crm';
import { crmDb } from './services/db';
import { Navbar } from './components/layout/Navbar';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { MentorWorkstation } from './components/mentor/MentorWorkstation';
import { PrismaSchemaModal } from './components/common/PrismaSchemaModal';
import { TestRunnerModal } from './components/common/TestRunnerModal';
import { LoginPage } from './components/auth/LoginPage';

export default function App() {
  // Authentication State
  const [authenticatedUser, setAuthenticatedUser] = useState<User | null>(() => {
    try {
      const saved = localStorage.getItem('narayana_crm_auth_session');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // Global Academic Session State (Section 5)
  const [activeSession, setActiveSession] = useState<AcademicSession>(() => {
    return crmDb.getActiveSession();
  });
  const [allSessions, setAllSessions] = useState<AcademicSession[]>(() => {
    return crmDb.getSessions();
  });

  // Active Navigation Tab
  const [activeTab, setActiveTab] = useState<string>(() => {
    const userRole = authenticatedUser?.role;
    return userRole === 'SUPER_ADMIN' ? 'dashboard' : 'assigned-calls';
  });

  const [showPrismaModal, setShowPrismaModal] = useState<boolean>(false);
  const [showTestRunnerModal, setShowTestRunnerModal] = useState<boolean>(false);

  // Restore authoritative server session & subscribe to real-time sync updates
  useEffect(() => {
    let active = true;

    const unsubscribe = crmDb.subscribe(() => {
      if (!active) return;
      setAllSessions([...crmDb.getSessions()]);
      setActiveSession(crmDb.getActiveSession());
      setAuthenticatedUser((prev) => {
        if (!prev) return null;
        if (!crmDb.hasServerSession()) {
          try {
            localStorage.removeItem('narayana_crm_auth_session');
          } catch {}
          return null;
        }
        const latest = crmDb.getUsers().find((u) => u.id === prev.id);
        if (latest) {
          if (latest.status === 'INACTIVE') {
            crmDb.disconnectServerSync();
            try {
              localStorage.removeItem('narayana_crm_auth_session');
            } catch {}
            return null;
          }
          if (
            latest.name !== prev.name ||
            latest.department !== prev.department ||
            latest.role !== prev.role ||
            latest.email !== prev.email ||
            latest.username !== prev.username ||
            latest.mobile_number !== prev.mobile_number
          ) {
            if (latest.role !== prev.role) {
              setActiveTab(latest.role === 'SUPER_ADMIN' ? 'dashboard' : 'assigned-calls');
            }
            const updated = {
              ...prev,
              name: latest.name,
              department: latest.department,
              role: latest.role,
              email: latest.email,
              username: latest.username,
              mobile_number: latest.mobile_number,
            };
            try {
              localStorage.setItem('narayana_crm_auth_session', JSON.stringify(updated));
            } catch {}
            return updated;
          }
        }
        return prev;
      });
    });

    if (authenticatedUser) {
      if (crmDb.hasServerSession()) {
        void crmDb.restoreServerSession().then((serverUser) => {
          if (!active) return;
          if (!serverUser) {
            try {
              localStorage.removeItem('narayana_crm_auth_session');
            } catch {}
            setAuthenticatedUser(null);
          } else {
            setAuthenticatedUser(serverUser);
            try {
              localStorage.setItem('narayana_crm_auth_session', JSON.stringify(serverUser));
            } catch {}
          }
        });
      } else {
        // Legacy local-only stored session without server token: require clean server sign-in
        try {
          localStorage.removeItem('narayana_crm_auth_session');
        } catch {}
        setAuthenticatedUser(null);
      }
    }

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  // Handle Session Change (Section 5)
  const handleSelectSession = (sessionId: string) => {
    crmDb.setActiveSession(sessionId);
    setActiveSession(crmDb.getActiveSession());
  };

  // Handle Login
  const handleLoginSuccess = (user: User) => {
    setAuthenticatedUser(user);
    setAllSessions([...crmDb.getSessions()]);
    setActiveSession(crmDb.getActiveSession());
    try {
      localStorage.setItem('narayana_crm_auth_session', JSON.stringify(user));
    } catch (e) {
      console.warn('Failed to save session:', e);
    }

    if (user.role === 'SUPER_ADMIN') {
      setActiveTab('dashboard');
    } else {
      setActiveTab('assigned-calls');
    }
  };

  // Handle Logout
  const handleLogout = () => {
    crmDb.disconnectServerSync();
    try {
      localStorage.removeItem('narayana_crm_auth_session');
    } catch (e) {
      console.warn('Failed to clear session:', e);
    }
    setAuthenticatedUser(null);
  };

  // Unauthenticated State: Section 4.1 Strict Zero-Leakage Login Gateway
  if (!authenticatedUser) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  // Authenticated State: Strict Role-Based View
  return (
    <div className="min-h-screen bg-slate-50/70 text-slate-900 flex flex-col font-sans selection:bg-amber-400 selection:text-slate-950">
      {/* Minimal White Top Navigation with Single Hamburger Drawer (Section 6) */}
      <Navbar
        currentUser={authenticatedUser}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        activeSession={activeSession}
        allSessions={allSessions}
        onSelectSession={handleSelectSession}
        onOpenPrismaSchema={() => setShowPrismaModal(true)}
        onOpenTestRunner={() => setShowTestRunnerModal(true)}
        onLogout={handleLogout}
      />

      {/* Main Dynamic Workspace with strict role boundaries */}
      <main className="flex-1 pb-16">
        {authenticatedUser.role === 'SUPER_ADMIN' ? (
          <AdminDashboard
            currentUser={authenticatedUser}
            initialTab={activeTab}
            activeSessionId={activeSession.id}
            onTrackMentor={(mentorId) => {
              setActiveTab('reports');
            }}
          />
        ) : (
          <MentorWorkstation
            currentUser={authenticatedUser}
            activeSessionId={activeSession.id}
            initialTab={
              activeTab === 'my-students'
                ? 'my-students'
                : activeTab === 'call-history'
                ? 'call-history'
                : 'assigned-calls'
            }
          />
        )}
      </main>

      {/* Minimal White Footer Audit Signature */}
      <footer className="border-t border-slate-200 bg-white py-4 px-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-800">Narayana Prodigy Academic CRM</span>
            <span className="text-slate-300">·</span>
            <span>Scale Target: 50,000+ Enrolled Students</span>
            <span className="text-slate-300">·</span>
            <span>Concurrent Staff Callers Supported</span>
          </div>
          <div className="flex items-center gap-3 text-slate-500 text-[11px]">
            <span>Active Session: <strong className="text-slate-800">{authenticatedUser.name}</strong></span>
            <span>·</span>
            <button
              onClick={handleLogout}
              className="text-rose-600 hover:underline font-semibold cursor-pointer"
            >
              Sign Out
            </button>
            {authenticatedUser.role === 'SUPER_ADMIN' && (
              <>
                <span>·</span>
                <button
                  onClick={() => setShowTestRunnerModal(true)}
                  className="text-emerald-700 hover:underline font-semibold cursor-pointer"
                >
                  Verify Tests (T1-T23)
                </button>
                <span>·</span>
                <button
                  onClick={() => setShowPrismaModal(true)}
                  className="text-amber-600 hover:underline font-semibold cursor-pointer"
                >
                  Prisma Schema
                </button>
              </>
            )}
          </div>
        </div>
      </footer>

      {/* Prisma Schema Modal */}
      {showPrismaModal && (
        <PrismaSchemaModal onClose={() => setShowPrismaModal(false)} />
      )}

      {/* Acceptance Test Runner Modal */}
      {showTestRunnerModal && (
        <TestRunnerModal onClose={() => setShowTestRunnerModal(false)} />
      )}
    </div>
  );
}
