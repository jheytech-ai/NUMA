import { defaultState } from "./data/defaultState.js";
import { symptomCatalog } from "./data/symptomsData.js";
import { educationArticles } from "./data/educationData.js";
import { clone } from "./state.js";

const STORAGE_KEY = "numa_mvp_state_v2";

let state = loadState();
let currentCalendarDate = new Date();

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return clone(defaultState);
    const parsed = JSON.parse(saved);
    return {
      ...clone(defaultState),
      ...parsed,
      userPreferences: {
        ...clone(defaultState).userPreferences,
        ...(parsed.userPreferences || {})
      },
      cycleData: {
        ...clone(defaultState).cycleData,
        ...(parsed.cycleData || {})
      },
      forms: {
        ...clone(defaultState).forms,
        ...(parsed.forms || {})
      }
    };
  } catch {
    return clone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function setScreen(screenName) {
  state.currentScreen = screenName;
  saveState();
  render();
}

function formatDateISO(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDateISO(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysBetween(a, b) {
  const ms = 24 * 60 * 60 * 1000;
  return Math.round((startOfDay(b) - startOfDay(a)) / ms);
}

function addDays(date, amount) {
  const d = new Date(date);
  d.setDate(d.getDate() + amount);
  return d;
}

function getTodayISO() {
  return formatDateISO(new Date());
}

function comparePeriods(a, b) {
  return parseDateISO(b.startDate) - parseDateISO(a.startDate);
}

function getSortedPeriodHistory() {
  return [...state.cycleData.periodHistory].sort(comparePeriods);
}

function getLatestPeriod() {
  const history = getSortedPeriodHistory();
  return history[0] || null;
}

function getLastPeriodStartDate() {
  const latest = getLatestPeriod();
  return latest ? parseDateISO(latest.startDate) : null;
}

function recalculateAverages() {
  const historyAsc = [...state.cycleData.periodHistory].sort((a, b) => parseDateISO(a.startDate) - parseDateISO(b.startDate));

  if (historyAsc.length >= 2) {
    const cycleDiffs = [];
    for (let i = 1; i < historyAsc.length; i++) {
      const prev = parseDateISO(historyAsc[i - 1].startDate);
      const curr = parseDateISO(historyAsc[i].startDate);
      const diff = daysBetween(prev, curr);
      if (diff > 0 && diff <= 60) cycleDiffs.push(diff);
    }
    if (cycleDiffs.length) {
      const avgCycle = Math.round(cycleDiffs.reduce((sum, value) => sum + value, 0) / cycleDiffs.length);
      state.cycleData.averageCycleLength = avgCycle;
    }
  }

  if (historyAsc.length >= 1) {
    const durations = historyAsc
      .map(item => Number(item.duration))
      .filter(value => value > 0 && value <= 15);

    if (durations.length) {
      const avgDuration = Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length);
      state.cycleData.averagePeriodLength = avgDuration;
    }
  }
}

function getCycleDay() {
  const start = getLastPeriodStartDate();
  if (!start) return null;
  return daysBetween(start, new Date()) + 1;
}

function getNextPeriodDate() {
  const start = getLastPeriodStartDate();
  if (!start) return null;
  return addDays(start, state.cycleData.averageCycleLength);
}

function getDaysUntilNextPeriod() {
  const next = getNextPeriodDate();
  if (!next) return null;
  return daysBetween(new Date(), next);
}

function getCurrentPhase() {
  const day = getCycleDay();
  if (!day) return "Ainda sem dados";
  if (day <= state.cycleData.averagePeriodLength) return "Fase menstrual";
  if (day <= 13) return "Fase folicular";
  if (day <= 16) return "Ovulação estimada";
  return "Fase lútea";
}

function getOvulationDate() {
  const next = getNextPeriodDate();
  if (!next) return null;
  return addDays(next, -14);
}

function getFertileWindow() {
  const ovulation = getOvulationDate();
  if (!ovulation) return null;
  return {
    start: addDays(ovulation, -5),
    ovulation,
    end: addDays(ovulation, 1)
  };
}

function isDateInPeriod(date, period) {
  const start = parseDateISO(period.startDate);
  const end = addDays(start, Number(period.duration) - 1);
  return startOfDay(date) >= startOfDay(start) && startOfDay(date) <= startOfDay(end);
}

function getTodayLog() {
  return state.dailyLogs.find(log => log.date === getTodayISO()) || null;
}

function upsertTodayLog(newLog) {
  const idx = state.dailyLogs.findIndex(log => log.date === newLog.date);
  if (idx >= 0) state.dailyLogs[idx] = newLog;
  else state.dailyLogs.push(newLog);
  saveState();
}

function getRecentSymptoms() {
  const symptomCount = {};
  state.dailyLogs.forEach(log => {
    (log.symptoms || []).forEach(symptom => {
      symptomCount[symptom] = (symptomCount[symptom] || 0) + 1;
    });
  });
  return Object.entries(symptomCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(item => item[0]);
}

function getMoodSummary() {
  const counts = {};
  state.dailyLogs.forEach(log => {
    if (log.mood) counts[log.mood] = (counts[log.mood] || 0) + 1;
  });
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return top ? top[0] : "Sem registros";
}

function addPastPeriod(period) {
  const exists = state.cycleData.periodHistory.some(item => item.startDate === period.startDate);
  if (exists) {
    alert("Já existe um período registrado com essa data de início.");
    return false;
  }

  state.cycleData.periodHistory.push({
    startDate: period.startDate,
    duration: Number(period.duration),
    flow: period.flow || "Médio",
    notes: period.notes || ""
  });

  recalculateAverages();
  saveState();
  return true;
}

function removePastPeriod(startDate) {
  state.cycleData.periodHistory = state.cycleData.periodHistory.filter(item => item.startDate !== startDate);
  recalculateAverages();
  saveState();
}

function startAppFlow() {
  setTimeout(() => {
    if (state.onboardingCompleted) setScreen("home");
    else setScreen("onboarding");
  }, 1400);
}

function activeClass(name) {
  return state.currentScreen === name ? "active" : "";
}

function render() {
  renderScreens();
  renderBottomNav();
  bindEvents();
}

function renderScreens() {
  const screens = document.getElementById("screens");
  screens.innerHTML = `
    ${renderSplash()}
    ${renderOnboarding()}
    ${renderGoal()}
    ${renderFertility()}
    ${renderHome()}
    ${renderCalendar()}
    ${renderRegister()}
    ${renderInsights()}
    ${renderEducation()}
    ${renderSettings()}
  `;
}

function renderSplash() {
  return `
    <section class="screen centered ${activeClass("splash")}">
      <div class="logo">NUMA</div>
      <p class="tagline">Seu ciclo, sem ruído.</p>
    </section>
  `;
}

function renderOnboarding() {
  return `
    <section class="screen ${activeClass("onboarding")}">
      <div class="top-copy">
        <h1 class="title">Nem todo mundo quer engravidar.<br>E tudo bem.</h1>
        <p class="subtitle">
          Um app simples, direto e sem excesso. Para acompanhar seu ciclo com clareza.
        </p>
      </div>
      <div class="spacer"></div>
      <div class="stack">
        <button class="btn btn-primary" data-next="goal">Continuar</button>
      </div>
    </section>
  `;
}

function renderGoal() {
  const goal = state.userPreferences.trackingGoal;
  return `
    <section class="screen ${activeClass("goal")}">
      <div class="top-copy">
        <h1 class="title">O que você quer acompanhar?</h1>
        <p class="subtitle">Escolha o foco principal da sua experiência no NUMA.</p>
      </div>

      <div class="stack">
        <button class="chip ${goal === "cycle" ? "active" : ""}" data-goal="cycle">Apenas meu ciclo</button>
        <button class="chip ${goal === "symptoms" ? "active" : ""}" data-goal="symptoms">Sintomas</button>
        <button class="chip ${goal === "all" ? "active" : ""}" data-goal="all">Tudo</button>
      </div>

      <div class="card">
        <p class="small">Você pode mudar isso depois em Configurações.</p>
      </div>

      <div class="spacer"></div>
      <div class="stack">
        <button class="btn btn-primary" data-next="fertility">Continuar</button>
        <button class="btn btn-secondary" data-next="onboarding">Voltar</button>
      </div>
    </section>
  `;
}

function renderFertility() {
  const showFertility = state.userPreferences.showFertility;
  return `
    <section class="screen ${activeClass("fertility")}">
      <div class="top-copy">
        <h1 class="title">Mostrar informações de fertilidade?</h1>
        <p class="subtitle">
          Se ativado, o calendário também mostra janela fértil e ovulação estimada.
        </p>
      </div>

      <div class="stack">
        <button class="chip ${showFertility ? "" : "active"}" data-fertility="false">Não</button>
        <button class="chip ${showFertility ? "active" : ""}" data-fertility="true">Sim</button>
      </div>

      <div class="card">
        <p class="small">
          Isso é apenas uma estimativa com base no seu histórico e no ciclo médio. Não substitui orientação médica e não deve ser usado como método anticoncepcional.
        </p>
      </div>

      <div class="spacer"></div>
      <div class="stack">
        <button class="btn btn-primary" id="finishOnboarding">Entrar no app</button>
        <button class="btn btn-secondary" data-next="goal">Voltar</button>
      </div>
    </section>
  `;
}

function renderHome() {
  const cycleDay = getCycleDay();
  const nextDays = getDaysUntilNextPeriod();
  const phase = getCurrentPhase();
  const todayLog = getTodayLog();
  const nextDate = getNextPeriodDate();
  const history = getSortedPeriodHistory();
  const fertileWindow = state.userPreferences.showFertility ? getFertileWindow() : null;

  return `
    <section class="screen ${activeClass("home")}">
      <div class="row">
        <div>
          <p class="label">Hoje</p>
          <h1 class="title">${cycleDay ? `Dia ${cycleDay}` : "Sem dados"}</h1>
        </div>
      </div>

      <div class="card hero-card">
        <p class="label">Próxima menstruação</p>
        <div class="value">${nextDays === null ? "Configure o ciclo" : nextDays <= 0 ? "Hoje ou atrasada" : `Em ${nextDays} dias`}</div>
        <p class="small" style="margin-top:10px;">${phase}</p>
        ${nextDate ? `<p class="small" style="margin-top:8px;">Previsão: ${nextDate.toLocaleDateString("pt-BR")}</p>` : ""}
      </div>

      <div class="insight-grid">
        <div class="card metric-card">
          <h3>Ciclo médio</h3>
          <p>${state.cycleData.averageCycleLength} dias</p>
        </div>
        <div class="card metric-card">
          <h3>Menstruação</h3>
          <p>${state.cycleData.averagePeriodLength} dias</p>
        </div>
      </div>

      ${fertileWindow ? `
        <div class="card">
          <p class="section-title">Fertilidade estimada</p>
          <p class="small">Janela fértil: ${fertileWindow.start.toLocaleDateString("pt-BR")} até ${fertileWindow.end.toLocaleDateString("pt-BR")}</p>
          <p class="small" style="margin-top:8px;">Ovulação estimada: ${fertileWindow.ovulation.toLocaleDateString("pt-BR")}</p>
        </div>
      ` : ""}

      <div class="card">
        <p class="section-title">Registro de hoje</p>
        <p class="small">
          ${todayLog ? "Você já registrou suas informações de hoje." : "Ainda sem registro hoje."}
        </p>
        <div style="margin-top:14px;">
          <button class="btn btn-primary" data-nav="register" style="width:100%;">Registrar hoje</button>
        </div>
      </div>

      <div class="card">
        <p class="section-title">Resumo rápido</p>
        <p class="small">Humor mais frequente: ${getMoodSummary()}</p>
        <p class="small" style="margin-top:8px;">Sintomas recorrentes: ${getRecentSymptoms().length ? getRecentSymptoms().join(", ") : "Sem dados suficientes"}</p>
        <p class="small" style="margin-top:8px;">Períodos registrados: ${history.length}</p>
      </div>
    </section>
  `;
}

function renderCalendar() {
  const date = currentCalendarDate;
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startWeekday = firstDay.getDay();
  const daysInMonth = lastDay.getDate();
  const monthName = firstDay.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  const todayISO = getTodayISO();
  const history = getSortedPeriodHistory();
  const nextPeriod = getNextPeriodDate();
  const fertileWindow = state.userPreferences.showFertility ? getFertileWindow() : null;

  let daysHtml = "";
  for (let i = 0; i < startWeekday; i++) {
    daysHtml += `<div class="day empty"></div>`;
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const current = new Date(year, month, d);
    const currentISO = formatDateISO(current);
    let classes = "day";

    if (currentISO === todayISO) classes += " today";

    const matchesHistory = history.some(period => isDateInPeriod(current, period));
    if (matchesHistory) classes += " period";

    if (!matchesHistory && nextPeriod) {
      const predictedStart = nextPeriod;
      const predictedEnd = addDays(predictedStart, state.cycleData.averagePeriodLength - 1);
      if (startOfDay(current) >= startOfDay(predictedStart) && startOfDay(current) <= startOfDay(predictedEnd)) {
        classes += " predicted";
      }
    }

    if (fertileWindow) {
      if (startOfDay(current).getTime() === startOfDay(fertileWindow.ovulation).getTime()) {
        classes += " ovulation";
      } else if (startOfDay(current) >= startOfDay(fertileWindow.start) && startOfDay(current) <= startOfDay(fertileWindow.end)) {
        classes += " fertile";
      }
    }

    daysHtml += `<div class="${classes}" data-calendar-day="${currentISO}">${d}</div>`;
  }

  const historyHtml = history.length
    ? history.map(item => `
        <div class="history-item">
          <div class="history-meta">
            <strong>${parseDateISO(item.startDate).toLocaleDateString("pt-BR")}</strong>
            <span class="small">${item.duration} dias • fluxo ${item.flow || "não informado"}</span>
            ${item.notes ? `<span class="small">${item.notes}</span>` : ""}
          </div>
          <div class="history-actions">
            <button class="mini-btn" data-remove-period="${item.startDate}">Excluir</button>
          </div>
        </div>
      `).join("")
    : `<p class="empty-state">Nenhum período anterior registrado ainda.</p>`;

  return `
    <section class="screen ${activeClass("calendar")}">
      <div class="calendar-header">
        <button class="icon-btn" id="prevMonth">‹</button>
        <h1 class="title" style="font-size:24px; text-transform:capitalize;">${monthName}</h1>
        <button class="icon-btn" id="nextMonth">›</button>
      </div>

      <div class="card">
        <div class="weekdays" style="margin-bottom:12px;">
          <div>Dom</div><div>Seg</div><div>Ter</div><div>Qua</div><div>Qui</div><div>Sex</div><div>Sáb</div>
        </div>
        <div class="days-grid">${daysHtml}</div>
      </div>

      <div class="card">
        <p class="section-title">Legenda</p>
        <div class="legend">
          <span class="legend-item"><span class="legend-dot" style="background:var(--primary);"></span>Período registrado</span>
          <span class="legend-item"><span class="legend-dot" style="background:var(--primary-soft);"></span>Previsão menstrual</span>
          ${state.userPreferences.showFertility ? `
            <span class="legend-item"><span class="legend-dot" style="background:var(--fertile-soft);"></span>Janela fértil</span>
            <span class="legend-item"><span class="legend-dot" style="background:var(--ovulation-soft);"></span>Ovulação</span>
          ` : ""}
        </div>
      </div>

      <div class="card">
        <div class="row" style="margin-bottom:12px;">
          <p class="section-title" style="margin-bottom:0;">Registrar período anterior</p>
        </div>

        <div class="form-grid">
          <div>
            <label class="small">Data de início</label>
            <input type="date" id="pastStartDate" value="${state.forms.pastPeriod.startDate || ""}">
          </div>
          <div>
            <label class="small">Duração (dias)</label>
            <input type="number" id="pastDuration" min="1" max="15" value="${state.forms.pastPeriod.duration || 5}">
          </div>
        </div>

        <div class="form-grid" style="margin-top:12px;">
          <div>
            <label class="small">Fluxo</label>
            <select id="pastFlow">
              ${["Leve", "Médio", "Intenso"].map(option => `
                <option value="${option}" ${state.forms.pastPeriod.flow === option ? "selected" : ""}>${option}</option>
              `).join("")}
            </select>
          </div>
          <div>
            <label class="small">Observação</label>
            <input type="text" id="pastNotes" value="${state.forms.pastPeriod.notes || ""}" placeholder="Opcional">
          </div>
        </div>

        <div style="margin-top:14px;">
          <button class="btn btn-primary" id="savePastPeriod" style="width:100%;">Salvar período anterior</button>
        </div>
      </div>

      <div class="card">
        <p class="section-title">Histórico menstrual</p>
        <div class="history-list">${historyHtml}</div>
      </div>
    </section>
  `;
}

function renderRegister() {
  const todayLog = getTodayLog() || {
    date: getTodayISO(),
    flow: "",
    symptoms: [],
    mood: "",
    notes: ""
  };

  const flowOptions = ["Leve", "Médio", "Intenso"];
  const moodOptions = ["Bem", "Neutra", "Sensível", "Cansada"];

  return `
    <section class="screen ${activeClass("register")}">
      <div>
        <h1 class="title" style="font-size:28px;">Registro diário</h1>
        <p class="subtitle">Leva menos de um minuto.</p>
      </div>

      <div class="card">
        <p class="section-title">Fluxo</p>
        <div class="chips">
          ${flowOptions.map(option => `
            <button class="chip ${todayLog.flow === option ? "active" : ""}" data-flow="${option}">
              ${option}
            </button>
          `).join("")}
        </div>
      </div>

      <div class="card">
        <p class="section-title">Sintomas</p>
        <div class="symptoms-grid">
          ${symptomCatalog.map(symptom => `
            <button class="chip ${todayLog.symptoms.includes(symptom) ? "active" : ""}" data-symptom="${symptom}">
              ${symptom}
            </button>
          `).join("")}
        </div>
      </div>

      <div class="card">
        <p class="section-title">Humor</p>
        <div class="chips" style="grid-template-columns:repeat(2,1fr);">
          ${moodOptions.map(option => `
            <button class="chip ${todayLog.mood === option ? "active" : ""}" data-mood="${option}">
              ${option}
            </button>
          `).join("")}
        </div>
      </div>

      <div class="card">
        <p class="section-title">Notas</p>
        <textarea id="notesField" placeholder="Escreva algo, se quiser...">${todayLog.notes || ""}</textarea>
      </div>

      <button class="btn btn-primary" id="saveRegister">Salvar</button>
    </section>
  `;
}

function renderInsights() {
  const logs = state.dailyLogs.length;
  const symptoms = getRecentSymptoms();
  const history = getSortedPeriodHistory();
  const fertileWindow = state.userPreferences.showFertility ? getFertileWindow() : null;

  return `
    <section class="screen ${activeClass("insights")}">
      <div>
        <h1 class="title" style="font-size:28px;">Insights</h1>
        <p class="subtitle">Resumo simples do que você registrou até agora.</p>
      </div>

      <div class="insight-grid">
        <div class="card metric-card">
          <h3>Registros</h3>
          <p>${logs}</p>
        </div>
        <div class="card metric-card">
          <h3>Fase atual</h3>
          <p style="font-size:18px;">${getCurrentPhase()}</p>
        </div>
      </div>

      <div class="card">
        <p class="section-title">Padrões observados</p>
        <div class="stack">
          <p class="small">Humor predominante: ${getMoodSummary()}</p>
          <p class="small">Sintomas mais frequentes: ${symptoms.length ? symptoms.join(", ") : "Sem dados suficientes"}</p>
          <p class="small">Ciclo médio calculado: ${state.cycleData.averageCycleLength} dias</p>
          <p class="small">Períodos no histórico: ${history.length}</p>
        </div>
      </div>

      ${fertileWindow ? `
        <div class="card">
          <p class="section-title">Estimativa de fertilidade</p>
          <div class="stack">
            <p class="small">Janela fértil: ${fertileWindow.start.toLocaleDateString("pt-BR")} até ${fertileWindow.end.toLocaleDateString("pt-BR")}</p>
            <p class="small">Ovulação estimada: ${fertileWindow.ovulation.toLocaleDateString("pt-BR")}</p>
          </div>
        </div>
      ` : ""}

      <div class="card">
        <p class="section-title">Observação</p>
        <p class="notice">
          O NUMA ajuda no acompanhamento do ciclo e dos registros do corpo. Ele não substitui avaliação médica.
        </p>
      </div>
    </section>
  `;
}

function renderEducation() {
  return `
    <section class="screen ${activeClass("education")}">
      <div>
        <h1 class="title" style="font-size:28px;">Educação</h1>
        <p class="subtitle">Informações curtas, claras e sem exagero.</p>
      </div>

      <div class="stack">
        ${educationArticles.map(article => `
          <div class="card article">
            <span class="pill">Leitura rápida</span>
            <h3>${article.title}</h3>
            <p>${article.content}</p>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function renderSettings() {
  const p = state.userPreferences;
  const latest = getLatestPeriod();

  return `
    <section class="screen ${activeClass("settings")}">
      <div>
        <h1 class="title" style="font-size:28px;">Configurações</h1>
        <p class="subtitle">Controle a experiência do seu jeito.</p>
      </div>

      <div class="card">
        <div class="toggle-row">
          <div>
            <p class="section-title" style="font-size:16px; margin-bottom:4px;">Mostrar fertilidade</p>
            <p class="small">Exibe janela fértil e ovulação estimada.</p>
          </div>
          <div class="toggle ${p.showFertility ? "active" : ""}" data-toggle="showFertility"></div>
        </div>

        <div class="toggle-row">
          <div>
            <p class="section-title" style="font-size:16px; margin-bottom:4px;">Notificações</p>
            <p class="small">Lembretes simples e discretos.</p>
          </div>
          <div class="toggle ${p.notificationsEnabled ? "active" : ""}" data-toggle="notificationsEnabled"></div>
        </div>

        <div class="toggle-row">
          <div>
            <p class="section-title" style="font-size:16px; margin-bottom:4px;">Privacidade</p>
            <p class="small">Base para proteção futura.</p>
          </div>
          <div class="toggle ${p.privacyEnabled ? "active" : ""}" data-toggle="privacyEnabled"></div>
        </div>

        <div class="toggle-row">
          <div>
            <p class="section-title" style="font-size:16px; margin-bottom:4px;">Modo discreto</p>
            <p class="small">Menos detalhes em lembretes.</p>
          </div>
          <div class="toggle ${p.discreetMode ? "active" : ""}" data-toggle="discreetMode"></div>
        </div>
      </div>

      <div class="card">
        <p class="section-title">Ciclo atual</p>
        <div class="stack">
          <p class="small">Último período registrado: ${latest ? parseDateISO(latest.startDate).toLocaleDateString("pt-BR") : "Ainda não informado"}</p>
          <label class="small">Ciclo médio (dias)</label>
          <input id="avgCycleLength" type="number" min="20" max="45" value="${state.cycleData.averageCycleLength}">
          <label class="small">Menstruação média (dias)</label>
          <input id="avgPeriodLength" type="number" min="2" max="10" value="${state.cycleData.averagePeriodLength}">
          <button class="btn btn-primary" id="saveCycleSettings">Salvar ajustes</button>
        </div>
      </div>

      <button class="btn btn-secondary" id="resetApp">Resetar app</button>
    </section>
  `;
}

function renderBottomNav() {
  const nav = document.getElementById("bottomNav");
  const showNav = ["home","calendar","register","insights","education","settings"].includes(state.currentScreen);
  nav.className = showNav ? "bottom-nav active" : "bottom-nav";

  if (!showNav) {
    nav.innerHTML = "";
    return;
  }

  const items = [
    ["home", "Início"],
    ["calendar", "Calendário"],
    ["register", "Registro"],
    ["insights", "Insights"],
    ["settings", "Ajustes"]
  ];

  nav.innerHTML = items.map(([id, label]) => `
    <button class="nav-item ${state.currentScreen === id ? "active" : ""}" data-nav="${id}">
      <span class="dot"></span>
      <span>${label}</span>
    </button>
  `).join("");
}

function bindEvents() {
  document.querySelectorAll("[data-next]").forEach(btn => {
    btn.onclick = () => setScreen(btn.dataset.next);
  });

  document.querySelectorAll("[data-nav]").forEach(btn => {
    btn.onclick = () => setScreen(btn.dataset.nav);
  });

  document.querySelectorAll("[data-goal]").forEach(btn => {
    btn.onclick = () => {
      state.userPreferences.trackingGoal = btn.dataset.goal;
      saveState();
      render();
    };
  });

  document.querySelectorAll("[data-fertility]").forEach(btn => {
    btn.onclick = () => {
      state.userPreferences.showFertility = btn.dataset.fertility === "true";
      saveState();
      render();
    };
  });

  const finish = document.getElementById("finishOnboarding");
  if (finish) {
    finish.onclick = () => {
      state.onboardingCompleted = true;
      saveState();
      setScreen("home");
    };
  }

  const prevMonth = document.getElementById("prevMonth");
  if (prevMonth) {
    prevMonth.onclick = () => {
      currentCalendarDate = new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth() - 1, 1);
      render();
    };
  }

  const nextMonth = document.getElementById("nextMonth");
  if (nextMonth) {
    nextMonth.onclick = () => {
      currentCalendarDate = new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth() + 1, 1);
      render();
    };
  }

  document.querySelectorAll("[data-flow]").forEach(btn => {
    btn.onclick = () => {
      const log = getTodayLog() || { date: getTodayISO(), flow: "", symptoms: [], mood: "", notes: "" };
      log.flow = btn.dataset.flow;
      upsertTodayLog(log);
      render();
    };
  });

  document.querySelectorAll("[data-symptom]").forEach(btn => {
    btn.onclick = () => {
      const log = getTodayLog() || { date: getTodayISO(), flow: "", symptoms: [], mood: "", notes: "" };
      const symptom = btn.dataset.symptom;
      if (log.symptoms.includes(symptom)) {
        log.symptoms = log.symptoms.filter(item => item !== symptom);
      } else {
        log.symptoms.push(symptom);
      }
      upsertTodayLog(log);
      render();
    };
  });

  document.querySelectorAll("[data-mood]").forEach(btn => {
    btn.onclick = () => {
      const log = getTodayLog() || { date: getTodayISO(), flow: "", symptoms: [], mood: "", notes: "" };
      log.mood = btn.dataset.mood;
      upsertTodayLog(log);
      render();
    };
  });

  const saveRegister = document.getElementById("saveRegister");
  if (saveRegister) {
    saveRegister.onclick = () => {
      const notes = document.getElementById("notesField").value.trim();
      const log = getTodayLog() || { date: getTodayISO(), flow: "", symptoms: [], mood: "", notes: "" };
      log.notes = notes;
      upsertTodayLog(log);
      alert("Registro salvo.");
      setScreen("home");
    };
  }

  document.querySelectorAll("[data-toggle]").forEach(toggle => {
    toggle.onclick = () => {
      const key = toggle.dataset.toggle;
      state.userPreferences[key] = !state.userPreferences[key];
      saveState();
      render();
    };
  });

  const saveCycleSettings = document.getElementById("saveCycleSettings");
  if (saveCycleSettings) {
    saveCycleSettings.onclick = () => {
      const avgCycle = Number(document.getElementById("avgCycleLength").value);
      const avgPeriod = Number(document.getElementById("avgPeriodLength").value);

      if (avgCycle < 20 || avgCycle > 45) {
        alert("O ciclo médio deve ficar entre 20 e 45 dias.");
        return;
      }

      if (avgPeriod < 2 || avgPeriod > 10) {
        alert("A duração média deve ficar entre 2 e 10 dias.");
        return;
      }

      state.cycleData.averageCycleLength = avgCycle;
      state.cycleData.averagePeriodLength = avgPeriod;
      saveState();
      alert("Ajustes salvos.");
      setScreen("home");
    };
  }

  const savePastPeriod = document.getElementById("savePastPeriod");
  if (savePastPeriod) {
    savePastPeriod.onclick = () => {
      const startDate = document.getElementById("pastStartDate").value;
      const duration = Number(document.getElementById("pastDuration").value);
      const flow = document.getElementById("pastFlow").value;
      const notes = document.getElementById("pastNotes").value.trim();

      if (!startDate) {
        alert("Informe a data de início.");
        return;
      }

      if (duration < 1 || duration > 15) {
        alert("A duração deve estar entre 1 e 15 dias.");
        return;
      }

      const success = addPastPeriod({ startDate, duration, flow, notes });
      if (!success) return;

      state.forms.pastPeriod = {
        startDate: "",
        duration: 5,
        flow: "Médio",
        notes: ""
      };
      saveState();
      alert("Período anterior salvo.");
      render();
    };
  }

  document.querySelectorAll("[data-remove-period]").forEach(btn => {
    btn.onclick = () => {
      const confirmed = confirm("Deseja excluir este período do histórico?");
      if (!confirmed) return;
      removePastPeriod(btn.dataset.removePeriod);
      render();
    };
  });

  const pastStartDate = document.getElementById("pastStartDate");
  if (pastStartDate) {
    pastStartDate.oninput = e => {
      state.forms.pastPeriod.startDate = e.target.value;
      saveState();
    };
  }

  const pastDuration = document.getElementById("pastDuration");
  if (pastDuration) {
    pastDuration.oninput = e => {
      state.forms.pastPeriod.duration = Number(e.target.value) || 5;
      saveState();
    };
  }

  const pastFlow = document.getElementById("pastFlow");
  if (pastFlow) {
    pastFlow.onchange = e => {
      state.forms.pastPeriod.flow = e.target.value;
      saveState();
    };
  }

  const pastNotes = document.getElementById("pastNotes");
  if (pastNotes) {
    pastNotes.oninput = e => {
      state.forms.pastPeriod.notes = e.target.value;
      saveState();
    };
  }

  const resetApp = document.getElementById("resetApp");
  if (resetApp) {
    resetApp.onclick = () => {
      const confirmed = confirm("Tem certeza que deseja resetar o app?");
      if (!confirmed) return;
      localStorage.removeItem(STORAGE_KEY);
      state = clone(defaultState);
      currentCalendarDate = new Date();
      render();
      startAppFlow();
    };
  }
}

render();
if (state.currentScreen === "splash") startAppFlow();
