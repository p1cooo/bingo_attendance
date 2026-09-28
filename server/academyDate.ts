const academyFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit',
});

export function academyToday(now = new Date()): string {
  const parts = Object.fromEntries(academyFormatter.formatToParts(now)
    .filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function academyMonth(now = new Date()): string { return academyToday(now).slice(0, 7); }
