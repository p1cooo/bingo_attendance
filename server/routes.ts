import { Router, Response } from 'express';
import { db } from './db.js';
import { adminAuth, hasAdminCredentials } from './firebaseAdmin.js';
import {
  authenticateUser,
  requireAdmin,
  requireSuperAdmin,
  requireCoachOrAdmin,
  verifySessionAttendanceAccess,
  AuthenticatedRequest,
} from './auth.js';
import {
  AttendanceRecord,
  AttendanceStatus,
  AttendanceType,
  AcademyClass,
  ClassSchedule,
  ClassSession,
  MonthlyReportItem,
  MonthlyStudentReportItem,
  NotificationLog,
  Student,
  User,
  Coach,
} from '../src/types.js';
import { dispatchTelegramNotification } from './telegram.js';
import { notificationService } from './notifications/NotificationService.js';
import { validateBulkImport, commitBulkImport } from './bulkImport.js';
import { generateClassScheduleDocx } from './exportDocx.js';
import { syncDocToFirestore, deleteDocFromFirestore } from './firestoreSync.js';

export const router = Router();

// Auto-persist on successful mutating requests (POST, PUT, DELETE, PATCH)
router.use((req, res, next) => {
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    res.on('finish', () => {
      if (res.statusCode >= 200 && res.statusCode < 400) {
        db.saveToDisk();
      }
    });
  }
  next();
});

// ============================================================
// 1. AUTHENTICATION ENDPOINTS
// ============================================================

/**
 * Resolves a username, student ID, coach alias, or email input to the registered Firebase account email.
 * This does NOT verify or handle passwords, keeping credentials secure and handled by Firebase Auth.
 */
router.post('/auth/resolve-account', (req, res) => {
  const { input } = req.body;
  const loginInput = String(input || '').trim();

  if (!loginInput) {
    return res.status(400).json({ error: 'Username or email is required' });
  }

  const user = db.findUserByLogin(loginInput);

  if (!user) {
    return res.status(404).json({
      error: `Account "${loginInput}" not found. Please verify your username or email address.`,
    });
  }

  if (!user.is_active) {
    return res.status(403).json({ error: 'This user account is inactive' });
  }

  return res.json({
    success: true,
    email: user.email,
    name: user.name,
    role: user.role,
    userId: user.id,
  });
});

/**
 * Synchronizes client-side Firebase Auth sessions with backend database profile.
 * Verifies the Firebase ID Token using Firebase Admin SDK.
 */
router.use('/auth/firebase-session', authenticateUser, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  return res.json({
    token: req.headers.authorization!.slice(7).trim(),
    user,
    coach_profile: user.coach_id ? db.coaches.get(user.coach_id) : undefined,
    student_profile: user.student_id ? db.getPopulatedStudent(user.student_id) : undefined,
  });
});

// ============================================================
// SUPER ADMIN PROVISIONING & ACCOUNT MANAGEMENT ENDPOINTS
// ============================================================

/**
 * Checks whether an initial Super Admin account has been provisioned.
 */
router.get('/admin/provision-status', (req, res) => {
  const hasSuperAdmin = Array.from(db.users.values()).some((u) => u.role === 'SUPER_ADMIN');
  return res.json({
    isProvisioned: hasSuperAdmin,
    defaultUsername: null,
  });
});

/**
 * Secure one-time initial provisioning of a Super Admin.
 * Only accessible if no SUPER_ADMIN exists in the database.
 * Directly creates credentials in Firebase Auth and avoids plaintext storage.
 */
router.post('/admin/provision-superadmin', async (req, res) => {
  const existingSuperAdmin = Array.from(db.users.values()).find((u) => u.role === 'SUPER_ADMIN');
  if (existingSuperAdmin) {
    return res.status(403).json({
      error: 'Forbidden: Super Admin has already been provisioned. Log in with your credentials.',
    });
  }

  const {
    password,
    username,
    email,
    displayName,
  } = req.body;

  if (!username || !email || !displayName || !password || typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Username, email, display name, and a password of at least 6 characters are required.' });
  }

  const cleanUsername = String(username).trim().toLowerCase();
  const cleanEmail = String(email).trim().toLowerCase();

  if (!hasAdminCredentials || !adminAuth) {
    return res.status(503).json({ error: 'Firebase Admin is not configured; Super Admin provisioning is unavailable.', code: 'FIREBASE_ADMIN_UNAVAILABLE' });
  }

  let fbUserUid = '';
  let fbSuccess = false;

  // 1. Attempt Firebase Authentication synchronization
  try {
    if (typeof adminAuth.getUserByEmail === 'function') {
      try {
        const existingFbUser = await adminAuth.getUserByEmail(cleanEmail);
        if (existingFbUser && existingFbUser.uid) {
          fbUserUid = existingFbUser.uid;
          await adminAuth.updateUser(existingFbUser.uid, {
            password,
            displayName: displayName || 'Super Admin',
            disabled: false,
          });
          fbSuccess = true;
        }
      } catch (notFoundErr: any) {
        // If user does not exist in Firebase Auth, create them
        try {
          const newFbUser = await adminAuth.createUser({
            email: cleanEmail,
            password,
            displayName: displayName || 'Super Admin',
          });
          if (newFbUser && newFbUser.uid) {
            fbUserUid = newFbUser.uid;
            fbSuccess = true;
          }
        } catch (createErr: any) {
          console.warn('[Provision] Firebase Admin createUser note:', createErr?.message);
        }
      }

      if (fbSuccess) {
        try {
          await adminAuth.setCustomUserClaims(fbUserUid, { role: 'SUPER_ADMIN' });
        } catch (claimErr: any) {
          console.warn('[Provision] Custom claims note:', claimErr?.message);
        }
      }
    }
  } catch (authErr: any) {
    console.error('[Provision] Firebase Admin Auth sync failed:', authErr?.message);
    return res.status(502).json({ error: 'Firebase Authentication could not create the Super Admin account.', code: 'FIREBASE_AUTH_WRITE_FAILED' });
  }

  if (!fbSuccess || !fbUserUid) {
    return res.status(502).json({ error: 'Firebase Authentication could not create the Super Admin account.', code: 'FIREBASE_AUTH_WRITE_FAILED' });
  }

  // 2. Save user to database and sync to Firestore
  try {
    const superAdminUser: User = {
      id: fbUserUid,
      username: cleanUsername,
      email: cleanEmail,
      name: displayName || 'Super Admin',
      role: 'SUPER_ADMIN',
      is_active: true,
      created_at: new Date().toISOString(),
    };

    db.users.set(superAdminUser.id, superAdminUser);
    try {
      db.saveToDisk();
    } catch (diskErr) {
      console.warn('[Provision] Save to disk note:', diskErr);
    }

    await syncDocToFirestore('users', superAdminUser.id, superAdminUser);

    return res.json({
      success: true,
      message: 'Super Admin account provisioned successfully. You may now log in.',
      user: {
        id: superAdminUser.id,
        username: superAdminUser.username,
        email: superAdminUser.email,
        name: superAdminUser.name,
        role: superAdminUser.role,
      },
    });
  } catch (err: any) {
    console.error('[Provision] Error saving Super Admin:', err);
    return res.status(500).json({ error: err.message || 'Failed to provision Super Admin account.' });
  }
});

/**
 * List all registered user accounts with linked profile information.
 * Accessible to Administrators and Super Administrators.
 */
router.get('/admin/users', authenticateUser, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const usersList = Array.from(db.users.values()).map((user) => {
    const coach = user.coach_id ? db.coaches.get(user.coach_id) : undefined;
    const student = user.student_id ? db.getPopulatedStudent(user.student_id) : undefined;
    return {
      ...user,
      coach_profile: coach,
      student_profile: student,
    };
  });

  return res.json({ users: usersList });
});

/**
 * Create a new user account (Coach, Staff, Student, or Admin).
 * Uses Firebase Admin SDK to register credentials without storing plaintext passwords.
 * Accessible to Administrators and Super Administrators.
 */
router.post('/admin/users', authenticateUser, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { username, email, displayName, role, password, coach_id, student_id } = req.body;

    if (!email || !password || !role || !displayName) {
      return res.status(400).json({ error: 'Display Name, Email, Role, and Password are required.' });
    }

    // Validate role is strictly one of the 3 allowed roles
    if (role !== 'COACH' && role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
      return res.status(400).json({ error: 'Invalid role. Valid roles are SUPER_ADMIN, ADMIN, and COACH.' });
    }

    // Privilege Guard: ADMIN can ONLY create COACH accounts
    if (req.user?.role === 'ADMIN' && role !== 'COACH') {
      return res.status(403).json({ error: 'Forbidden: Administrators can only create Coach accounts.' });
    }

    // Privilege Guard: Only Super Admins can create Admin or Super Admin accounts
    if ((role === 'ADMIN' || role === 'SUPER_ADMIN') && req.user?.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Forbidden: Only Super Administrators can create Administrator or Super Administrator accounts.' });
    }

    if (typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanUsername = username ? String(username).trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '') : cleanEmail.split('@')[0];

    // Check if user already exists
    const existingUser = Array.from(db.users.values()).find((u) => u.email.toLowerCase() === cleanEmail);

    let finalUid = existingUser ? existingUser.id : `user-${Date.now()}`;

    // Firebase Auth creation is authoritative. Never report a local-only
    // account as created when the Admin SDK operation failed.
    if (!hasAdminCredentials || !adminAuth) {
      return res.status(503).json({ error: 'Firebase Admin is not configured.', code: 'FIREBASE_ADMIN_UNAVAILABLE' });
    }
    let fbUser;
    try {
      try {
        fbUser = await adminAuth.getUserByEmail(cleanEmail);
        finalUid = fbUser.uid;
        await adminAuth.updateUser(fbUser.uid, { password, displayName, disabled: false });
      } catch (lookupError: any) {
        if (lookupError?.code !== 'auth/user-not-found') throw lookupError;
        fbUser = await adminAuth.createUser({ email: cleanEmail, password, displayName });
        finalUid = fbUser.uid;
      }
      await adminAuth.setCustomUserClaims(finalUid, { role });
    } catch (fbErr: any) {
      console.error('[Admin Create User] Firebase Auth operation failed:', fbErr?.code || fbErr?.message);
      return res.status(502).json({ error: 'Firebase Authentication could not create this account. No Academy profile was saved.', code: 'FIREBASE_AUTH_WRITE_FAILED' });
    }

    // 2. Create or update database record
    const newUser: User = {
      id: finalUid,
      username: cleanUsername,
      email: cleanEmail,
      name: displayName,
      role,
      coach_id: coach_id || existingUser?.coach_id || undefined,
      student_id: student_id || existingUser?.student_id || undefined,
      is_active: true,
      created_at: existingUser ? existingUser.created_at : new Date().toISOString(),
    };

    await syncDocToFirestore('users', newUser.id, newUser);
    db.users.set(newUser.id, newUser);
    db.saveToDisk();

    return res.status(201).json({
      success: true,
      message: `Account for ${displayName} (${role}) configured successfully.`,
      user: newUser,
    });
  } catch (err: any) {
    console.error('[Admin Create User] Error:', err);
    return res.status(500).json({ error: err.message || 'Failed to create user account.' });
  }
});

/**
 * Update an existing user account (role, status, username, linked profile, or password).
 * Accessible to Administrators and Super Administrators.
 */
router.patch('/admin/users/:id', authenticateUser, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const user = db.users.get(id);

  if (!user) {
    return res.status(404).json({ error: 'User account not found.' });
  }

  const { name, role, username, email, is_active, coach_id, student_id, password } = req.body;

  // Role hierarchy guard:
  // Administrators can only modify Coach accounts and cannot promote anyone to Admin or Super Admin
  if (req.user?.role === 'ADMIN') {
    if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Forbidden: Administrators cannot modify Administrator or Super Administrator accounts.' });
    }
    if (role && role !== 'COACH') {
      return res.status(403).json({ error: 'Forbidden: Administrators cannot assign Administrator or Super Administrator privileges.' });
    }
  }

  // Only Super Admins can modify Super Admin accounts or promote users to Super Admin
  if ((user.role === 'SUPER_ADMIN' || role === 'SUPER_ADMIN') && req.user?.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'Forbidden: Only Super Administrators can modify Super Admin accounts or grant Super Admin privileges.' });
  }

  try {
    // Update Firebase Auth if credentials available
    if (hasAdminCredentials && adminAuth) {
      try {
        const fbUpdates: any = {};
        if (typeof is_active === 'boolean') {
          fbUpdates.disabled = !is_active;
        }
        if (name) {
          fbUpdates.displayName = name;
        }
        if (password && typeof password === 'string' && password.length >= 6) {
          fbUpdates.password = password;
        }

        if (Object.keys(fbUpdates).length > 0) {
          await adminAuth.updateUser(user.id, fbUpdates);
        }

        if (role && role !== user.role) {
          await adminAuth.setCustomUserClaims(user.id, { role });
        }
      } catch (fbErr) {
        console.warn('[Admin Patch User] Firebase Auth update note:', fbErr);
      }
    }

    // Update database record
    if (name !== undefined) user.name = name;
    if (role !== undefined) user.role = role;
    if (username !== undefined) user.username = String(username).trim().toLowerCase();
    if (email !== undefined) user.email = String(email).trim().toLowerCase();
    if (is_active !== undefined) user.is_active = is_active;
    if (coach_id !== undefined) user.coach_id = coach_id || undefined;
    if (student_id !== undefined) user.student_id = student_id || undefined;

    db.users.set(user.id, user);
    db.saveToDisk();
    syncDocToFirestore('users', user.id, user).catch(console.error);

    return res.json({
      success: true,
      message: 'User account updated successfully.',
      user,
    });
  } catch (err: any) {
    console.error('[Admin Patch User] Error:', err);
    return res.status(500).json({ error: err.message || 'Failed to update user.' });
  }
});

/**
 * Reset a user's password directly in Firebase Auth.
 * Accessible to Administrators and Super Administrators.
 */
router.post('/admin/users/:id/reset-password', authenticateUser, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const user = db.users.get(id);

  if (!user) {
    return res.status(404).json({ error: 'User account not found.' });
  }

  // Guard: Administrators cannot reset password for Admin or Super Admin accounts
  if (req.user?.role === 'ADMIN' && (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN')) {
    return res.status(403).json({ error: 'Forbidden: Administrators cannot reset passwords for Administrator or Super Administrator accounts.' });
  }

  // Guard: Only Super Admins can reset Super Admin passwords
  if (user.role === 'SUPER_ADMIN' && req.user?.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'Forbidden: Only Super Administrators can reset Super Admin passwords.' });
  }

  const { newPassword } = req.body;
  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters long.' });
  }

  try {
    if (hasAdminCredentials && adminAuth) {
      try {
        await adminAuth.updateUser(user.id, { password: newPassword });
      } catch (fbErr) {
        console.warn('[Admin Reset Password] Firebase Auth note:', fbErr);
      }
    }
    return res.json({
      success: true,
      message: `Password for ${user.name} (${user.email}) has been reset successfully.`,
    });
  } catch (err: any) {
    console.error('[Admin Reset Password] Error:', err);
    return res.status(500).json({ error: err.message || 'Failed to reset password.' });
  }
});

/**
 * Delete or remove a user account.
 * Accessible to Administrators and Super Administrators.
 */
router.delete('/admin/users/:id', authenticateUser, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const currentReqUser = req.user!;

  if (currentReqUser.id === id) {
    return res.status(400).json({ error: 'You cannot delete your own active administrator account.' });
  }

  const user = db.users.get(id);
  if (!user) {
    return res.status(404).json({ error: 'User account not found.' });
  }

  // Guard: Administrators cannot delete Admin or Super Admin accounts
  if (req.user?.role === 'ADMIN' && (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN')) {
    return res.status(403).json({ error: 'Forbidden: Administrators cannot delete Administrator or Super Administrator accounts.' });
  }

  // Guard: Only Super Admin can delete Super Admin account
  if (user.role === 'SUPER_ADMIN' && req.user?.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'Forbidden: Only Super Administrators can delete Super Admin accounts.' });
  }

  try {
    if (hasAdminCredentials && adminAuth) {
      try {
        await adminAuth.deleteUser(user.id);
      } catch (fbErr) {
        console.warn('[Admin Delete User] Firebase Auth delete note:', fbErr);
      }
    }

    db.users.delete(user.id);
    db.saveToDisk();
    deleteDocFromFirestore('users', user.id).catch(console.error);

    return res.json({
      success: true,
      message: `User ${user.name} (${user.email}) removed successfully.`,
    });
  } catch (err: any) {
    console.error('[Admin Delete User] Error:', err);
    return res.status(500).json({ error: err.message || 'Failed to delete user.' });
  }
});

router.post('/auth/login', (_req, res) => {
  return res.status(410).json({
    error: 'Password login is handled by Firebase Authentication. Please update the client configuration if this endpoint is being called.',
    code: 'FIREBASE_AUTH_REQUIRED',
  });
});

router.get('/auth/me', authenticateUser, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const coachProfile = user.coach_id ? db.coaches.get(user.coach_id) : undefined;
  const studentProfile = user.student_id ? db.getPopulatedStudent(user.student_id) : undefined;

  return res.json({
    user,
    coach_profile: coachProfile,
    student_profile: studentProfile,
  });
});

router.get('/student/me/profile', authenticateUser, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const studentId = user.student_id || Array.from(db.students.values())[0]?.id;
  if (!studentId) {
    return res.status(404).json({ error: 'Student record not found' });
  }
  const populated = db.getPopulatedStudent(studentId);
  return res.json(populated);
});

router.post('/auth/logout', authenticateUser, (req: AuthenticatedRequest, res: Response) => {
  return res.json({ message: 'Logged out successfully' });
});

// ============================================================
// 2. COACHES MANAGEMENT
// ============================================================

router.get('/coaches', authenticateUser, (req: AuthenticatedRequest, res: Response) => {
  const coachesList = Array.from(db.coaches.values()).map((coach) => {
    // Calculate active schedule count
    const activeScheduleCount = Array.from(db.schedules.values()).filter(
      (s) => s.coach_id === coach.id && s.status === 'ACTIVE'
    ).length;

    return {
      ...coach,
      active_schedules_count: activeScheduleCount,
    };
  });

  return res.json(coachesList);
});

router.post('/coaches', authenticateUser, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { name, email, phone, color, color_name, bio } = req.body;

  if (!name || !email) {
    return res.status(400).json({ error: 'Coach name and email are required' });
  }

  const cleanEmail = String(email).trim().toLowerCase();
  const coachId = `coach-${Date.now()}`;
  const newCoach: Coach = {
    id: coachId,
    name: String(name).trim(),
    email: cleanEmail,
    phone: phone ? String(phone).trim() : '',
    color: color || '#3b82f6',
    color_name: color_name || 'Pastel Blue',
    is_active: true,
    bio: bio ? String(bio).trim() : '',
    created_at: new Date().toISOString(),
  };

  try {
    // Link the Firebase-authenticated account created by /admin/users.
    const existingUser = Array.from(db.users.values()).find((u) => u.email.toLowerCase() === cleanEmail);
    if (!existingUser) {
      return res.status(400).json({ error: 'Create the Firebase account before creating the coach profile.' });
    }
    existingUser.coach_id = coachId;
    existingUser.role = 'COACH';

    await Promise.all([
      syncDocToFirestore('users', existingUser.id, existingUser),
      syncDocToFirestore('coaches', coachId, newCoach),
    ]);
    db.users.set(existingUser.id, existingUser);
    db.coaches.set(coachId, newCoach);
    db.saveToDisk();
    return res.status(201).json(newCoach);
  } catch (error: any) {
    console.error('[Create Coach] Firestore write failed:', error?.message || error);
    return res.status(503).json({ error: 'Coach could not be saved to Firestore. Please retry.', code: 'FIRESTORE_WRITE_FAILED' });
  }
});

router.put('/coaches/:id', authenticateUser, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const coach = db.coaches.get(id);

  if (!coach) {
    return res.status(404).json({ error: 'Coach not found' });
  }

  const { name, email, phone, color, color_name, bio, is_active } = req.body;

  if (name !== undefined) coach.name = String(name).trim();
  if (email !== undefined) coach.email = String(email).trim();
  if (phone !== undefined) coach.phone = String(phone).trim();
  if (color !== undefined) coach.color = color;
  if (color_name !== undefined) coach.color_name = color_name;
  if (bio !== undefined) coach.bio = String(bio).trim();
  if (is_active !== undefined) coach.is_active = Boolean(is_active);

  db.coaches.set(id, coach);

  // Update associated user account if exists
  const associatedUser = Array.from(db.users.values()).find((u) => u.coach_id === id);
  if (associatedUser) {
    if (name !== undefined) associatedUser.name = coach.name;
    if (email !== undefined) associatedUser.email = coach.email;
    if (is_active !== undefined) associatedUser.is_active = coach.is_active;
    db.users.set(associatedUser.id, associatedUser);
  }

  return res.json(coach);
});

router.delete('/coaches/:id', authenticateUser, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const coach = db.coaches.get(id);

  if (!coach) {
    return res.status(404).json({ error: 'Coach not found' });
  }

  try {
    const user = Array.from(db.users.values()).find((u) => u.coach_id === id);
    if (user && adminAuth) await adminAuth.deleteUser(user.id);
    await Promise.all([
      deleteDocFromFirestore('coaches', id),
      ...(user ? [deleteDocFromFirestore('users', user.id)] : []),
    ]);
    db.coaches.delete(id);
    if (user) db.users.delete(user.id);
    db.saveToDisk();
    return res.json({ success: true, message: `Coach ${coach.name} deleted successfully` });
  } catch (error: any) {
    console.error('[Delete Coach] Firestore/Auth delete failed:', error?.message || error);
    return res.status(503).json({ error: 'Coach could not be deleted completely. Please retry.', code: 'DELETE_FAILED' });
  }
});

// ============================================================
// 3. STUDENTS & PARENTS MANAGEMENT
// ============================================================

router.get('/students', authenticateUser, (req: AuthenticatedRequest, res: Response) => {
  const { search, coach_id, class_id, status } = req.query;

  let list = Array.from(db.students.values()).map((s) => db.getPopulatedStudent(s.id)!);

  if (status) {
    list = list.filter((s) => s.status === status);
  }

  if (coach_id) {
    list = list.filter((s) =>
      s.enrolled_schedules?.some((sch) => {
        const fullSched = db.schedules.get(sch.schedule_id);
        return fullSched?.coach_id === coach_id;
      })
    );
  }

  if (class_id) {
    list = list.filter((s) =>
      s.enrolled_schedules?.some((sch) => {
        const fullSched = db.schedules.get(sch.schedule_id);
        return fullSched?.class_id === class_id;
      })
    );
  }

  if (search) {
    const q = String(search).trim().toLowerCase();
    list = list.filter(
      (s) =>
        s.full_name.toLowerCase().includes(q) ||
        s.student_id.toLowerCase().includes(q) ||
        (s.nick_name && s.nick_name.toLowerCase().includes(q)) ||
        (s.school && s.school.toLowerCase().includes(q)) ||
        (s.parent && s.parent.name.toLowerCase().includes(q))
    );
  }

  return res.json(list);
});

router.get('/students/:id', authenticateUser, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const student = db.getPopulatedStudent(id);

  if (!student) {
    return res.status(404).json({ error: 'Student not found' });
  }

  // Get past attendance history for this student
  const studentAttendanceRecords = Array.from(db.attendance.values())
    .filter((a) => a.student_id === id)
    .map((a) => {
      const sess = db.sessions.get(a.session_id);
      const cls = sess ? db.classes.get(sess.class_id) : undefined;
      const coach = sess ? db.coaches.get(sess.actual_coach_id) : undefined;
      return {
        ...a,
        session_date: sess?.session_date,
        start_time: sess?.start_time,
        class_name: cls?.name,
        coach_name: coach?.name,
        coach_color: coach?.color,
      };
    })
    .sort((a, b) => (b.session_date || '').localeCompare(a.session_date || ''));

  return res.json({
    ...student,
    attendance_history: studentAttendanceRecords,
  });
});

router.post('/students', authenticateUser, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const {
    student_id,
    full_name,
    nick_name,
    school,
    parent_name,
    parent_phone,
    parent_email,
    parent_telegram,
    parent_relation,
    schedule_ids,
  } = req.body;

  if (!full_name) {
    return res.status(400).json({ error: 'Student full name is required' });
  }

  // Generate unique student ID if not provided
  let finalStudentId = student_id ? String(student_id).trim().toUpperCase() : '';
  if (!finalStudentId) {
    const count = db.students.size + 1;
    finalStudentId = `STU-0${100 + count}`;
  }

  // Check student ID uniqueness
  const existingWithId = Array.from(db.students.values()).find(
    (s) => s.student_id === finalStudentId
  );
  if (existingWithId) {
    return res.status(400).json({ error: `Student ID ${finalStudentId} is already in use` });
  }

  // Create or link parent
  let parentId: string | undefined;
  if (parent_name || parent_phone) {
    parentId = `parent-${Date.now()}`;
    db.parents.set(parentId, {
      id: parentId,
      name: String(parent_name || 'Guardian').trim(),
      phone: String(parent_phone || '').trim(),
      email: parent_email ? String(parent_email).trim() : undefined,
      telegram_username: parent_telegram ? String(parent_telegram).trim() : undefined,
      telegram_chat_id: parent_telegram ? `tg-${Date.now()}` : undefined,
      created_at: new Date().toISOString(),
    });
  }

  const stuId = `stu-${Date.now()}`;
  const newStudent: Student = {
    id: stuId,
    student_id: finalStudentId,
    full_name: String(full_name).trim(),
    nick_name: nick_name ? String(nick_name).trim() : undefined,
    school: school ? String(school).trim() : undefined,
    parent_id: parentId,
    parent_relation: parent_relation ? String(parent_relation).trim() : 'Parent',
    status: 'ACTIVE',
    created_at: new Date().toISOString(),
  };

  const recordsToPersist: Array<[string, string, unknown]> = [];
  if (parentId) recordsToPersist.push(['parents', parentId, db.parents.get(parentId)!]);
  recordsToPersist.push(['students', stuId, newStudent]);
  db.students.set(stuId, newStudent);

  // Enroll in schedules if provided
  if (Array.isArray(schedule_ids) && schedule_ids.length > 0) {
    schedule_ids.forEach((schedId) => {
      if (db.schedules.has(schedId)) {
        const memId = `m-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
        const membership = {
          id: memId,
          student_id: stuId,
          schedule_id: schedId,
          joined_date: new Date().toISOString().split('T')[0],
          status: 'ACTIVE' as const,
        };
        db.memberships.set(memId, membership);
        recordsToPersist.push(['memberships', memId, membership]);
      }
    });
  }

  try {
    await Promise.all(recordsToPersist.map(([collection, id, record]) => syncDocToFirestore(collection, id, record)));
    db.saveToDisk();
    return res.status(201).json(db.getPopulatedStudent(stuId));
  } catch (error: any) {
    console.error('[Create Student] Firestore write failed:', error?.message || error);
    return res.status(503).json({ error: 'Student could not be saved to Firestore. Please retry.', code: 'FIRESTORE_WRITE_FAILED' });
  }
});

router.post('/students/bulk', authenticateUser, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { students } = req.body;
  if (!Array.isArray(students) || students.length === 0) {
    return res.status(400).json({ error: 'Array of students is required.' });
  }

  const created: any[] = [];
  const errors: { row: number; full_name?: string; feedback: string }[] = [];

  students.forEach((item: any, idx: number) => {
    const rowNum = idx + 1;
    const {
      full_name,
      nick_name,
      school,
      parent_name,
      parent_phone,
      parent_email,
      parent_relation,
      schedule_ids,
      status,
      student_id,
    } = item;

    if (!full_name || !String(full_name).trim()) {
      errors.push({ row: rowNum, full_name, feedback: 'Student full name is required.' });
      return;
    }

    const cleanFullName = String(full_name).trim();

    // Check duplicate student name or student ID
    let finalStudentId = student_id ? String(student_id).trim().toUpperCase() : '';
    if (!finalStudentId) {
      const count = db.students.size + created.length + 1;
      finalStudentId = `STU-0${100 + count}`;
    }

    const existingWithId = Array.from(db.students.values()).find(
      (s) => s.student_id === finalStudentId
    );
    if (existingWithId) {
      errors.push({ row: rowNum, full_name: cleanFullName, feedback: `Student ID ${finalStudentId} is already in use.` });
      return;
    }

    // Verify schedule_ids if provided
    const validScheduleIds: string[] = [];
    const invalidScheduleIds: string[] = [];
    if (Array.isArray(schedule_ids) && schedule_ids.length > 0) {
      schedule_ids.forEach((sid: string) => {
        const cleanSid = String(sid).trim();
        if (db.schedules.has(cleanSid) || db.classes.has(cleanSid)) {
          validScheduleIds.push(cleanSid);
        } else {
          invalidScheduleIds.push(cleanSid);
        }
      });
    }

    if (invalidScheduleIds.length > 0) {
      errors.push({
        row: rowNum,
        full_name: cleanFullName,
        feedback: `Schedule ID(s) not found: ${invalidScheduleIds.join(', ')}.`,
      });
      return;
    }

    // Create or link parent
    let parentId: string | undefined;
    if (parent_name || parent_phone || parent_email) {
      parentId = `parent-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      db.parents.set(parentId, {
        id: parentId,
        name: String(parent_name || 'Guardian').trim(),
        phone: String(parent_phone || '').trim(),
        email: parent_email ? String(parent_email).trim() : undefined,
        created_at: new Date().toISOString(),
      });
    }

    const stuId = `stu-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const newStudent: Student = {
      id: stuId,
      student_id: finalStudentId,
      full_name: cleanFullName,
      nick_name: nick_name ? String(nick_name).trim() : undefined,
      school: school ? String(school).trim() : undefined,
      parent_id: parentId,
      parent_relation: parent_relation ? String(parent_relation).trim() : 'Parent',
      status: status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
      created_at: new Date().toISOString(),
    };

    db.students.set(stuId, newStudent);

    // Enroll in schedules
    validScheduleIds.forEach((schedId) => {
      const memId = `m-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      db.memberships.set(memId, {
        id: memId,
        student_id: stuId,
        schedule_id: schedId,
        joined_date: new Date().toISOString().split('T')[0],
        status: 'ACTIVE',
      });
    });

    const populated = db.getPopulatedStudent(stuId);
    created.push(populated);
  });

  db.saveToDisk();

  return res.status(200).json({
    success: true,
    message: `Imported ${created.length} students successfully.${errors.length > 0 ? ` ${errors.length} rows had errors.` : ''}`,
    importedCount: created.length,
    errorCount: errors.length,
    created,
    errors,
  });
});

router.put('/students/:id', authenticateUser, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const student = db.students.get(id);

  if (!student) {
    return res.status(404).json({ error: 'Student not found' });
  }

  const {
    student_id,
    full_name,
    nick_name,
    school,
    parent_name,
    parent_phone,
    parent_email,
    parent_telegram,
    parent_relation,
    status,
    schedule_ids,
  } = req.body;

  if (student_id !== undefined) student.student_id = String(student_id).trim().toUpperCase();
  if (full_name !== undefined) student.full_name = String(full_name).trim();
  if (nick_name !== undefined) student.nick_name = String(nick_name).trim();
  if (school !== undefined) student.school = String(school).trim();
  if (parent_relation !== undefined) student.parent_relation = String(parent_relation).trim();
  if (status !== undefined) student.status = status;

  // Update parent info
  if (student.parent_id && db.parents.has(student.parent_id)) {
    const parent = db.parents.get(student.parent_id)!;
    if (parent_name !== undefined) parent.name = String(parent_name).trim();
    if (parent_phone !== undefined) parent.phone = String(parent_phone).trim();
    if (parent_email !== undefined) parent.email = String(parent_email).trim();
    if (parent_telegram !== undefined) parent.telegram_username = String(parent_telegram).trim();
    db.parents.set(parent.id, parent);
  } else if (parent_name || parent_phone) {
    const newParentId = `parent-${Date.now()}`;
    db.parents.set(newParentId, {
      id: newParentId,
      name: String(parent_name || 'Guardian').trim(),
      phone: String(parent_phone || '').trim(),
      email: parent_email ? String(parent_email).trim() : undefined,
      telegram_username: parent_telegram ? String(parent_telegram).trim() : undefined,
      created_at: new Date().toISOString(),
    });
    student.parent_id = newParentId;
  }

  db.students.set(id, student);

  // Update schedule memberships if schedule_ids array provided
  if (Array.isArray(schedule_ids)) {
    // Remove existing memberships
    Array.from(db.memberships.entries()).forEach(([mId, m]) => {
      if (m.student_id === id) {
        db.memberships.delete(mId);
      }
    });

    // Add new memberships
    schedule_ids.forEach((schedId) => {
      if (db.schedules.has(schedId)) {
        const memId = `m-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
        db.memberships.set(memId, {
          id: memId,
          student_id: id,
          schedule_id: schedId,
          joined_date: new Date().toISOString().split('T')[0],
          status: 'ACTIVE',
        });
      }
    });
  }

  const populated = db.getPopulatedStudent(id);
  return res.json(populated);
});

router.delete('/students/:id', authenticateUser, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const student = db.students.get(id);

  if (!student) {
    return res.status(404).json({ error: 'Student not found' });
  }

  const membershipIds = Array.from(db.memberships.entries()).flatMap(([mId, m]) => {
    if (m.student_id === id) {
      return [mId];
    }
    return [];
  });
  try {
    await Promise.all([
      deleteDocFromFirestore('students', id),
      ...membershipIds.map((membershipId) => deleteDocFromFirestore('memberships', membershipId)),
    ]);
    membershipIds.forEach((membershipId) => db.memberships.delete(membershipId));
    db.students.delete(id);
    db.saveToDisk();
    return res.json({ success: true, message: `Student ${student.full_name} deleted successfully` });
  } catch (error: any) {
    console.error('[Delete Student] Firestore delete failed:', error?.message || error);
    return res.status(503).json({ error: 'Student could not be deleted completely. Please retry.', code: 'DELETE_FAILED' });
  }
});

// ============================================================
// 4. CLASSES (PERMANENT RECURRING ACADEMY CLASSES)
// ============================================================

router.get('/classes', authenticateUser, (req: AuthenticatedRequest, res: Response) => {
  const { coach_id, class_type, day_of_week, status, search } = req.query;

  let list = Array.from(db.classes.values()).map((c) => db.getPopulatedClass(c.id)!);

  if (coach_id) {
    list = list.filter((c) => c.default_coach_id === coach_id);
  }

  if (class_type) {
    list = list.filter((c) => c.class_type === class_type);
  }

  if (day_of_week !== undefined && day_of_week !== '') {
    list = list.filter((c) => c.day_of_week === Number(day_of_week));
  }

  if (status) {
    const isActive = status === 'ACTIVE';
    list = list.filter((c) => (status === 'ALL' ? true : c.is_active === isActive));
  }

  if (search) {
    const q = String(search).trim().toLowerCase();
    list = list.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.default_coach?.name && c.default_coach.name.toLowerCase().includes(q)) ||
        (c.room_location && c.room_location.toLowerCase().includes(q)) ||
        (c.description && c.description.toLowerCase().includes(q))
    );
  }

  return res.json(list);
});

router.get('/classes/:id', authenticateUser, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const cls = db.getPopulatedClass(id);
  if (!cls) {
    return res.status(404).json({ error: 'Class not found' });
  }
  return res.json(cls);
});

router.post('/classes', authenticateUser, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const {
    name,
    class_type,
    day_of_week,
    start_time,
    end_time,
    default_coach_id,
    coach_id,
    room_location,
    description,
    default_duration_mins,
    default_capacity,
    student_ids,
  } = req.body;

  if (!name || !class_type) {
    return res.status(400).json({ error: 'Class name and class type are required' });
  }

  const assignedCoachId = default_coach_id || coach_id || 'coach-1';
  const classId = `class-${Date.now()}`;
  const newClass: AcademyClass = {
    id: classId,
    name: String(name).trim(),
    class_type: class_type as 'GROUP' | 'INDIVIDUAL',
    day_of_week: day_of_week !== undefined ? Number(day_of_week) : 6,
    start_time: start_time || '09:30',
    end_time: end_time || '11:00',
    default_coach_id: assignedCoachId,
    room_location: room_location ? String(room_location).trim() : 'Chess Hall A',
    description: description ? String(description).trim() : '',
    default_duration_mins: Number(default_duration_mins) || 90,
    default_capacity: Number(default_capacity) || 8,
    is_active: true,
    created_at: new Date().toISOString(),
  };

  const recordsToPersist: Array<[string, string, unknown]> = [['classes', classId, newClass]];
  db.classes.set(classId, newClass);

  // Synchronize recurring schedule
  const newSched: ClassSchedule = {
    id: classId,
    class_id: classId,
    coach_id: assignedCoachId,
    default_coach_id: assignedCoachId,
    day_of_week: newClass.day_of_week ?? 6,
    start_time: newClass.start_time ?? '09:30',
    end_time: newClass.end_time ?? '11:00',
    room_location: newClass.room_location,
    status: 'ACTIVE',
    is_active: true,
    created_at: newClass.created_at,
  };
  db.schedules.set(classId, newSched);
  recordsToPersist.push(['schedules', classId, newSched]);

  // Enroll initial students if provided
  if (Array.isArray(student_ids)) {
    student_ids.forEach((stuId: string) => {
      if (db.students.has(stuId)) {
        const memId = `m-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        const membership = {
          id: memId,
          student_id: stuId,
          schedule_id: classId,
          joined_date: new Date().toISOString().split('T')[0],
          status: 'ACTIVE' as const,
        };
        db.memberships.set(memId, membership);
        recordsToPersist.push(['memberships', memId, membership]);
      }
    });
  }

  try {
    await Promise.all(recordsToPersist.map(([collection, id, record]) => syncDocToFirestore(collection, id, record)));
    db.saveToDisk();
    return res.status(201).json(db.getPopulatedClass(classId));
  } catch (error: any) {
    console.error('[Create Class] Firestore write failed:', error?.message || error);
    return res.status(503).json({ error: 'Class could not be saved to Firestore. Please retry.', code: 'FIRESTORE_WRITE_FAILED' });
  }
});

router.put('/classes/:id', authenticateUser, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const cls = db.classes.get(id);

  if (!cls) {
    return res.status(404).json({ error: 'Class not found' });
  }

  const {
    name,
    class_type,
    day_of_week,
    start_time,
    end_time,
    default_coach_id,
    coach_id,
    room_location,
    description,
    default_duration_mins,
    default_capacity,
    is_active,
    student_ids,
  } = req.body;

  if (name !== undefined) cls.name = String(name).trim();
  if (class_type !== undefined) cls.class_type = class_type;
  if (day_of_week !== undefined) cls.day_of_week = Number(day_of_week);
  if (start_time !== undefined) cls.start_time = start_time;
  if (end_time !== undefined) cls.end_time = end_time;
  if (default_coach_id !== undefined || coach_id !== undefined) {
    cls.default_coach_id = default_coach_id || coach_id;
  }
  if (room_location !== undefined) cls.room_location = String(room_location).trim();
  if (description !== undefined) cls.description = String(description).trim();
  if (default_duration_mins !== undefined) cls.default_duration_mins = Number(default_duration_mins);
  if (default_capacity !== undefined) cls.default_capacity = Number(default_capacity);
  if (is_active !== undefined) cls.is_active = Boolean(is_active);

  db.classes.set(id, cls);

  // Synchronize recurring schedule
  let sched = db.schedules.get(id) || Array.from(db.schedules.values()).find((s) => s.class_id === id);
  if (!sched) {
    sched = {
      id: id,
      class_id: id,
      coach_id: cls.default_coach_id || 'coach-1',
      default_coach_id: cls.default_coach_id || 'coach-1',
      day_of_week: cls.day_of_week ?? 6,
      start_time: cls.start_time ?? '09:30',
      end_time: cls.end_time ?? '11:00',
      room_location: cls.room_location,
      status: cls.is_active ? 'ACTIVE' : 'INACTIVE',
      is_active: cls.is_active,
      created_at: new Date().toISOString(),
    };
  } else {
    if (cls.default_coach_id) {
      sched.coach_id = cls.default_coach_id;
      sched.default_coach_id = cls.default_coach_id;
    }
    if (cls.day_of_week !== undefined) sched.day_of_week = cls.day_of_week;
    if (cls.start_time) sched.start_time = cls.start_time;
    if (cls.end_time) sched.end_time = cls.end_time;
    if (cls.room_location) sched.room_location = cls.room_location;
    if (cls.is_active !== undefined) {
      sched.status = cls.is_active ? 'ACTIVE' : 'INACTIVE';
      sched.is_active = cls.is_active;
    }
  }
  db.schedules.set(sched.id, sched);

  // Synchronize students if student_ids array provided
  if (Array.isArray(student_ids)) {
    const currentMemberships = Array.from(db.memberships.values()).filter(
      (m) => m.schedule_id === id || (sched && m.schedule_id === sched.id)
    );
    const currentStudentIds = new Set(currentMemberships.map((m) => m.student_id));
    const targetStudentIds = new Set(student_ids);

    // Remove unassigned
    currentMemberships.forEach((m) => {
      if (!targetStudentIds.has(m.student_id)) {
        db.memberships.delete(m.id);
      }
    });

    // Add new
    student_ids.forEach((stuId: string) => {
      if (!currentStudentIds.has(stuId) && db.students.has(stuId)) {
        const memId = `m-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        db.memberships.set(memId, {
          id: memId,
          student_id: stuId,
          schedule_id: id,
          joined_date: new Date().toISOString().split('T')[0],
          status: 'ACTIVE',
        });
      }
    });
  }

  // Update future scheduled sessions to match new default coach if not already customized
  Array.from(db.sessions.values()).forEach((sess) => {
    if ((sess.class_id === id || sess.schedule_id === id) && sess.status === 'SCHEDULED') {
      if (cls.default_coach_id && sess.session_type === 'NORMAL') {
        sess.default_coach_id = cls.default_coach_id;
        sess.scheduled_coach_id = cls.default_coach_id;
        sess.actual_coach_id = cls.default_coach_id;
      }
      if (cls.start_time) sess.start_time = cls.start_time;
      if (cls.end_time) sess.end_time = cls.end_time;
    }
  });

  db.saveToDisk();
  return res.json(db.getPopulatedClass(id));
});

router.delete('/classes/:id', authenticateUser, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const cls = db.classes.get(id);

  if (!cls) {
    return res.status(404).json({ error: 'Class not found' });
  }

  const membershipIds = Array.from(db.memberships.entries()).flatMap(([mId, m]) => {
    if (m.schedule_id === id) {
      return [mId];
    }
    return [];
  });
  try {
    await Promise.all([
      deleteDocFromFirestore('classes', id),
      deleteDocFromFirestore('schedules', id),
      ...membershipIds.map((membershipId) => deleteDocFromFirestore('memberships', membershipId)),
    ]);
    membershipIds.forEach((membershipId) => db.memberships.delete(membershipId));
    db.classes.delete(id);
    db.schedules.delete(id);
    db.saveToDisk();
    return res.json({ success: true, message: `Class ${cls.name} deleted successfully` });
  } catch (error: any) {
    console.error('[Delete Class] Firestore delete failed:', error?.message || error);
    return res.status(503).json({ error: 'Class could not be deleted completely. Please retry.', code: 'DELETE_FAILED' });
  }
});

// ============================================================
// 5. RECURRING CLASS SCHEDULES
// ============================================================

router.get('/schedules', authenticateUser, (req: AuthenticatedRequest, res: Response) => {
  const { coach_id, class_id, day_of_week, status, search } = req.query;

  let list = Array.from(db.schedules.values()).map((s) => db.getPopulatedSchedule(s.id)!);

  if (coach_id) {
    list = list.filter((s) => s.coach_id === coach_id);
  }

  if (class_id) {
    list = list.filter((s) => s.class_id === class_id);
  }

  if (day_of_week !== undefined && day_of_week !== '') {
    list = list.filter((s) => s.day_of_week === Number(day_of_week));
  }

  if (status) {
    list = list.filter((s) => s.status === status);
  }

  if (search) {
    const q = String(search).trim().toLowerCase();
    list = list.filter(
      (s) =>
        s.class_item?.name.toLowerCase().includes(q) ||
        s.coach?.name.toLowerCase().includes(q) ||
        (s.room_location && s.room_location.toLowerCase().includes(q))
    );
  }

  return res.json(list);
});

router.post('/schedules', authenticateUser, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { class_id, coach_id, day_of_week, start_time, end_time, room_location } = req.body;

  if (!class_id || !coach_id || day_of_week === undefined || !start_time || !end_time) {
    return res.status(400).json({ error: 'Missing required schedule fields' });
  }

  const schedId = `sched-${Date.now()}`;
  const newSched: ClassSchedule = {
    id: schedId,
    class_id,
    coach_id,
    day_of_week: Number(day_of_week),
    start_time,
    end_time,
    room_location: room_location ? String(room_location).trim() : 'Main Studio',
    status: 'ACTIVE',
    is_active: true,
    created_at: new Date().toISOString(),
  };

  db.schedules.set(schedId, newSched);
  return res.status(201).json(db.getPopulatedSchedule(schedId));
});

router.put('/schedules/:id', authenticateUser, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const sched = db.schedules.get(id);

  if (!sched) {
    return res.status(404).json({ error: 'Schedule not found' });
  }

  const { class_id, coach_id, day_of_week, start_time, end_time, room_location, status } = req.body;

  if (class_id !== undefined) sched.class_id = class_id;
  if (coach_id !== undefined) sched.coach_id = coach_id;
  if (day_of_week !== undefined) sched.day_of_week = Number(day_of_week);
  if (start_time !== undefined) sched.start_time = start_time;
  if (end_time !== undefined) sched.end_time = end_time;
  if (room_location !== undefined) sched.room_location = String(room_location).trim();
  if (status !== undefined) {
    sched.status = status;
    sched.is_active = status === 'ACTIVE';
  }

  db.schedules.set(id, sched);
  return res.json(db.getPopulatedSchedule(id));
});

router.delete('/schedules/:id', authenticateUser, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const sched = db.schedules.get(id);

  if (!sched) {
    return res.status(404).json({ error: 'Schedule not found' });
  }

  // Remove memberships associated with schedule
  Array.from(db.memberships.entries()).forEach(([mId, m]) => {
    if (m.schedule_id === id) {
      db.memberships.delete(mId);
    }
  });

  db.schedules.delete(id);
  return res.json({ success: true, message: 'Class schedule deleted successfully' });
});

// Manage student memberships in a schedule
router.post('/schedules/:id/students', authenticateUser, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { student_id } = req.body;

  if (!student_id || !db.students.has(student_id) || !db.schedules.has(id)) {
    return res.status(400).json({ error: 'Invalid schedule or student' });
  }

  // Check if already enrolled
  const existing = Array.from(db.memberships.values()).find(
    (m) => m.schedule_id === id && m.student_id === student_id && m.status === 'ACTIVE'
  );

  if (!existing) {
    const memId = `m-${Date.now()}`;
    db.memberships.set(memId, {
      id: memId,
      student_id,
      schedule_id: id,
      joined_date: new Date().toISOString().split('T')[0],
      status: 'ACTIVE',
    });
  }

  return res.json(db.getPopulatedSchedule(id));
});

router.delete('/schedules/:id/students/:studentId', authenticateUser, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { id, studentId } = req.params;

  Array.from(db.memberships.entries()).forEach(([mId, m]) => {
    if (m.schedule_id === id && m.student_id === studentId) {
      db.memberships.delete(mId);
    }
  });

  return res.json(db.getPopulatedSchedule(id));
});

// ============================================================
// 6. CALENDAR SESSIONS (CONCRETE OCCURRENCES)
// ============================================================

router.get('/sessions', authenticateUser, (req: AuthenticatedRequest, res: Response) => {
  const { date, month, coach_id, class_id, status, my_classes_only } = req.query;
  const user = req.user!;

  if (month && typeof month === 'string') {
    db.ensureSessionsForMonth(month);
  }

  let list = Array.from(db.sessions.values()).map((s) => db.getPopulatedSession(s.id)!);

  // Strictly enforce coach isolation: A coach only sees their own assigned sessions
  if (user.role === 'COACH' && user.coach_id) {
    list = list.filter(
      (s) =>
        s.scheduled_coach_id === user.coach_id ||
        s.actual_coach_id === user.coach_id ||
        s.replacement_coach_id === user.coach_id
    );
  } else if (my_classes_only === 'true' && user.coach_id) {
    list = list.filter(
      (s) =>
        s.scheduled_coach_id === user.coach_id ||
        s.actual_coach_id === user.coach_id ||
        s.replacement_coach_id === user.coach_id
    );
  }

  if (coach_id && user.role === 'ADMIN') {
    list = list.filter(
      (s) => s.scheduled_coach_id === coach_id || s.actual_coach_id === coach_id
    );
  }

  if (class_id) {
    list = list.filter((s) => s.class_id === class_id);
  }

  if (date) {
    list = list.filter((s) => s.session_date === String(date));
  }

  if (month) {
    // Format YYYY-MM
    list = list.filter((s) => s.session_date.startsWith(String(month)));
  }

  if (status) {
    list = list.filter((s) => s.status === status);
  }

  // Sort by date desc, then start_time asc
  list.sort((a, b) => {
    if (a.session_date !== b.session_date) {
      return a.session_date.localeCompare(b.session_date);
    }
    return a.start_time.localeCompare(b.start_time);
  });

  return res.json(list);
});

router.get('/sessions/:id', authenticateUser, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const user = req.user!;

  const session = db.getPopulatedSession(id);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  // Resource authorization check for coaches
  if (user.role === 'COACH') {
    const authorized = verifySessionAttendanceAccess(id, user);
    if (!authorized) {
      return res.status(403).json({
        error: 'Forbidden: You are not assigned as the scheduled or replacement coach for this session',
      });
    }
  }

  // Also include list of all enrolled students in the schedule so coach/admin sees everyone
  const enrolledMemberships = Array.from(db.memberships.values()).filter(
    (m) => (m.schedule_id === session.schedule_id || m.schedule_id === session.class_id) && m.status === 'ACTIVE'
  );

  const enrolledStudents = enrolledMemberships
    .map((m) => db.getPopulatedStudent(m.student_id))
    .filter((s): s is NonNullable<typeof s> => s !== null);

  return res.json({
    ...session,
    enrolled_students: enrolledStudents,
  });
});

router.post('/sessions', authenticateUser, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const {
    schedule_id,
    class_id,
    session_date,
    start_time,
    end_time,
    scheduled_coach_id,
    default_coach_id,
    actual_coach_id,
    status,
    notes,
  } = req.body;

  if (!schedule_id || !class_id || !session_date || !start_time || !end_time) {
    return res.status(400).json({ error: 'Missing required session parameters' });
  }

  const defCoach = default_coach_id || scheduled_coach_id || 'coach-1';
  const sessId = `sess-${Date.now()}`;
  const newSession: ClassSession = {
    id: sessId,
    schedule_id,
    class_id,
    session_date,
    start_time,
    end_time,
    default_coach_id: defCoach,
    scheduled_coach_id: defCoach,
    actual_coach_id: actual_coach_id || defCoach,
    session_type: 'NORMAL',
    status: status || 'SCHEDULED',
    notes,
  };

  db.sessions.set(sessId, newSession);
  db.saveToDisk();
  return res.status(201).json(db.getPopulatedSession(sessId));
});

router.put('/sessions/:id', authenticateUser, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const session = db.sessions.get(id);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const {
    session_type,
    replacement_coach_id,
    actual_coach_id,
    status,
    cancellation_reason,
    notes,
    session_date,
    start_time,
    end_time,
  } = req.body;

  const defaultCoachId = session.default_coach_id || session.scheduled_coach_id;

  // Handle Session Type transitions
  if (session_type === 'COACH_CANCELLED' || status === 'COACH_CANCELLED' || status === 'CANCELLED') {
    session.status = 'COACH_CANCELLED';
    session.session_type = 'COACH_CANCELLED';
    session.cancellation_reason = cancellation_reason || 'Coach cancelled';
    session.replacement_coach_id = null;
    session.actual_coach_id = defaultCoachId;
  } else if (session_type === 'PLANNED_OFF_DAY' || status === 'PLANNED_OFF_DAY' || status === 'OFF_DAY') {
    session.status = 'PLANNED_OFF_DAY';
    session.session_type = 'PLANNED_OFF_DAY';
    session.cancellation_reason = cancellation_reason || 'Academy planned off-day';
    session.replacement_coach_id = null;
    session.actual_coach_id = defaultCoachId;
  } else if (session_type === 'REPLACEMENT_COACH' || (replacement_coach_id && session_type !== 'NORMAL')) {
    const replCoach = replacement_coach_id || actual_coach_id;
    session.actual_coach_id = replCoach;
    session.replacement_coach_id = replCoach;
    session.session_type = 'REPLACEMENT_COACH';
    session.status = status && status !== 'COACH_CANCELLED' && status !== 'PLANNED_OFF_DAY' ? status : 'SCHEDULED';
    session.cancellation_reason = undefined;
  } else if (session_type === 'NORMAL') {
    session.actual_coach_id = defaultCoachId;
    session.replacement_coach_id = null;
    session.session_type = 'NORMAL';
    if (session.status === 'COACH_CANCELLED' || session.status === 'PLANNED_OFF_DAY') {
      session.status = 'SCHEDULED';
    } else if (status && status !== 'COACH_CANCELLED' && status !== 'PLANNED_OFF_DAY') {
      session.status = status;
    }
    session.cancellation_reason = undefined;
  } else {
    if (actual_coach_id !== undefined) session.actual_coach_id = actual_coach_id;
    if (status !== undefined) session.status = status;
    if (cancellation_reason !== undefined) session.cancellation_reason = cancellation_reason;
  }

  if (notes !== undefined) session.notes = notes;
  if (session_date !== undefined) session.session_date = session_date;
  if (start_time !== undefined) session.start_time = start_time;
  if (end_time !== undefined) session.end_time = end_time;

  db.sessions.set(id, session);
  db.saveToDisk();
  return res.json(db.getPopulatedSession(id));
});

// ============================================================
// 7. ATTENDANCE & REPLACEMENT ATTENDANCE
// ============================================================

router.post('/sessions/:id/attendance', authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const user = req.user!;
  const { student_id, status, attendance_type, replacement_note } = req.body;

  if (!student_id || !status) {
    return res.status(400).json({ error: 'Student ID and attendance status are required' });
  }

  const session = db.sessions.get(id);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  // Security check: Coach can only take attendance for assigned sessions!
  if (!verifySessionAttendanceAccess(id, user)) {
    return res.status(403).json({
      error: 'Forbidden: You are not authorized to mark attendance for this session',
    });
  }

  // Future session attendance restriction (attendance only opens on or after session date)
  const todayStr = new Date().toISOString().split('T')[0];
  if (session.session_date > todayStr && user.role !== 'ADMIN') {
    return res.status(400).json({
      error: 'Attendance cannot be recorded for future sessions. Attendance opens on the scheduled session date.',
    });
  }

  // Check if attendance record already exists for this student and session
  const existingRecord = Array.from(db.attendance.values()).find(
    (a) => a.session_id === id && a.student_id === student_id
  );

  const prevStatus: AttendanceStatus | 'NOT_MARKED' = existingRecord ? existingRecord.status : 'NOT_MARKED';
  const newStatus = status as AttendanceStatus;
  const attType = (attendance_type as AttendanceType) || (existingRecord ? existingRecord.attendance_type : 'REGULAR');

  let recordId: string;
  if (existingRecord) {
    recordId = existingRecord.id;
    existingRecord.status = newStatus;
    existingRecord.attendance_type = attType;
    if (replacement_note !== undefined) existingRecord.replacement_note = replacement_note;
    existingRecord.marked_at = new Date().toISOString();
    existingRecord.marked_by_user_id = user.id;
    existingRecord.notification_status = 'SENT';
    db.attendance.set(recordId, existingRecord);
    syncDocToFirestore('attendance', recordId, existingRecord).catch(console.error);
  } else {
    recordId = `att-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const newRecord: AttendanceRecord = {
      id: recordId,
      session_id: id,
      student_id,
      status: newStatus,
      attendance_type: attType,
      replacement_note,
      marked_at: new Date().toISOString(),
      marked_by_user_id: user.id,
      notification_status: 'SENT',
    };
    db.attendance.set(recordId, newRecord);
    syncDocToFirestore('attendance', recordId, newRecord).catch(console.error);
  }

  // Create Audit Log if status changed
  if (prevStatus !== newStatus) {
    const studentObj = db.students.get(student_id);
    const auditEntry = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      attendance_id: recordId,
      session_id: id,
      student_id,
      student_name: studentObj?.full_name || 'Student',
      changed_by_user_id: user.id,
      changed_by_user_name: user.name,
      changed_by_user_role: user.role,
      previous_status: prevStatus,
      new_status: newStatus,
      reason: user.role === 'ADMIN' ? (req.body.audit_reason || 'Admin status update') : 'Roll-call marked by coach',
      timestamp: new Date().toISOString(),
    };
    db.auditLogs.unshift(auditEntry);
    syncDocToFirestore('auditLogs', auditEntry.id, auditEntry).catch(console.error);
  }

  // Parent Attendance Notification Trigger (via NotificationService)
  const student = db.students.get(student_id);
  const parent = student?.parent_id ? db.parents.get(student.parent_id) : undefined;
  const classItem = db.classes.get(session.class_id);
  const coach = db.coaches.get(session.actual_coach_id) || db.coaches.get(session.scheduled_coach_id);

  if (student) {
    notificationService.sendAttendanceAlert({
      attendanceId: recordId,
      sessionId: id,
      studentId: student_id,
      studentName: student.full_name,
      parentId: parent?.id,
      parentName: parent?.name,
      parentPhone: parent?.phone,
      parentTelegramChatId: parent?.telegram_chat_id,
      parentTelegramUsername: parent?.telegram_username,
      attendanceStatus: newStatus,
      attendanceType: attType,
      className: classItem?.name || 'Class',
      sessionDate: session.session_date,
      startTime: session.start_time,
      endTime: session.end_time,
      coachName: coach?.name || 'Coach',
      replacementNote: req.body.replacement_note,
    }).catch((err) => console.error('[Routes] Attendance notification alert error:', err));
  }

  return res.json({
    success: true,
    attendance_record: db.attendance.get(recordId),
    session: db.getPopulatedSession(id),
  });
});

// Coach adds a replacement student to session
router.post('/sessions/:id/replacement-student', authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const user = req.user!;
  const { student_id, replacement_note } = req.body;

  if (!student_id) {
    return res.status(400).json({ error: 'Student ID is required' });
  }

  const session = db.sessions.get(id);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  if (!verifySessionAttendanceAccess(id, user)) {
    return res.status(403).json({
      error: 'Forbidden: You are not authorized to manage attendance for this session',
    });
  }

  const todayStr = new Date().toISOString().split('T')[0];
  if (session.session_date > todayStr && user.role !== 'ADMIN') {
    return res.status(400).json({
      error: 'Attendance cannot be recorded for future sessions. Attendance opens on the scheduled session date.',
    });
  }

  const student = db.students.get(student_id);
  if (!student) {
    return res.status(404).json({ error: 'Student not found in academy directory' });
  }

  // Create attendance record as REPLACEMENT and default to PRESENT
  const recordId = `att-rep-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const newRecord: AttendanceRecord = {
    id: recordId,
    session_id: id,
    student_id,
    status: 'PRESENT',
    attendance_type: 'REPLACEMENT',
    replacement_note: replacement_note || 'Attending replacement lesson',
    marked_at: new Date().toISOString(),
    marked_by_user_id: user.id,
    notification_status: 'SENT',
  };

  db.attendance.set(recordId, newRecord);
  syncDocToFirestore('attendance', recordId, newRecord).catch(console.error);

  // Audit log
  const auditEntry = {
    id: `audit-${Date.now()}`,
    attendance_id: recordId,
    session_id: id,
    student_id,
    student_name: student.full_name,
    changed_by_user_id: user.id,
    changed_by_user_name: user.name,
    changed_by_user_role: user.role,
    previous_status: 'NOT_MARKED' as const,
    new_status: 'PRESENT' as const,
    reason: `Added as replacement student (${replacement_note || 'Flexible replacement'})`,
    timestamp: new Date().toISOString(),
  };
  db.auditLogs.unshift(auditEntry);
  syncDocToFirestore('auditLogs', auditEntry.id, auditEntry).catch(console.error);

  // Parent Attendance Notification Trigger (via NotificationService)
  const parent = student.parent_id ? db.parents.get(student.parent_id) : undefined;
  const classItem = db.classes.get(session.class_id);
  const coach = db.coaches.get(session.actual_coach_id) || db.coaches.get(session.scheduled_coach_id);

  notificationService.sendAttendanceAlert({
    attendanceId: recordId,
    sessionId: id,
    studentId: student_id,
    studentName: student.full_name,
    parentId: parent?.id,
    parentName: parent?.name,
    parentPhone: parent?.phone,
    parentTelegramChatId: parent?.telegram_chat_id,
    parentTelegramUsername: parent?.telegram_username,
    attendanceStatus: 'PRESENT',
    attendanceType: 'REPLACEMENT',
    className: classItem?.name || 'Class',
    sessionDate: session.session_date,
    startTime: session.start_time,
    endTime: session.end_time,
    coachName: coach?.name || 'Coach',
    replacementNote: replacement_note || 'Attending replacement lesson',
  }).catch((err) => console.error('[Routes] Replacement notification alert error:', err));

  return res.json({
    success: true,
    attendance_record: newRecord,
    session: db.getPopulatedSession(id),
  });
});

// Record an Unregistered Student on the fly during Roll Call
router.post('/sessions/:id/unregistered-student', authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const user = req.user!;
  const { full_name, nick_name, parent_phone, status, replacement_note } = req.body;

  if (!full_name || !String(full_name).trim()) {
    return res.status(400).json({ error: 'Student full name is required' });
  }

  const session = db.sessions.get(id);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  if (!verifySessionAttendanceAccess(id, user)) {
    return res.status(403).json({ error: 'Forbidden: Unauthorized to mark attendance for this session' });
  }

  const todayStr = new Date().toISOString().split('T')[0];
  if (session.session_date > todayStr && user.role !== 'ADMIN') {
    return res.status(400).json({
      error: 'Attendance cannot be recorded for future sessions. Attendance opens on the scheduled session date.',
    });
  }

  // Create temporary/unregistered parent if phone provided
  let parentId: string | undefined;
  if (parent_phone) {
    parentId = `parent-unreg-${Date.now()}`;
    const newParent = {
      id: parentId,
      name: `${String(full_name).trim()}'s Parent`,
      phone: String(parent_phone).trim(),
      created_at: new Date().toISOString(),
    };
    db.parents.set(parentId, newParent);
    syncDocToFirestore('parents', parentId, newParent).catch(console.error);
  }

  const studentId = `student-unreg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const unregCode = `UNREG-${Math.floor(1000 + Math.random() * 9000)}`;
  const newStudent: Student = {
    id: studentId,
    student_id: unregCode,
    full_name: String(full_name).trim(),
    nick_name: nick_name ? String(nick_name).trim() : undefined,
    parent_id: parentId,
    status: 'ACTIVE',
    is_unregistered: true,
    created_at: new Date().toISOString(),
  };

  db.students.set(studentId, newStudent);
  syncDocToFirestore('students', studentId, newStudent).catch(console.error);

  const attStatus: AttendanceStatus = (status as AttendanceStatus) || 'PRESENT';
  const recordId = `att-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const newRecord: AttendanceRecord = {
    id: recordId,
    session_id: id,
    student_id: studentId,
    status: attStatus,
    attendance_type: 'REGULAR',
    replacement_note: replacement_note || 'Unregistered student walk-in/trial',
    marked_at: new Date().toISOString(),
    marked_by_user_id: user.id,
    notification_status: 'QUEUED',
  };

  db.attendance.set(recordId, newRecord);
  syncDocToFirestore('attendance', recordId, newRecord).catch(console.error);

  // Audit log
  const auditEntry = {
    id: `audit-${Date.now()}`,
    attendance_id: recordId,
    session_id: id,
    student_id: studentId,
    student_name: newStudent.full_name,
    changed_by_user_id: user.id,
    changed_by_user_name: user.name,
    changed_by_user_role: user.role,
    previous_status: 'NOT_MARKED' as const,
    new_status: attStatus,
    reason: `Unregistered student recorded (${unregCode})`,
    timestamp: new Date().toISOString(),
  };
  db.auditLogs.unshift(auditEntry);
  syncDocToFirestore('auditLogs', auditEntry.id, auditEntry).catch(console.error);

  db.saveToDisk();

  return res.status(201).json({
    success: true,
    student: newStudent,
    attendance_record: newRecord,
    session: db.getPopulatedSession(id),
  });
});

// Admin converts an Unregistered Student to a Formal Registered Student profile
router.post('/students/:id/convert-registered', authenticateUser, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const student = db.students.get(id);
  if (!student) {
    return res.status(404).json({ error: 'Student not found' });
  }

  const {
    student_id,
    full_name,
    nick_name,
    school,
    parent_name,
    parent_phone,
    parent_email,
    parent_telegram,
    parent_relation,
    schedule_ids,
  } = req.body;

  if (!student_id || !full_name) {
    return res.status(400).json({ error: 'Formal Student ID and Full Name are required' });
  }

  // Update parent
  let parentId = student.parent_id;
  if (!parentId) {
    parentId = `parent-${Date.now()}`;
    const newParent = {
      id: parentId,
      name: parent_name || `${full_name}'s Parent`,
      phone: parent_phone || '',
      email: parent_email || '',
      telegram_username: parent_telegram || '',
      created_at: new Date().toISOString(),
    };
    db.parents.set(parentId, newParent);
    syncDocToFirestore('parents', parentId, newParent).catch(console.error);
  } else {
    const p = db.parents.get(parentId);
    if (p) {
      if (parent_name) p.name = parent_name;
      if (parent_phone) p.phone = parent_phone;
      if (parent_email) p.email = parent_email;
      if (parent_telegram) p.telegram_username = parent_telegram;
      db.parents.set(parentId, p);
      syncDocToFirestore('parents', parentId, p).catch(console.error);
    }
  }

  // Update student in place to maintain all existing attendance records and audit logs
  student.student_id = String(student_id).trim();
  student.full_name = String(full_name).trim();
  student.nick_name = nick_name ? String(nick_name).trim() : undefined;
  student.school = school ? String(school).trim() : undefined;
  student.parent_id = parentId;
  student.parent_relation = parent_relation || 'Parent';
  student.is_unregistered = false; // Officially registered

  db.students.set(id, student);
  syncDocToFirestore('students', id, student).catch(console.error);

  // Enroll in schedules if provided
  if (Array.isArray(schedule_ids)) {
    for (const [memId, mem] of db.memberships.entries()) {
      if (mem.student_id === id) {
        db.memberships.delete(memId);
        deleteDocFromFirestore('memberships', memId).catch(console.error);
      }
    }
    for (const schedId of schedule_ids) {
      const memId = `mem-${id}-${schedId}`;
      const newMem = {
        id: memId,
        student_id: id,
        schedule_id: schedId,
        joined_date: new Date().toISOString().split('T')[0],
        status: 'ACTIVE' as const,
      };
      db.memberships.set(memId, newMem);
      syncDocToFirestore('memberships', memId, newMem).catch(console.error);
    }
  }

  db.saveToDisk();
  return res.json(db.getPopulatedStudent(id));
});

// List all attendance records with rich filtering (Admin & Session view)
router.get('/attendance', authenticateUser, (req: AuthenticatedRequest, res: Response) => {
  const { session_id, month, date, coach_id, class_id, status, student_search } = req.query;
  let records = Array.from(db.attendance.values());

  if (session_id) {
    records = records.filter((r) => r.session_id === session_id);
  }

  if (month || date || coach_id || class_id) {
    records = records.filter((r) => {
      const sess = db.sessions.get(r.session_id);
      if (!sess) return false;
      if (month && !sess.session_date.startsWith(String(month))) return false;
      if (date && sess.session_date !== String(date)) return false;
      if (coach_id && sess.actual_coach_id !== coach_id && sess.scheduled_coach_id !== coach_id) return false;
      if (class_id && sess.class_id !== class_id) return false;
      return true;
    });
  }

  if (status) {
    records = records.filter((r) => r.status === status);
  }

  if (student_search) {
    const term = String(student_search).toLowerCase();
    records = records.filter((r) => {
      const stu = db.students.get(r.student_id);
      return stu && (stu.full_name.toLowerCase().includes(term) || stu.student_id.toLowerCase().includes(term));
    });
  }

  const populated = records.map((r) => {
    const student = db.students.get(r.student_id);
    const session = db.getPopulatedSession(r.session_id);
    return {
      ...r,
      student,
      session,
    };
  });

  return res.json(populated);
});

// Admin direct attendance correction with mandatory audit reason
router.put('/attendance/:id', authenticateUser, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const user = req.user!;
  const { status, attendance_type, replacement_note, reason } = req.body;

  const record = db.attendance.get(id);
  if (!record) {
    return res.status(404).json({ error: 'Attendance record not found' });
  }

  if (!reason || String(reason).trim().length < 3) {
    return res.status(400).json({ error: 'Audit reason is required for administrative attendance corrections' });
  }

  const prevStatus = record.status;
  if (status !== undefined) record.status = status;
  if (attendance_type !== undefined) record.attendance_type = attendance_type;
  if (replacement_note !== undefined) record.replacement_note = replacement_note;

  record.marked_at = new Date().toISOString();
  record.marked_by_user_id = user.id;
  db.attendance.set(id, record);
  syncDocToFirestore('attendance', id, record).catch(console.error);

  // Audit log entry
  const student = db.students.get(record.student_id);
  const auditEntry = {
    id: `audit-${Date.now()}`,
    attendance_id: id,
    session_id: record.session_id,
    student_id: record.student_id,
    student_name: student?.full_name || 'Student',
    changed_by_user_id: user.id,
    changed_by_user_name: user.name,
    changed_by_user_role: 'ADMIN' as const,
    previous_status: prevStatus,
    new_status: record.status,
    reason: String(reason).trim(),
    timestamp: new Date().toISOString(),
  };
  db.auditLogs.unshift(auditEntry);
  syncDocToFirestore('auditLogs', auditEntry.id, auditEntry).catch(console.error);

  return res.json({
    success: true,
    attendance_record: record,
  });
});

// ============================================================
// 8. BULK IMPORT ENDPOINTS
// ============================================================

router.post('/admin/bulk-import/validate', authenticateUser, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { type, records } = req.body;
  if (!type || !Array.isArray(records)) {
    return res.status(400).json({ error: 'Valid import type and records array are required' });
  }

  const validationResult = validateBulkImport(type, records);
  return res.json(validationResult);
});

router.post('/admin/bulk-import/commit', authenticateUser, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { type, validatedItems } = req.body;
  if (!type || !Array.isArray(validatedItems)) {
    return res.status(400).json({ error: 'Valid import type and validated items array are required' });
  }

  const result = await commitBulkImport(type, validatedItems);
  return res.json(result);
});

// ============================================================
// 9. EXPORT ENDPOINTS (WORD DOCX & HUMAN-READABLE CSV)
// ============================================================

router.get('/export/class-schedules-docx', authenticateUser, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const docBuffer = await generateClassScheduleDocx();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', 'attachment; filename="Chess_Academy_Class_Schedules.docx"');
    return res.send(docBuffer);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to generate Word document' });
  }
});

router.get('/export/attendance-csv', authenticateUser, (req: AuthenticatedRequest, res: Response) => {
  const { month, coach_id, class_id } = req.query;
  const targetMonth = month ? String(month) : '2026-08';

  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  let records = Array.from(db.attendance.values()).filter((r) => {
    const sess = db.sessions.get(r.session_id);
    if (!sess) return false;
    if (!sess.session_date.startsWith(targetMonth)) return false;
    if (coach_id && sess.actual_coach_id !== coach_id && sess.scheduled_coach_id !== coach_id) return false;
    if (class_id && sess.class_id !== class_id) return false;
    return true;
  });

  // Human-readable CSV column order:
  // Date, Day, Start Time, End Time, Class, Class Type, Coach, Student, Attendance Status, Attendance Type, Replacement, Notes
  const headers = [
    'Date',
    'Day',
    'Start Time',
    'End Time',
    'Class',
    'Class Type',
    'Coach',
    'Student',
    'Attendance Status',
    'Attendance Type',
    'Replacement',
    'Notes',
  ];

  const rows = records.map((r) => {
    const sess = db.sessions.get(r.session_id)!;
    const cls = db.classes.get(sess.class_id);
    const coach = db.coaches.get(sess.actual_coach_id);
    const student = db.students.get(r.student_id);
    const dateObj = new Date(sess.session_date);
    const dayName = isNaN(dateObj.getTime()) ? '' : daysOfWeek[dateObj.getDay()];

    const isReplacement = r.attendance_type === 'REPLACEMENT' ? 'YES' : 'NO';
    const notes = r.replacement_note ? `"${r.replacement_note.replace(/"/g, '""')}"` : '""';
    const className = cls?.name ? `"${cls.name.replace(/"/g, '""')}"` : '""';
    const studentName = student?.full_name ? `"${student.full_name.replace(/"/g, '""')}"` : '""';
    const coachName = coach?.name ? `"${coach.name.replace(/"/g, '""')}"` : '""';

    return [
      sess.session_date,
      dayName,
      sess.start_time,
      sess.end_time,
      className,
      cls?.class_type || 'GROUP',
      coachName,
      studentName,
      r.status,
      r.attendance_type,
      isReplacement,
      notes,
    ].join(',');
  });

  const csvContent = [headers.join(','), ...rows].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="Chess_Academy_Attendance_${targetMonth}.csv"`);
  return res.send(csvContent);
});

// Dedicated Coach Breakdown
router.get('/coach/breakdown', authenticateUser, requireCoachOrAdmin, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { month } = req.query;
  const targetMonth = month ? String(month) : '2026-08';

  // Determine which coach to inspect
  let coachId = user.coach_id;
  if (user.role === 'ADMIN' && req.query.coach_id) {
    coachId = String(req.query.coach_id);
  }

  if (!coachId) {
    return res.status(400).json({ error: 'No associated coach profile found for this account' });
  }

  const coach = db.coaches.get(coachId);
  if (!coach) {
    return res.status(404).json({ error: 'Coach not found' });
  }

  // Get all sessions taught or scheduled for this coach in this month
  const sessions = Array.from(db.sessions.values()).filter((s) => {
    if (!s.session_date.startsWith(targetMonth)) return false;
    return s.actual_coach_id === coachId || s.scheduled_coach_id === coachId || s.default_coach_id === coachId;
  });

  let totalSessions = 0;
  let normalSessions = 0;
  let replacementSessions = 0;
  let cancelledSessions = 0;
  let plannedOffDays = 0;
  let totalPresentStudents = 0;
  let totalAbsentStudents = 0;
  let totalLateStudents = 0;
  let totalReplacementStudents = 0;

  const sessionDetails = sessions.map((s) => {
    const cls = db.classes.get(s.class_id);
    const isReplacementCoach = s.session_type === 'REPLACEMENT_COACH' || (s.replacement_coach_id && s.replacement_coach_id === coachId);
    
    if (s.status === 'COACH_CANCELLED' || s.status === 'CANCELLED') {
      cancelledSessions++;
    } else if (s.status === 'PLANNED_OFF_DAY' || s.status === 'OFF_DAY') {
      plannedOffDays++;
    } else {
      totalSessions++;
      if (isReplacementCoach) replacementSessions++;
      else normalSessions++;
    }

    const attendances = Array.from(db.attendance.values()).filter((a) => a.session_id === s.id);
    const present = attendances.filter((a) => a.status === 'PRESENT').length;
    const absent = attendances.filter((a) => a.status === 'ABSENT').length;
    const late = attendances.filter((a) => a.status === 'LATE').length;
    const repCount = attendances.filter((a) => a.attendance_type === 'REPLACEMENT' && (a.status === 'PRESENT' || a.status === 'LATE')).length;

    totalPresentStudents += present;
    totalAbsentStudents += absent;
    totalLateStudents += late;
    totalReplacementStudents += repCount;

    return {
      session_id: s.id,
      date: s.session_date,
      start_time: s.start_time,
      end_time: s.end_time,
      class_name: cls?.name || 'Class',
      class_type: cls?.class_type || 'GROUP',
      status: s.status,
      session_type: s.session_type,
      is_replacement_coach: isReplacementCoach,
      marked_count: attendances.length,
      present_count: present,
      absent_count: absent,
      late_count: late,
      replacement_students_count: repCount,
    };
  });

  return res.json({
    month: targetMonth,
    coach: {
      id: coach.id,
      name: coach.name,
      email: coach.email,
      color: coach.color,
      color_name: coach.color_name,
    },
    metrics: {
      total_sessions: totalSessions,
      normal_sessions: normalSessions,
      replacement_sessions: replacementSessions,
      cancelled_sessions: cancelledSessions,
      planned_off_days: plannedOffDays,
      total_present_students: totalPresentStudents,
      total_absent_students: totalAbsentStudents,
      total_late_students: totalLateStudents,
      total_replacement_students: totalReplacementStudents,
    },
    sessions: sessionDetails,
  });
});


// ============================================================
// 8. MONTHLY REPORTS & AGGREGATION
// ============================================================

router.get('/reports/monthly', authenticateUser, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { month, coach_id, class_id, student_id, class_type } = req.query;

  const targetMonth = month ? String(month) : '2026-08';

  // 1. Get all sessions for this month
  let monthSessions = Array.from(db.sessions.values()).filter((s) =>
    s.session_date.startsWith(targetMonth)
  );

  if (coach_id) {
    monthSessions = monthSessions.filter(
      (s) => s.actual_coach_id === coach_id || s.scheduled_coach_id === coach_id
    );
  }

  if (class_id) {
    monthSessions = monthSessions.filter((s) => s.class_id === class_id);
  }

  if (class_type) {
    monthSessions = monthSessions.filter((s) => {
      const cls = db.classes.get(s.class_id);
      return cls?.class_type === class_type;
    });
  }

  // Aggregation by Coach
  const coachReportsMap = new Map<string, MonthlyReportItem>();

  Array.from(db.coaches.values()).forEach((coach) => {
    coachReportsMap.set(coach.id, {
      coach_id: coach.id,
      coach_name: coach.name,
      coach_color: coach.color,
      total_sessions_taught: 0,
      normal_sessions_taught: 0,
      replacement_sessions_taught: 0,
      cancelled_sessions_count: 0,
      planned_off_days_count: 0,
      group_sessions_count: 0,
      individual_sessions_count: 0,
      total_student_attendances: 0,
      total_replacement_students: 0,
      sessions: [],
    });
  });

  monthSessions.forEach((sess) => {
    const defaultCoachId = sess.default_coach_id || sess.scheduled_coach_id;
    const defaultCoach = db.coaches.get(defaultCoachId);
    const defaultCoachReport = defaultCoach ? coachReportsMap.get(defaultCoach.id) : undefined;

    if (sess.status === 'COACH_CANCELLED' || sess.status === 'CANCELLED') {
      if (defaultCoachReport) {
        defaultCoachReport.cancelled_sessions_count += 1;
      }
      return;
    }

    if (sess.status === 'PLANNED_OFF_DAY' || sess.status === 'OFF_DAY') {
      if (defaultCoachReport) {
        defaultCoachReport.planned_off_days_count += 1;
      }
      return;
    }

    // The coach who actually taught this session receives teaching credit
    const actualCoachId = sess.actual_coach_id || defaultCoachId;
    const actualCoach = db.coaches.get(actualCoachId);
    if (!actualCoach) return;

    const reportItem = coachReportsMap.get(actualCoach.id);
    if (!reportItem) return;

    const cls = db.classes.get(sess.class_id);
    const isReplacementCoach = sess.session_type === 'REPLACEMENT_COACH' || (sess.replacement_coach_id && sess.replacement_coach_id !== defaultCoachId);

    const sessionAttendances = Array.from(db.attendance.values()).filter(
      (a) => a.session_id === sess.id
    );
    const presentStudents = sessionAttendances.filter(
      (a) => a.status === 'PRESENT' || a.status === 'LATE'
    ).length;
    const replacementStudents = sessionAttendances.filter(
      (a) => a.attendance_type === 'REPLACEMENT' && (a.status === 'PRESENT' || a.status === 'LATE')
    ).length;

    reportItem.total_sessions_taught += 1;
    if (isReplacementCoach) {
      reportItem.replacement_sessions_taught += 1;
    } else {
      reportItem.normal_sessions_taught += 1;
    }

    if (cls?.class_type === 'INDIVIDUAL') {
      reportItem.individual_sessions_count += 1;
    } else {
      reportItem.group_sessions_count += 1;
    }

    reportItem.total_student_attendances += presentStudents;
    reportItem.total_replacement_students += replacementStudents;

    reportItem.sessions.push({
      session_id: sess.id,
      date: sess.session_date,
      class_name: cls?.name || 'Class',
      class_type: cls?.class_type || 'GROUP',
      is_replacement_coach: isReplacementCoach,
      present_students: presentStudents,
      replacement_students: replacementStudents,
    });
  });

  // Aggregation by Student
  const studentReports: MonthlyStudentReportItem[] = [];
  const studentsList = Array.from(db.students.values());

  studentsList.forEach((stu) => {
    if (student_id && stu.id !== student_id) return;

    const populatedStu = db.getPopulatedStudent(stu.id)!;
    const stuAttendances = Array.from(db.attendance.values()).filter((a) => {
      if (a.student_id !== stu.id) return false;
      const sess = db.sessions.get(a.session_id);
      return sess && sess.session_date.startsWith(targetMonth);
    });

    const attendedCount = stuAttendances.filter(
      (a) => a.status === 'PRESENT' || a.status === 'LATE'
    ).length;
    const absentCount = stuAttendances.filter((a) => a.status === 'ABSENT').length;
    const replacementCount = stuAttendances.filter(
      (a) => a.attendance_type === 'REPLACEMENT'
    ).length;

    const totalScheduled = stuAttendances.length;
    const attendanceRate = totalScheduled > 0 ? Math.round((attendedCount / totalScheduled) * 100) : 100;

    const attendanceDetails = stuAttendances.map((a) => {
      const sess = db.sessions.get(a.session_id);
      const cls = sess ? db.classes.get(sess.class_id) : undefined;
      const coach = sess ? db.coaches.get(sess.actual_coach_id) : undefined;
      return {
        date: sess?.session_date || '',
        class_name: cls?.name || 'Class',
        coach_name: coach?.name || 'Coach',
        status: a.status,
        type: a.attendance_type,
      };
    });

    studentReports.push({
      student_id: stu.id,
      student_code: stu.student_id,
      student_name: stu.full_name,
      school: stu.school,
      parent_name: populatedStu.parent?.name,
      parent_phone: populatedStu.parent?.phone,
      enrolled_classes: (populatedStu.enrolled_schedules || []).map((s) => s.class_name),
      total_scheduled: totalScheduled,
      attended_count: attendedCount,
      absent_count: absentCount,
      replacement_count: replacementCount,
      attendance_rate: attendanceRate,
      attendances: attendanceDetails,
    });
  });

  return res.json({
    month: targetMonth,
    coaches_summary: Array.from(coachReportsMap.values()).filter((c) =>
      coach_id ? c.coach_id === coach_id : true
    ),
    students_summary: studentReports,
  });
});

// Dashboard Quick Stats
const getDashboardStatsHandler = (req: AuthenticatedRequest, res: Response) => {
  try {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const sessions = db?.sessions ? Array.from(db.sessions.values()) : [];
    const attendance = db?.attendance ? Array.from(db.attendance.values()) : [];
    const students = db?.students ? Array.from(db.students.values()) : [];
    const coaches = db?.coaches ? Array.from(db.coaches.values()) : [];

    const monthSessions = sessions.filter((s) => s?.session_date && s.session_date.startsWith(currentMonth));
    const monthAttendances = attendance.filter((a) => {
      const sess = db.sessions.get(a.session_id);
      return sess && sess.session_date && sess.session_date.startsWith(currentMonth) && (a.status === 'PRESENT' || a.status === 'LATE');
    });

    const monthReplacements = attendance.filter((a) => {
      const sess = db.sessions.get(a.session_id);
      return (
        sess &&
        sess.session_date &&
        sess.session_date.startsWith(currentMonth) &&
        a.attendance_type === 'REPLACEMENT' &&
        (a.status === 'PRESENT' || a.status === 'LATE')
      );
    });

    const todaySessions = sessions
      .filter((s) => s?.session_date === today)
      .map((s) => {
        try {
          return db.getPopulatedSession(s.id);
        } catch {
          return s;
        }
      })
      .filter(Boolean);

    return res.json({
      month: currentMonth,
      sessions_this_month: monthSessions.length,
      student_attendances: monthAttendances.length,
      replacement_attendances: monthReplacements.length,
      today_sessions: todaySessions,
      total_active_students: students.filter((s) => s?.status === 'ACTIVE').length,
      total_active_coaches: coaches.filter((c) => c?.is_active).length,
    });
  } catch (err: any) {
    console.error('[Dashboard Stats Error]:', err);
    return res.json({
      month: new Date().toISOString().substring(0, 7),
      sessions_this_month: 0,
      student_attendances: 0,
      replacement_attendances: 0,
      today_sessions: [],
      total_active_students: 0,
      total_active_coaches: 0,
    });
  }
};

router.get('/reports/stats', authenticateUser, requireCoachOrAdmin, getDashboardStatsHandler);
router.get('/dashboard/stats', authenticateUser, requireCoachOrAdmin, getDashboardStatsHandler);

// ============================================================
// 9. AUDIT LOGS & NOTIFICATIONS
// ============================================================

router.get('/audit-logs', authenticateUser, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  return res.json(db.auditLogs);
});

router.get('/notifications', authenticateUser, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  return res.json(db.notificationLogs);
});

router.get('/notifications/logs', authenticateUser, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  return res.json(db.notificationLogs);
});
