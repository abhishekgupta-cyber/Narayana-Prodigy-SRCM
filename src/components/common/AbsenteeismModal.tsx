import React from 'react';
import { X, Calendar, Clock, BookOpen, AlertCircle, CheckCircle2 } from 'lucide-react';
import { AttendanceAggregation, Student } from '../../types/crm';

interface AbsenteeismModalProps {
  student: Student;
  attendance: AttendanceAggregation;
  onClose: () => void;
}

export const AbsenteeismModal: React.FC<AbsenteeismModalProps> = ({
  student,
  attendance,
  onClose,
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold tracking-wider text-amber-400 uppercase font-mono">
                {student.admission_no}
              </span>
              <span className="text-slate-400">·</span>
              <span className="text-xs text-slate-300">{student.batch_name}</span>
            </div>
            <h2 className="text-lg font-bold text-white mt-0.5">{student.user_name} · Attendance Audit</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Top Aggregates */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-center">
              <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">Overall Attendance</div>
              <div className={`text-2xl font-bold mt-1 font-mono-numbers ${
                attendance.overallPercentage >= 85 ? 'text-emerald-600' : attendance.overallPercentage >= 75 ? 'text-amber-600' : 'text-rose-600'
              }`}>
                {attendance.overallPercentage}%
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                {attendance.presentClasses} of {attendance.totalClasses} sessions
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-center">
              <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">Present Sessions</div>
              <div className="text-2xl font-bold mt-1 text-emerald-600 font-mono-numbers">
                {attendance.presentClasses}
              </div>
              <div className="text-[11px] text-emerald-700/80 mt-0.5">Attended successfully</div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-center">
              <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">Absent Sessions</div>
              <div className="text-2xl font-bold mt-1 text-rose-600 font-mono-numbers">
                {attendance.absenteeDetails.length}
              </div>
              <div className="text-[11px] text-rose-700/80 mt-0.5">Requires parent follow-up</div>
            </div>
          </div>

          {/* Per-Subject Breakdown */}
          <div>
            <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <BookOpen className="w-4 h-4 text-slate-500" />
              Subject-Wise Breakdown
            </h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {Object.keys(attendance.subjectCounts).length === 0 ? (
                <div className="col-span-3 text-xs text-slate-500 py-3 text-center bg-slate-50 rounded-lg">
                  No subject records found for this student.
                </div>
              ) : (
                Object.entries(attendance.subjectCounts).map(([subj, counts]) => (
                  <div key={subj} className="border border-slate-200 rounded-lg p-2.5 bg-white">
                    <div className="text-xs font-bold text-slate-800 truncate">{subj}</div>
                    <div className="flex items-baseline justify-between mt-1">
                      <span className="text-xs text-slate-500 font-mono-numbers">
                        {counts.present} / {counts.total} classes
                      </span>
                      <span className={`text-xs font-bold font-mono-numbers ${
                        counts.percentage >= 85 ? 'text-emerald-600' : 'text-amber-600'
                      }`}>
                        {counts.percentage}%
                      </span>
                    </div>
                    {/* Progress Bar */}
                    <div className="w-full bg-slate-100 rounded-full h-1.5 mt-1.5 overflow-hidden">
                      <div
                        className={`h-full ${counts.percentage >= 85 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                        style={{ width: `${counts.percentage}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Absenteeism Audit List */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-rose-500" />
                Detailed Absence Log ({attendance.absenteeDetails.length})
              </h3>
              <span className="text-[11px] text-slate-500">Auto-aggregated for parent consultation</span>
            </div>

            {attendance.absenteeDetails.length === 0 ? (
              <div className="p-4 rounded-lg bg-emerald-50/50 border border-emerald-200/60 flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                <div className="text-xs text-emerald-800">
                  <span className="font-semibold">Clean Attendance Record:</span> No recorded absences for this student in the current term.
                </div>
              </div>
            ) : (
              <div className="border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-100 max-h-52 overflow-y-auto">
                {attendance.absenteeDetails.map((item, idx) => (
                  <div key={idx} className="p-3 bg-white flex items-center justify-between text-xs hover:bg-slate-50">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-rose-500 flex-shrink-0" />
                      <div>
                        <div className="font-semibold text-slate-800 flex items-center gap-2">
                          <span>{item.subject}</span>
                          {item.faculty && (
                            <span className="text-[11px] font-normal text-slate-500">· {item.faculty}</span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-3 mt-0.5">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-slate-400" />
                            {item.date}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-400" />
                            {item.time_slot}
                          </span>
                        </div>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200/60">
                      Absent
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
