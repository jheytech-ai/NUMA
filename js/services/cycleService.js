// funcoes com registos e calculos do ciclo menstrual
export function recalculateAverages(state) {
  const historyAsc = [...state.cycleData.periodHistory].sort((a, b) => new Date(a.startDate) - new Date(b.startDate));

  if (historyAsc.length >= 2) {
    const cycleDiffs = [];
    for (let i = 1; i < historyAsc.length; i++) {
      const prev = new Date(historyAsc[i - 1].startDate);
      const curr = new Date(historyAsc[i].startDate);
      const diff = Math.round((curr - prev) / (24 * 60 * 60 * 1000));
      if (diff > 0 && diff <= 60) cycleDiffs.push(diff);
    }
    if (cycleDiffs.length) {
      state.cycleData.averageCycleLength = Math.round(cycleDiffs.reduce((sum, v) => sum + v, 0) / cycleDiffs.length);
    }
  }

  if (historyAsc.length >= 1) {
    const durations = historyAsc
      .map(item => Number(item.duration))
      .filter(v => v > 0 && v <= 15);

    if (durations.length) {
      state.cycleData.averagePeriodLength = Math.round(durations.reduce((sum, v) => sum + v, 0) / durations.length);
    }
  }
}
