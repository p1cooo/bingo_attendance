import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { db } from './db.js';

type AccountantSession = { date: string; className: string; classType: 'GROUP' | 'INDIVIDUAL'; startTime: string; endTime: string; durationHours: number; studentAttendances: { name: string; attended: boolean }[]; };
export type AccountantCoach = { id: string; name: string; sessions: AccountantSession[]; totalHours: number };
const attended = (status: string) => status === 'PRESENT' || status === 'LATE';
const duration = (start: string, end: string) => { const [sh, sm] = start.split(':').map(Number); const [eh, em] = end.split(':').map(Number); return Math.max(0, (eh * 60 + em - sh * 60 - sm) / 60); };
const shortDate = (value: string) => { const [, m, d] = value.split('-'); return `${Number(d)}/${Number(m)}`; };

/** Only sessions with at least one attendance record are auditable teaching sessions. */
export function getAccountantReport(month: string, coachId?: string, classId?: string): AccountantCoach[] {
  const byCoach = new Map<string, AccountantCoach>();
  for (const session of db.sessions.values()) {
    if (!session.session_date.startsWith(month) || (classId && session.class_id !== classId)) continue;
    const records = Array.from(db.attendance.values()).filter((record) => record.session_id === session.id);
    if (!records.length) continue;
    const actualCoachId = session.actual_coach_id || session.scheduled_coach_id || session.default_coach_id;
    if (!actualCoachId || (coachId && actualCoachId !== coachId)) continue;
    const coach = db.coaches.get(actualCoachId); const cls = db.classes.get(session.class_id);
    if (!coach || !cls) continue;
    if (!byCoach.has(actualCoachId)) byCoach.set(actualCoachId, { id: actualCoachId, name: coach.name, sessions: [], totalHours: 0 });
    const item = byCoach.get(actualCoachId)!;
    item.sessions.push({ date: session.session_date, className: cls.name, classType: cls.class_type, startTime: session.start_time, endTime: session.end_time, durationHours: duration(session.start_time, session.end_time), studentAttendances: records.map((record) => ({ name: db.students.get(record.student_id)?.full_name || 'Unregistered student', attended: attended(record.status) })) });
  }
  for (const item of byCoach.values()) { item.sessions.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)); item.totalHours = item.sessions.reduce((sum, session) => sum + session.durationHours, 0); }
  return Array.from(byCoach.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export async function generateAccountantWorkbook(month: string, coachId?: string, classId?: string): Promise<Buffer> {
  const report = getAccountantReport(month, coachId, classId); const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet('Accountant Summary');
  sheet.views = [{ showGridLines: false }]; sheet.columns = [{ width: 24 }, { width: 18 }, { width: 17 }, { width: 14 }, { width: 16 }, { width: 36 }];
  sheet.mergeCells('A1:F1'); sheet.getCell('A1').value = `Academy Teaching Attendance - ${month}`; sheet.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } }; sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } }; sheet.getCell('A1').alignment = { horizontal: 'center' };
  const header = sheet.addRow(['Coach', 'Completed sessions', 'Teaching hours', 'Group sessions', 'Individual sessions', 'Present attendances']); header.font = { bold: true, color: { argb: 'FFFFFFFF' } }; header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
  for (const coach of report) { const group = coach.sessions.filter((s) => s.classType === 'GROUP'); const individual = coach.sessions.filter((s) => s.classType === 'INDIVIDUAL'); const present = coach.sessions.flatMap((s) => s.studentAttendances).filter((s) => s.attended).length; sheet.addRow([coach.name, coach.sessions.length, coach.totalHours, group.length, individual.length, present]); for (const session of coach.sessions) sheet.addRow(['', shortDate(session.date), `${session.startTime}-${session.endTime}`, session.className, session.classType, session.studentAttendances.filter((s) => s.attended).map((s) => s.name).join(', ')]); }
  sheet.getColumn(3).numFmt = '0.0'; sheet.getRow(1).height = 28; sheet.eachRow((row) => row.alignment = { vertical: 'top', wrapText: true });
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function generateAccountantPdf(month: string, coachId?: string, classId?: string): Promise<Buffer> {
  const report = getAccountantReport(month, coachId, classId);
  return new Promise((resolve, reject) => { const pdf = new PDFDocument({ margin: 42, size: 'A4' }); const chunks: Buffer[] = []; pdf.on('data', (chunk) => chunks.push(chunk)); pdf.on('end', () => resolve(Buffer.concat(chunks))); pdf.on('error', reject); pdf.fontSize(18).fillColor('#0f172a').text(`Academy Teaching Attendance - ${month}`); pdf.moveDown(0.35); pdf.fontSize(9).fillColor('#475569').text('Auditable report: only sessions with recorded attendance. Group totals count Present/Late, including replacements.'); pdf.moveDown(); for (const coach of report) { if (pdf.y > 700) pdf.addPage(); pdf.fontSize(13).fillColor('#0f172a').text(`${coach.name} - Total ${coach.totalHours.toFixed(1)} hours (${coach.sessions.length} completed sessions)`); pdf.moveDown(0.25); for (const session of coach.sessions) { const present = session.studentAttendances.filter((s) => s.attended).map((s) => s.name); pdf.fontSize(10).fillColor('#111827').text(`${shortDate(session.date)}   ${session.startTime}-${session.endTime}   ${session.className}`); if (session.classType === 'GROUP') pdf.fontSize(9).fillColor('#475569').text(`  Present: ${present.length ? present.join(', ') : 'None'}`); } pdf.moveDown(0.75); } pdf.end(); });
}
