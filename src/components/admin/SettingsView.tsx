import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api.js';
import { useToast } from '../common/Toast.js';
import { NotificationLog } from '../../types.js';
import { LoadingSkeleton } from '../common/LoadingSkeleton.js';
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  ShieldCheck,
  Calendar,
  Sparkles,
  Info,
  RefreshCw,
  MessageSquare,
  Phone,
  User,
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
          Academy Rules & Parent Notifications
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Automated parent notification delivery status, audit logs, and standard academy rules
        </p>
      </div>

      {/* WhatsApp Delivery Channel Status Banner (Test Mode) */}
      <div className="bg-[#f0fdf4] dark:bg-emerald-950/20 border-2 border-slate-900 dark:border-emerald-800 rounded-3xl p-5 sm:p-6 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.06)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-emerald-200 dark:border-emerald-900/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center border-2 border-slate-900 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] flex-shrink-0">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                  WhatsApp Parent Notifications
                </h3>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-900 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
                  <Info className="w-3 h-3" />
                  Test Mode (WHATSAPP_ENABLED=false)
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 font-medium">
                Primary delivery channel for student attendance & replacement alerts
              </p>
            </div>
          </div>

          <div className="text-right sm:text-right">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block">
              Live Messaging
            </span>
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Standby / Simulated
            </span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="bg-white/80 dark:bg-neutral-900/80 p-3 rounded-2xl border border-emerald-200/80 dark:border-emerald-900/40">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Delivery Mechanism
            </span>
            <span className="font-semibold text-slate-900 dark:text-white">
              WhatsApp Cloud API (Meta)
            </span>
          </div>
          <div className="bg-white/80 dark:bg-neutral-900/80 p-3 rounded-2xl border border-emerald-200/80 dark:border-emerald-900/40">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Target Recipient
            </span>
            <span className="font-semibold text-slate-900 dark:text-white">
              Parent Phone (<code className="font-mono text-[11px]">parent.phone</code>)
            </span>
          </div>
          <div className="bg-white/80 dark:bg-neutral-900/80 p-3 rounded-2xl border border-emerald-200/80 dark:border-emerald-900/40">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Operational Mode
            </span>
            <span className="font-semibold text-amber-700 dark:text-amber-400">
              No real WhatsApp messages sent
            </span>
          </div>
        </div>
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
              When a month contains a 5th recurring weekday (e.g. 5th Saturday or 5th Sunday), classes are marked as OFF_DAY by default.
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

      {/* Parent Notification Dispatch Logs */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-black text-slate-900 dark:text-white tracking-tight">
              Parent Notification Dispatch Logs
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Audit trail of automated WhatsApp attendance alerts and legacy records
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
                No notification records logged yet.
              </p>
            ) : (
              logs.map((log) => {
                const isWhatsApp = log.channel === 'WHATSAPP';
                const timestamp = log.created_at || log.sent_at || '';
                const displayTime = timestamp ? new Date(timestamp).toLocaleString() : 'Just now';
                const recipientContact = log.recipient_phone || log.recipient_identifier || log.recipient_telegram || '—';

                return (
                  <div key={log.id} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="space-y-2 max-w-2xl">
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Channel Badge */}
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border ${
                            isWhatsApp
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                              : 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-neutral-800 dark:text-slate-300 dark:border-neutral-700'
                          }`}
                        >
                          {isWhatsApp ? 'WHATSAPP' : 'TELEGRAM (LEGACY)'}
                        </span>

                        <span className="flex items-center gap-1 font-bold text-xs text-slate-900 dark:text-white">
                          <User className="w-3 h-3 text-slate-400" />
                          {log.recipient_name || log.parent_name || 'Parent'}
                        </span>

                        <span className="flex items-center gap-1 font-mono text-[11px] text-slate-700 dark:text-slate-300 font-semibold bg-slate-100 dark:bg-neutral-800 px-2 py-0.5 rounded border border-slate-200 dark:border-neutral-700">
                          <Phone className="w-2.5 h-2.5 text-slate-400" />
                          {recipientContact}
                        </span>

                        {log.student_name && (
                          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                            (Student: {log.student_name})
                          </span>
                        )}

                        <span className="text-[10px] text-slate-400 ml-auto sm:ml-0">
                          {displayTime}
                        </span>
                      </div>

                      <p className="text-xs text-slate-600 dark:text-slate-300 font-medium whitespace-pre-line leading-relaxed bg-slate-50 dark:bg-neutral-800/50 p-2.5 rounded-xl border border-slate-100 dark:border-neutral-800">
                        {log.message}
                      </p>

                      {log.error_message && (
                        <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-800/40 px-2.5 py-1.5 rounded-lg flex items-start gap-1.5">
                          <Info className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                          <span>{log.error_message}</span>
                        </div>
                      )}
                    </div>

                    <div className="self-start sm:self-center flex-shrink-0">
                      <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                          log.status === 'SENT'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300'
                            : log.status === 'DISABLED'
                            ? 'bg-sky-50 text-sky-800 border-sky-300 dark:bg-sky-950 dark:text-sky-300'
                            : log.status === 'QUEUED'
                            ? 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300'
                            : 'bg-rose-50 text-rose-800 border-rose-300 dark:bg-rose-950 dark:text-rose-300'
                        }`}
                      >
                        {log.status === 'SENT' && <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
                        {log.status === 'DISABLED' && <Info className="w-3 h-3 text-sky-600" />}
                        {log.status === 'QUEUED' && <Clock className="w-3 h-3 text-amber-600" />}
                        {log.status === 'FAILED' && <AlertTriangle className="w-3 h-3 text-rose-600" />}
                        {log.status === 'DISABLED' ? 'TEST MODE (SIMULATED)' : log.status}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
};
