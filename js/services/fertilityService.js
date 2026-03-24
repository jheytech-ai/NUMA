export function getOvulationDate(start, averageCycleLength) {
  return new Date(start.getTime() + (averageCycleLength - 14) * 24 * 60 * 60 * 1000);
}

export function getFertileWindow(ovulationDate) {
  return {
    start: new Date(ovulationDate.getTime() - 5 * 24 * 60 * 60 * 1000),
    ovulation: ovulationDate,
    end: new Date(ovulationDate.getTime() + 1 * 24 * 60 * 60 * 1000)
  };
}
