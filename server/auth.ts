import { Request, Response, NextFunction } from 'express';
import { db } from './db.js';
import { User, Coach } from '../src/types.js';
import { adminAuth } from './firebaseAdmin.js';

/**
 * ============================================================================
 * AUTHENTICATION ARCHITECTURE NOTE & PRODUCTION ROADMAP
 * ============================================================================
 * CURRENT STATE (Phase 1):
 * - Authenticates coaches and administrators using server-issued session bearer
 *   tokens stored in activeTokens Map with 30-day sliding expiration.
 * - Firebase Admin ID token verification is wired and ready as fallback.
 *
 * TODO (Production Pilot Requirement):
 * - Production authentication still needs to migrate from the current
 *   server-issued demo/session-token mechanism to Firebase Authentication
 *   with verified Firebase ID tokens (e.g. client-side Firebase Auth SDK
 *   signInWithEmailAndPassword / Google popup passing ID tokens to server).
 * ============================================================================
 */

// In-memory token-to-user map with expiry timestamp
const activeTokens = new Map<string, { userId: string; expiresAt: number }>();

export interface AuthenticatedRequest extends Request {
  user?: User;
  coachProfile?: Coach;
}

export function createTokenForUser(userId: string): string {
  const token = `token-${userId}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  activeTokens.set(token, {
    userId,
    expiresAt: Date.now() + 86400000 * 30, // 30 days
  });
  return token;
}

export function revokeToken(token: string) {
  activeTokens.delete(token);
}

export async function authenticateUser(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing authentication token' });
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Empty token provided' });
  }

  let userId: string | undefined;

  // 1. Check in-memory authenticated session tokens
  const session = activeTokens.get(token);
  if (session && session.expiresAt > Date.now()) {
    userId = session.userId;
  }

  // 2. Try Firebase ID Token verification
  if (!userId) {
    try {
      const decoded = await adminAuth.verifyIdToken(token);
      if (decoded && decoded.uid) {
        // Find matching user by UID or email
        const matched = Array.from(db.users.values()).find(
          (u) => u.id === decoded.uid || (decoded.email && u.email.toLowerCase() === decoded.email.toLowerCase())
        );
        if (matched) {
          userId = matched.id;
          activeTokens.set(token, { userId: matched.id, expiresAt: Date.now() + 86400000 * 7 });
        }
      }
    } catch {
      // Not a valid Firebase ID token
    }
  }

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired session token' });
  }

  const user = db.users.get(userId);
  if (!user || !user.is_active) {
    return res.status(403).json({ error: 'Forbidden: User account is inactive or disabled' });
  }

  req.user = user;
  if (user.coach_id) {
    req.coachProfile = db.coaches.get(user.coach_id);
  }

  next();
}

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user || (req.user.role !== 'SUPER_ADMIN' && req.user.role !== 'ADMIN')) {
    return res.status(403).json({ error: 'Forbidden: Administrator privileges required' });
  }
  next();
}

export function requireCoachOrAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user || (req.user.role !== 'SUPER_ADMIN' && req.user.role !== 'ADMIN' && req.user.role !== 'COACH')) {
    return res.status(403).json({ error: 'Forbidden: Coach or Administrator privileges required' });
  }
  next();
}

/**
 * Validates that the authenticated coach is authorized to view or edit the specific session.
 * Authorized if:
 * 1. User is ADMIN, OR
 * 2. User is the scheduled_coach_id, OR
 * 3. User is the actual_coach_id (replacement coach assignment)
 */
export function verifySessionAttendanceAccess(sessionId: string, user: User): boolean {
  if (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') return true;
  if (!user.coach_id) return false;

  const session = db.sessions.get(sessionId);
  if (!session) return false;

  return (
    session.scheduled_coach_id === user.coach_id ||
    session.actual_coach_id === user.coach_id ||
    session.replacement_coach_id === user.coach_id
  );
}
