import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api.js';
import { useToast } from '../common/Toast.js';
import { NotificationLog } from '../../types.js';
import { LoadingSkeleton } from '../common/LoadingSkeleton.js';
import {
  Send,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ShieldCheck,
  Calendar,
  Sparkles,
  Info,
  RefreshCw,
} from 'lucide-react';

export const SettingsView: React.FC = () => {
  const { showToast } = useToast();

  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [loading, setLoading] = useState(true);

  const loadLogs = async () => {
    try {
      setLoading(true);
      const data = await api.getNotificationLogs();
      setLogs(data);
    } catch (err: any) {
      showToast(err.message || 'Failed to load notification logs', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-2.5 py-1 rounded-full border border-indigo-200 dark:border-indigo-800 inline-block mb-1.5">
          System & Delivery Config
        </span>
        <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
          Academy Rules & Telegram Notifications
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Automated parent dispatch history and standard academy attendance rules
        </p>
      </div>

      {/* Bento Grid Rules & Configuration */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Rule 1: 4 Lessons/Month */}
        <div className="bg-[#f0f9ff] dark:bg-sky-950/20 border-2 border-slate-900 dark:border-neutral-700 rounded-3xl p-6 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.06)] flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="w-5 h-5 text-sky-700 dark:text-sky-400" />
              <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">
                4-Lesson Group Rule
              </h3>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
              Standard group tuition covers 4 sessions per calendar month. Sessions are tracked strictly against recurring weekly schedules.
            </p>
          </div>
          <span className="inline-block mt-4 text-[10px] font-black uppercase tracking-wider text-sky-800 dark:text-sky-300 bg-sky-100 dark:bg-sky-900/60 px-2 py-0.5 rounded-lg w-fit">
            Active Policy
          </span>
        </div>

        {/* Rule 2: 5th Week Off-Day */}
        <div className="bg-[#fff7ed] dark:bg-amber-950/20 border-2 border-slate-900 dark:border-neutral-700 rounded-3xl p-6 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.06)] flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-5 h-5 text-amber-700 dark:text-amber-400" />
              <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">
                5th Week Off-Day Policy
              </h3>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
              When a month contains a 5th recurring weekday (e.g. 5th Saturday on 29 August 2026), classes are marked as OFF_DAY by default.
            </p>
          </div>
          <span className="inline-block mt-4 text-[10px] font-black uppercase tracking-wider text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/60 px-2 py-0.5 rounded-lg w-fit">
            Auto Enforced
          </span>
        </div>

        {/* Rule 3: Audit Trail */}
        <div className="bg-[#ecfdf5] dark:bg-emerald-950/20 border-2 border-slate-900 dark:border-neutral-700 rounded-3xl p-6 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.06)] flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />
              <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">
                Audit Trail Integrity
              </h3>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
              Every manual administrative correction requires a mandatory reason note and is permanently recorded with timestamp and admin ID.
            </p>
          </div>
          <span className="inline-block mt-4 text-[10px] font-black uppercase tracking-wider text-emerald-800 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/60 px-2 py-0.5 rounded-lg w-fit">
            Mandatory Logging
          </span>
        </div>
      </div>

      {/* Telegram Notification Dispatch Log */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-black text-slate-900 dark:text-white tracking-tight">
              Telegram Notification Dispatch Logs
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Live broadcast messages sent to parents upon attendance recording
            </p>
          </div>

          <button
            onClick={loadLogs}
            className="p-2 rounded-xl border-2 border-slate-900 dark:border-neutral-700 hover:bg-slate-100 dark:hover:bg-neutral-800 text-slate-700 dark:text-slate-300 transition-colors shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.1)]"
            title="Refresh logs"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {loading ? (
          <LoadingSkeleton count={3} type="card" />
        ) : (
          <div className="bg-white dark:bg-neutral-900 rounded-3xl border-2 border-slate-900 dark:border-neutral-700 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.06)] divide-y divide-slate-100 dark:divide-neutral-800 overflow-hidden">
            {logs.length === 0 ? (
              <p className="p-8 text-center text-xs text-slate-400">
                No Telegram notifications dispatched yet.
              </p>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-xs text-slate-900 dark:text-white">
                        {log.recipient_name}
                      </span>
                      <span className="font-mono text-[11px] text-indigo-600 dark:text-indigo-400 font-bold">
                        {log.recipient_telegram}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {new Date(log.created_at).toLocaleString()}
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 dark:text-slate-300 font-medium">
                      "{log.message}"
                    </p>
                  </div>

                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider self-start sm:self-center border ${
                      log.status === 'SENT'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300'
                        : log.status === 'QUEUED'
                        ? 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300'
                        : 'bg-rose-50 text-rose-800 border-rose-300 dark:bg-rose-950 dark:text-rose-300'
                    }`}
                  >
                    <CheckCircle2 className="w-3 h-3" />
                    {log.status}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};
