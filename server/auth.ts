import { Request, Response, NextFunction } from 'express';
import { db } from './db.js';
import { User, Coach } from '../src/types.js';
import { adminAuth, hasAdminCredentials, firebaseAdminConfigurationError } from './firebaseAdmin.js';

export interface AuthenticatedRequest extends Request { user?: User; coachProfile?: Coach; }

/** Firebase ID tokens are the only production bearer credential. */
export async function authenticateUser(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized: Firebase ID token required' });
  if (!hasAdminCredentials || !adminAuth) return res.status(503).json({ error: firebaseAdminConfigurationError(), code: 'FIREBASE_ADMIN_UNAVAILABLE' });
  try {
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7).trim());
    const email = decoded.email?.toLowerCase().trim();
    const user = Array.from(db.users.values()).find((candidate) => candidate.id === decoded.uid || Boolean(email && candidate.email.toLowerCase() === email));
    if (!user) return res.status(403).json({ error: 'No Academy profile is assigned to this Firebase account.' });
    if (!user.is_active) return res.status(403).json({ error: 'Forbidden: User account is inactive or disabled' });
    req.user = user;
    req.coachProfile = user.coach_id ? db.coaches.get(user.coach_id) : undefined;
    next();
  } catch {
    console.warn('[Auth] Firebase ID token verification failed');
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired Firebase ID token' });
  }
}
export function requireSuperAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) { if (!req.user || req.user.role !== 'SUPER_ADMIN') return res.status(403).json({ error: 'Forbidden: Super Administrator privileges required' }); next(); }
export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) { if (!req.user || !['ADMIN', 'SUPER_ADMIN'].includes(req.user.role)) return res.status(403).json({ error: 'Forbidden: Administrator privileges required' }); next(); }
export function requireCoachOrAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) { if (!req.user || !['ADMIN', 'SUPER_ADMIN', 'COACH'].includes(req.user.role)) return res.status(403).json({ error: 'Forbidden: Coach or Administrator privileges required' }); next(); }
export function verifySessionAttendanceAccess(sessionId: string, user: User): boolean { if (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') return true; if (!user.coach_id) return false; const session = db.sessions.get(sessionId); return Boolean(session && (session.scheduled_coach_id === user.coach_id || session.actual_coach_id === user.coach_id || session.replacement_coach_id === user.coach_id || session.default_coach_id === user.coach_id)); }
