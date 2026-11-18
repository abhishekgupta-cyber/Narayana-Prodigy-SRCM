import React, { useState } from 'react';
import { X, Play, CheckCircle2, XCircle, Clock, ShieldCheck, Cpu, RefreshCw } from 'lucide-react';
import { runAllAcceptanceTests, TestResult } from '../../tests/specVerification';

interface TestRunnerModalProps {
  onClose: () => void;
}

export const TestRunnerModal: React.FC<TestRunnerModalProps> = ({ onClose }) => {
  const [isRunning, setIsRunning] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [report, setReport] = useState<{
    results: TestResult[];
    passed: number;
    failed: number;
    totalDurationMs: number;
  } | null>(null);

  const handleRun = async () => {
    setIsRunning(true);
    setErrorMsg('');
    try {
      const res = await runAllAcceptanceTests();
      setReport(res);
    } catch (e: any) {
      setErrorMsg('Test suite error: ' + (e.message || String(e)));
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 bg-slate-950 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/10 rounded-lg border border-amber-500/20">
              <ShieldCheck className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-white">Acceptance Test Runner (T1 – T23)</h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-400/20 text-amber-300 border border-amber-400/30">
                  Section 15 & 16
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Automated programmatic verification of all 23 spec acceptance tests & 50,000-row benchmark
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3 text-xs">
            {report ? (
              <>
                <span className="flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  {report.passed} / {report.results.length} PASSED
                </span>
                {report.failed > 0 && (
                  <span className="flex items-center gap-1 font-bold text-rose-700 bg-rose-50 px-2.5 py-1 rounded-md border border-rose-200">
                    <XCircle className="w-3.5 h-3.5 text-rose-600" />
                    {report.failed} FAILED
                  </span>
                )}
                <span className="text-slate-500 font-mono text-[11px] flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Execution: {report.totalDurationMs}ms
                </span>
              </>
            ) : (
              <span className="text-slate-500 font-medium text-xs">
                Click "Run All Verification Tests" to execute the test suite against the local database engine.
              </span>
            )}
          </div>

          <button
            onClick={handleRun}
            disabled={isRunning}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer"
          >
            {isRunning ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Executing Tests...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current text-amber-400" />
                <span>Run All Verification Tests</span>
              </>
            )}
          </button>
        </div>

        {/* Test Items List */}
        <div className="p-5 overflow-y-auto space-y-2.5 flex-1 text-xs">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg font-semibold">
              {errorMsg}
            </div>
          )}
          {report ? (
            report.results.map((r) => (
              <div
                key={r.id}
                className={`p-3 rounded-xl border transition-all ${
                  r.status === 'PASS'
                    ? 'bg-white border-slate-200 hover:border-emerald-300'
                    : 'bg-rose-50/50 border-rose-200'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-mono font-bold text-[11px] px-2 py-0.5 rounded ${
                        r.status === 'PASS'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {r.id}
                    </span>
                    <span className="font-bold text-slate-900 text-xs">{r.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-slate-400">{r.durationMs}ms</span>
                    <span
                      className={`flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded ${
                        r.status === 'PASS'
                          ? 'text-emerald-700 bg-emerald-50'
                          : 'text-rose-700 bg-rose-50'
                      }`}
                    >
                      {r.status === 'PASS' ? (
                        <>
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" /> PASS
                        </>
                      ) : (
                        <>
                          <XCircle className="w-3 h-3 text-rose-600" /> FAIL
                        </>
                      )}
                    </span>
                  </div>
                </div>
                <div className="text-[11px] text-slate-600 pl-1 font-mono">
                  {r.details}
                </div>
              </div>
            ))
          ) : (
            <div className="py-12 text-center text-slate-400 space-y-3">
              <Cpu className="w-10 h-10 text-slate-300 mx-auto" />
              <div>
                <p className="font-semibold text-slate-700 text-sm">Automated Acceptance Test Suite Ready</p>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                  Covers T1–T23: Landing page zero-disclosure, single daily CallLog, cross-batch linking, phone masking, 4-chip mentor precedence, silent submission latency audit, Section 10.3 bulk selector, Section 11 reports, and 50,000-row performance benchmark.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500 px-5">
          <span>Engine: TypeScript 7 + Vite + In-Memory PostgreSQL Data Contracts</span>
          <button
            onClick={onClose}
            className="px-3 py-1 bg-white hover:bg-slate-100 border border-slate-300 rounded font-bold text-slate-700 cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
