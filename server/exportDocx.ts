import { AlignmentType, Document, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from 'docx';
import { db } from './db.js';

const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const dayColours = ['22C55E', '06B6D4', '06B6D4', '06B6D4', '06B6D4', '06B6D4', '22C55E'];

function coachColumn(coachId: string): Paragraph[] {
  const coach = db.coaches.get(coachId);
  const schedules = Array.from(db.schedules.values()).filter((s) => s.status === 'ACTIVE' && (s.coach_id === coachId || s.default_coach_id === coachId)).sort((a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time));
  const paragraphs: Paragraph[] = [new Paragraph({ children: [new TextRun({ text: coach?.name || 'Unassigned coach', bold: true, size: 28, color: '111827' })], spacing: { after: 150 } })];
  let currentDay = -1;
  for (const schedule of schedules) {
    const cls = db.classes.get(schedule.class_id); if (!cls) continue;
    if (currentDay !== schedule.day_of_week) { currentDay = schedule.day_of_week; paragraphs.push(new Paragraph({ children: [new TextRun({ text: dayNames[currentDay], bold: true, underline: {}, highlight: dayColours[currentDay] as any, size: 22 })], spacing: { before: 140, after: 20 } })); }
    const students = Array.from(db.memberships.values()).filter((m) => (m.schedule_id === schedule.id || m.schedule_id === cls.id) && m.status === 'ACTIVE').map((m) => db.students.get(m.student_id)?.full_name).filter(Boolean) as string[];
    const label = cls.class_type === 'INDIVIDUAL' ? `${schedule.start_time}-${schedule.end_time}: ${cls.name}` : `${schedule.start_time}-${schedule.end_time}: ${cls.name} (${students.length} students)`;
    paragraphs.push(new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 20 })], spacing: { after: cls.class_type === 'GROUP' ? 15 : 70 } }));
    if (cls.class_type === 'GROUP') students.forEach((student, index) => paragraphs.push(new Paragraph({ children: [new TextRun({ text: `${index + 1}. ${student}`, size: 19 })], indent: { left: 180 }, spacing: { after: 8 } })));
  }
  if (!schedules.length) paragraphs.push(new Paragraph({ children: [new TextRun({ text: 'No active weekly classes', italics: true, color: '64748B', size: 19 })] }));
  return paragraphs;
}

export async function generateClassScheduleDocx(): Promise<Buffer> {
  const coachIds = Array.from(new Set(Array.from(db.schedules.values()).filter((s) => s.status === 'ACTIVE').map((s) => s.coach_id || s.default_coach_id).filter(Boolean))) as string[];
  const children: (Paragraph | Table)[] = [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'BINGO CHESS ACADEMY - WEEKLY CLASS TIMETABLE', bold: true, size: 30, color: '0F172A' })], spacing: { after: 100 } }), new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Recurring schedules and current class rosters', italics: true, size: 19, color: '475569' })], spacing: { after: 240 } })];
  for (let index = 0; index < coachIds.length; index += 2) {
    const cells = coachIds.slice(index, index + 2).map((id) => new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, children: coachColumn(id) }));
    if (cells.length === 1) cells.push(new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, children: [new Paragraph('')] }));
    children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ children: cells })] }));
    if (index + 2 < coachIds.length) children.push(new Paragraph({ pageBreakBefore: true, text: '' }));
  }
  return Packer.toBuffer(new Document({ sections: [{ properties: { page: { size: { width: 16840, height: 11900 }, margin: { top: 600, right: 600, bottom: 600, left: 600 } } }, children }] }));
}
