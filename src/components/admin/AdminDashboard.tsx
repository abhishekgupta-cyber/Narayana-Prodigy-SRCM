import React, { useState, useEffect } from 'react';
import {
  Upload,
  FileSpreadsheet,
  Download,
  AlertTriangle,
  ShieldAlert,
  Users,
  CheckCircle2,
  Clock,
  Filter,
  Search,
  Check,
  RefreshCw,
  Sparkles,
  ArrowRight,
  TrendingUp,
  FileCheck,
  Flame,
  UserCheck,
  Building2,
  PhoneCall,
  Layers,
  Send,
  PlusCircle,
  Database,
  BarChart3,
  Calendar,
  ChevronRight,
  FileText,
  SlidersHorizontal,
  History,
  Trash2,
  X,
  Phone,
  Briefcase,
  AlertCircle,
  Eye,
  RotateCcw,
} from 'lucide-react';
import {
  CallAnalytics,
  Campaign,
  Student,
  User,
  ExternalLead,
  UploadBatch,
  AuditLog,
  CallLog,
} from '../../types/crm';
import { crmDb } from '../../services/db';
import {
  exportFilteredDataToExcel,
  exportCampaignReportToExcel,
  exportAdmissionConversionReportToExcel,
  exportAdmissionReportToExcel,
  exportMentorTrackingToExcel,
  exportBatchAuditToExcel,
  exportCrossBatchEnrolleesToExcel,
  generateSampleTemplate,
  parseAttendance,
  parseExamResults,
  parseMasterAdmissions,
  parseExternalLeads,
} from '../../services/excelIngestion';
import { UserManagementView } from './UserManagementView';
import { formatISTDateTime, getTodayCalendarDate, istDay } from '../../services/antiCheat';

interface AdminDashboardProps {
  currentUser: User;
  initialTab?: string;
  onTrackMentor?: (mentorId: string) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  currentUser,
  initialTab = 'dashboard',
  onTrackMentor,
}) => {
  const [activeTab, setActiveTab] = useState<string>(initialTab);

  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);

  const [analytics, setAnalytics] = useState<CallAnalytics | null>(null);

  // 1. Directory State
  const [students, setStudents] = useState<Student[]>([]);
  const [directorySearch, setDirectorySearch] = useState('');
  const [directoryBatch, setDirectoryBatch] = useState('ALL');
  const [directoryCourse, setDirectoryCourse] = useState('ALL');
  const [directoryPage, setDirectoryPage] = useState(1);
  const [directoryLimit, setDirectoryLimit] = useState(50);
  const [directoryTotal, setDirectoryTotal] = useState(0);
  const [selectedStudentForDetail, setSelectedStudentForDetail] = useState<Student | null>(null);

  // 2. Campaigns & Section 10.3 Universal Bulk Selector
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
  const [isCreateCampaignOpen, setIsCreateCampaignOpen] = useState(false);
  const [newCampaignTitle, setNewCampaignTitle] = useState('');
  const [newCampaignPurpose, setNewCampaignPurpose] = useState('PTM');
  const [newCampaignAssignedDate, setNewCampaignAssignedDate] = useState(getTodayCalendarDate());
  const [newCampaignDueDate, setNewCampaignDueDate] = useState('');
  const [newCampaignOutcomes, setNewCampaignOutcomes] = useState('Will Attend, Cannot Attend, Maybe');
  const [targetMentorIds, setTargetMentorIds] = useState<string[]>([]);

  // Section 10.3 Bulk Selector State
  const [bulkMode, setBulkMode] = useState<'PRESET' | 'RANGE' | 'EXACT_COUNT'>('PRESET');
  const [bulkPreset, setBulkPreset] = useState<number | 'ALL'>(50);
  const [bulkRangeStr, setBulkRangeStr] = useState('1-50');
  const [bulkExactCount, setBulkExactCount] = useState<number>(25);
  const [bulkOnlyUnassigned, setBulkOnlyUnassigned] = useState(false);
  const [bulkSelectedMentors, setBulkSelectedMentors] = useState<string[]>([]);
  const [bulkSnapshotToken, setBulkSnapshotToken] = useState<string | null>(null);
  const [bulkPreviewData, setBulkPreviewData] = useState<{
    totalSelected: number;
    sampleRows: Student[];
    skippedAlreadyActive: number;
  } | null>(null);
  const [bulkSuccessMsg, setBulkSuccessMsg] = useState('');

  // 3. Cross-Batch State (Section 8: 3 tabs)
  const [crossBatchTab, setCrossBatchTab] = useState<'CROSS_BATCH' | 'SINGLE_COURSE' | 'NEEDS_REVIEW'>('CROSS_BATCH');
  const [crossBatchSearch, setCrossBatchSearch] = useState('');

  // 4. External Leads State (Section 7.5)
  const [leads, setLeads] = useState<ExternalLead[]>([]);
  const [leadsTotal, setLeadsTotal] = useState(0);
  const [leadsSearch, setLeadsSearch] = useState('');
  const [leadsPage, setLeadsPage] = useState(1);
  const [leadsLimit, setLeadsLimit] = useState(50);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [leadTargetMentor, setLeadTargetMentor] = useState('');

  // 5. Upload Center State (Section 7.1 - 7.6)
  const [uploadBatches, setUploadBatches] = useState<UploadBatch[]>([]);
  const [uploadPreviewModal, setUploadPreviewModal] = useState<{
    title: string;
    totalRows: number;
    sampleRows: any[];
    errorCount: number;
    errors: string[];
    onConfirm: () => void;
  } | null>(null);

  // 6. Reports & Call Audit State (Section 11)
  const [reportSubTab, setReportSubTab] = useState<'ADMISSION' | 'CALLING' | 'MENTOR_TRACKING' | 'BATCH_AUDIT' | 'CAMPAIGN_REPORT'>('ADMISSION');
  const [reportFromDate, setReportFromDate] = useState('');
  const [reportToDate, setReportToDate] = useState('');
  const [reportMentorId, setReportMentorId] = useState('ALL');
  const [reportCampaignId, setReportCampaignId] = useState('ALL');
  const [reportBatchName, setReportBatchName] = useState('ALL');
  const [reportDisposition, setReportDisposition] = useState('ALL');

  // Tracking specific mentor deep-dive state
  const [selectedMentorForDeepDive, setSelectedMentorForDeepDive] = useState<string>('');

  // Settings State (Section 12)
  const [settings, setSettings] = useState(crmDb.getSettings());
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  const refreshAll = () => {
    setAnalytics(crmDb.getAnalytics());
    setCampaigns(crmDb.getCampaigns());
    setUploadBatches(crmDb.getUploadBatches());
    setAuditLogs(crmDb.getAuditLogs(50));
    setSettings(crmDb.getSettings());

    // Directory
    const dirRes = crmDb.getStudents({
      page: directoryPage,
      limit: directoryLimit,
      search: directorySearch,
      batch: directoryBatch,
      course: directoryCourse,
      userRole: 'SUPER_ADMIN',
    });
    setStudents(dirRes.students);
    setDirectoryTotal(dirRes.total);

    // Leads
    const leadsRes = crmDb.getExternalLeads({
      page: leadsPage,
      limit: leadsLimit,
      search: leadsSearch,
    });
    setLeads(leadsRes.leads);
    setLeadsTotal(leadsRes.total);
  };

  useEffect(() => {
    refreshAll();
  }, [
    activeTab,
    directoryPage,
    directoryLimit,
    directorySearch,
    directoryBatch,
    directoryCourse,
    leadsPage,
    leadsLimit,
    leadsSearch,
  ]);

  // Section 10.3 Bulk Preview
  const handleRunBulkPreview = () => {
    try {
      const res = crmDb.previewBulkSelection({
        batch: directoryBatch,
        course: directoryCourse,
        search: directorySearch,
        onlyUnassigned: bulkOnlyUnassigned,
        selectionMode: bulkMode,
        presetCount: bulkPreset,
        rangeString: bulkRangeStr,
        exactCount: bulkExactCount,
        campaignId: selectedCampaignId || undefined,
      });

      setBulkSnapshotToken(res.snapshotToken);
      setBulkPreviewData({
        totalSelected: res.totalSelected,
        sampleRows: res.sampleRows,
        skippedAlreadyActive: res.skippedAlreadyActive,
      });
    } catch (err: any) {
      alert(err.message || 'Invalid selection syntax.');
    }
  };

  // Section 10.3 Bulk Confirm
  const handleConfirmBulkAssignment = () => {
    if (!bulkSnapshotToken) {
      alert('Please click "Preview Selection" first.');
      return;
    }
    if (!selectedCampaignId) {
      alert('Please select a target Campaign for this assignment.');
      return;
    }
    if (bulkSelectedMentors.length === 0) {
      alert('Please select at least one mentor to receive assignments.');
      return;
    }

    try {
      const res = crmDb.confirmBulkAssignment({
        snapshotToken: bulkSnapshotToken,
        campaignId: selectedCampaignId,
        targetMentorIds: bulkSelectedMentors,
        assignedDate: getTodayCalendarDate(),
        adminUser: currentUser,
      });

      setBulkSuccessMsg(`Successfully assigned ${res.assignedCount} students across ${bulkSelectedMentors.length} mentors!`);
      setBulkSnapshotToken(null);
      setBulkPreviewData(null);
      setTimeout(() => setBulkSuccessMsg(''), 5000);
      refreshAll();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Create Campaign
  const handleCreateCampaign = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCampaignTitle.trim()) {
      alert('Campaign title is required.');
      return;
    }
    const outcomesList = newCampaignOutcomes
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);

    crmDb.createCampaign({
      title: newCampaignTitle.trim(),
      purpose: newCampaignPurpose,
      assignment_date: newCampaignAssignedDate,
      due_date: newCampaignDueDate || undefined,
      outcome_options: outcomesList,
      target_mentor_ids: targetMentorIds,
    });

    setIsCreateCampaignOpen(false);
    setNewCampaignTitle('');
    refreshAll();
  };

  // Rollback Upload Batch (Section 7.6)
  const handleRollbackBatch = (batchId: string) => {
    if (window.confirm('Roll back this upload batch? Inserted records without active call logs will be reversed.')) {
      try {
        const res = crmDb.rollbackUploadBatch(batchId, currentUser);
        alert(`Rollback complete. Reversed ${res.rolledBackCount} rows. Retained ${res.retainedCount} rows with call history.`);
        refreshAll();
      } catch (err: any) {
        alert(err.message);
      }
    }
  };

  const mentorsList = crmDb.getMentors();
  const allBatches = Array.from(new Set(students.map((s) => s.batch_name).filter(Boolean)));
  const allCourses = Array.from(new Set(students.map((s) => s.course_name).filter(Boolean)));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* ========================================================================= */}
      {/* 1. EXECUTIVE DASHBOARD (Section 6: Dense KPI Strip + Mentor Table)         */}
      {/* ========================================================================= */}
      {activeTab === 'dashboard' && analytics && (
        <div className="space-y-6">
          {/* Real-Data KPI Strip (No charts!) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                Total Admissions
              </span>
              <div className="text-xl font-black text-slate-900 mt-1 font-mono">
                {analytics.totalStudents}
              </div>
              <span className="text-[10px] text-slate-400">Course seats</span>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                Unique Students
              </span>
              <div className="text-xl font-black text-blue-700 mt-1 font-mono">
                {analytics.uniqueIndividualsCount}
              </div>
              <span className="text-[10px] text-blue-600 font-medium">Distinct profiles</span>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                Cross-Batch (2+)
              </span>
              <div className="text-xl font-black text-amber-700 mt-1 font-mono">
                {analytics.crossBatchCount}
              </div>
              <span className="text-[10px] text-amber-600 font-medium">Multi-enrollees</span>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                Calls Today
              </span>
              <div className="text-xl font-black text-emerald-700 mt-1 font-mono">
                {analytics.callsLoggedToday}
              </div>
              <span className="text-[10px] text-emerald-600 font-medium">IST calendar day</span>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                Due Callbacks
              </span>
              <div className="text-xl font-black text-rose-700 mt-1 font-mono">
                {analytics.dueFollowupsCount}
              </div>
              <span className="text-[10px] text-rose-600 font-medium">Reminders today</span>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                Active Staff
              </span>
              <div className="text-xl font-black text-slate-900 mt-1 font-mono">
                {analytics.activeMentorsCount}
              </div>
              <span className="text-[10px] text-slate-400">Calling mentors</span>
            </div>
          </div>

          {/* Operational Notices (Section 6) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="text-xs font-bold text-amber-950 block">Stealth Anti-Cheat Audit</span>
                <p className="text-[11px] text-amber-800 mt-0.5">
                  {analytics.suspiciousCallsCount} calls recorded with &lt;15s latency flagged for admin review.
                </p>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5 flex items-start gap-3">
              <Layers className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <span className="text-xs font-bold text-blue-950 block">Cross-Batch Enrollments</span>
                <p className="text-[11px] text-blue-800 mt-0.5">
                  {analytics.crossBatchCount} valid multi-course seats mapped without duplicate key conflict.
                </p>
              </div>
            </div>

            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <span className="text-xs font-bold text-emerald-950 block">Active Academic Session</span>
                <p className="text-[11px] text-emerald-800 mt-0.5">
                  Filtering strictly for <strong>{crmDb.getActiveSession().name}</strong>. Historical sessions preserved.
                </p>
              </div>
            </div>
          </div>

          {/* Mentor Performance Spreadsheet Table (Section 6: Click row opens Mentor Tracking) */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Mentor Performance & Call Allocation Matrix
                </h3>
                <p className="text-xs text-slate-500">
                  Click any mentor row to open their 1-to-1 call tracking report and complete remark timeline.
                </p>
              </div>
              <span className="text-xs font-mono font-bold text-slate-600">
                {analytics.mentorPerformance.length} Calling Mentors
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-4">Mentor Name</th>
                    <th className="py-3 px-4">Designation</th>
                    <th className="py-3 px-4 text-center">Total Assigned</th>
                    <th className="py-3 px-4 text-center">New Calls</th>
                    <th className="py-3 px-4 text-center">Completed</th>
                    <th className="py-3 px-4 text-center">Pending / Overdue</th>
                    <th className="py-3 px-4 text-center">Reminders Due</th>
                    <th className="py-3 px-4 text-center">Monthly Overdue</th>
                    <th className="py-3 px-4 text-right">Deep Dive</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {analytics.mentorPerformance.map((m) => (
                    <tr
                      key={m.mentorId}
                      onClick={() => {
                        setSelectedMentorForDeepDive(m.mentorId);
                        setActiveTab('reports');
                        setReportSubTab('MENTOR_TRACKING');
                      }}
                      className="hover:bg-amber-50/50 cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-4 font-bold text-slate-900 flex items-center gap-2">
                        <span>{m.mentorName}</span>
                      </td>
                      <td className="py-3 px-4 text-slate-600">{m.designation}</td>
                      <td className="py-3 px-4 text-center font-mono font-bold text-slate-800">
                        {m.totalAssigned}
                      </td>
                      <td className="py-3 px-4 text-center font-mono text-blue-700 font-semibold">
                        {m.newCalls}
                      </td>
                      <td className="py-3 px-4 text-center font-mono text-emerald-700 font-semibold">
                        {m.completedCalls}
                      </td>
                      <td className="py-3 px-4 text-center font-mono text-amber-700 font-semibold">
                        {m.pendingOverdue}
                      </td>
                      <td className="py-3 px-4 text-center font-mono text-rose-700 font-semibold">
                        {m.remindersDue}
                      </td>
                      <td className="py-3 px-4 text-center font-mono text-purple-700 font-semibold">
                        {m.monthlyOverdue}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="text-[11px] font-bold text-amber-700 hover:underline flex items-center justify-end gap-1">
                          <span>Track</span>
                          <ChevronRight className="w-3 h-3" />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. STUDENT DIRECTORY (Section 6 & 8)                                      */}
      {/* ========================================================================= */}
      {activeTab === 'students' && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Master Admission Directory ({directoryTotal} Students)
              </h2>
              <p className="text-xs text-slate-500">
                Server-paginated Google-Sheet-like table. Click any student row to view full profile & call history.
              </p>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search name, mobile, admission #..."
                  value={directorySearch}
                  onChange={(e) => {
                    setDirectorySearch(e.target.value);
                    setDirectoryPage(1);
                  }}
                  className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500 bg-white"
                />
              </div>

              <select
                value={directoryBatch}
                onChange={(e) => {
                  setDirectoryBatch(e.target.value);
                  setDirectoryPage(1);
                }}
                className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white cursor-pointer font-bold"
              >
                <option value="ALL">All Batches</option>
                {allBatches.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>

              <select
                value={directoryLimit}
                onChange={(e) => {
                  setDirectoryLimit(Number(e.target.value));
                  setDirectoryPage(1);
                }}
                className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white cursor-pointer font-bold"
              >
                <option value={25}>25 rows</option>
                <option value={50}>50 rows</option>
                <option value={100}>100 rows</option>
                <option value={200}>200 rows</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4">Adm #</th>
                  <th className="py-3 px-4">Student & Father</th>
                  <th className="py-3 px-4">Direct Mobile</th>
                  <th className="py-3 px-4">Batch & Course</th>
                  <th className="py-3 px-4">Assigned Mentor</th>
                  <th className="py-3 px-4">Cross-Batch?</th>
                  <th className="py-3 px-4">Last Connected</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {students.map((st) => (
                  <tr
                    key={st.admission_no}
                    onClick={() => setSelectedStudentForDetail(st)}
                    className="hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">
                      #{st.admission_no}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900">{st.user_name}</div>
                      <div className="text-[11px] text-slate-500">Father: {st.father_name}</div>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-700">
                      {st.student_mobile}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-800">{st.batch_name}</div>
                      <div className="text-[11px] text-slate-500">{st.course_name}</div>
                    </td>
                    <td className="py-3 px-4 text-slate-800 font-medium">
                      {st.mentor_name || <span className="text-amber-700 italic">Unassigned</span>}
                    </td>
                    <td className="py-3 px-4">
                      {st.is_cross_batch_enrolled ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                          Multi-Course
                        </span>
                      ) : (
                        <span className="text-slate-400">Single</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-600 font-mono">
                      {st.last_connected_at ? formatISTDateTime(st.last_connected_at) : 'Never'}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className="text-[11px] font-bold text-blue-600 hover:underline">
                        View Profile →
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Directory Pagination Bar */}
          <div className="p-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-600">
            <span>
              Showing {(directoryPage - 1) * directoryLimit + 1} to{' '}
              {Math.min(directoryPage * directoryLimit, directoryTotal)} of {directoryTotal} students
            </span>
            <div className="flex items-center gap-1.5">
              <button
                disabled={directoryPage <= 1}
                onClick={() => setDirectoryPage((p) => p - 1)}
                className="px-2.5 py-1 bg-white border border-slate-300 rounded font-bold disabled:opacity-50 cursor-pointer"
              >
                Previous
              </button>
              <span className="font-bold px-2">Page {directoryPage}</span>
              <button
                disabled={directoryPage * directoryLimit >= directoryTotal}
                onClick={() => setDirectoryPage((p) => p + 1)}
                className="px-2.5 py-1 bg-white border border-slate-300 rounded font-bold disabled:opacity-50 cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. UPLOAD CENTER (Section 7.1 - 7.6)                                      */}
      {/* ========================================================================= */}
      {activeTab === 'upload-center' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
            <h2 className="text-base font-bold text-slate-900">
              Excel / CSV Batch Upload Center (Section 7)
            </h2>
            <p className="text-xs text-slate-500">
              Upload templates with automatic header mapping, dry-run preview, and 1-click rollback history.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Card 1: Master Admissions */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase text-slate-500">Sheet 1</span>
                <FileSpreadsheet className="w-4 h-4 text-blue-600" />
              </div>
              <h3 className="font-bold text-slate-900 text-sm">Master Admissions</h3>
              <p className="text-[11px] text-slate-500">
                22 standard attributes with cross-batch identity linking by person_key.
              </p>
              <button
                onClick={() => generateSampleTemplate('ADMISSIONS')}
                className="w-full py-1.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Sample Excel</span>
              </button>
            </div>

            {/* Card 2: Exam Results */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase text-slate-500">Sheet 2</span>
                <Sparkles className="w-4 h-4 text-emerald-600" />
              </div>
              <h3 className="font-bold text-slate-900 text-sm">Exam Results</h3>
              <p className="text-[11px] text-slate-500">
                Dynamic subject marks, ranks, and percentages linked by Admission No.
              </p>
              <button
                onClick={() => generateSampleTemplate('EXAMS')}
                className="w-full py-1.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Sample Excel</span>
              </button>
            </div>

            {/* Card 3: Attendance */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase text-slate-500">Sheet 3</span>
                <Calendar className="w-4 h-4 text-purple-600" />
              </div>
              <h3 className="font-bold text-slate-900 text-sm">Attendance Matrix</h3>
              <p className="text-[11px] text-slate-500">
                Matrix, Combined-Header, or Flat sheets with P/A/L status (blank = not recorded).
              </p>
              <button
                onClick={() => generateSampleTemplate('ATTENDANCE')}
                className="w-full py-1.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Sample Excel</span>
              </button>
            </div>

            {/* Card 4: External Leads */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase text-slate-500">Sheet 4</span>
                <PhoneCall className="w-4 h-4 text-amber-600" />
              </div>
              <h3 className="font-bold text-slate-900 text-sm">External Leads</h3>
              <p className="text-[11px] text-slate-500">
                Permissive marketing lists. Unenrolled leads never mixed into student directory.
              </p>
              <button
                onClick={() => generateSampleTemplate('ADMISSIONS')}
                className="w-full py-1.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Sample Excel</span>
              </button>
            </div>
          </div>

          {/* Upload Batches History & 1-Click Rollback (Section 7.6) */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50/50">
              <h3 className="text-sm font-bold text-slate-900">
                Upload Batch History & Rollback Console
              </h3>
              <p className="text-xs text-slate-500">
                Audited ingestion batches. Rollback cleanly reverses inserts while preserving call history.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-4">Batch ID</th>
                    <th className="py-3 px-4">Uploaded At (IST)</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">File Name</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Total Rows</th>
                    <th className="py-3 px-4 text-right">Rollback</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {uploadBatches.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400">
                        No previous batches recorded in this session.
                      </td>
                    </tr>
                  ) : (
                    uploadBatches.map((b) => (
                      <tr key={b.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-mono font-bold text-slate-900">#{b.id}</td>
                        <td className="py-3 px-4 font-mono text-slate-600">{formatISTDateTime(b.uploaded_at)}</td>
                        <td className="py-3 px-4 font-semibold">{b.type}</td>
                        <td className="py-3 px-4">{b.file_name}</td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            b.status === 'SUCCESS' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {b.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono font-bold">{b.total_rows}</td>
                        <td className="py-3 px-4 text-right">
                          {b.status !== 'ROLLED_BACK' && (
                            <button
                              onClick={() => handleRollbackBatch(b.id)}
                              className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded font-bold text-[11px] cursor-pointer"
                            >
                              Rollback
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. CAMPAIGNS & SECTION 10.3 UNIVERSAL BULK SELECTOR                       */}
      {/* ========================================================================= */}
      {activeTab === 'campaigns' && (
        <div className="space-y-6">
          {bulkSuccessMsg && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>{bulkSuccessMsg}</span>
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Campaign Allocation & Universal Bulk Selector (Section 10)
              </h2>
              <p className="text-xs text-slate-500">
                Organize target calling drives (PTM, IOQM, Marks). Select exact index ranges (e.g. "1-50", "60-90") or exact counts.
              </p>
            </div>

            <button
              onClick={() => setIsCreateCampaignOpen(true)}
              className="px-4 py-2 bg-slate-950 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer"
            >
              <PlusCircle className="w-4 h-4 text-amber-400" />
              <span>Create New Campaign</span>
            </button>
          </div>

          {/* Section 10.3 Bulk Selector Console */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-4">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Universal Range & Exact Count Allocation Engine (Section 10.3)
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
              {/* Campaign Pick */}
              <div>
                <label className="block text-slate-700 font-bold mb-1">Target Campaign</label>
                <select
                  value={selectedCampaignId}
                  onChange={(e) => setSelectedCampaignId(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-lg bg-white font-semibold cursor-pointer"
                >
                  <option value="">-- Choose Campaign --</option>
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title} ({c.purpose})
                    </option>
                  ))}
                </select>
              </div>

              {/* Selection Mode */}
              <div>
                <label className="block text-slate-700 font-bold mb-1">Selection Syntax</label>
                <select
                  value={bulkMode}
                  onChange={(e) => setBulkMode(e.target.value as any)}
                  className="w-full p-2 border border-slate-300 rounded-lg bg-white font-semibold cursor-pointer"
                >
                  <option value="PRESET">Preset Quantities (10, 25, 50, 100, All)</option>
                  <option value="RANGE">Index Range String (e.g. "1-50", "60-90")</option>
                  <option value="EXACT_COUNT">Exact Count N (N &gt;= 1)</option>
                </select>
              </div>

              {/* Syntax Input */}
              <div>
                {bulkMode === 'PRESET' && (
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Preset Amount</label>
                    <select
                      value={bulkPreset}
                      onChange={(e) => setBulkPreset(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))}
                      className="w-full p-2 border border-slate-300 rounded-lg bg-white font-semibold cursor-pointer"
                    >
                      <option value={10}>Top 10 Records</option>
                      <option value={25}>Top 25 Records</option>
                      <option value={50}>Top 50 Records</option>
                      <option value={100}>Top 100 Records</option>
                      <option value={250}>Top 250 Records</option>
                      <option value={500}>Top 500 Records</option>
                      <option value="ALL">Select All Matching</option>
                    </select>
                  </div>
                )}

                {bulkMode === 'RANGE' && (
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Index Range (Global #)</label>
                    <input
                      type="text"
                      placeholder="e.g. 1-50 or 60-90 or 1-10, 15, 20-25"
                      value={bulkRangeStr}
                      onChange={(e) => setBulkRangeStr(e.target.value)}
                      className="w-full p-2 border border-slate-300 rounded-lg font-mono font-semibold"
                    />
                  </div>
                )}

                {bulkMode === 'EXACT_COUNT' && (
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Assign Exactly N Calls</label>
                    <input
                      type="number"
                      min="1"
                      value={bulkExactCount}
                      onChange={(e) => setBulkExactCount(Math.max(1, Number(e.target.value)))}
                      className="w-full p-2 border border-slate-300 rounded-lg font-mono font-bold"
                    />
                  </div>
                )}
              </div>

              {/* Unassigned Only */}
              <div className="flex flex-col justify-end">
                <label className="flex items-center gap-2 cursor-pointer pb-2">
                  <input
                    type="checkbox"
                    checked={bulkOnlyUnassigned}
                    onChange={(e) => setBulkOnlyUnassigned(e.target.checked)}
                    className="rounded text-amber-600 focus:ring-amber-500"
                  />
                  <span className="font-semibold text-slate-800">Only unassigned students</span>
                </label>
                <button
                  type="button"
                  onClick={handleRunBulkPreview}
                  className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg cursor-pointer"
                >
                  Preview Selection Snapshot
                </button>
              </div>
            </div>

            {/* Target Mentors Multi-Selection (Section 10.3: Split equally) */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-2">
                Distribute To Calling Mentors (Equal Contiguous Split)
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2 max-h-40 overflow-y-auto p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                {mentorsList.map((m) => {
                  const isChecked = bulkSelectedMentors.includes(m.id);
                  return (
                    <label
                      key={m.id}
                      className={`flex items-center gap-1.5 p-1.5 rounded cursor-pointer border ${
                        isChecked ? 'bg-amber-100 border-amber-300 text-slate-950 font-bold' : 'bg-white border-slate-200 text-slate-700'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          if (isChecked) {
                            setBulkSelectedMentors(bulkSelectedMentors.filter((id) => id !== m.id));
                          } else {
                            setBulkSelectedMentors([...bulkSelectedMentors, m.id]);
                          }
                        }}
                        className="rounded text-amber-600"
                      />
                      <span className="truncate">{m.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Snapshot Preview Box */}
            {bulkPreviewData && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3 animate-fade-in text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-amber-950">
                    Snapshot Ready: {bulkPreviewData.totalSelected} Records Selected
                  </span>
                  {bulkPreviewData.skippedAlreadyActive > 0 && (
                    <span className="text-[11px] font-semibold text-amber-800">
                      ({bulkPreviewData.skippedAlreadyActive} skipped because already active in campaign)
                    </span>
                  )}
                </div>

                <div className="text-[11px] text-slate-700">
                  Sample rows from snapshot:{' '}
                  {bulkPreviewData.sampleRows.map((s) => `${s.user_name} (#${s.admission_no})`).join(', ')}
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    onClick={() => {
                      setBulkSnapshotToken(null);
                      setBulkPreviewData(null);
                    }}
                    className="px-3 py-1.5 border border-slate-300 rounded font-bold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmBulkAssignment}
                    className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg cursor-pointer"
                  >
                    Confirm & Allocate {bulkPreviewData.totalSelected} Calls
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Existing Campaigns Table */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50/50">
              <h3 className="text-sm font-bold text-slate-900">
                Active & Archived Campaigns
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-4">Campaign Title</th>
                    <th className="py-3 px-4">Purpose</th>
                    <th className="py-3 px-4">Assigned Date</th>
                    <th className="py-3 px-4">Due Date</th>
                    <th className="py-3 px-4">Outcome Options</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {campaigns.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-bold text-slate-900">{c.title}</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-800 border border-slate-200">
                          {c.purpose}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600">{c.assignment_date}</td>
                      <td className="py-3 px-4 font-mono text-slate-600">{c.due_date || 'No Deadline'}</td>
                      <td className="py-3 px-4 text-slate-600 truncate max-w-[200px]" title={c.outcome_options?.join(', ')}>
                        {c.outcome_options?.join(', ')}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          c.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-800'
                        }`}>
                          {c.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => {
                            if (window.confirm(`Delete campaign "${c.title}"? Call history is preserved.`)) {
                              crmDb.deleteCampaign(c.id, currentUser);
                              refreshAll();
                            }
                          }}
                          className="text-rose-600 hover:text-rose-800 font-bold cursor-pointer"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. CROSS-BATCH ENROLLEES (Section 8: 3 Tabs & Excel Export)              */}
      {/* ========================================================================= */}
      {activeTab === 'cross-batch' && analytics && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Cross-Batch Multi-Enrollment Center (Section 8 & D2)
              </h2>
              <p className="text-xs text-slate-500">
                Students enrolled across multiple academic batches are valid registrations, never duplicate errors.
              </p>
            </div>

            <button
              onClick={() => {
                const cross = students.filter((s) => s.is_cross_batch_enrolled);
                const single = students.filter((s) => !s.is_cross_batch_enrolled);
                exportCrossBatchEnrolleesToExcel(cross, single, crmDb.getActiveSession().name);
              }}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Download className="w-4 h-4" />
              <span>Download Cross-Batch Excel (3 Sheets)</span>
            </button>
          </div>

          {/* 3 Tabs Header (Section 8) */}
          <div className="flex items-center gap-2 border-b border-slate-200 pb-2 text-xs">
            <button
              onClick={() => setCrossBatchTab('CROSS_BATCH')}
              className={`px-4 py-2 font-bold rounded-lg transition-all cursor-pointer ${
                crossBatchTab === 'CROSS_BATCH'
                  ? 'bg-amber-500 text-slate-950 shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Cross-Batch Students (2+ Courses) ({analytics.crossBatchCount})
            </button>
            <button
              onClick={() => setCrossBatchTab('SINGLE_COURSE')}
              className={`px-4 py-2 font-bold rounded-lg transition-all cursor-pointer ${
                crossBatchTab === 'SINGLE_COURSE'
                  ? 'bg-amber-500 text-slate-950 shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Single-Course Students ({analytics.singleCourseCount})
            </button>
            <button
              onClick={() => setCrossBatchTab('NEEDS_REVIEW')}
              className={`px-4 py-2 font-bold rounded-lg transition-all cursor-pointer ${
                crossBatchTab === 'NEEDS_REVIEW'
                  ? 'bg-amber-500 text-slate-950 shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Needs Review (Possible Matches)
            </button>
          </div>

          {/* Tab 1: Cross-Batch Multi-Enrolled Students Grid */}
          {crossBatchTab === 'CROSS_BATCH' && (
            <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[11px]">
                      <th className="py-3 px-4">Student Full Name</th>
                      <th className="py-3 px-4">Father Name</th>
                      <th className="py-3 px-4">Direct Mobile</th>
                      <th className="py-3 px-4">Enrolled Course Seats</th>
                      <th className="py-3 px-4">Multi-Batch Summary</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {students.filter((s) => s.is_cross_batch_enrolled).map((s) => (
                      <tr key={s.admission_no} className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-bold text-slate-900">{s.user_name}</td>
                        <td className="py-3 px-4 text-slate-600">{s.father_name}</td>
                        <td className="py-3 px-4 font-mono text-slate-800">{s.student_mobile}</td>
                        <td className="py-3 px-4 font-mono font-bold text-amber-700">
                          Adm #{s.admission_no} ({s.course_name})
                        </td>
                        <td className="py-3 px-4 text-slate-700 font-medium">
                          {s.enrolled_batches_summary || `${s.batch_name} (#${s.admission_no})`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tab 2: Single-Course Students */}
          {crossBatchTab === 'SINGLE_COURSE' && (
            <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[11px]">
                      <th className="py-3 px-4">Adm #</th>
                      <th className="py-3 px-4">Student Name</th>
                      <th className="py-3 px-4">Father Name</th>
                      <th className="py-3 px-4">Mobile</th>
                      <th className="py-3 px-4">Course & Batch</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {students.filter((s) => !s.is_cross_batch_enrolled).slice(0, 50).map((s) => (
                      <tr key={s.admission_no} className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-mono font-bold text-slate-800">#{s.admission_no}</td>
                        <td className="py-3 px-4 font-bold text-slate-900">{s.user_name}</td>
                        <td className="py-3 px-4 text-slate-600">{s.father_name}</td>
                        <td className="py-3 px-4 font-mono">{s.student_mobile}</td>
                        <td className="py-3 px-4">{s.course_name} ({s.batch_name})</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tab 3: Needs Review */}
          {crossBatchTab === 'NEEDS_REVIEW' && (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center shadow-2xs">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
              <h3 className="font-bold text-slate-900 text-sm">No Unresolved Admission Clashes</h3>
              <p className="text-xs text-slate-500 mt-1">
                All uploaded student records match standard 22-attribute profiles cleanly.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 6. EXTERNAL LEADS (Section 7.5)                                           */}
      {/* ========================================================================= */}
      {activeTab === 'leads' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                External Promotional Leads & Bulk Assignment (Section 7.5)
              </h2>
              <p className="text-xs text-slate-500">
                Permissive marketing inquiries. Isolated from Student Directory.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={leadTargetMentor}
                onChange={(e) => setLeadTargetMentor(e.target.value)}
                className="p-1.5 border border-slate-300 rounded text-xs bg-white font-semibold"
              >
                <option value="">Assign to Mentor...</option>
                {mentorsList.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>

              <button
                disabled={selectedLeadIds.length === 0 || !leadTargetMentor}
                onClick={() => {
                  crmDb.assignExternalLeads(selectedLeadIds, leadTargetMentor);
                  alert(`Assigned ${selectedLeadIds.length} leads successfully.`);
                  setSelectedLeadIds([]);
                  refreshAll();
                }}
                className="px-3 py-1.5 bg-slate-950 hover:bg-slate-800 disabled:bg-slate-400 text-white rounded text-xs font-bold cursor-pointer"
              >
                Assign Selected ({selectedLeadIds.length})
              </button>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-4 w-10">
                      <input
                        type="checkbox"
                        checked={selectedLeadIds.length > 0 && selectedLeadIds.length === leads.length}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedLeadIds(leads.map((l) => l.id));
                          else setSelectedLeadIds([]);
                        }}
                      />
                    </th>
                    <th className="py-3 px-4">Lead Name</th>
                    <th className="py-3 px-4">Contact Phone</th>
                    <th className="py-3 px-4">City / School</th>
                    <th className="py-3 px-4">Source Campaign</th>
                    <th className="py-3 px-4">Assigned To</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {leads.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400">
                        No external leads in database. Use Upload Center to ingest promotional lists.
                      </td>
                    </tr>
                  ) : (
                    leads.map((l) => (
                      <tr key={l.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4">
                          <input
                            type="checkbox"
                            checked={selectedLeadIds.includes(l.id)}
                            onChange={() => {
                              if (selectedLeadIds.includes(l.id)) {
                                setSelectedLeadIds(selectedLeadIds.filter((id) => id !== l.id));
                              } else {
                                setSelectedLeadIds([...selectedLeadIds, l.id]);
                              }
                            }}
                          />
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-900">{l.name}</td>
                        <td className="py-3 px-4 font-mono text-slate-800">{l.mobile}</td>
                        <td className="py-3 px-4">{l.city || l.school || '—'}</td>
                        <td className="py-3 px-4">{l.source_list}</td>
                        <td className="py-3 px-4 font-semibold text-slate-700">
                          {mentorsList.find((m) => m.id === l.assigned_to)?.name || 'Unassigned'}
                        </td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-800">
                            {l.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 7. MENTORS & SETTINGS (Section 4.2 & 12)                                   */}
      {/* ========================================================================= */}
      {activeTab === 'settings' && (
        <div className="space-y-6">
          <UserManagementView
            currentUser={currentUser}
            onTrackMentor={(mId) => {
              setSelectedMentorForDeepDive(mId);
              setActiveTab('reports');
              setReportSubTab('MENTOR_TRACKING');
            }}
            onRefreshAll={refreshAll}
          />

          {/* Operational Settings */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900">
              System Thresholds & Compliance Settings (Section 12)
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Pending Task Age Window (Days)
                </label>
                <input
                  type="number"
                  min="1"
                  value={settings.pending_after_days}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setSettings({ ...settings, pending_after_days: val });
                    crmDb.updateSettings({ pending_after_days: val }, currentUser);
                  }}
                  className="w-full p-2 border border-slate-300 rounded-lg font-mono font-bold"
                />
                <span className="text-[11px] text-slate-500">Unattempted calls older than N days become Overdue</span>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Stealth Anti-Cheat Latency Threshold (Seconds)
                </label>
                <input
                  type="number"
                  min="5"
                  value={settings.suspicious_seconds}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setSettings({ ...settings, suspicious_seconds: val });
                    crmDb.updateSettings({ suspicious_seconds: val }, currentUser);
                  }}
                  className="w-full p-2 border border-slate-300 rounded-lg font-mono font-bold"
                />
                <span className="text-[11px] text-slate-500">Flag Connected call submissions faster than N seconds</span>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Monthly Relationship Call Interval (Days)
                </label>
                <input
                  type="number"
                  min="7"
                  value={settings.monthly_call_days}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setSettings({ ...settings, monthly_call_days: val });
                    crmDb.updateSettings({ monthly_call_days: val }, currentUser);
                  }}
                  className="w-full p-2 border border-slate-300 rounded-lg font-mono font-bold"
                />
                <span className="text-[11px] text-slate-500">Requires Connected call every N days</span>
              </div>
            </div>
          </div>

          {/* Audit Logs Table */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50/50">
              <h3 className="text-sm font-bold text-slate-900">
                System Security & Unmask Audit Log (Section 12)
              </h3>
              <p className="text-xs text-slate-500">
                Immutable chronological log of phone unmask events, logins, and setting changes.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-4">Timestamp (IST)</th>
                    <th className="py-3 px-4">User</th>
                    <th className="py-3 px-4">Action</th>
                    <th className="py-3 px-4">Entity</th>
                    <th className="py-3 px-4">Entity ID</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {auditLogs.map((a) => (
                    <tr key={a.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-mono text-slate-600">{formatISTDateTime(a.created_at)}</td>
                      <td className="py-3 px-4 font-bold text-slate-900">{a.user_name}</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-800">
                          {a.action}
                        </span>
                      </td>
                      <td className="py-3 px-4">{a.entity}</td>
                      <td className="py-3 px-4 font-mono">{a.entity_id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 8. REPORTS & CALL AUDIT (Section 11: 5 Dedicated Reports)                  */}
      {/* ========================================================================= */}
      {activeTab === 'reports' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Reports & Comprehensive Call Auditing Suite (Section 11)
              </h2>
              <p className="text-xs text-slate-500">
                5 distinct operational reports with native date pickers (From &lt;= To) and 1-click Excel download.
              </p>
            </div>
          </div>

          {/* Sub-Tabs for the 5 Reports */}
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2 text-xs">
            <button
              onClick={() => setReportSubTab('ADMISSION')}
              className={`px-3 py-1.5 font-bold rounded-lg cursor-pointer ${
                reportSubTab === 'ADMISSION' ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              A) Admission Report
            </button>
            <button
              onClick={() => setReportSubTab('CALLING')}
              className={`px-3 py-1.5 font-bold rounded-lg cursor-pointer ${
                reportSubTab === 'CALLING' ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              B) Calling Report
            </button>
            <button
              onClick={() => setReportSubTab('MENTOR_TRACKING')}
              className={`px-3 py-1.5 font-bold rounded-lg cursor-pointer ${
                reportSubTab === 'MENTOR_TRACKING' ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              C) Mentor Tracking (1-to-1)
            </button>
            <button
              onClick={() => setReportSubTab('BATCH_AUDIT')}
              className={`px-3 py-1.5 font-bold rounded-lg cursor-pointer ${
                reportSubTab === 'BATCH_AUDIT' ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              D) Batch Call Audit (IOQM)
            </button>
            <button
              onClick={() => setReportSubTab('CAMPAIGN_REPORT')}
              className={`px-3 py-1.5 font-bold rounded-lg cursor-pointer ${
                reportSubTab === 'CAMPAIGN_REPORT' ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              E) Campaign Consolidated
            </button>
          </div>

          {/* Report Content: A) Admission Report */}
          {reportSubTab === 'ADMISSION' && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-4 text-xs">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">A) Master Admission Performance Report</h3>
                  <p className="text-slate-500 text-[11px]">Completely separate from calling records (Section 11.A)</p>
                </div>
                <button
                  onClick={() => {
                    const rep = crmDb.getAdmissionReport({});
                    exportAdmissionReportToExcel({
                      ...rep,
                      sessionName: crmDb.getActiveSession().name,
                    });
                  }}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Excel</span>
                </button>
              </div>

              {(() => {
                const rep = crmDb.getAdmissionReport({});
                return (
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-3 text-center font-mono">
                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                        <span className="text-[10px] text-slate-500 block">TOTAL ADMISSIONS</span>
                        <span className="text-xl font-bold text-slate-900">{rep.totalAdmissions}</span>
                      </div>
                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                        <span className="text-[10px] text-slate-500 block">UNIQUE STUDENTS</span>
                        <span className="text-xl font-bold text-blue-700">{rep.uniqueStudents}</span>
                      </div>
                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                        <span className="text-[10px] text-slate-500 block">CROSS-BATCH SEATS</span>
                        <span className="text-xl font-bold text-amber-700">{rep.crossBatchCount}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="border border-slate-200 rounded-lg p-3">
                        <span className="font-bold block mb-2 text-slate-800">Batch-Wise Enrollments:</span>
                        {Object.entries(rep.batchBreakdown).map(([b, count]) => (
                          <div key={b} className="flex justify-between py-1 border-b border-slate-100">
                            <span>{b}</span>
                            <strong className="font-mono">{count}</strong>
                          </div>
                        ))}
                      </div>

                      <div className="border border-slate-200 rounded-lg p-3">
                        <span className="font-bold block mb-2 text-slate-800">Course-Wise Enrollments:</span>
                        {Object.entries(rep.courseBreakdown).map(([c, count]) => (
                          <div key={c} className="flex justify-between py-1 border-b border-slate-100">
                            <span>{c}</span>
                            <strong className="font-mono">{count}</strong>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Report Content: C) Mentor Tracking 1-to-1 Deep Dive */}
          {reportSubTab === 'MENTOR_TRACKING' && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-4 text-xs">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">C) 1-to-1 Mentor Tracking Deep Dive</h3>
                    <p className="text-slate-500 text-[11px]">Every call, attempt, latency, and all remarks in chronological order</p>
                  </div>
                  <select
                    value={selectedMentorForDeepDive || mentorsList[0]?.id}
                    onChange={(e) => setSelectedMentorForDeepDive(e.target.value)}
                    className="p-1.5 border border-slate-300 rounded font-bold bg-white cursor-pointer"
                  >
                    {mentorsList.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={() => {
                    const mId = selectedMentorForDeepDive || mentorsList[0]?.id;
                    if (mId) {
                      const rep = crmDb.getMentorTracking(mId);
                      exportMentorTrackingToExcel({
                        mentorName: rep.mentor.name,
                        designation: rep.mentor.department || 'Senior Academic Mentor',
                        totalAssigned: rep.totalAssignedTasks,
                        completed: rep.completedTasks,
                        pending: rep.pendingTasks,
                        suspiciousCount: rep.suspiciousCount,
                        calls: rep.calls,
                      });
                    }
                  }}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Mentor Excel</span>
                </button>
              </div>

              {(() => {
                const mId = selectedMentorForDeepDive || mentorsList[0]?.id;
                if (!mId) return null;
                const rep = crmDb.getMentorTracking(mId);

                return (
                  <div className="space-y-4">
                    <div className="grid grid-cols-4 gap-3 text-center font-mono">
                      <div className="bg-slate-50 p-2.5 rounded border border-slate-200">
                        <span className="text-[10px] text-slate-500 block">ASSIGNED TASKS</span>
                        <span className="text-lg font-bold">{rep.totalAssignedTasks}</span>
                      </div>
                      <div className="bg-slate-50 p-2.5 rounded border border-slate-200">
                        <span className="text-[10px] text-slate-500 block">COMPLETED</span>
                        <span className="text-lg font-bold text-emerald-700">{rep.completedTasks}</span>
                      </div>
                      <div className="bg-slate-50 p-2.5 rounded border border-slate-200">
                        <span className="text-[10px] text-slate-500 block">TOTAL CALLS</span>
                        <span className="text-lg font-bold">{rep.totalCalls}</span>
                      </div>
                      <div className="bg-slate-50 p-2.5 rounded border border-slate-200">
                        <span className="text-[10px] text-slate-500 block">SUSPICIOUS (&lt;15s)</span>
                        <span className="text-lg font-bold text-rose-700">{rep.suspiciousCount}</span>
                      </div>
                    </div>

                    <div className="border border-slate-200 rounded-lg overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px]">
                            <th className="py-2.5 px-3">Date (IST)</th>
                            <th className="py-2.5 px-3">Student Adm #</th>
                            <th className="py-2.5 px-3">Disposition</th>
                            <th className="py-2.5 px-3">Duration</th>
                            <th className="py-2.5 px-3">Latency</th>
                            <th className="py-2.5 px-3">Remarks</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {rep.calls.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="py-6 text-center text-slate-400">
                                No calls logged by this mentor yet.
                              </td>
                            </tr>
                          ) : (
                            rep.calls.map((c) => (
                              <tr key={c.id} className="hover:bg-slate-50">
                                <td className="py-2.5 px-3 font-mono text-slate-600">{formatISTDateTime(c.call_initiated_at)}</td>
                                <td className="py-2.5 px-3 font-mono font-bold">#{c.student_id}</td>
                                <td className="py-2.5 px-3">
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100">
                                    {c.disposition}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 font-mono">{c.call_duration_sec}s</td>
                                <td className="py-2.5 px-3 font-mono">
                                  {c.is_suspicious ? (
                                    <span className="text-rose-700 font-bold">{c.latency_seconds}s (Flagged)</span>
                                  ) : (
                                    <span>{c.latency_seconds}s</span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-slate-800">{c.remark}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Report Content: D) Batch-Wise Call Audit (IOQM case, including 0-call students) */}
          {reportSubTab === 'BATCH_AUDIT' && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-4 text-xs">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">D) Batch-Wise Call Audit (IOQM Case)</h3>
                  <p className="text-slate-500 text-[11px]">Includes all students in batch, especially those with 0 calls (Section 11.D)</p>
                </div>
                <button
                  onClick={() => {
                    const batchTarget = reportBatchName === 'ALL' ? (allBatches[0] || 'General') : reportBatchName;
                    const rep = crmDb.getBatchWiseCallAudit(batchTarget);
                    exportBatchAuditToExcel(rep);
                  }}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Audit Excel</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-700">Choose Batch:</span>
                <select
                  value={reportBatchName}
                  onChange={(e) => setReportBatchName(e.target.value)}
                  className="p-1.5 border border-slate-300 rounded font-semibold bg-white"
                >
                  <option value="ALL">All Batches</option>
                  {allBatches.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>

              {(() => {
                const batchTarget = reportBatchName === 'ALL' ? (allBatches[0] || 'General') : reportBatchName;
                const rep = crmDb.getBatchWiseCallAudit(batchTarget);

                return (
                  <div className="border border-slate-200 rounded-lg overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px]">
                          <th className="py-2.5 px-3">Student Name</th>
                          <th className="py-2.5 px-3">Adm #</th>
                          <th className="py-2.5 px-3">Mobile</th>
                          <th className="py-2.5 px-3">Calls Count</th>
                          <th className="py-2.5 px-3">Attempts</th>
                          <th className="py-2.5 px-3">Mentors Who Called</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {rep.auditRows.map((r) => (
                          <tr key={r.student.admission_no} className="hover:bg-slate-50">
                            <td className="py-2.5 px-3 font-bold text-slate-900">{r.student.user_name}</td>
                            <td className="py-2.5 px-3 font-mono">#{r.student.admission_no}</td>
                            <td className="py-2.5 px-3 font-mono">{r.student.student_mobile}</td>
                            <td className="py-2.5 px-3 font-mono font-bold">
                              {r.callsCount === 0 ? (
                                <span className="text-rose-700">0 Calls (Not Contacted)</span>
                              ) : (
                                <span className="text-emerald-700">{r.callsCount}</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 font-mono">{r.attemptsCount}</td>
                            <td className="py-2.5 px-3 text-slate-700">{r.mentorsWhoCalled || 'None'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Report Content: E) Campaign Consolidated Report */}
          {reportSubTab === 'CAMPAIGN_REPORT' && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-4 text-xs">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">E) Consolidated Campaign Outcomes Report</h3>
                  <p className="text-slate-500 text-[11px]">Consolidated response counts (e.g. PTM: Will Attend X / Not Y) across all mentors</p>
                </div>
                {campaigns.length > 0 && (
                  <button
                    onClick={() => {
                      const cId = selectedCampaignId || campaigns[0]?.id;
                      if (cId) {
                        const camp = campaigns.find((c) => c.id === cId)!;
                        const calls = crmDb.getCallingReport({ campaignId: cId }).calls;
                        exportCampaignReportToExcel(camp, [], calls);
                      }
                    }}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Campaign Excel</span>
                  </button>
                )}
              </div>

              {campaigns.length === 0 ? (
                <div className="p-8 text-center text-slate-400">No campaigns created yet.</div>
              ) : (
                (() => {
                  const cId = selectedCampaignId || campaigns[0]?.id;
                  const rep = crmDb.getConsolidatedCampaignReport(cId);

                  return (
                    <div className="space-y-4">
                      <div className="grid grid-cols-3 gap-3 text-center font-mono">
                        <div className="bg-slate-50 p-2.5 rounded border border-slate-200">
                          <span className="text-[10px] text-slate-500 block">TOTAL ASSIGNED</span>
                          <span className="text-lg font-bold">{rep.totalAssigned}</span>
                        </div>
                        <div className="bg-slate-50 p-2.5 rounded border border-slate-200">
                          <span className="text-[10px] text-slate-500 block">COMPLETED</span>
                          <span className="text-lg font-bold text-emerald-700">{rep.totalCompleted}</span>
                        </div>
                        <div className="bg-slate-50 p-2.5 rounded border border-slate-200">
                          <span className="text-[10px] text-slate-500 block">TOTAL CALLS</span>
                          <span className="text-lg font-bold">{rep.totalCalls}</span>
                        </div>
                      </div>

                      <div className="border border-slate-200 rounded-lg p-3">
                        <span className="font-bold text-slate-800 block mb-2">Campaign Outcome Responses:</span>
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(rep.outcomeCounts).map(([outcome, cnt]) => (
                            <span key={outcome} className="px-3 py-1 bg-amber-50 text-amber-900 border border-amber-200 rounded-full font-bold">
                              {outcome}: {cnt}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })()
              )}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* STUDENT DETAIL MODAL (From Student Directory Click)                       */}
      {/* ========================================================================= */}
      {selectedStudentForDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 bg-slate-950 text-white flex items-center justify-between">
              <div>
                <span className="text-[10px] font-mono text-amber-400 uppercase tracking-wider">
                  Full Student Profile · Adm #{selectedStudentForDetail.admission_no}
                </span>
                <h3 className="text-base font-bold mt-0.5">
                  {selectedStudentForDetail.user_name}
                </h3>
              </div>
              <button
                onClick={() => setSelectedStudentForDetail(null)}
                className="text-slate-400 hover:text-white p-1 rounded font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200 font-mono">
                <div>
                  <span className="text-[10px] text-slate-400 block">PRIMARY MOBILE</span>
                  <span className="font-bold text-slate-900">{selectedStudentForDetail.student_mobile}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block">FATHER NAME</span>
                  <span className="font-bold text-slate-900">{selectedStudentForDetail.father_name}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block">BATCH NAME</span>
                  <span className="font-bold text-slate-900">{selectedStudentForDetail.batch_name}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block">ASSIGNED MENTOR</span>
                  <span className="font-bold text-slate-900">{selectedStudentForDetail.mentor_name || 'Unassigned'}</span>
                </div>
              </div>

              {/* Call History Timeline with Remarks */}
              <div>
                <h4 className="font-bold text-slate-900 mb-2">Call & Conversation Timeline:</h4>
                <div className="space-y-2">
                  {crmDb.getCallsForStudent(selectedStudentForDetail.admission_no, 'SUPER_ADMIN').map((c) => (
                    <div key={c.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900">
                          {c.mentor_name} · <span className="font-mono">{formatISTDateTime(c.call_initiated_at)}</span>
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-800">
                          {c.disposition}
                        </span>
                      </div>
                      <div className="text-slate-700 italic">"{c.remark}"</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Campaign Modal */}
      {isCreateCampaignOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden">
            <div className="p-4 bg-slate-950 text-white flex items-center justify-between">
              <h3 className="font-bold text-sm">Create Calling Campaign (Section 10.1)</h3>
              <button
                onClick={() => setIsCreateCampaignOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateCampaign} className="p-5 space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">Campaign Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. PTM Attendance Drive"
                  value={newCampaignTitle}
                  onChange={(e) => setNewCampaignTitle(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Purpose Category *</label>
                <select
                  value={newCampaignPurpose}
                  onChange={(e) => setNewCampaignPurpose(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-lg bg-white font-bold"
                >
                  <option value="PTM">PTM Attendance</option>
                  <option value="Marks">Exam Marks Review</option>
                  <option value="IOQM">IOQM Stage-1 Performance</option>
                  <option value="Fee">Fee Follow-up</option>
                  <option value="Routine">Routine Relationship Call</option>
                  <option value="Other">Other Operational Drive</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Outcome Options (Comma-Separated)</label>
                <input
                  type="text"
                  value={newCampaignOutcomes}
                  onChange={(e) => setNewCampaignOutcomes(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsCreateCampaignOpen(false)}
                  className="px-3 py-1.5 border border-slate-300 rounded font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-slate-950 hover:bg-slate-800 text-white font-bold rounded-lg cursor-pointer"
                >
                  Save Campaign
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
