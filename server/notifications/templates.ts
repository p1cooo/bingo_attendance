import { AttendanceNotificationPayload } from './types.js';

/**
 * Attendance Notification Template Layer
 * Decouples message wording from attendance routes and controllers.
 */

export function generateAttendanceMessage(payload: AttendanceNotificationPayload): string {
  const {
    parentName,
    studentName,
    attendanceStatus,
    attendanceType,
    className,
    sessionDate,
    startTime,
    endTime,
    coachName,
    replacementNote,
  } = payload;

  const parentGreeting = parentName ? `Hi ${parentName},` : 'Hello,';
  const timeDisplay = endTime ? `${startTime} - ${endTime}` : startTime;

  let statusText: string = attendanceStatus;
  if (attendanceStatus === 'PRESENT') statusText = 'Present';
  else if (attendanceStatus === 'ABSENT') statusText = 'Absent';
  else if (attendanceStatus === 'LATE') statusText = 'Late';
  else if (attendanceStatus === 'EXCUSED') statusText = 'Excused';

  const typeSuffix =
    attendanceType === 'REPLACEMENT'
      ? ` (Replacement Lesson${replacementNote ? `: ${replacementNote}` : ''})`
      : '';

  return (
    `${parentGreeting}\n\n` +
    `This is an attendance notification from Bingo Chess Academy.\n\n` +
    `• Student: ${studentName}\n` +
    `• Class: ${className}\n` +
    `• Date: ${sessionDate}\n` +
    `• Time: ${timeDisplay}\n` +
    `• Coach: ${coachName}\n` +
    `• Attendance Status: ${statusText}${typeSuffix}\n\n` +
    `Thank you.`
  );
}
