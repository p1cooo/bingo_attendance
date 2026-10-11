import { User } from '../src/types.js';
import { db } from './db.js';
import { syncDocToFirestore } from './firestoreSync.js';

export function activityEntry(actor: User, action: string, entityType: string, entityId: string, options: { classId?: string; summary?: string; previous_values?: unknown; new_values?: unknown; notes?: string } = {}) {
  return { id: `activity-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, actor_user_id: actor.id, actor_user_name: actor.name, actor_role: actor.role, action, entity_type: entityType, entity_id: entityId, class_id: options.classId, summary: options.summary, previous_values: options.previous_values, new_values: options.new_values, notes: options.notes, created_at: new Date().toISOString() };
}

export async function recordActivity(actor: User, action: string, entityType: string, entityId: string, options: { classId?: string; summary?: string; previous_values?: unknown; new_values?: unknown; notes?: string } = {}) {
  const entry = activityEntry(actor, action, entityType, entityId, options);
  db.activityLogs.unshift(entry);
  try { await syncDocToFirestore('activityLogs', entry.id, entry, false); }
  catch (error) { db.activityLogs.shift(); throw error; }
  return entry;
}
