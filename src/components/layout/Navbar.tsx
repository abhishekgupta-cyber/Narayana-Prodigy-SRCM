import React, { useState } from 'react';
import {
  Menu,
  X,
  Users,
  ShieldCheck,
  FileSpreadsheet,
  AlertTriangle,
  FileCode2,
  Clock,
  PhoneCall,
  CheckCircle,
  BarChart3,
  SlidersHorizontal,
  ChevronRight,
  Database,
  Building2,
  LogOut,
  Layers,
  Sparkles,
  Calendar,
  Briefcase,
  FolderSync,
  History,
  FileText,
  UserCheck,
} from 'lucide-react';
import { AcademicSession, User } from '../../types/crm';
import { crmDb } from '../../services/db';

interface NavbarProps {
  currentUser: User;
  activeTab: string;
  onSelectTab: (tab: string) => void;
  activeSession: AcademicSession;
  allSessions: AcademicSession[];
  onSelectSession: (sessionId: string) => void;
  onOpenPrismaSchema: () => void;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  activeTab,
  onSelectTab,
  activeSession,
  allSessions,
  onSelectSession,
  onOpenPrismaSchema,
  onLogout,
}) => {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const isAdmin = currentUser.role === 'SUPER_ADMIN';

  const handleNavClick = (tab: string) => {
    onSelectTab(tab);
    setIsDrawerOpen(false);
  };

  return (
    <>
      {/* MINIMAL WHITE HEADER (Section 5 & 6) */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Left: Single Hamburger Menu Button & Branding */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsDrawerOpen(true)}
                className="p-2 -ml-2 rounded-lg text-slate-700 hover:text-slate-900 hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400 cursor-pointer"
                aria-label="Open Navigation Menu"
                title="Open Navigation Menu"
              >
                <Menu className="w-5 h-5 text-slate-800" />
              </button>

              <div
                className="flex items-center gap-2.5 cursor-pointer"
                onClick={() => onSelectTab(isAdmin ? 'dashboard' : 'assigned-calls')}
              >
                <div className="w-8 h-8 rounded-lg bg-amber-500 text-slate-950 font-black flex items-center justify-center text-sm shadow-2xs">
                  N
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-extrabold text-sm tracking-tight text-slate-900">
                      NARAYANA <span className="text-amber-600 font-bold">PRODIGY</span>
                    </span>
                    <span className="text-slate-300">|</span>
                    <span className="text-xs font-semibold text-slate-600 hidden sm:inline">
                      CRM
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 flex items-center gap-2">
                    <span>{isAdmin ? 'Master Operations' : 'Mentor Workstation'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Center: Global Academic Session Selector (Section 5) */}
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs">
              <Calendar className="w-3.5 h-3.5 text-amber-600" />
              <span className="text-slate-500 font-medium hidden sm:inline text-[11px]">Academic Session:</span>
              <select
                value={activeSession.id}
                onChange={(e) => onSelectSession(e.target.value)}
                className="bg-transparent font-bold text-slate-900 text-xs focus:outline-none cursor-pointer"
              >
                {allSessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Right: User Role Badge, Prisma Schema & Secure Sign Out */}
            <div className="flex items-center gap-2.5">
              {isAdmin && (
                <button
                  onClick={onOpenPrismaSchema}
                  className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 border border-slate-300 transition-colors shadow-2xs cursor-pointer"
                  title="View PostgreSQL Prisma Schema Specification"
                >
                  <FileCode2 className="w-3.5 h-3.5 text-blue-600" />
                  <span>Prisma Schema</span>
                </button>
              )}

              {/* Logged in User Tag */}
              <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
                <div className="flex flex-col text-right">
                  <span className="text-xs font-bold text-slate-900 flex items-center justify-end gap-1">
                    {currentUser.name}
                    {isAdmin ? (
                      <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1 py-0.2 rounded border border-amber-200">
                        ADMIN
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-1 py-0.2 rounded border border-blue-200">
                        MENTOR
                      </span>
                    )}
                  </span>
                  <span className="text-[10px] text-slate-500 truncate max-w-[140px]">
                    {currentUser.department || 'Academic Operations'}
                  </span>
                </div>

                {/* Secure Sign Out Button */}
                <button
                  onClick={onLogout}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:text-rose-700 bg-slate-50 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 rounded-lg transition-colors ml-1 shadow-2xs cursor-pointer"
                  title="Log out of session"
                >
                  <LogOut className="w-3.5 h-3.5 text-slate-500 hover:text-rose-600" />
                  <span className="hidden sm:inline">Logout</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* SINGLE HAMBURGER SLIDE-OUT DRAWER (Section 6) */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/30 backdrop-blur-xs transition-opacity"
            onClick={() => setIsDrawerOpen(false)}
          />

          {/* Drawer Content Panel */}
          <div className="relative flex-1 flex flex-col max-w-xs w-full bg-white shadow-2xl z-50 border-r border-slate-200 animate-slide-right">
            {/* Drawer Header */}
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-white">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500 text-slate-950 font-black flex items-center justify-center text-sm shadow-2xs">
                  N
                </div>
                <div>
                  <h2 className="text-sm font-extrabold text-slate-900">
                    Narayana Prodigy
                  </h2>
                  <p className="text-[11px] text-slate-500">Student Relation CRM</p>
                </div>
              </div>
              <button
                onClick={() => setIsDrawerOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Current User Card inside Drawer */}
            <div className="p-4 bg-slate-50 border-b border-slate-200">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Active Authenticated Session
              </div>
              <div className="text-sm font-bold text-slate-900 mt-0.5">{currentUser.name}</div>
              <div className="text-xs text-slate-600 mt-0.5 flex items-center gap-1.5">
                <span>{isAdmin ? 'Administrator' : 'Academic Mentor'}</span>
                <span>·</span>
                <span className="text-[11px] text-slate-500">{currentUser.department}</span>
              </div>
            </div>

            {/* Drawer Navigation Links */}
            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-3 py-1">
                Navigation Modules
              </div>

              {isAdmin ? (
                <>
                  {/* Module 1: Dashboard */}
                  <button
                    onClick={() => handleNavClick('dashboard')}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      activeTab === 'dashboard'
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <BarChart3 className="w-4 h-4 text-amber-500" />
                      <span>1. Dashboard</span>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 opacity-60" />
                  </button>

                  {/* Module 2: Student Directory */}
                  <button
                    onClick={() => handleNavClick('students')}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      activeTab === 'students'
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <FileSpreadsheet className="w-4 h-4 text-blue-500" />
                      <span>2. Student Directory</span>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 opacity-60" />
                  </button>

                  {/* Module 3: Upload Center */}
                  <button
                    onClick={() => handleNavClick('upload-center')}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      activeTab === 'upload-center'
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <SlidersHorizontal className="w-4 h-4 text-purple-500" />
                      <span>3. Upload Center</span>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 opacity-60" />
                  </button>

                  {/* Module 4: Campaigns & Call Assignment */}
                  <button
                    onClick={() => handleNavClick('campaigns')}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      activeTab === 'campaigns'
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Briefcase className="w-4 h-4 text-emerald-500" />
                      <span>4. Campaigns & Assignment</span>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 opacity-60" />
                  </button>

                  {/* Module 5: Cross-Batch Enrollees */}
                  <button
                    onClick={() => handleNavClick('cross-batch')}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      activeTab === 'cross-batch'
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Layers className="w-4 h-4 text-amber-500" />
                      <span>5. Cross-Batch Enrollees</span>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 opacity-60" />
                  </button>

                  {/* Module 6: External Leads */}
                  <button
                    onClick={() => handleNavClick('leads')}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      activeTab === 'leads'
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <PhoneCall className="w-4 h-4 text-indigo-500" />
                      <span>6. External Leads</span>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 opacity-60" />
                  </button>

                  {/* Module 7: Mentors & Settings */}
                  <button
                    onClick={() => handleNavClick('settings')}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      activeTab === 'settings'
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Users className="w-4 h-4 text-cyan-500" />
                      <span>7. Mentors & Settings</span>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 opacity-60" />
                  </button>

                  {/* Module 8: Reports & Call Audit */}
                  <button
                    onClick={() => handleNavClick('reports')}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      activeTab === 'reports'
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <FileText className="w-4 h-4 text-rose-500" />
                      <span>8. Reports & Call Audit</span>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 opacity-60" />
                  </button>
                </>
              ) : (
                <>
                  {/* MENTOR MODULES (Section 6) */}
                  <button
                    onClick={() => handleNavClick('assigned-calls')}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      activeTab === 'assigned-calls'
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <PhoneCall className="w-4 h-4 text-amber-500" />
                      <span>Assigned Calls</span>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 opacity-60" />
                  </button>

                  <button
                    onClick={() => handleNavClick('my-students')}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      activeTab === 'my-students'
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <UserCheck className="w-4 h-4 text-blue-500" />
                      <span>My Students</span>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 opacity-60" />
                  </button>

                  <button
                    onClick={() => handleNavClick('call-history')}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      activeTab === 'call-history'
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <History className="w-4 h-4 text-emerald-500" />
                      <span>Call History</span>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 opacity-60" />
                  </button>
                </>
              )}
            </div>

            {/* Drawer Footer */}
            <div className="p-3 bg-slate-50 border-t border-slate-200 text-center text-[10px] text-slate-500">
              Narayana Prodigy CRM · Production Mode
            </div>
          </div>
        </div>
      )}
    </>
  );
};
