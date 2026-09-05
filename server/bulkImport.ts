import { db } from './db.js';
import { markFirestoreStateChanged, syncDocToFirestore } from './firestoreSync.js';
import { Student, Coach, Parent, AcademyClass, ClassSchedule } from '../src/types.js';

export interface BulkImportItemResult {
  rowNumber: number;
  raw: Record<string, any>;
  isValid: boolean;
  errors: string[];
  previewData?: any;
}

export interface BulkImportValidationResponse {
  type: string;
  total: number;
  readyCount: number;
  errorCount: number;
  items: BulkImportItemResult[];
}

export function validateBulkImport(type: string, rows: Record<string, any>[]): BulkImportValidationResponse {
  const items: BulkImportItemResult[] = [];
  let readyCount = 0;
  let errorCount = 0;

  // Track duplicates within the batch
  const seenStudentIds = new Set<string>();
  const seenEmails = new Set<string>();

  rows.forEach((raw, idx) => {
    const rowNumber = idx + 1;
    const errors: string[] = [];
    let previewData: any = null;

    if (type === 'students') {
      const name = raw.full_name || raw.name || raw['Full Name'] || raw['Student Name'];
      const studentCode = (raw.student_id || raw.code || raw['Student ID'] || raw['Student Code'] || '').trim();
      const parentName = raw.parent_name || raw['Parent Name'];
      const parentPhone = raw.parent_phone || raw.phone || raw['Parent Phone'] || raw['Contact Number'];
      const school = raw.school || raw['School'];
      const nickname = raw.nick_name || raw.nickname || raw['Nickname'];

      if (!name || String(name).trim().length === 0) {
        errors.push('Missing student full name');
      }

      if (studentCode) {
        if (seenStudentIds.has(studentCode.toLowerCase())) {
          errors.push(`Duplicate Student ID "${studentCode}" within import file`);
        } else {
          seenStudentIds.add(studentCode.toLowerCase());
        }

        // Check against existing database
        const existingStudent = Array.from(db.students.values()).find(
          (s) => s.student_id.toLowerCase() === studentCode.toLowerCase()
        );
        if (existingStudent) {
          errors.push(`Student ID "${studentCode}" already exists for ${existingStudent.full_name}`);
        }
      }

      const isValid = errors.length === 0;
      if (isValid) {
        readyCount++;
        previewData = {
          full_name: String(name).trim(),
          student_id: studentCode || `STU-${Math.floor(1000 + Math.random() * 9000)}`,
          nick_name: nickname ? String(nickname).trim() : undefined,
          school: school ? String(school).trim() : undefined,
          parent_name: parentName ? String(parentName).trim() : undefined,
          parent_phone: parentPhone ? String(parentPhone).trim() : undefined,
          status: 'ACTIVE',
        };
      } else {
        errorCount++;
      }

      items.push({ rowNumber, raw, isValid, errors, previewData });
    } else if (type === 'coaches') {
      const name = raw.name || raw.full_name || raw['Coach Name'] || raw['Name'];
      const email = (raw.email || raw['Email'] || '').trim();
      const phone = raw.phone || raw['Phone'] || raw['Contact Number'];
      const color = raw.color || raw['Color Hex'] || '#3b82f6';
      const colorName = raw.color_name || raw['Color Name'] || 'Pastel Blue';

      if (!name) errors.push('Missing coach name');
      if (!email) errors.push('Missing coach email');
      else if (!email.includes('@')) errors.push('Invalid email format');

      if (email) {
        if (seenEmails.has(email.toLowerCase())) {
          errors.push(`Duplicate email "${email}" in import file`);
        } else {
          seenEmails.add(email.toLowerCase());
        }

        const existingCoach = Array.from(db.coaches.values()).find(
          (c) => c.email.toLowerCase() === email.toLowerCase()
        );
        if (existingCoach) {
          errors.push(`Coach email "${email}" already registered for ${existingCoach.name}`);
        }
      }

      const isValid = errors.length === 0;
      if (isValid) {
        readyCount++;
        previewData = {
          name: String(name).trim(),
          email: email.toLowerCase(),
          phone: phone ? String(phone).trim() : '',
          color,
          color_name: colorName,
          is_active: true,
        };
      } else {
        errorCount++;
      }

      items.push({ rowNumber, raw, isValid, errors, previewData });
    } else if (type === 'classes') {
      const name = raw.name || raw['Class Name'] || raw['Name'];
      const classType = (raw.class_type || raw['Class Type'] || 'GROUP').toUpperCase();
      const coachName = raw.coach_name || raw.default_coach || raw['Default Coach'];
      const duration = Number(raw.default_duration_mins || raw['Duration (Mins)'] || 90);

      if (!name) errors.push('Missing class name');
      if (classType !== 'GROUP' && classType !== 'INDIVIDUAL') {
        errors.push('Class type must be GROUP or INDIVIDUAL');
      }

      let coachId: string | undefined;
      if (coachName) {
        const foundCoach = Array.from(db.coaches.values()).find(
          (c) => c.name.toLowerCase().includes(String(coachName).toLowerCase())
        );
        if (foundCoach) {
          coachId = foundCoach.id;
        }
      }

      const isValid = errors.length === 0;
      if (isValid) {
        readyCount++;
        previewData = {
          name: String(name).trim(),
          class_type: classType,
          default_duration_mins: duration,
          default_capacity: classType === 'INDIVIDUAL' ? 1 : 12,
          default_coach_id: coachId,
          is_active: true,
        };
      } else {
        errorCount++;
      }

      items.push({ rowNumber, raw, isValid, errors, previewData });
    } else if (type === 'schedules') {
      const className = raw.class_name || raw['Class Name'];
      const dayOfWeek = Number(raw.day_of_week ?? raw['Day of Week'] ?? 6); // default Saturday
      const startTime = raw.start_time || raw['Start Time'] || '09:30';
      const endTime = raw.end_time || raw['End Time'] || '11:00';
      const coachName = raw.coach_name || raw['Coach'];

      let classId: string | undefined;
      if (className) {
        const found = Array.from(db.classes.values()).find(
          (c) => c.name.toLowerCase().includes(String(className).toLowerCase())
        );
        if (found) classId = found.id;
        else errors.push(`Class "${className}" not found in database`);
      } else {
        errors.push('Missing class name');
      }

      let coachId: string | undefined;
      if (coachName) {
        const found = Array.from(db.coaches.values()).find(
          (c) => c.name.toLowerCase().includes(String(coachName).toLowerCase())
        );
        if (found) coachId = found.id;
      }

      const isValid = errors.length === 0;
      if (isValid) {
        readyCount++;
        previewData = {
          class_id: classId,
          coach_id: coachId || 'coach-1',
          day_of_week: dayOfWeek,
          start_time: startTime,
          end_time: endTime,
          status: 'ACTIVE',
          is_active: true,
        };
      } else {
        errorCount++;
      }

      items.push({ rowNumber, raw, isValid, errors, previewData });
    } else {
      errors.push(`Unsupported import type: ${type}`);
      errorCount++;
      items.push({ rowNumber, raw, isValid: false, errors });
    }
  });

  return {
    type,
    total: rows.length,
    readyCount,
    errorCount,
    items,
  };
}

export async function commitBulkImport(type: string, validatedItems: BulkImportItemResult[]): Promise<{
  importedCount: number;
  errors: string[];
}> {
  const readyItems = validatedItems.filter((i) => i.isValid && i.previewData);
  let importedCount = 0;
  const errors: string[] = [];
  const persistenceTasks: Promise<void>[] = [];

  for (const item of readyItems) {
    const data = item.previewData;
    try {
      if (type === 'students') {
        const studentId = `student-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
        let parentId: string | undefined;

        if (data.parent_name || data.parent_phone) {
          parentId = `parent-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
          const newParent: Parent = {
            id: parentId,
            name: data.parent_name || `${data.full_name}'s Parent`,
            phone: data.parent_phone || '',
            created_at: new Date().toISOString(),
          };
          db.parents.set(parentId, newParent);
          persistenceTasks.push(syncDocToFirestore('parents', parentId, newParent, false));
        }

        const newStudent: Student = {
          id: studentId,
          student_id: data.student_id,
          full_name: data.full_name,
          nick_name: data.nick_name,
          school: data.school,
          parent_id: parentId,
          parent_relation: 'Parent',
          status: 'ACTIVE',
          created_at: new Date().toISOString(),
        };

        db.students.set(studentId, newStudent);
        persistenceTasks.push(syncDocToFirestore('students', studentId, newStudent, false));
        importedCount++;
      } else if (type === 'coaches') {
        const coachId = `coach-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
        const newCoach: Coach = {
          id: coachId,
          name: data.name,
          email: data.email,
          phone: data.phone || '',
          color: data.color,
          color_name: data.color_name,
          is_active: true,
          created_at: new Date().toISOString(),
        };
        db.coaches.set(coachId, newCoach);
        persistenceTasks.push(syncDocToFirestore('coaches', coachId, newCoach, false));

        // Create User login account for coach
        const userId = `user-${coachId}`;
        const newUser = {
          id: userId,
          email: data.email,
          name: data.name,
          role: 'COACH' as const,
          coach_id: coachId,
          is_active: true,
          created_at: new Date().toISOString(),
        };
        db.users.set(userId, newUser);
        persistenceTasks.push(syncDocToFirestore('users', userId, newUser, false));

        importedCount++;
      } else if (type === 'classes') {
        const classId = `class-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
        const newClass: AcademyClass = {
          id: classId,
          name: data.name,
          class_type: data.class_type,
          default_duration_mins: data.default_duration_mins || 90,
          default_capacity: data.default_capacity || 12,
          default_coach_id: data.default_coach_id,
          is_active: true,
          created_at: new Date().toISOString(),
        };
        db.classes.set(classId, newClass);
        persistenceTasks.push(syncDocToFirestore('classes', classId, newClass, false));
        importedCount++;
      } else if (type === 'schedules') {
        const schedId = `sched-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
        const newSched: ClassSchedule = {
          id: schedId,
          class_id: data.class_id,
          coach_id: data.coach_id,
          day_of_week: data.day_of_week,
          start_time: data.start_time,
          end_time: data.end_time,
          status: 'ACTIVE',
          is_active: true,
          created_at: new Date().toISOString(),
        };
        db.schedules.set(schedId, newSched);
        persistenceTasks.push(syncDocToFirestore('schedules', schedId, newSched, false));
        importedCount++;
      }
    } catch (err: any) {
      errors.push(`Row ${item.rowNumber}: ${err.message}`);
    }
  }

  // In a serverless function, background promises can be terminated once the
  // response is sent. Do not report a successful import until every document
  // has been written to Firestore and the durable revision is updated.
  await Promise.all(persistenceTasks);
  await markFirestoreStateChanged();
  db.saveToDisk();
  return { importedCount, errors };
}
