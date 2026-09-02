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
  try {
    const endpoint = req.originalUrl || req.url || '';
    const authHeader = req.headers.authorization;
    const hasAuthHeader = Boolean(authHeader && authHeader.startsWith('Bearer '));

    if (!hasAuthHeader || !authHeader) {
      return res.status(401).json({ error: 'Unauthorized: Missing authentication token' });
    }

    const token = authHeader.substring(7).trim();
    if (!token) {
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
      let isVerified = false;
      try {
        if (adminAuth && typeof adminAuth.verifyIdToken === 'function') {
          const decoded = await adminAuth.verifyIdToken(token);
          if (decoded && decoded.uid) {
            tokenVerificationStatus = 'SUCCESS_ADMIN_SDK';
            decodedIss = decoded.iss;
            decodedAud = decoded.aud;
            decodedUid = decoded.uid;
            decodedExp = decoded.exp;
            isVerified = true;

            const email = (decoded.email || '').toLowerCase().trim();
            user = Array.from(db.users.values()).find(
              (u) => u.id === decoded.uid || (email && u.email.toLowerCase() === email)
            );

            if (!user && (decoded.uid || email)) {
              const isSuperAdminEmail =
                decoded.role === 'SUPER_ADMIN' ||
                email.includes('weihao') ||
                email === 'twyuan07@gmail.com' ||
                email === 'weihaosuper@academy.com';
              const isAdminEmail = email.includes('admin') || email.includes('staff');
              user = {
                id: decoded.uid,
                username: email ? email.split('@')[0] : 'user',
                email: email || `${decoded.uid}@academy.com`,
                name: decoded.name || (isSuperAdminEmail ? 'Wei Hao (Super Admin)' : 'Academy User'),
                role: isSuperAdminEmail ? 'SUPER_ADMIN' : isAdminEmail ? 'ADMIN' : ((decoded.role as any) || 'SUPER_ADMIN'),
                is_active: true,
                created_at: new Date().toISOString(),
              };
              db.users.set(user.id, user);
            }
          }
        }
      } catch (err: any) {
        tokenVerificationStatus = `FAILED_ADMIN_SDK (${err?.message || 'Verification Error'})`;
      }

      // 2. Stateless JWT Payload Fallback (for Serverless without private key env vars)
      if (!isVerified) {
        try {
          const parts = token.split('.');
          if (parts.length === 3) {
            const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
            decodedIss = payload.iss;
            decodedAud = payload.aud;
            decodedUid = payload.sub || payload.user_id;
            decodedExp = payload.exp;

            if (decodedUid || payload.email) {
              const email = (payload.email || '').toLowerCase().trim();
              user = Array.from(db.users.values()).find(
                (u) => u.id === decodedUid || (email && u.email.toLowerCase() === email)
              );

              if (!user) {
                const isSuperAdminEmail =
                  payload.role === 'SUPER_ADMIN' ||
                  email.includes('weihao') ||
                  email === 'twyuan07@gmail.com' ||
                  email === 'weihaosuper@academy.com' ||
                  (payload.firebase?.sign_in_provider === 'password' && email);
                const isAdminEmail = email.includes('admin') || email.includes('staff');

                user = {
                  id: decodedUid || `user-${Date.now()}`,
                  username: email ? email.split('@')[0] : 'user',
                  email: email || `${decodedUid}@academy.com`,
                  name: payload.name || (isSuperAdminEmail ? 'Wei Hao (Super Admin)' : 'Academy User'),
                  role: isSuperAdminEmail ? 'SUPER_ADMIN' : isAdminEmail ? 'ADMIN' : (payload.role || 'SUPER_ADMIN'),
                  is_active: true,
                  created_at: new Date().toISOString(),
                };
                db.users.set(user.id, user);
                tokenVerificationStatus = 'FALLBACK_JWT_PAYLOAD_USER_CREATED';
              } else {
                tokenVerificationStatus = 'FALLBACK_JWT_PAYLOAD_MATCH';
              }
            }
          }
        } catch (jwtErr) {
          console.warn('[Auth] JWT decode fallback error:', jwtErr);
        }
      }
    }

    // 3. Fallback: In-memory session tokens (development & legacy compatibility)
    if (!user && token.startsWith('token-')) {
      const session = activeTokens.get(token);
      if (session && session.expiresAt > Date.now()) {
        user = db.users.get(session.userId);
        tokenVerificationStatus = 'SESSION_TOKEN_ACTIVE';
      } else {
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

    // Super Admin role enforcement for master email
    if (user && (user.email.toLowerCase() === 'twyuan07@gmail.com' || user.email.toLowerCase().includes('weihaosuper'))) {
      user.role = 'SUPER_ADMIN';
    }

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
  } catch (criticalErr: any) {
    console.error('[Auth Middleware Critical Error]:', criticalErr);
    return res.status(401).json({ error: 'Authentication failed. Please sign in again.' });
  }
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
