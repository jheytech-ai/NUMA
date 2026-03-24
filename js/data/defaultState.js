export const defaultState = {
  onboardingCompleted: false,
  currentScreen: "splash",
  userPreferences: {
    trackingGoal: "cycle",
    showFertility: false,
    notificationsEnabled: true,
    privacyEnabled: false,
    discreetMode: true,
    language: "pt-BR"
  },
  cycleData: {
    averageCycleLength: 28,
    averagePeriodLength: 5,
    periodHistory: []
  },
  dailyLogs: [],
  forms: {
    pastPeriod: {
      startDate: "",
      duration: 5,
      flow: "Médio",
      notes: ""
    }
  }
};
