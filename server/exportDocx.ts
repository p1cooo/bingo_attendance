import { Document, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, HeadingLevel, BorderStyle } from 'docx';
import { db } from './db.js';

export async function generateClassScheduleDocx(): Promise<Buffer> {
  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const classesList = Array.from(db.classes.values());
  const schedulesList = Array.from(db.schedules.values()).filter((s) => s.status === 'ACTIVE');

  // Group schedules by day of week
  const schedulesByDay = new Map<number, typeof schedulesList>();
  for (let i = 0; i < 7; i++) {
    schedulesByDay.set(i, []);
  }

  schedulesList.forEach((s) => {
    const list = schedulesByDay.get(s.day_of_week) || [];
    list.push(s);
    schedulesByDay.set(s.day_of_week, list);
  });

  const docChildren: any[] = [];

  // Header Title
  docChildren.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: 'CHESS ACADEMY MANAGEMENT SYSTEM',
          bold: true,
          size: 32, // 16pt
          color: '0F172A',
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
      children: [
        new TextRun({
          text: 'Official Academy Class Schedule & Student Roster Overview',
          italics: true,
          size: 24, // 12pt
          color: '475569',
        }),
      ],
    })
  );

  // For each day that has schedules (e.g. Saturday = 6, Sunday = 0, etc.)
  const dayOrder = [6, 0, 1, 2, 3, 4, 5]; // Weekend first

  for (const dayIdx of dayOrder) {
    const daySchedules = schedulesByDay.get(dayIdx) || [];
    if (daySchedules.length === 0) continue;

    const dayName = daysOfWeek[dayIdx].toUpperCase();

    docChildren.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 300, after: 150 },
        children: [
          new TextRun({
            text: `DAY: ${dayName}`,
            bold: true,
            size: 28,
            color: '1E293B',
          }),
        ],
      })
    );

    // Build table rows
    const tableRows: TableRow[] = [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 25, type: WidthType.PERCENTAGE },
            children: [new Paragraph({ children: [new TextRun({ text: 'Time / Room', bold: true, size: 20 })] })],
          }),
          new TableCell({
            width: { size: 30, type: WidthType.PERCENTAGE },
            children: [new Paragraph({ children: [new TextRun({ text: 'Class & Type', bold: true, size: 20 })] })],
          }),
          new TableCell({
            width: { size: 20, type: WidthType.PERCENTAGE },
            children: [new Paragraph({ children: [new TextRun({ text: 'Assigned Coach', bold: true, size: 20 })] })],
          }),
          new TableCell({
            width: { size: 25, type: WidthType.PERCENTAGE },
            children: [new Paragraph({ children: [new TextRun({ text: 'Enrolled Students', bold: true, size: 20 })] })],
          }),
        ],
      }),
    ];

    daySchedules.sort((a, b) => a.start_time.localeCompare(b.start_time));

    daySchedules.forEach((s) => {
      const cls = db.classes.get(s.class_id);
      const coach = db.coaches.get(s.coach_id);
      const enrolled = Array.from(db.memberships.values())
        .filter((m) => (m.schedule_id === s.id || m.schedule_id === s.class_id) && m.status === 'ACTIVE')
        .map((m) => db.students.get(m.student_id)?.full_name)
        .filter(Boolean);

      const enrolledText = enrolled.length > 0 ? enrolled.join(', ') : 'None currently enrolled';

      tableRows.push(
        new TableRow({
          children: [
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({ text: `${s.start_time} – ${s.end_time}`, bold: true, size: 18 }),
                    new TextRun({ text: s.room_location ? `\nRoom: ${s.room_location}` : '', size: 16, color: '64748B' }),
                  ],
                }),
              ],
            }),
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({ text: cls?.name || 'Class', bold: true, size: 18 }),
                    new TextRun({ text: `\n(${cls?.class_type || 'GROUP'})`, size: 16, color: '64748B' }),
                  ],
                }),
              ],
            }),
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({ text: coach ? `Coach ${coach.name}` : 'Unassigned', size: 18 }),
                  ],
                }),
              ],
            }),
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({ text: `${enrolled.length} Student(s):\n`, bold: true, size: 16 }),
                    new TextRun({ text: enrolledText, size: 16, color: '334155' }),
                  ],
                }),
              ],
            }),
          ],
        })
      );
    });

    const table = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: tableRows,
    });

    docChildren.push(table);
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: docChildren,
      },
    ],
  });

  const { Packer } = await import('docx');
  const buffer = await Packer.toBuffer(doc);
  return buffer;
}
