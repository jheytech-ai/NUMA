// gerencia a tela atual
export function setScreen(screenName, state, render) {
  state.currentScreen = screenName;
  localStorage.setItem("numa_mvp_state_v2", JSON.stringify(state));
  render();
}
