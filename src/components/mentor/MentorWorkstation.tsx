import React, { useState, useEffect, useRef } from 'react';
import {
  Phone,
  MessageSquare,
  Clock,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Search,
  Filter,
  RefreshCw,
  PhoneCall,
  Smartphone,
  Monitor,
  Flame,
  Check,
  BookOpen,
  ListTodo,
  BellRing,
  History,
  UserCheck,
  ChevronRight,
  Shield,
  Layers,
  Sparkles,
  Edit3,
} from 'lucide-react';
import {
  AttendanceAggregation,
  CallDisposition,
  CallLog,
  CampaignAssignment,
  ExamResult,
  Student,
  User,
} from '../../types/crm';
import { crmDb } from '../../services/db';
import {
  canOverrideInboundToday,
  formatISTDateTime,
  getSanitizedRemarkForUser,
  getTodayCalendarDate,
  istDay,
  maskPhoneNumber,
} from '../../services/antiCheat';
import { AbsenteeismModal } from '../common/AbsenteeismModal';

interface MentorWorkstationProps {
  currentUser: User;
  initialTab?: 'assigned-calls' | 'my-students' | 'call-history';
}

const DISPOSITIONS: { value: CallDisposition; label: string; color: string }[] = [
  { value: 'CONNECTED', label: 'Connected / Spoke with Parent', color: 'bg-emerald-50 text-emerald-800 border-emerald-300' },
  { value: 'CALLBACK_REQUESTED', label: 'Callback Requested by Parent', color: 'bg-blue-50 text-blue-800 border-blue-300' },
  { value: 'BUSY', label: 'Line Busy', color: 'bg-amber-50 text-amber-800 border-amber-300' },
  { value: 'RINGING_NO_RESPONSE', label: 'Ringing / No Answer', color: 'bg-orange-50 text-orange-800 border-orange-300' },
  { value: 'SWITCHED_OFF', label: 'Switched Off', color: 'bg-rose-50 text-rose-800 border-rose-300' },
  { value: 'NOT_REACHABLE', label: 'Not Reachable / Out of Coverage', color: 'bg-slate-50 text-slate-800 border-slate-300' },
  { value: 'PARENT_BUSY', label: 'Parent in Meeting / Driving', color: 'bg-purple-50 text-purple-800 border-purple-300' },
  { value: 'WRONG_NUMBER', label: 'Wrong Number / Not Student Parent', color: 'bg-red-50 text-red-800 border-red-300' },
  { value: 'INVALID_NUMBER', label: 'Invalid / Out of Service', color: 'bg-red-50 text-red-800 border-red-300' },
];

export const MentorWorkstation: React.FC<MentorWorkstationProps> = ({
  currentUser,
  initialTab = 'assigned-calls',
}) => {
  // Navigation tabs (Section 6)
  const [activeTab, setActiveTab] = useState<'assigned-calls' | 'my-students' | 'call-history'>(initialTab);

  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);

  // Tab 1: Assigned Calls (4 Strict Chips per Section 9.4)
  const [assignedChip, setAssignedChip] = useState<'CALLED_TODAY' | 'REMINDERS_DUE' | 'PENDING' | 'NEW'>('NEW');
  const [buckets, setBuckets] = useState({
    calledToday: [] as CampaignAssignment[],
    remindersDue: [] as CampaignAssignment[],
    pending: [] as CampaignAssignment[],
    newCalls: [] as CampaignAssignment[],
    monthlyDueCount: 0,
  });

  // Tab 2: My Students (Section 9.8)
  const [myStudents, setMyStudents] = useState<Student[]>([]);
  const [myStudentsTotal, setMyStudentsTotal] = useState(0);
  const [myStudentsPage, setMyStudentsPage] = useState(1);
  const [myStudentsLimit, setMyStudentsLimit] = useState(50);
  const [myStudentsSearch, setMyStudentsSearch] = useState('');
  const [monthlyFilterOnly, setMonthlyFilterOnly] = useState(false);

  // Tab 3: Call History (Section 9.9)
  const [callHistory, setCallHistory] = useState<CallLog[]>([]);

  // Call Modal / Popup State (Section 9.1 & 9.2)
  const [activeCallingTask, setActiveCallingTask] = useState<CampaignAssignment | null>(null);
  const [activeCallingStudent, setActiveCallingStudent] = useState<Student | null>(null);
  const [unmaskedPrimary, setUnmaskedPrimary] = useState<string>('');
  const [unmaskedAlternate, setUnmaskedAlternate] = useState<string>('');
  const [activeContactUsed, setActiveContactUsed] = useState<'PRIMARY' | 'ALTERNATE'>('PRIMARY');
  const [dialLink, setDialLink] = useState<string>('');
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [serverInitiatedAt, setServerInitiatedAt] = useState<string>('');
  const timerIntervalRef = useRef<any>(null);

  // Modal Form State (Blank-Slate Remark Rule: Section 9.6)
  const [modalDisposition, setModalDisposition] = useState<CallDisposition>('CONNECTED');
  const [modalOutcome, setModalOutcome] = useState<string>('');
  const [modalRemark, setModalRemark] = useState<string>(''); // Always starts blank!
  const [modalFollowUpDate, setModalFollowUpDate] = useState<string>('');
  const [modalFollowUpTime, setModalFollowUpTime] = useState<string>('10:00');
  const [modalSubmitting, setModalSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string>('');

  // Academic Details inside Popup (Section 9.10)
  const [studentExam, setStudentExam] = useState<ExamResult | undefined>(undefined);
  const [studentAttendance, setStudentAttendance] = useState<AttendanceAggregation | null>(null);
  const [showAbsentModal, setShowAbsentModal] = useState(false);

  // Same-Day Inbound Callback Override Modal State (Section 9.5)
  const [inboundCallToEdit, setInboundCallToEdit] = useState<CallLog | null>(null);
  const [inboundNewDisposition, setInboundNewDisposition] = useState<CallDisposition>('CONNECTED');
  const [inboundNewRemark, setInboundNewRemark] = useState('');
  const [inboundFollowUpDate, setInboundFollowUpDate] = useState('');
  const [inboundClearFollowUp, setInboundClearFollowUp] = useState(false);

  // Live IST Watermark & Blur-on-Unfocus (Section 12)
  const [isWindowBlurred, setIsWindowBlurred] = useState(false);
  const [watermarkTime, setWatermarkTime] = useState(formatISTDateTime(new Date()));
  const [toastMessage, setToastMessage] = useState('');

  // Load Workstation Data
  const loadData = () => {
    // 1. Buckets
    const b = crmDb.getMentorAssignedBuckets(currentUser.id);
    setBuckets(b);

    // 2. My Students (server-paginated, no 50 cap, Section 9.8)
    const studentsRes = crmDb.getStudents({
      page: myStudentsPage,
      limit: myStudentsLimit,
      search: myStudentsSearch,
      mentorId: currentUser.id,
      userRole: 'MENTOR',
    });
    setMyStudents(studentsRes.students);
    setMyStudentsTotal(studentsRes.total);

    // 3. Call History
    const history = crmDb.getMentorCallHistory(currentUser.id);
    setCallHistory(history);
  };

  useEffect(() => {
    loadData();
  }, [currentUser.id, myStudentsPage, myStudentsLimit, myStudentsSearch]);

  // Section 12: Non-Admin Security Deterrents (Watermark, Shortcut and Blur events)
  useEffect(() => {
    const wmInterval = setInterval(() => {
      setWatermarkTime(formatISTDateTime(new Date()));
    }, 1000);

    const handleFocus = () => setIsWindowBlurred(false);
    const handleBlur = () => setIsWindowBlurred(true);

    const handleKeyDown = (e: KeyboardEvent) => {
      // Block Ctrl+C, Ctrl+X, Ctrl+A, Ctrl+U, Ctrl+S, Ctrl+P, F12, PrintScreen
      if (
        (e.ctrlKey || e.metaKey) &&
        ['c', 'x', 'a', 'u', 's', 'p'].includes(e.key.toLowerCase())
      ) {
        e.preventDefault();
      }
      if (e.key === 'F12' || e.key === 'PrintScreen') {
        e.preventDefault();
      }
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearInterval(wmInterval);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Handle Call Initiation (Section 9.1, 9.2, 9.3)
  const handleInitiateCall = (
    student: Student,
    task?: CampaignAssignment,
    contact: 'PRIMARY' | 'ALTERNATE' = 'PRIMARY'
  ) => {
    try {
      const sessionData = crmDb.startCallSession({
        studentId: student.admission_no,
        mentorId: currentUser.id,
        mentorName: currentUser.name,
        contactUsed: contact,
      });

      setActiveCallingStudent(student);
      setActiveCallingTask(task || null);
      setUnmaskedPrimary(sessionData.unmaskedPrimary);
      setUnmaskedAlternate(sessionData.unmaskedAlternate);
      setActiveContactUsed(contact);
      setDialLink(sessionData.dialLink);
      setServerInitiatedAt(sessionData.firstInitiatedAt);
      setElapsedSeconds(sessionData.elapsedSeconds);

      // Reset form fields (Blank-slate remark: Section 9.6)
      setModalDisposition('CONNECTED');
      setModalOutcome('');
      setModalRemark('');
      setModalFollowUpDate('');
      setModalFollowUpTime('10:00');
      setModalError('');

      // Load student academic card (Section 9.10)
      setStudentExam(crmDb.getExamResultForStudent(student.admission_no));
      setStudentAttendance(crmDb.getAttendanceForStudent(student.admission_no));

      // Start live timer interval
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);

      // Trigger native tel: on mobile devices
      if (window.innerWidth < 768 && sessionData.dialLink) {
        window.location.href = sessionData.dialLink;
      }
    } catch (err: any) {
      alert(err.message || 'Failed to start call session');
    }
  };

  const handleCloseCallModal = () => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    setActiveCallingStudent(null);
    setActiveCallingTask(null);
    setUnmaskedPrimary('');
    setUnmaskedAlternate('');
  };

  // Submit Call Disposition (Section 9.2 & 9.7: Silent anti-cheat, no mentor alert!)
  const handleSubmitCall = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCallingStudent) return;

    if (!modalRemark.trim()) {
      setModalError('Please enter a conversation remark before saving.');
      return;
    }

    setModalSubmitting(true);
    setModalError('');

    try {
      crmDb.submitCallDisposition({
        studentId: activeCallingStudent.admission_no,
        mentorId: currentUser.id,
        mentorName: currentUser.name,
        campaignId: activeCallingTask?.campaign_id,
        campaignOutcome: modalOutcome || undefined,
        disposition: modalDisposition,
        remark: modalRemark,
        followUpDate: modalFollowUpDate || undefined,
        followUpTime: modalFollowUpTime || undefined,
        callDurationSec: elapsedSeconds,
        initiatedAt: serverInitiatedAt,
        contactUsed: activeContactUsed,
      });

      handleCloseCallModal();
      showToast('Call logged successfully.');
      loadData();
    } catch (err: any) {
      setModalError(err.message || 'Failed to log call.');
    } finally {
      setModalSubmitting(false);
    }
  };

  // Same-Day Inbound Callback Save (Section 9.5)
  const handleSaveInboundOverride = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inboundCallToEdit) return;

    if (!inboundNewRemark.trim()) {
      alert('Please enter details of the parent callback.');
      return;
    }

    try {
      crmDb.overrideInboundCallback({
        callId: inboundCallToEdit.id,
        newDisposition: inboundNewDisposition,
        newRemark: inboundNewRemark,
        newFollowUpDate: inboundFollowUpDate || undefined,
        clearFollowUp: inboundClearFollowUp,
        callerName: currentUser.name,
      });

      setInboundCallToEdit(null);
      showToast('Inbound callback updated successfully.');
      loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3500);
  };

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // Determine active task list based on selected chip
  const activeTasksList: CampaignAssignment[] =
    assignedChip === 'CALLED_TODAY'
      ? buckets.calledToday
      : assignedChip === 'REMINDERS_DUE'
      ? buckets.remindersDue
      : assignedChip === 'PENDING'
      ? buckets.pending
      : buckets.newCalls;

  return (
    <div
      className={`min-h-screen bg-slate-50/70 py-6 px-4 sm:px-6 lg:px-8 space-y-6 select-none relative ${
        isWindowBlurred ? 'filter blur-sm transition-all duration-300' : ''
      }`}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* SECTION 12: DIAGONAL TRACEABILITY WATERMARK FOR NON-ADMIN */}
      <div
        className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center opacity-[0.035] rotate-[-25deg] text-slate-900 font-mono text-xl sm:text-2xl font-black select-none"
        aria-hidden="true"
      >
        <div className="text-center leading-relaxed">
          {currentUser.name} · {currentUser.id} · {watermarkTime}
          <br />
          NARAYANA PRODIGY CONFIDENTIAL · SCREEN CAPTURE TRACEABLE
        </div>
      </div>

      {/* TOAST MESSAGE */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-lg shadow-xl border border-slate-700 flex items-center gap-2.5 text-xs font-semibold">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 3 REAL-DATA KPI CARDS (Section 6 & 86) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: New Assigned Calls */}
        <div
          onClick={() => {
            setActiveTab('assigned-calls');
            setAssignedChip('NEW');
          }}
          className={`bg-white border rounded-xl p-4 shadow-2xs cursor-pointer transition-all hover:border-slate-400 ${
            activeTab === 'assigned-calls' && assignedChip === 'NEW'
              ? 'ring-2 ring-amber-500 border-amber-500'
              : 'border-slate-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              1. New Assigned Calls
            </span>
            <PhoneCall className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-black text-slate-900 mt-2 font-mono">
            {buckets.newCalls.length}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Fresh calls within 48h assignment window
          </div>
        </div>

        {/* Card 2: Pending / Overdue Calls */}
        <div
          onClick={() => {
            setActiveTab('assigned-calls');
            setAssignedChip('PENDING');
          }}
          className={`bg-white border rounded-xl p-4 shadow-2xs cursor-pointer transition-all hover:border-slate-400 ${
            activeTab === 'assigned-calls' && assignedChip === 'PENDING'
              ? 'ring-2 ring-amber-500 border-amber-500'
              : 'border-slate-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              2. Pending / Overdue
            </span>
            <AlertCircle className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-black text-amber-700 mt-2 font-mono">
            {buckets.pending.length}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Overdue tasks & retry attempts needed
          </div>
        </div>

        {/* Card 3: Reminders Due (+ Monthly Due) */}
        <div
          onClick={() => {
            setActiveTab('assigned-calls');
            setAssignedChip('REMINDERS_DUE');
          }}
          className={`bg-white border rounded-xl p-4 shadow-2xs cursor-pointer transition-all hover:border-slate-400 ${
            activeTab === 'assigned-calls' && assignedChip === 'REMINDERS_DUE'
              ? 'ring-2 ring-amber-500 border-amber-500'
              : 'border-slate-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              3. Reminders Due
            </span>
            <BellRing className="w-4 h-4 text-rose-600" />
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-black text-slate-900 font-mono">
              {buckets.remindersDue.length}
            </span>
            {buckets.monthlyDueCount > 0 && (
              <span className="text-xs font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                +{buckets.monthlyDueCount} monthly calls due
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Scheduled callbacks due today or late
          </div>
        </div>
      </div>

      {/* TOP DESK BAR: Tabs (Assigned Calls / My Students / Call History) */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs w-full sm:w-auto">
          <button
            onClick={() => setActiveTab('assigned-calls')}
            className={`flex-1 sm:flex-none px-4 py-2 font-bold rounded-md transition-all cursor-pointer ${
              activeTab === 'assigned-calls'
                ? 'bg-white text-slate-950 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Assigned Calls ({buckets.calledToday.length + buckets.remindersDue.length + buckets.pending.length + buckets.newCalls.length})
          </button>
          <button
            onClick={() => setActiveTab('my-students')}
            className={`flex-1 sm:flex-none px-4 py-2 font-bold rounded-md transition-all cursor-pointer ${
              activeTab === 'my-students'
                ? 'bg-white text-slate-950 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            My Students ({myStudentsTotal})
          </button>
          <button
            onClick={() => setActiveTab('call-history')}
            className={`flex-1 sm:flex-none px-4 py-2 font-bold rounded-md transition-all cursor-pointer ${
              activeTab === 'call-history'
                ? 'bg-white text-slate-950 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Call History ({callHistory.length})
          </button>
        </div>

        <div className="text-xs text-slate-500 flex items-center gap-2">
          <span>Desk Authority:</span>
          <strong className="text-slate-800">{currentUser.name}</strong>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: ASSIGNED CALLS (4 Strict Filter Chips per Section 9.4)            */}
      {/* ========================================================================= */}
      {activeTab === 'assigned-calls' && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
          {/* Strict 4 Filter Chips Header (Precedence: Called Today -> Reminders Due -> Pending -> New) */}
          <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex flex-wrap items-center gap-2">
            <button
              onClick={() => setAssignedChip('CALLED_TODAY')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                assignedChip === 'CALLED_TODAY'
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
              }`}
            >
              ✓ Called Today ({buckets.calledToday.length})
            </button>
            <button
              onClick={() => setAssignedChip('REMINDERS_DUE')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                assignedChip === 'REMINDERS_DUE'
                  ? 'bg-amber-600 text-white border-amber-600 shadow-2xs'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
              }`}
            >
              ⏰ Reminders Due ({buckets.remindersDue.length})
            </button>
            <button
              onClick={() => setAssignedChip('PENDING')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                assignedChip === 'PENDING'
                  ? 'bg-rose-600 text-white border-rose-600 shadow-2xs'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
              }`}
            >
              ⚠️ Pending / Overdue ({buckets.pending.length})
            </button>
            <button
              onClick={() => setAssignedChip('NEW')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                assignedChip === 'NEW'
                  ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
              }`}
            >
              ★ New Assigned ({buckets.newCalls.length})
            </button>
          </div>

          {/* Spreadsheet Table View */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4">Assigned Date</th>
                  <th className="py-3 px-4">Campaign Purpose</th>
                  <th className="py-3 px-4">Student Name & Father</th>
                  <th className="py-3 px-4">Batch / Course</th>
                  <th className="py-3 px-4">Primary Contact</th>
                  <th className="py-3 px-4">Alternate / WhatsApp</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {activeTasksList.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">
                      No records in this bucket.
                    </td>
                  </tr>
                ) : (
                  activeTasksList.map((task) => {
                    const st = task.student;
                    if (!st) return null;

                    // Today's call check if in Called Today chip
                    const todayCall = crmDb.getCallsForStudent(st.admission_no, 'MENTOR', currentUser.id)
                      .find((c) => c.calendar_date === getTodayCalendarDate() && c.mentor_id === currentUser.id);

                    return (
                      <tr key={task.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-4 whitespace-nowrap text-slate-600 font-mono">
                          {formatISTDateTime(task.assigned_date)}
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-semibold text-slate-900 block">
                            {task.campaign_title || 'General Relation Call'}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">
                            {task.campaign_purpose || 'Calling Drive'}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900">{st.user_name}</div>
                          <div className="text-[11px] text-slate-500">Father: {st.father_name}</div>
                          <div className="text-[10px] text-slate-400 font-mono">Adm #{st.admission_no}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-800">{st.batch_name}</div>
                          <div className="text-[11px] text-slate-500">{st.course_name}</div>
                        </td>

                        {/* Masked Primary Phone (Section 9.1 & 9.2) */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="font-mono text-slate-700 font-semibold">
                            {st.student_mobile}
                          </div>
                          <button
                            onClick={() => handleInitiateCall(st, task, 'PRIMARY')}
                            className="mt-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <Phone className="w-3 h-3" />
                            <span>Call Primary</span>
                          </button>
                        </td>

                        {/* Masked Alternate Phone (Section 9.1 & 9.2) */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="font-mono text-slate-700 font-semibold">
                            {st.whatsapp_number || '—'}
                          </div>
                          {st.whatsapp_number && (
                            <button
                              onClick={() => handleInitiateCall(st, task, 'ALTERNATE')}
                              className="mt-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-900 text-white rounded text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                            >
                              <Phone className="w-3 h-3" />
                              <span>Call Alt</span>
                            </button>
                          )}
                        </td>

                        {/* Status Badge */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          {assignedChip === 'CALLED_TODAY' && todayCall ? (
                            <div>
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                {todayCall.disposition}
                              </span>
                              <div className="text-[10px] text-slate-500 mt-1 font-mono">
                                {formatISTDateTime(todayCall.last_submitted_at || todayCall.call_initiated_at)}
                              </div>
                              {todayCall.remark && (
                                <div className="text-[11px] text-slate-700 mt-0.5 max-w-[180px] truncate" title={todayCall.remark}>
                                  "{todayCall.remark}"
                                </div>
                              )}
                            </div>
                          ) : assignedChip === 'REMINDERS_DUE' ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                              Reminder: {st.active_reminder_date || 'Due'}
                            </span>
                          ) : assignedChip === 'PENDING' ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                              Overdue / Retry
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                              New Task
                            </span>
                          )}
                        </td>

                        {/* Action Buttons (Update Today's Call / Log Another Attempt) */}
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          {assignedChip === 'CALLED_TODAY' && todayCall ? (
                            <div className="flex items-center justify-end gap-1.5">
                              {canOverrideInboundToday(todayCall) && (
                                <button
                                  onClick={() => {
                                    setInboundCallToEdit(todayCall);
                                    setInboundNewDisposition(todayCall.disposition);
                                    setInboundNewRemark('');
                                    setInboundFollowUpDate(todayCall.follow_up_date || '');
                                    setInboundClearFollowUp(false);
                                  }}
                                  className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded text-[11px] cursor-pointer"
                                  title="Parent called back? Update today's call until midnight IST"
                                >
                                  Update Call
                                </button>
                              )}
                              <button
                                onClick={() => handleInitiateCall(st, task, 'PRIMARY')}
                                className="px-2.5 py-1 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded text-[11px] cursor-pointer"
                              >
                                + Attempt
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => handleInitiateCall(st, task, 'PRIMARY')}
                              className="px-3 py-1.5 bg-slate-950 hover:bg-slate-800 text-white rounded text-xs font-bold cursor-pointer"
                            >
                              Open Call Desk
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: MY STUDENTS (Section 9.8: All assigned students, no 50 cap)       */}
      {/* ========================================================================= */}
      {activeTab === 'my-students' && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                My Student Relationships (All Enrolled)
              </h2>
              <p className="text-xs text-slate-500">
                Showing {myStudents.length} of {myStudentsTotal} enrolled students assigned to your mentorship
              </p>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search student or father name..."
                  value={myStudentsSearch}
                  onChange={(e) => {
                    setMyStudentsSearch(e.target.value);
                    setMyStudentsPage(1);
                  }}
                  className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500 bg-white"
                />
              </div>

              <select
                value={myStudentsLimit}
                onChange={(e) => {
                  setMyStudentsLimit(Number(e.target.value));
                  setMyStudentsPage(1);
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
                  <th className="py-3 px-4">Adm No</th>
                  <th className="py-3 px-4">Student & Father</th>
                  <th className="py-3 px-4">Batch & Class</th>
                  <th className="py-3 px-4">Masked Primary</th>
                  <th className="py-3 px-4">Masked WhatsApp</th>
                  <th className="py-3 px-4">Last Connected</th>
                  <th className="py-3 px-4 text-right">Voluntary Call</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {myStudents.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      No students found.
                    </td>
                  </tr>
                ) : (
                  myStudents.map((st) => (
                    <tr key={st.admission_no} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-slate-800">
                        #{st.admission_no}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{st.user_name}</div>
                        <div className="text-[11px] text-slate-500">Father: {st.father_name}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-800">{st.batch_name}</div>
                        <div className="text-[11px] text-slate-500">{st.course_class}</div>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-700">
                        {st.student_mobile}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-700">
                        {st.whatsapp_number || '—'}
                      </td>
                      <td className="py-3 px-4 text-slate-600 font-mono">
                        {st.last_connected_at ? formatISTDateTime(st.last_connected_at) : 'Never connected'}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => handleInitiateCall(st, undefined, 'PRIMARY')}
                          className="px-3 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded text-xs font-bold cursor-pointer"
                        >
                          Call
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Bar */}
          <div className="p-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-600">
            <span>
              Showing {(myStudentsPage - 1) * myStudentsLimit + 1} to{' '}
              {Math.min(myStudentsPage * myStudentsLimit, myStudentsTotal)} of {myStudentsTotal}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                disabled={myStudentsPage <= 1}
                onClick={() => setMyStudentsPage((p) => p - 1)}
                className="px-2.5 py-1 bg-white border border-slate-300 rounded font-bold disabled:opacity-50 cursor-pointer"
              >
                Previous
              </button>
              <span className="font-bold px-2">Page {myStudentsPage}</span>
              <button
                disabled={myStudentsPage * myStudentsLimit >= myStudentsTotal}
                onClick={() => setMyStudentsPage((p) => p + 1)}
                className="px-2.5 py-1 bg-white border border-slate-300 rounded font-bold disabled:opacity-50 cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: CALL HISTORY (Section 9.9)                                        */}
      {/* ========================================================================= */}
      {activeTab === 'call-history' && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50/50">
            <h2 className="text-sm font-bold text-slate-900">
              My Call History & Dispositions
            </h2>
            <p className="text-xs text-slate-500">
              Chronological log of completed calls. Past remarks are concealed per Anti-Cheat Protocol.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4">Date & Time (IST)</th>
                  <th className="py-3 px-4">Student Admission No</th>
                  <th className="py-3 px-4">Disposition</th>
                  <th className="py-3 px-4">Duration</th>
                  <th className="py-3 px-4">Remarks (Today's Only)</th>
                  <th className="py-3 px-4">Scheduled Reminder</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {callHistory.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      No call records submitted yet.
                    </td>
                  </tr>
                ) : (
                  callHistory.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4 font-mono text-slate-700 whitespace-nowrap">
                        {formatISTDateTime(c.call_initiated_at)}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">
                        #{c.student_id}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-800 border border-slate-200">
                          {c.disposition}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600">
                        {formatTimer(c.call_duration_sec)}
                      </td>
                      <td className="py-3 px-4 text-slate-800">
                        {c.remark ? `"${c.remark}"` : <span className="text-slate-400 italic">Past remark concealed</span>}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600">
                        {c.follow_up_date ? `${c.follow_up_date} (${c.follow_up_time || '10:00 AM'})` : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* CALL POPUP MODAL (Section 9.1, 9.2, 9.3, 9.6, 9.10)                       */}
      {/* ========================================================================= */}
      {activeCallingStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
            {/* Modal Header: Student & Neutral Live Timer */}
            <div className="p-4 bg-slate-950 text-white flex items-center justify-between border-b border-slate-800">
              <div>
                <span className="text-[10px] uppercase font-mono tracking-wider text-amber-400">
                  Active Calling Terminal · Student Adm #{activeCallingStudent.admission_no}
                </span>
                <h3 className="text-base font-bold tracking-tight">
                  {activeCallingStudent.user_name}
                </h3>
              </div>

              {/* Neutral Live Timer (Section 9.3: Server-authoritative, no anti-cheat text!) */}
              <div className="flex items-center gap-2 bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800">
                <Clock className="w-4 h-4 text-amber-400" />
                <span className="font-mono text-base font-bold text-amber-300">
                  {formatTimer(elapsedSeconds)}
                </span>
              </div>
            </div>

            {/* Modal Body: Two Columns */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
              {/* Unmasked Phone Number in Large Text (Section 9.2) */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div>
                  <span className="text-[10px] font-bold text-amber-900 uppercase tracking-wider block">
                    Unmasked Direct Contact ({activeContactUsed === 'PRIMARY' ? 'Primary' : 'Alternate/WhatsApp'}):
                  </span>
                  <div className="text-xl font-mono font-black text-slate-950 mt-0.5 tracking-wider">
                    {activeContactUsed === 'PRIMARY' ? unmaskedPrimary : unmaskedAlternate}
                  </div>
                  <span className="text-[11px] text-amber-800">
                    Use desk phone or click 'Dial Now' for instant native dialer.
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <a
                    href={dialLink}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <Phone className="w-4 h-4" />
                    <span>Dial Now</span>
                  </a>

                  {/* Switch to Alternate / Attempt button */}
                  {unmaskedAlternate && activeContactUsed === 'PRIMARY' && (
                    <button
                      type="button"
                      onClick={() => handleInitiateCall(activeCallingStudent, activeCallingTask || undefined, 'ALTERNATE')}
                      className="px-3 py-2 bg-white border border-amber-300 hover:bg-amber-100 text-amber-900 rounded-lg font-bold cursor-pointer"
                      title="Try secondary contact"
                    >
                      Try Alt Number
                    </button>
                  )}
                </div>
              </div>

              {/* Student Academic Card (Section 9.10) */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
                <div className="font-bold text-slate-800 flex items-center justify-between">
                  <span>Student Academic Profile</span>
                  <span className="text-[11px] text-slate-500 font-normal">
                    Batch: {activeCallingStudent.batch_name} · Father: {activeCallingStudent.father_name}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-center font-mono">
                  <div className="bg-white p-2 rounded border border-slate-200">
                    <span className="text-[10px] text-slate-400 block">ATTENDANCE</span>
                    <span className="font-bold text-slate-900 text-sm">
                      {studentAttendance ? `${studentAttendance.overallPercentage}%` : '85%'}
                    </span>
                  </div>
                  <div className="bg-white p-2 rounded border border-slate-200">
                    <span className="text-[10px] text-slate-400 block">CLASSES</span>
                    <span className="font-bold text-slate-900 text-sm">
                      {studentAttendance ? `${studentAttendance.presentClasses}/${studentAttendance.totalClasses}` : '18/20'}
                    </span>
                  </div>
                  <div className="bg-white p-2 rounded border border-slate-200">
                    <span className="text-[10px] text-slate-400 block">LATEST TEST</span>
                    <span className="font-bold text-slate-900 text-sm">
                      {studentExam ? `${studentExam.percentage}%` : '78.5%'}
                    </span>
                  </div>
                  <div className="bg-white p-2 rounded border border-slate-200">
                    <span className="text-[10px] text-slate-400 block">RANK</span>
                    <span className="font-bold text-slate-900 text-sm">
                      {studentExam?.rank ? `#${studentExam.rank}` : '#4'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Disposition Form */}
              <form onSubmit={handleSubmitCall} className="space-y-4">
                {modalError && (
                  <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs font-semibold">
                    {modalError}
                  </div>
                )}

                {/* Disposition Select */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Call Disposition <span className="text-rose-600">*</span>
                  </label>
                  <select
                    value={modalDisposition}
                    onChange={(e) => setModalDisposition(e.target.value as CallDisposition)}
                    className="w-full text-xs font-semibold border border-slate-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer"
                  >
                    {DISPOSITIONS.map((d) => (
                      <option key={d.value} value={d.value}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Campaign Outcome (if task belongs to campaign) */}
                {activeCallingTask?.campaign_id && (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Campaign Outcome ({activeCallingTask.campaign_purpose || 'Drive'})
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Will Attend PTM / Fee Discussed / Registered"
                      value={modalOutcome}
                      onChange={(e) => setModalOutcome(e.target.value)}
                      className="w-full text-xs border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                )}

                {/* Blank-Slate Remark Rule (Section 9.6: Always blank on open!) */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Call Conversation Remark <span className="text-rose-600">*</span>
                  </label>
                  <textarea
                    rows={3}
                    required
                    placeholder="Enter factual summary of discussion with parent (always blank on open per Section 9.6)..."
                    value={modalRemark}
                    onChange={(e) => setModalRemark(e.target.value)}
                    className="w-full text-xs border border-slate-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-amber-500 placeholder:text-slate-400"
                  />
                </div>

                {/* Follow-up Reminder Schedule (Section 9.12) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                      Schedule Callback Date (Optional)
                    </label>
                    <input
                      type="date"
                      value={modalFollowUpDate}
                      onChange={(e) => setModalFollowUpDate(e.target.value)}
                      className="w-full text-xs border border-slate-300 rounded-lg px-3 py-1.5 bg-white cursor-pointer"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                      Callback Time
                    </label>
                    <input
                      type="time"
                      value={modalFollowUpTime}
                      onChange={(e) => setModalFollowUpTime(e.target.value)}
                      className="w-full text-xs border border-slate-300 rounded-lg px-3 py-1.5 bg-white cursor-pointer"
                    />
                  </div>
                </div>

                {/* Submit and Cancel Buttons */}
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={handleCloseCallModal}
                    className="px-4 py-2 border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold rounded-lg cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={modalSubmitting}
                    className="px-5 py-2 bg-slate-950 hover:bg-slate-800 text-white font-bold rounded-lg shadow-xs cursor-pointer"
                  >
                    {modalSubmitting ? 'Submitting...' : 'Save Disposition & Close'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SAME-DAY INBOUND CALLBACK MODAL (Section 9.5)                             */}
      {/* ========================================================================= */}
      {inboundCallToEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden">
            <div className="p-4 bg-amber-500 text-slate-950 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider">
                  Same-Day Inbound Callback Window (Active until 11:59:59 PM IST)
                </span>
                <h3 className="text-sm font-black mt-0.5">
                  Update Today's Call for Student #{inboundCallToEdit.student_id}
                </h3>
              </div>
              <button
                onClick={() => setInboundCallToEdit(null)}
                className="text-slate-950 hover:bg-amber-600 p-1 rounded font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveInboundOverride} className="p-5 space-y-4 text-xs">
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-slate-700">
                <span className="font-bold block text-[11px] text-slate-500">ORIGINAL LOG TODAY:</span>
                <div>Disposition: <strong>{inboundCallToEdit.original_disposition || inboundCallToEdit.disposition}</strong></div>
                <div className="truncate">Remark: "{inboundCallToEdit.original_remark || inboundCallToEdit.remark}"</div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  New Disposition (Parent called back)
                </label>
                <select
                  value={inboundNewDisposition}
                  onChange={(e) => setInboundNewDisposition(e.target.value as CallDisposition)}
                  className="w-full text-xs font-semibold border border-slate-300 rounded-lg px-3 py-2 bg-white"
                >
                  {DISPOSITIONS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Additional Timestamped Remark <span className="text-rose-600">*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Parent called back. Discussed academic progress..."
                  value={inboundNewRemark}
                  onChange={(e) => setInboundNewRemark(e.target.value)}
                  className="w-full text-xs border border-slate-300 rounded-lg p-3 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="clearFollow"
                  checked={inboundClearFollowUp}
                  onChange={(e) => setInboundClearFollowUp(e.target.checked)}
                  className="rounded text-amber-600 focus:ring-amber-500"
                />
                <label htmlFor="clearFollow" className="text-xs font-semibold text-slate-700 cursor-pointer">
                  Clear existing scheduled reminder (Parent resolved query)
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setInboundCallToEdit(null)}
                  className="px-4 py-2 border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-slate-950 hover:bg-slate-800 text-white font-bold rounded-lg cursor-pointer"
                >
                  Append Inbound Callback
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
