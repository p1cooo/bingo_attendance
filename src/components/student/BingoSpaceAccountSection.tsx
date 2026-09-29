import React, { useEffect, useState } from 'react';
import type { Student } from '../../types.js';
import { api } from '../../lib/api.js';
import { useToast } from '../common/Toast.js';

type Account = { linked: boolean; username: string; stars: number };

export function BingoSpaceAccountSection({ student }: { student: Student }) {
  const { showToast } = useToast();
  const [account, setAccount] = useState<Account | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [mode, setMode] = useState<'username' | 'password' | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    setAccount(null); setUnavailable(false); setMode(null);
    api.getPortalAccount(student.id).then((value) => {
      if (active) { setAccount(value); setUsername(value.username); }
    }).catch((error) => {
      if (active && !String(error.message).includes('404')) setUnavailable(true);
    });
    return () => { active = false; };
  }, [student.id]);

  const changeUsername = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true);
    try {
      const updated = await api.updatePortalUsername(student.id, username.trim());
      setAccount(updated); setMode(null); showToast('Username updated', 'success');
    } catch (error: any) { showToast(error.message || 'Could not update username', 'error'); }
    finally { setBusy(false); }
  };
  const resetPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password !== confirmation) { showToast('Passwords do not match', 'error'); return; }
    setBusy(true);
    try {
      await api.resetPortalPassword(student.id, password, confirmation);
      setPassword(''); setConfirmation(''); setMode(null);
      showToast('Password reset successfully', 'success');
    } catch (error: any) { showToast(error.message || 'Could not reset password', 'error'); }
    finally { setBusy(false); }
  };

  if (unavailable) return <p className="text-xs font-medium text-amber-700">Bingo Space account details are temporarily unavailable.</p>;
  if (!account?.linked) return null;
  return <section className="rounded-2xl border-2 border-slate-900 bg-slate-50 p-4 text-slate-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white">
    <h4 className="text-sm font-black">Bingo Space Account</h4>
    <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
      <div><span className="block text-slate-500">Status</span><strong className="text-emerald-700">Linked</strong></div>
      <div><span className="block text-slate-500">Username</span><strong>{account.username}</strong></div>
      <div><span className="block text-slate-500">Stars</span><strong>{account.stars}</strong></div>
    </div>
    {!mode && <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" onClick={() => { setUsername(account.username); setMode('username'); }} className="rounded-lg border border-slate-900 px-3 py-1.5 text-xs font-black dark:border-white">Change Username</button>
      <button type="button" onClick={() => setMode('password')} className="rounded-lg border border-slate-900 px-3 py-1.5 text-xs font-black dark:border-white">Reset Password</button>
    </div>}
    {mode === 'username' && <form onSubmit={changeUsername} className="mt-3 space-y-2">
      <label className="block text-xs font-bold">New username<input required minLength={3} maxLength={80} pattern="[A-Za-z0-9_-]+" value={username} onChange={(event) => setUsername(event.target.value)} className="mt-1 w-full rounded-lg border p-2 text-slate-900" /></label>
      <div className="flex gap-2"><button disabled={busy} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-black text-white">Save username</button><button type="button" onClick={() => setMode(null)} className="px-3 py-2 text-xs font-bold">Cancel</button></div>
    </form>}
    {mode === 'password' && <form onSubmit={resetPassword} className="mt-3 space-y-2">
      <label className="block text-xs font-bold">New password<input type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 w-full rounded-lg border p-2 text-slate-900" /></label>
      <label className="block text-xs font-bold">Confirm new password<input type="password" autoComplete="new-password" required minLength={8} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-1 w-full rounded-lg border p-2 text-slate-900" /></label>
      <div className="flex gap-2"><button disabled={busy} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-black text-white">Reset password</button><button type="button" onClick={() => { setPassword(''); setConfirmation(''); setMode(null); }} className="px-3 py-2 text-xs font-bold">Cancel</button></div>
    </form>}
  </section>;
}
