export function predictNextPeriod(lastStartDate, averageCycleLength) {
  if (!lastStartDate) return null;
  const date = new Date(lastStartDate);
  date.setDate(date.getDate() + averageCycleLength);
  return date;
}
