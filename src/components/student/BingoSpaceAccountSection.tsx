import React, { useEffect, useState } from 'react';
import { EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import type { Student } from '../../types.js';
import { api } from '../../lib/api.js';
import { clientAuth } from '../../lib/firebase.js';
import { useToast } from '../common/Toast.js';

const REAUTH_REQUIRED = 'REAUTH_REQUIRED';

/** Confirms the signed-in coach's own password so the next ID token carries a fresh auth_time. */
async function confirmOwnPassword(password: string): Promise<void> {
  const firebaseUser = clientAuth?.currentUser;
  if (!firebaseUser?.email) throw new Error('Your sign-in session is unavailable. Sign out and sign in again.');
  try {
    await reauthenticateWithCredential(firebaseUser, EmailAuthProvider.credential(firebaseUser.email, password));
    await firebaseUser.getIdToken(true);
  } catch (error) {
    const code = error instanceof FirebaseError ? error.code : '';
    if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') throw new Error('That password is incorrect.');
    if (code === 'auth/too-many-requests') throw new Error('Too many attempts. Please try again later.');
    throw new Error('Could not confirm your password. Please try again.');
  }
}

type Account = { linked: false } | { linked: true; student_name: string; bingo_space_id: string; attendance_student_id: string; username: string; password_status: 'RECOVERABLE' | 'UNRECOVERABLE' };

export function BingoSpaceAccountSection({ student }: { student: Student }) {
  const { showToast } = useToast();
  const [account, setAccount] = useState<Account | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [mode, setMode] = useState<'username' | 'password' | 'confirm' | null>(null);
  const [ownPassword, setOwnPassword] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [revealedPassword, setRevealedPassword] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    setAccount(null); setUnavailable(false); setMode(null); setRevealedPassword(null);
    api.getPortalAccount(student.id).then((value) => {
      if (active) { setAccount(value); setUsername(value.linked ? value.username : ''); }
    }).catch((error) => {
      if (active && !String(error.message).includes('404')) setUnavailable(true);
    });
    return () => { active = false; };
  }, [student.id]);

  useEffect(() => {
    if (revealedPassword === null) return;
    const hide = () => setRevealedPassword(null);
    const timer = window.setTimeout(hide, 60_000);
    window.addEventListener('blur', hide);
    return () => { window.clearTimeout(timer); window.removeEventListener('blur', hide); };
  }, [revealedPassword]);

  const revealPassword = async () => {
    const result = await api.revealPortalPassword(student.id);
    if (result.password_status === 'RECOVERABLE') setRevealedPassword(result.password);
    else setAccount((current) => current?.linked ? { ...current, password_status: 'UNRECOVERABLE' } : current);
  };

  const showPassword = async () => {
    if (revealedPassword !== null) { setRevealedPassword(null); return; }
    setBusy(true);
    try { await revealPassword(); }
    catch (error: any) {
      if (error?.data?.code === REAUTH_REQUIRED) { setOwnPassword(''); setMode('confirm'); }
      else showToast(error.message || 'Could not show password', 'error');
    }
    finally { setBusy(false); }
  };

  const confirmAndShowPassword = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true);
    try {
      await confirmOwnPassword(ownPassword);
      setOwnPassword(''); setMode(null);
      await revealPassword();
    } catch (error: any) { showToast(error.message || 'Could not show password', 'error'); }
    finally { setBusy(false); }
  };

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
      const result = await api.resetPortalPassword(student.id, password, confirmation);
      setRevealedPassword(null);
      if (result.password_status === 'RECOVERABLE') setAccount((current) => current?.linked ? { ...current, password_status: 'RECOVERABLE' } : current);
      setPassword(''); setConfirmation(''); setMode(null);
      showToast('Password reset successfully', 'success');
    } catch (error: any) { showToast(error.message || 'Could not reset password', 'error'); }
    finally { setBusy(false); }
  };

  if (unavailable) return <p className="text-xs font-medium text-amber-700">Bingo Space account details are temporarily unavailable.</p>;
  if (!account) return null;
  if (!account.linked) return <p className="text-xs font-medium text-amber-700">No verified Bingo Space account is linked to this Attendance ID. Ask an Admin to review the account before changing login details.</p>;
  return <section className="rounded-2xl border-2 border-slate-900 bg-slate-50 p-4 text-slate-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white">
    <h4 className="text-sm font-black">Student Login Details</h4>
    <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
      <div><span className="block text-slate-500">Student</span><strong>{account.student_name}</strong></div>
      <div><span className="block text-slate-500">Bingo Space record ID</span><strong className="break-all">{account.bingo_space_id}</strong></div>
      <div><span className="block text-slate-500">Linked Attendance ID</span><strong>{account.attendance_student_id || 'Not linked'}</strong></div>
      <div><span className="block text-slate-500">Username</span><strong>{account.username}</strong></div>
      <div><span className="block text-slate-500">Password</span>{account.password_status === 'RECOVERABLE'
        ? <><strong className="break-all">{revealedPassword ?? '••••••••'}</strong><button type="button" disabled={busy} onClick={showPassword} className="ml-2 text-xs font-bold underline">{revealedPassword === null ? 'Show Password' : 'Hide Password'}</button></>
        : <strong>Password unavailable — reset required.</strong>}</div>
    </div>
    {!mode && <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" onClick={() => { setUsername(account.username); setMode('username'); }} className="rounded-lg border border-slate-900 px-3 py-1.5 text-xs font-black dark:border-white">Change Username</button>
      <button type="button" onClick={() => setMode('password')} className="rounded-lg border border-slate-900 px-3 py-1.5 text-xs font-black dark:border-white">Change Password</button>
    </div>}
    {mode === 'confirm' && <form onSubmit={confirmAndShowPassword} className="mt-3 space-y-2">
      <p className="text-xs font-medium text-slate-600 dark:text-neutral-300">For security, confirm your own sign-in password to show this student's password.</p>
      <label className="block text-xs font-bold">Your password<input type="password" autoComplete="current-password" required autoFocus value={ownPassword} onChange={(event) => setOwnPassword(event.target.value)} className="mt-1 w-full rounded-lg border p-2 text-slate-900" /></label>
      <div className="flex gap-2"><button disabled={busy} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-black text-white">Confirm &amp; show</button><button type="button" onClick={() => { setOwnPassword(''); setMode(null); }} className="px-3 py-2 text-xs font-bold">Cancel</button></div>
    </form>}
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
