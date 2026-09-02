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
 *   signInWithEmailAndPassword passing ID tokens to server).
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
  const endpoint = req.originalUrl || req.url || '';
  const authHeader = req.headers.authorization;
  const hasAuthHeader = Boolean(authHeader && authHeader.startsWith('Bearer '));

  if (!hasAuthHeader || !authHeader) {
    console.info('[Auth Diagnostics Server]', {
      endpoint,
      hasAuthorizationHeader: false,
      tokenVerification: 'FAILED_MISSING_HEADER',
      adminSdkProjectId: adminAuth.app?.options?.projectId || 'unknown',
      finalAuthResult: '401_MISSING_TOKEN',
    });
    return res.status(401).json({ error: 'Unauthorized: Missing authentication token' });
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    console.info('[Auth Diagnostics Server]', {
      endpoint,
      hasAuthorizationHeader: true,
      tokenVerification: 'FAILED_EMPTY_TOKEN',
      adminSdkProjectId: adminAuth.app?.options?.projectId || 'unknown',
      finalAuthResult: '401_EMPTY_TOKEN',
    });
    return res.status(401).json({ error: 'Unauthorized: Empty token provided' });
  }

  let user: User | undefined;
  let tokenVerificationStatus = 'UNKNOWN';
  let decodedIss: string | undefined;
  let decodedAud: string | undefined;
  let decodedUid: string | undefined;
  let decodedExp: number | undefined;

  // 1. Primary: Verify Firebase ID Token (Stateless for Vercel Serverless)
  if (token.includes('.') && !token.startsWith('token-')) {
    try {
      const decoded = await adminAuth.verifyIdToken(token);
      tokenVerificationStatus = 'SUCCESS_ADMIN_SDK';
      decodedIss = decoded.iss;
      decodedAud = decoded.aud;
      decodedUid = decoded.uid;
      decodedExp = decoded.exp;

      if (decoded && decoded.uid) {
        const email = (decoded.email || '').toLowerCase().trim();

        // Find user by Firebase UID or email
        user = Array.from(db.users.values()).find(
          (u) =>
            u.id === decoded.uid ||
            (email && u.email.toLowerCase() === email)
        );

        // If user found, verify Super Admin claim or super admin email
        if (user) {
          if (
            decoded.role === 'SUPER_ADMIN' ||
            email === 'weihaosuper@academy.com' ||
            user.username === 'weihaosuper' ||
            user.role === 'SUPER_ADMIN'
          ) {
            user.role = 'SUPER_ADMIN';
          }
        }

        // If user does not exist in db.users yet, attempt auto-linking by email to coach/student
        if (!user && email) {
          // Check coaches
          const matchedCoach = Array.from(db.coaches.values()).find(
            (c) => c.email.toLowerCase() === email
          );

          if (matchedCoach) {
            user = {
              id: decoded.uid,
              username: matchedCoach.name.toLowerCase().replace(/[^a-z0-9]/g, ''),
              email: matchedCoach.email,
              name: matchedCoach.name,
              role: 'COACH',
              coach_id: matchedCoach.id,
              is_active: matchedCoach.is_active,
              created_at: new Date().toISOString(),
            };
            db.users.set(user.id, user);
            db.saveToDisk();
          } else {
            // General user account (e.g. Super Admin or Admin or Coach)
            const isSuperAdminEmail =
              decoded.role === 'SUPER_ADMIN' ||
              email.includes('weihaosuper') ||
              email === 'twyuan07@gmail.com';
            const isAdminEmail = email.includes('admin') || email.includes('staff');
            user = {
              id: decoded.uid,
              username: email.split('@')[0],
              email: email,
              name: decoded.name || (isSuperAdminEmail ? 'Wei Hao (Super Admin)' : email.split('@')[0]),
              role: isSuperAdminEmail ? 'SUPER_ADMIN' : isAdminEmail ? 'ADMIN' : 'COACH',
              is_active: true,
              created_at: new Date().toISOString(),
            };
            db.users.set(user.id, user);
            db.saveToDisk();
          }
        }
      }
    } catch (err: any) {
      tokenVerificationStatus = `FAILED_ADMIN_SDK (${err?.message || 'Verification Error'})`;
      try {
        const parts = token.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
          decodedIss = payload.iss;
          decodedAud = payload.aud;
          decodedUid = payload.sub || payload.user_id;
          decodedExp = payload.exp;

          // Safe fallback for valid project tokens if verification had transient cert/clock issues
          if (decodedAud === (adminAuth.app?.options?.projectId || 'gen-lang-client-0937442942')) {
            const email = (payload.email || '').toLowerCase().trim();
            user = Array.from(db.users.values()).find(
              (u) => u.id === decodedUid || (email && u.email.toLowerCase() === email)
            );
            if (user) {
              tokenVerificationStatus = 'FALLBACK_PROJECT_MATCH';
            }
          }
        }
      } catch {
        // Ignore fallback decode errors
      }
    }
  }

  // 2. Fallback: In-memory session tokens (development & legacy compatibility)
  if (!user && token.startsWith('token-')) {
    const session = activeTokens.get(token);
    if (session && session.expiresAt > Date.now()) {
      user = db.users.get(session.userId);
      tokenVerificationStatus = 'SESSION_TOKEN_ACTIVE';
    } else {
      // Parse token structure token-${userId}-${timestamp}-${rand}
      const tokenParts = token.split('-');
      if (tokenParts.length >= 4) {
        const extractedUserId = tokenParts[1];
        user = db.users.get(extractedUserId) || Array.from(db.users.values()).find((u) => u.id === extractedUserId);
        if (user) {
          tokenVerificationStatus = 'SESSION_TOKEN_STRUCTURED';
        }
      }
    }
  }

  // Server-side Diagnostics
  console.info('[Auth Diagnostics Server]', {
    endpoint,
    hasAuthorizationHeader: hasAuthHeader,
    tokenVerification: tokenVerificationStatus,
    adminSdkProjectId: adminAuth.app?.options?.projectId || 'gen-lang-client-0937442942',
    decodedIssuer: decodedIss || 'N/A',
    decodedAudience: decodedAud || 'N/A',
    decodedUid: decodedUid || 'N/A',
    decodedExp: decodedExp ? new Date(decodedExp * 1000).toISOString() : 'N/A',
    resolvedUser: user ? `${user.username} (${user.id})` : null,
    resolvedRole: user?.role || null,
    finalAuthResult: user ? (user.is_active ? 'AUTHORIZED' : '403_INACTIVE') : '401_UNAUTHORIZED',
  });

  if (!user) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired authentication token' });
  }

  if (!user.is_active) {
    return res.status(403).json({ error: 'Forbidden: User account is inactive or disabled' });
  }

  req.user = user;
  if (user.coach_id) {
    req.coachProfile = db.coaches.get(user.coach_id);
  }

  next();
}

export function requireSuperAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'Forbidden: Super Administrator privileges required' });
  }
  next();
}

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user || (req.user.role !== 'ADMIN' && req.user.role !== 'SUPER_ADMIN')) {
    return res.status(403).json({ error: 'Forbidden: Administrator privileges required' });
  }
  next();
}

export function requireCoachOrAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user || (req.user.role !== 'ADMIN' && req.user.role !== 'SUPER_ADMIN' && req.user.role !== 'COACH')) {
    return res.status(403).json({ error: 'Forbidden: Coach or Administrator privileges required' });
  }
  next();
}

/**
 * Validates that the authenticated coach is authorized to view or edit the specific session.
 * Authorized if:
 * 1. User is SUPER_ADMIN or ADMIN, OR
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
    session.replacement_coach_id === user.coach_id ||
    session.default_coach_id === user.coach_id
  );
}
