import './styles.css';

const stateLabels = {
  initializing: 'Inicializando',
  stopped: 'Detenida',
  ready: 'Lista',
  running: 'Produciendo',
  paused: 'Pausada',
  stack_transition: 'Cambio de stack',
  reserved: 'Estado reservado',
  fault: 'Falla',
  manual_or_maintenance: 'Modo manual',
};

const faultLabels = {
  none: 'Sin fallas',
  invalid_stack_size: 'Objetivo de stack inválido',
  command_not_allowed_while_running: 'Comando no permitido durante la marcha',
  command_not_allowed_in_current_state: 'Comando no permitido en el estado actual',
  reset_requires_stopped_machine: 'El reinicio requiere la máquina detenida',
  reserved_legacy_command: 'Comando anterior no compatible',
  manual_step_requires_manual_mode: 'El paso sólo está disponible en modo manual',
  manual_step_blocked: 'Paso bloqueado por los permisos de la máquina',
  remote_heartbeat_lost: 'Se perdió la supervisión remota',
  unknown_command: 'Comando desconocido',
};

const icons = {
  plug: '<path d="M8 12h8M10 8v4m4-4v4m-7 0v2a5 5 0 0 0 10 0v-2M12 19v3"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-1.42 1.42-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.55V20h-2v-.09a1.7 1.7 0 0 0-1.03-1.55 1.7 1.7 0 0 0-1.88.34l-.06.06-1.42-1.42.06-.06A1.7 1.7 0 0 0 9.4 15.4a1.7 1.7 0 0 0-1.55-1.03H7.8v-2h.09A1.7 1.7 0 0 0 9.4 11.34a1.7 1.7 0 0 0-.34-1.88L9 9.4 10.4 8l.06.06a1.7 1.7 0 0 0 1.88.34 1.7 1.7 0 0 0 1.03-1.55V6.8h2v.09a1.7 1.7 0 0 0 1.03 1.55 1.7 1.7 0 0 0 1.88-.34l.06-.06 1.42 1.42-.06.06a1.7 1.7 0 0 0-.34 1.88 1.7 1.7 0 0 0 1.55 1.03H21v2h-.09A1.7 1.7 0 0 0 19.4 15Z"/>',
  play: '<path d="m8 5 11 7-11 7Z"/>',
  pause: '<path d="M9 5v14m6-14v14"/>',
  step: '<path d="m5 5 9 7-9 7Zm11 0v14"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="1"/>',
  reset: '<path d="M4 12a8 8 0 1 0 2.34-5.66L4 8.7M4 4v4.7h4.7"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.9-3M4 4v5h5m-5 4a8 8 0 0 0 14.9 3M20 20v-5h-5"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  box: '<path d="m4 7 8-4 8 4-8 4Zm0 0v10l8 4 8-4V7m-8 4v10"/>',
  trend: '<path d="M4 18 10 12l4 4 6-9m-5 0h5v5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5Zm-9 9 9 5 9-5m-18 4 9 5 9-5"/>',
  stage: '<circle cx="6" cy="6" r="2"/><circle cx="18" cy="18" r="2"/><path d="M8 6h4a3 3 0 0 1 3 3v6a3 3 0 0 0 3 3"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M5 20h14"/>',
  terminal: '<path d="m5 7 4 4-4 4m7 0h7"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  chevron: '<path d="m8 10 4 4 4-4"/>',
  warning: '<path d="M12 4 3 20h18Zm0 6v4m0 3h.01"/>',
};

function icon(name, className = '') {
  return `<svg class="icon ${className}" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${icons[name]}</svg>`;
}

const app = document.querySelector('#app');

app.innerHTML = `
  <main class="app-shell">
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark">PAI</span>
        <div>
          <p class="eyebrow">HMI local · Xinje XD3</p>
          <h1>Apilado de cajas predobladas</h1>
        </div>
      </div>

      <div class="global-actions">
        <div class="connection-control">
          <button id="connectionTrigger" class="header-status connection-trigger" type="button" aria-haspopup="dialog" aria-expanded="false">
            <span class="status-dot"></span>
            <span id="connectionText">Sin conexión</span>
            ${icon('chevron')}
          </button>
          <div id="connectionPopover" class="connection-popover" role="dialog" aria-label="Conexión PLC" hidden>
            <div class="popover-heading">
              <div>
                <p class="eyebrow">Conexión rápida</p>
                <h2>PLC Xinje</h2>
              </div>
              <button id="closeConnectionButton" class="icon-button" type="button" aria-label="Cerrar conexión">${icon('close')}</button>
            </div>
            <div id="connectionPopoverState" class="connection-state neutral">
              <span class="status-dot"></span>
              <div><strong>Sin conexión</strong><small>Seleccione un puerto disponible.</small></div>
            </div>
            <label class="field">
              <span>Puerto serial detectado</span>
              <select id="serialPortSelect">
                <option value="">Buscando puertos…</option>
              </select>
            </label>
            <div id="selectedPortDetail" class="port-detail">Abra la lista para detectar adaptadores.</div>
            <div class="connection-buttons">
              <button id="refreshPortsButton" type="button">${icon('refresh')} Actualizar</button>
              <button id="quickConnectButton" class="primary" type="button">${icon('plug')} Conectar</button>
              <button id="quickDisconnectButton" type="button">Desconectar</button>
            </div>
            <p class="technical-line">Modbus RTU · 19200 8E1 · esclavo 1</p>
          </div>
        </div>
        <span id="modeBadge" class="header-status">${icon('settings')} <span>Modo --</span></span>
        <span id="machineBadge" class="header-status">${icon('play')} <span>Estado --</span></span>
        <button id="settingsTrigger" class="settings-trigger" type="button" aria-haspopup="dialog" aria-expanded="false" aria-label="Abrir configuración">${icon('settings')}</button>
      </div>
    </header>

    <nav class="view-tabs" aria-label="Vistas de la aplicación">
      <button class="tab-button active" type="button" data-view="operation">Operación</button>
      <button class="tab-button" type="button" data-view="supervision">Supervisión</button>
      <button class="tab-button" type="button" data-view="console">Consola</button>
    </nav>

    <div id="alarmBanner" class="alarm-banner" role="alert" hidden>
      ${icon('warning')}
      <div>
        <strong id="alarmTitle">Atención</strong>
        <span id="alarmMessage"></span>
      </div>
      <span id="alarmCode" class="alarm-code"></span>
    </div>

    <div id="normalStatusStrip" class="normal-status-strip">
      ${icon('check')}
      <strong>Sistema sin alarmas activas</strong>
      <span>El paro de emergencia permanece en el circuito físico.</span>
    </div>

    <section id="operationView" class="view active" aria-label="Vista de operación">
      <div class="operation-layout">
        <article class="panel production-panel">
          <div class="panel-heading">
            <div>
              <p class="eyebrow">Stack actual</p>
              <h2>Avance de producción</h2>
            </div>
            <span id="lastUpdate" class="live-update">${icon('refresh')} Sin lectura del PLC</span>
          </div>

          <div class="production-focus">
            <div class="count-display">
              <strong id="processedCount">0</strong>
              <span>de <b id="activeTarget">20</b> cajas</span>
            </div>
            <div class="percentage-block">
              <strong id="progressPercent">0%</strong>
              <span>completado</span>
            </div>
          </div>
          <div id="progressTrack" class="progress-track" role="progressbar" aria-label="Avance del stack" aria-valuemin="0" aria-valuemax="20" aria-valuenow="0">
            <span id="progressBar"></span>
          </div>

          <div class="production-kpis">
            <div class="operation-kpi">${icon('layers')}<div><span>Total histórico</span><strong id="historicalTotal">0</strong></div></div>
            <div class="operation-kpi">${icon('stage')}<div><span>Próximo objetivo</span><strong id="pendingTarget">20</strong></div></div>
            <div class="operation-kpi">${icon('stage')}<div><span>Etapa actual</span><strong id="stageNumber">0</strong><small id="stageLabel">Espera / inicio</small></div></div>
            <div class="operation-kpi">${icon('clock')}<div><span>Última caja</span><strong id="lastBoxTime">--:--</strong></div></div>
          </div>
        </article>

        <aside class="panel controls-panel">
          <div class="panel-heading">
            <div><p class="eyebrow">Mando</p><h2>Control de máquina</h2></div>
          </div>
          <label class="field">
            <span>Objetivo del próximo stack</span>
            <div class="target-control">
              <input id="stackSize" type="number" min="1" max="100" value="20" inputmode="numeric" />
              <button id="setTargetButton" type="button">Programar</button>
            </div>
            <small id="targetHint">Se aplicará al siguiente stack.</small>
          </label>

          <div class="primary-controls">
            <button id="startButton" class="command primary" type="button" data-command="start">${icon('play')} Iniciar</button>
            <button id="pauseButton" class="command" type="button" data-command="pause">${icon('pause')} Pausar</button>
            <button id="resumeButton" class="command" type="button" data-command="resume">${icon('play')} Reanudar</button>
            <button id="stepButton" class="command step" type="button" data-command="step">${icon('step')} Avanzar un paso</button>
          </div>
          <div class="secondary-controls">
            <button id="stopButton" class="command caution" type="button" data-command="safe_stop">${icon('stop')} Parada controlada</button>
            <button id="resetButton" class="command quiet" type="button" data-command="reset_counter">${icon('reset')} Reiniciar stack</button>
          </div>
          <div id="commandFeedback" class="command-feedback neutral">${icon('terminal')} <span>Sin comandos pendientes</span></div>
          <p class="safety-note"><strong>Paro de emergencia:</strong> utilice siempre el circuito físico.</p>
        </aside>
      </div>

      <article class="panel recent-panel">
        <div class="panel-heading">
          <div><p class="eyebrow">Trazabilidad</p><h2>Últimas cajas terminadas</h2></div>
          <button class="text-button" type="button" data-go-view="supervision">Ver histórico completo</button>
        </div>
        <div class="table-wrap compact-history">
          <table>
            <thead><tr><th>Total</th><th>Timestamp</th><th>Estado</th></tr></thead>
            <tbody id="recentEventsTable"><tr><td colspan="3">Aún no hay cajas registradas.</td></tr></tbody>
          </table>
        </div>
      </article>
    </section>

    <section id="supervisionView" class="view" aria-label="Vista de supervisión" hidden>
      <div class="supervision-kpis">
        <article class="metric-card">${icon('box')}<div><span>Cajas última hora</span><strong id="boxesLastHour">0</strong></div></article>
        <article class="metric-card">${icon('trend')}<div><span>Cajas últimas 24 h</span><strong id="boxesLastDay">0</strong></div></article>
        <article class="metric-card">${icon('clock')}<div><span>Tiempo medio entre cajas</span><strong id="averageCycle">--</strong></div></article>
        <article class="metric-card">${icon('layers')}<div><span>Stacks terminados</span><strong id="completedStacks">0</strong></div></article>
        <article class="metric-card">${icon('layers')}<div><span>Total histórico</span><strong id="supervisionTotal">0</strong></div></article>
        <article class="metric-card wide">${icon('clock')}<div><span>Tiempo en marcha / pausa</span><strong><b id="runningKpi">0 min</b> <small>/ <span id="pausedKpi">0 min</span></small></strong></div></article>
      </div>

      <div class="analytics-grid">
        <article class="panel chart-card">
          <div class="panel-heading"><div><p class="eyebrow">Rendimiento</p><h2>Producción por hora · últimas 24 h</h2></div></div>
          <div id="productionChart" class="bar-chart"><p class="empty-state">No hay producción registrada.</p></div>
        </article>
        <article class="panel chart-card">
          <div class="panel-heading"><div><p class="eyebrow">Estabilidad</p><h2>Tiempo entre cajas · tendencia</h2></div></div>
          <div id="cycleTrendChart" class="line-chart"><p class="empty-state">Aún no hay suficientes datos.</p></div>
        </article>
        <article class="panel chart-card">
          <div class="panel-heading"><div><p class="eyebrow">Disponibilidad</p><h2>Marcha frente a pausa · últimas 24 h</h2></div></div>
          <div id="durationChart" class="duration-chart"></div>
        </article>
      </div>

      <article class="panel history-panel full-history">
        <div class="panel-heading">
          <div><p class="eyebrow">Lotes</p><h2>Histórico de stacks</h2></div>
          <a class="button-link" href="/api/production/export.csv">${icon('download')} Exportar CSV</a>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>ID</th><th>Inicio</th><th>Fin</th><th>Objetivo</th><th>Procesadas</th><th>Estado</th></tr></thead>
            <tbody id="stacksTable"><tr><td colspan="6">Sin registros</td></tr></tbody>
          </table>
        </div>
      </article>
    </section>

    <section id="consoleView" class="view" aria-label="Consola de diagnóstico" hidden>
      <div class="console-header">
        <div><p class="eyebrow">Diagnóstico en vivo · sólo lectura</p><h2>Entradas y salidas físicas</h2><p>Los indicadores reflejan los puntos utilizados por el secuencial.</p></div>
        <div class="console-actions"><span id="ioLastUpdate">Sin lectura</span><button id="refreshConsoleButton" type="button">${icon('refresh')} Actualizar</button></div>
      </div>
      <div id="consoleError" class="console-error" hidden></div>
      <div class="io-sections">
        <article class="panel io-panel">
          <div class="panel-heading"><div><p class="eyebrow">Sensores y pulsadores</p><h2>Entradas X</h2></div><span id="inputActiveCount" class="io-count">0 activas</span></div>
          <div id="inputLedGrid" class="io-led-grid"><p class="empty-state">Esperando lectura.</p></div>
        </article>
        <article class="panel io-panel">
          <div class="panel-heading"><div><p class="eyebrow">Actuadores comandados</p><h2>Salidas Y</h2></div><span id="outputActiveCount" class="io-count">0 activas</span></div>
          <div id="outputLedGrid" class="io-led-grid"><p class="empty-state">Esperando lectura.</p></div>
        </article>
      </div>
      <article class="panel console-terminal-panel">
        <div class="panel-heading">
          <div><p class="eyebrow">Consola técnica</p><h2>Registros y transacciones Modbus</h2></div>
          <div class="button-row"><button id="consoleReadRegistersButton" type="button">Leer D200–D219</button><button id="consoleRefreshLogButton" type="button">Actualizar log</button></div>
        </div>
        <div class="diagnostic-summary">
          <div><span>Contrato</span><strong id="contractVersion">--</strong></div>
          <div><span>Heartbeat</span><strong id="heartbeat">--</strong></div>
          <div><span>Request confirmado</span><strong id="acceptedRequest">--</strong></div>
          <div><span>Último poll</span><strong id="lastPoll">--</strong></div>
        </div>
        <div id="flagList" class="flag-list"></div>
        <div class="debug-grid">
          <div><span class="console-label">Registros del contrato</span><pre id="consoleRegisterReadout">Sin lectura manual</pre></div>
          <div><span class="console-label">Log de comunicación</span><pre id="consoleDebugLog">Sin eventos de comunicación</pre></div>
        </div>
      </article>
      <p class="console-disclaimer">Esta vista no permite forzar señales. Una salida encendida no es un botón de mando.</p>
    </section>

    <div id="toast" class="toast" role="status" aria-live="polite" hidden></div>
  </main>

  <div id="settingsOverlay" class="drawer-overlay" hidden></div>
  <aside id="settingsDrawer" class="settings-drawer" role="dialog" aria-modal="true" aria-labelledby="settingsTitle" hidden>
    <div class="drawer-heading">
      <div><p class="eyebrow">Sistema</p><h2 id="settingsTitle">Configuración</h2></div>
      <button id="closeSettingsButton" class="icon-button" type="button" aria-label="Cerrar configuración">${icon('close')}</button>
    </div>
    <div id="settingsDirtyNotice" class="dirty-notice" hidden>Cambios sin guardar</div>
    <form id="settingsForm" class="drawer-form">
      <section class="settings-section">
        <h3>Entorno de comunicación</h3>
        <label class="switch-field"><input id="simulator" type="checkbox" /><span><b>Usar simulador local</b><small>Desactívelo para trabajar con el PLC real.</small></span></label>
        <label class="field"><span>Periodo de lectura</span><div class="input-suffix"><input id="pollInterval" type="number" min="250" max="500" value="300" /><span>ms</span></div></label>
        <div class="fixed-parameters">
          <div><span>Esclavo</span><strong>1</strong></div>
          <div><span>Serial</span><strong>19200 8E1</strong></div>
          <div><span>Timeout</span><strong>500 ms · 2 reintentos</strong></div>
        </div>
        <div id="simulatorControls" class="simulator-controls" hidden>
          <span>Modo simulado</span>
          <div><button id="simAutoButton" type="button">Automático</button><button id="simManualButton" type="button">Manual</button></div>
        </div>
      </section>
      <section class="settings-section">
        <h3>Parámetros operativos</h3>
        <label class="field"><span>Máximo permitido por la HMI</span><input id="maxStackSize" type="number" min="1" max="32767" value="100" /><small>El PLC valida que el objetivo sea positivo.</small></label>
        <label class="field"><span>Zona horaria</span><input id="timezone" value="America/Bogota" /></label>
      </section>
      <div class="drawer-footer">
        <button id="cancelSettingsButton" type="button">Cancelar</button>
        <button class="primary" type="submit">Guardar configuración</button>
      </div>
    </form>
  </aside>
`;

const $ = (selector) => document.querySelector(selector);
const els = {
  connectionTrigger: $('#connectionTrigger'),
  connectionText: $('#connectionText'),
  connectionPopover: $('#connectionPopover'),
  closeConnectionButton: $('#closeConnectionButton'),
  connectionPopoverState: $('#connectionPopoverState'),
  serialPortSelect: $('#serialPortSelect'),
  selectedPortDetail: $('#selectedPortDetail'),
  refreshPortsButton: $('#refreshPortsButton'),
  quickConnectButton: $('#quickConnectButton'),
  quickDisconnectButton: $('#quickDisconnectButton'),
  settingsTrigger: $('#settingsTrigger'),
  modeBadge: $('#modeBadge'),
  machineBadge: $('#machineBadge'),
  alarmBanner: $('#alarmBanner'),
  alarmTitle: $('#alarmTitle'),
  alarmMessage: $('#alarmMessage'),
  alarmCode: $('#alarmCode'),
  normalStatusStrip: $('#normalStatusStrip'),
  lastUpdate: $('#lastUpdate'),
  processedCount: $('#processedCount'),
  activeTarget: $('#activeTarget'),
  progressPercent: $('#progressPercent'),
  progressTrack: $('#progressTrack'),
  progressBar: $('#progressBar'),
  historicalTotal: $('#historicalTotal'),
  pendingTarget: $('#pendingTarget'),
  stageNumber: $('#stageNumber'),
  stageLabel: $('#stageLabel'),
  lastBoxTime: $('#lastBoxTime'),
  stackSize: $('#stackSize'),
  setTargetButton: $('#setTargetButton'),
  commandFeedback: $('#commandFeedback'),
  recentEventsTable: $('#recentEventsTable'),
  boxesLastHour: $('#boxesLastHour'),
  boxesLastDay: $('#boxesLastDay'),
  averageCycle: $('#averageCycle'),
  completedStacks: $('#completedStacks'),
  supervisionTotal: $('#supervisionTotal'),
  runningKpi: $('#runningKpi'),
  pausedKpi: $('#pausedKpi'),
  productionChart: $('#productionChart'),
  cycleTrendChart: $('#cycleTrendChart'),
  durationChart: $('#durationChart'),
  stacksTable: $('#stacksTable'),
  contractVersion: $('#contractVersion'),
  heartbeat: $('#heartbeat'),
  acceptedRequest: $('#acceptedRequest'),
  lastPoll: $('#lastPoll'),
  flagList: $('#flagList'),
  ioLastUpdate: $('#ioLastUpdate'),
  consoleError: $('#consoleError'),
  inputActiveCount: $('#inputActiveCount'),
  outputActiveCount: $('#outputActiveCount'),
  inputLedGrid: $('#inputLedGrid'),
  outputLedGrid: $('#outputLedGrid'),
  refreshConsoleButton: $('#refreshConsoleButton'),
  consoleReadRegistersButton: $('#consoleReadRegistersButton'),
  consoleRefreshLogButton: $('#consoleRefreshLogButton'),
  consoleRegisterReadout: $('#consoleRegisterReadout'),
  consoleDebugLog: $('#consoleDebugLog'),
  settingsOverlay: $('#settingsOverlay'),
  settingsDrawer: $('#settingsDrawer'),
  closeSettingsButton: $('#closeSettingsButton'),
  cancelSettingsButton: $('#cancelSettingsButton'),
  settingsForm: $('#settingsForm'),
  settingsDirtyNotice: $('#settingsDirtyNotice'),
  simulator: $('#simulator'),
  pollInterval: $('#pollInterval'),
  simulatorControls: $('#simulatorControls'),
  simAutoButton: $('#simAutoButton'),
  simManualButton: $('#simManualButton'),
  maxStackSize: $('#maxStackSize'),
  timezone: $('#timezone'),
  toast: $('#toast'),
};

let latestSnapshot = null;
let currentSettings = null;
let portsPayload = null;
let selectedPort = '';
let commandPending = false;
let connectionBusy = false;
let settingsDirty = false;
let toastTimer = null;
let lastFocusedElement = null;

document.querySelectorAll('.tab-button').forEach((button) => {
  button.addEventListener('click', () => switchView(button.dataset.view));
});
document.querySelectorAll('[data-go-view]').forEach((button) => {
  button.addEventListener('click', () => switchView(button.dataset.goView));
});
document.querySelectorAll('.command').forEach((button) => {
  button.addEventListener('click', () => sendCommand(button.dataset.command));
});

els.setTargetButton.addEventListener('click', () => sendCommand('set_target', true));
els.connectionTrigger.addEventListener('click', toggleConnectionPopover);
els.closeConnectionButton.addEventListener('click', closeConnectionPopover);
els.refreshPortsButton.addEventListener('click', loadSerialPorts);
els.serialPortSelect.addEventListener('change', () => {
  selectedPort = els.serialPortSelect.value;
  renderSelectedPort();
  renderConnectionActions();
});
els.quickConnectButton.addEventListener('click', quickConnect);
els.quickDisconnectButton.addEventListener('click', quickDisconnect);
els.settingsTrigger.addEventListener('click', openSettings);
els.closeSettingsButton.addEventListener('click', closeSettings);
els.cancelSettingsButton.addEventListener('click', closeSettings);
els.settingsOverlay.addEventListener('click', closeSettings);
els.settingsForm.addEventListener('input', markSettingsDirty);
els.settingsForm.addEventListener('change', markSettingsDirty);
els.settingsForm.addEventListener('submit', saveSettings);
els.simAutoButton.addEventListener('click', () => setSimulatorMode(false));
els.simManualButton.addEventListener('click', () => setSimulatorMode(true));
els.refreshConsoleButton.addEventListener('click', refreshConsole);
els.consoleReadRegistersButton.addEventListener('click', readConsoleRegisters);
els.consoleRefreshLogButton.addEventListener('click', refreshConsoleLog);

document.addEventListener('pointerdown', (event) => {
  if (
    !els.connectionPopover.hidden
    && !els.connectionPopover.contains(event.target)
    && !els.connectionTrigger.contains(event.target)
  ) {
    closeConnectionPopover();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (!els.settingsDrawer.hidden) closeSettings();
    else if (!els.connectionPopover.hidden) closeConnectionPopover();
    return;
  }
  if (event.key === 'Tab') {
    if (!els.settingsDrawer.hidden) trapFocus(event, els.settingsDrawer);
    else if (!els.connectionPopover.hidden) trapFocus(event, els.connectionPopover);
  }
});

function trapFocus(event, container) {
  const focusable = [...container.querySelectorAll(
    'button:not(:disabled), select:not(:disabled), input:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])',
  )].filter((element) => element.offsetParent !== null);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(body.detail || response.statusText);
  }
  return response.json();
}

function switchView(view) {
  document.querySelectorAll('.tab-button').forEach((button) => {
    button.classList.toggle('active', button.dataset.view === view);
  });
  const views = {
    operation: $('#operationView'),
    supervision: $('#supervisionView'),
    console: $('#consoleView'),
  };
  Object.entries(views).forEach(([name, element]) => {
    const active = name === view;
    element.hidden = !active;
    element.classList.toggle('active', active);
  });
  if (view === 'supervision') refreshProduction();
  if (view === 'console') refreshConsole();
}

function toggleConnectionPopover() {
  if (els.connectionPopover.hidden) openConnectionPopover();
  else closeConnectionPopover();
}

async function openConnectionPopover() {
  lastFocusedElement = document.activeElement;
  els.connectionPopover.hidden = false;
  els.connectionTrigger.setAttribute('aria-expanded', 'true');
  await loadSerialPorts();
  els.serialPortSelect.focus();
}

function closeConnectionPopover() {
  els.connectionPopover.hidden = true;
  els.connectionTrigger.setAttribute('aria-expanded', 'false');
  if (lastFocusedElement === els.connectionTrigger) els.connectionTrigger.focus();
}

async function loadSerialPorts() {
  els.refreshPortsButton.disabled = true;
  els.serialPortSelect.innerHTML = '<option value="">Buscando puertos…</option>';
  try {
    const previousSelection = selectedPort;
    portsPayload = await api('/api/serial/ports');
    const availableDevices = new Set(portsPayload.ports.map((port) => port.device));
    if (previousSelection && availableDevices.has(previousSelection)) {
      selectedPort = previousSelection;
    } else {
      selectedPort = portsPayload.suggested_port || '';
    }
    renderSerialPorts();
  } catch (error) {
    portsPayload = null;
    selectedPort = '';
    els.serialPortSelect.innerHTML = '<option value="">No fue posible leer los puertos</option>';
    els.selectedPortDetail.textContent = error.message;
  } finally {
    els.refreshPortsButton.disabled = false;
    renderConnectionActions();
  }
}

function renderSerialPorts() {
  els.serialPortSelect.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = portsPayload.ports.length
    ? 'Seleccione un puerto'
    : 'No hay puertos seriales disponibles';
  els.serialPortSelect.appendChild(placeholder);

  portsPayload.ports.forEach((port) => {
    const option = document.createElement('option');
    option.value = port.device;
    const labels = [portKindLabel(port.kind)];
    if (port.in_use) labels.push('En uso');
    option.textContent = `${port.device} — ${port.description} [${labels.join(' · ')}]`;
    els.serialPortSelect.appendChild(option);
  });

  const remembered = portsPayload.last_successful_port;
  const rememberedAvailable = portsPayload.ports.some((port) => port.device === remembered);
  if (remembered && !rememberedAvailable) {
    const unavailable = document.createElement('option');
    unavailable.value = `unavailable:${remembered}`;
    unavailable.textContent = `${remembered} — último puerto usado [No disponible]`;
    unavailable.disabled = true;
    els.serialPortSelect.appendChild(unavailable);
  }
  els.serialPortSelect.value = selectedPort;
  renderSelectedPort();
}

function renderSelectedPort() {
  const selected = portsPayload?.ports.find((port) => port.device === selectedPort);
  if (!selected) {
    if (portsPayload?.last_successful_port && !portsPayload.configured_port_available) {
      els.selectedPortDetail.textContent =
        `${portsPayload.last_successful_port} fue el último puerto válido, pero no está conectado.`;
      els.selectedPortDetail.className = 'port-detail warning';
    } else {
      els.selectedPortDetail.textContent = 'Seleccione el adaptador USB-RS485 del PLC.';
      els.selectedPortDetail.className = 'port-detail';
    }
    return;
  }
  els.selectedPortDetail.innerHTML = `
    <span class="port-kind ${selected.kind}">${portKindLabel(selected.kind)}</span>
    ${selected.in_use ? '<span class="port-kind in-use">En uso</span>' : ''}
    <span><b>${selected.device}</b> · ${escapeHtml(selected.manufacturer || selected.description)}</span>
  `;
  els.selectedPortDetail.className = 'port-detail selected';
}

function portKindLabel(kind) {
  return { usb: 'USB', bluetooth: 'Bluetooth', virtual: 'Virtual', other: 'Serial' }[kind] || 'Serial';
}

async function quickConnect() {
  if (!selectedPort || connectionBusy) return;
  connectionBusy = true;
  renderConnectionActions();
  renderPopoverState('pending', 'Conectando…', `Abriendo ${selectedPort}`);
  try {
    const current = latestSnapshot?.config || {};
    const snapshot = await api('/api/connect', {
      method: 'POST',
      body: JSON.stringify({
        port: selectedPort,
        simulator: false,
        slave_id: 1,
        baudrate: 19200,
        bytesize: 8,
        parity: 'E',
        stopbits: 1,
        timeout_ms: 500,
        retries: 2,
        poll_interval_ms: current.poll_interval_ms || 300,
        heartbeat_interval_ms: 1000,
      }),
    });
    renderSnapshot(snapshot);
    if (!snapshot.connected) throw new Error(snapshot.last_error || 'El PLC no respondió');
    showToast(`PLC conectado en ${selectedPort}`, 'success');
    await loadSerialPorts();
  } catch (error) {
    showToast(error.message, 'error');
    renderPopoverState('danger', 'No fue posible conectar', error.message);
  } finally {
    connectionBusy = false;
    renderConnectionActions();
  }
}

async function quickDisconnect() {
  if (connectionBusy) return;
  connectionBusy = true;
  renderConnectionActions();
  try {
    renderSnapshot(await api('/api/disconnect', { method: 'POST' }));
    showToast('Conexión cerrada', 'neutral');
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    connectionBusy = false;
    renderConnectionActions();
  }
}

function renderConnectionActions() {
  const connected = Boolean(latestSnapshot?.connected);
  const selected = portsPayload?.ports.some((port) => port.device === selectedPort);
  els.serialPortSelect.disabled = connectionBusy || connected;
  els.quickConnectButton.disabled = connectionBusy || connected || !selected;
  els.quickDisconnectButton.disabled = connectionBusy || !connected;
}

function renderPopoverState(kind, title, detail) {
  els.connectionPopoverState.className = `connection-state ${kind}`;
  els.connectionPopoverState.innerHTML = `
    <span class="status-dot"></span>
    <div><strong>${escapeHtml(title)}</strong><small>${escapeHtml(detail || '')}</small></div>
  `;
}

function openSettings() {
  lastFocusedElement = document.activeElement;
  syncSettingsForm();
  els.settingsOverlay.hidden = false;
  els.settingsDrawer.hidden = false;
  els.settingsTrigger.setAttribute('aria-expanded', 'true');
  document.body.classList.add('drawer-open');
  els.closeSettingsButton.focus();
}

function closeSettings() {
  els.settingsOverlay.hidden = true;
  els.settingsDrawer.hidden = true;
  els.settingsTrigger.setAttribute('aria-expanded', 'false');
  document.body.classList.remove('drawer-open');
  if (lastFocusedElement === els.settingsTrigger) els.settingsTrigger.focus();
}

function markSettingsDirty() {
  settingsDirty = true;
  els.settingsDirtyNotice.hidden = false;
}

function syncSettingsForm() {
  if (!latestSnapshot || settingsDirty) return;
  els.simulator.checked = latestSnapshot.config.simulator;
  els.pollInterval.value = latestSnapshot.config.poll_interval_ms;
  els.simulatorControls.hidden = !latestSnapshot.simulator;
  if (currentSettings) {
    els.maxStackSize.value = currentSettings.max_stack_size;
    els.timezone.value = currentSettings.timezone;
  }
}

async function saveSettings(event) {
  event.preventDefault();
  try {
    const port = selectedPort || latestSnapshot?.config.port || currentSettings?.last_serial_port || 'COM9';
    const [snapshot, settings] = await Promise.all([
      api('/api/config', {
        method: 'POST',
        body: JSON.stringify({
          port,
          simulator: els.simulator.checked,
          slave_id: 1,
          baudrate: 19200,
          bytesize: 8,
          parity: 'E',
          stopbits: 1,
          timeout_ms: 500,
          retries: 2,
          poll_interval_ms: Number(els.pollInterval.value),
          heartbeat_interval_ms: 1000,
        }),
      }),
      api('/api/settings', {
        method: 'PUT',
        body: JSON.stringify({
          max_stack_size: Number(els.maxStackSize.value),
          timezone: els.timezone.value.trim(),
        }),
      }),
    ]);
    currentSettings = settings;
    settingsDirty = false;
    els.settingsDirtyNotice.hidden = true;
    els.stackSize.max = settings.max_stack_size;
    renderSnapshot(snapshot);
    showToast('Configuración guardada', 'success');
    closeSettings();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function setSimulatorMode(manual) {
  try {
    renderSnapshot(await api('/api/simulator/mode', {
      method: 'POST',
      body: JSON.stringify({ manual }),
    }));
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function sendCommand(command, includeTarget = false) {
  if (commandPending) return;
  commandPending = true;
  renderControlAvailability();
  renderCommandFeedback('pending', 'Esperando confirmación del PLC…');
  try {
    const body = { command };
    if (includeTarget || command === 'start') body.stack_size = Number(els.stackSize.value);
    const result = await api('/api/command', { method: 'POST', body: JSON.stringify(body) });
    renderCommandFeedback(result.status, result.message);
    showToast(result.message, result.accepted ? 'success' : 'warning');
    await Promise.all([refreshStatus(), refreshProduction()]);
  } catch (error) {
    renderCommandFeedback('rejected', error.message);
    showToast(error.message, 'error');
  } finally {
    commandPending = false;
    renderControlAvailability();
  }
}

async function refreshStatus() {
  try {
    renderSnapshot(await api('/api/status'));
  } catch (error) {
    renderBackendError(error.message);
  }
}

async function refreshProduction() {
  try {
    const [summary, events, stacks] = await Promise.all([
      api('/api/production/summary'),
      api('/api/production/events?limit=8'),
      api('/api/production/stacks?limit=12'),
    ]);
    renderSummary(summary);
    renderEvents(events.entries);
    renderStacks(stacks.entries);
  } catch (error) {
    showToast(`No se pudo actualizar el histórico: ${error.message}`, 'error');
  }
}

async function refreshConsole() {
  try {
    const result = await api('/api/console/io');
    renderIoPoints(els.inputLedGrid, result.inputs);
    renderIoPoints(els.outputLedGrid, result.outputs);
    const inputCount = result.inputs.filter((point) => point.active).length;
    const outputCount = result.outputs.filter((point) => point.active).length;
    els.inputActiveCount.textContent = `${inputCount} ${inputCount === 1 ? 'activa' : 'activas'}`;
    els.outputActiveCount.textContent = `${outputCount} ${outputCount === 1 ? 'activa' : 'activas'}`;
    els.ioLastUpdate.textContent = `Actualizado ${formatTime(result.observed_at)}`;
    els.consoleError.hidden = true;
  } catch (error) {
    els.consoleError.textContent = `No fue posible leer las entradas y salidas: ${error.message}`;
    els.consoleError.hidden = false;
  }
}

async function loadSettings() {
  try {
    currentSettings = await api('/api/settings');
    els.stackSize.max = currentSettings.max_stack_size;
    $('#targetHint').textContent =
      `Se aplicará al siguiente stack. Máximo configurado: ${currentSettings.max_stack_size}.`;
    syncSettingsForm();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function renderSnapshot(snapshot) {
  latestSnapshot = snapshot;
  const manual = Boolean(snapshot.flags.manual_mode);
  const hasFault = Number(snapshot.fault_code) !== 0 || snapshot.machine_state_label === 'fault';
  const stale = snapshot.connected && (
    !snapshot.last_poll_at || Date.now() - new Date(snapshot.last_poll_at).getTime() > 2500
  );

  els.connectionText.textContent = snapshot.simulator && snapshot.connected
    ? 'Simulador conectado'
    : snapshot.connected ? `PLC · ${snapshot.config.port}` : 'PLC desconectado';
  els.connectionTrigger.className = `header-status connection-trigger ${snapshot.connected && !stale ? 'ok' : 'warning'}`;
  els.modeBadge.querySelector('span').textContent = manual ? 'Modo manual' : 'Modo automático';
  els.machineBadge.querySelector('span').textContent =
    stateLabels[snapshot.machine_state_label] || snapshot.machine_state_label;
  els.machineBadge.className = `header-status ${hasFault ? 'danger' : ''}`;

  const target = Math.max(Number(snapshot.accepted_stack_size) || 20, 1);
  const processed = Math.max(Number(snapshot.processed_count) || 0, 0);
  const progress = Math.min(100, Math.round((processed / target) * 100));
  els.processedCount.textContent = processed.toLocaleString('es-CO');
  els.activeTarget.textContent = target.toLocaleString('es-CO');
  els.progressPercent.textContent = `${progress}%`;
  els.progressBar.style.width = `${progress}%`;
  els.progressTrack.setAttribute('aria-valuemax', String(target));
  els.progressTrack.setAttribute('aria-valuenow', String(processed));
  els.historicalTotal.textContent = Number(snapshot.historical_total).toLocaleString('es-CO');
  els.pendingTarget.textContent = Number(snapshot.pending_stack_size).toLocaleString('es-CO');
  els.stageNumber.textContent = snapshot.stage;
  els.stageLabel.textContent = snapshot.stage_label;
  els.lastBoxTime.textContent = snapshot.last_box_at ? formatTime(snapshot.last_box_at) : '--:--';
  els.lastUpdate.innerHTML = `${icon('refresh')} ${snapshot.last_poll_at ? `Lectura actualizada ${formatRelative(snapshot.last_poll_at)}` : 'Sin lectura del PLC'}`;

  els.contractVersion.textContent = snapshot.contract_version;
  els.heartbeat.textContent = snapshot.heartbeat;
  els.acceptedRequest.textContent = snapshot.accepted_request_id;
  els.lastPoll.textContent = snapshot.last_poll_at ? formatTime(snapshot.last_poll_at) : '--';
  renderFlags(snapshot.flags);
  renderAlarm(snapshot, hasFault, stale);
  renderCommandFeedback(snapshot.command_status, snapshot.command_message);
  renderConnectionStatus(snapshot, stale);
  els.simulatorControls.hidden = !snapshot.simulator;
  if (!settingsDirty) syncSettingsForm();
  renderControlAvailability();
  renderConnectionActions();
}

function renderConnectionStatus(snapshot, stale) {
  if (snapshot.connected && !stale) {
    renderPopoverState(
      'ok',
      snapshot.simulator ? 'Simulador conectado' : `PLC conectado en ${snapshot.config.port}`,
      snapshot.last_poll_at ? `Última lectura ${formatRelative(snapshot.last_poll_at)}` : 'Enlace abierto',
    );
  } else if (snapshot.last_error) {
    renderPopoverState('danger', 'Error de conexión', snapshot.last_error);
  } else {
    renderPopoverState('neutral', 'Sin conexión', 'Seleccione un puerto disponible.');
  }
}

function renderAlarm(snapshot, hasFault, stale) {
  let title = '';
  let message = '';
  let code = '';
  if (!snapshot.connected) {
    title = 'Sin comunicación con el PLC';
    message = 'Los mandos están bloqueados. Use Conexión PLC en la barra superior.';
  } else if (snapshot.last_error) {
    title = 'Error de comunicación';
    message = snapshot.last_error;
  } else if (hasFault) {
    title = faultLabels[snapshot.fault_label] || snapshot.fault_label;
    message = faultAction(snapshot.fault_code);
    code = `F${snapshot.fault_code}`;
  } else if (stale) {
    title = 'Datos sin actualizar';
    message = 'La última lectura del PLC superó el tiempo esperado.';
  }
  els.alarmBanner.hidden = !title;
  els.normalStatusStrip.hidden = Boolean(title);
  if (title) {
    els.alarmTitle.textContent = title;
    els.alarmMessage.textContent = message;
    els.alarmCode.textContent = code;
  }
}

function faultAction(code) {
  if (code === 24) return 'Cambie el selector físico X2 a modo manual.';
  if (code === 90) return 'Revise la conexión y el heartbeat antes de reanudar.';
  if (code === 10) return 'Corrija el objetivo del próximo stack.';
  return 'Revise las condiciones de máquina y Consola antes de reintentar.';
}

function renderControlAvailability() {
  if (!latestSnapshot) return;
  const enabled = latestSnapshot.connected && !commandPending;
  const manual = Boolean(latestSnapshot.flags.manual_mode);
  const state = latestSnapshot.machine_state_label;
  const severeFault = Number(latestSnapshot.fault_code) >= 90;
  $('#startButton').disabled = !enabled || manual || !['ready', 'stopped'].includes(state) || severeFault;
  $('#pauseButton').disabled = !enabled || manual || state !== 'running';
  $('#resumeButton').disabled = !enabled || manual || state !== 'paused';
  $('#stepButton').disabled = !enabled || !manual || severeFault;
  $('#stopButton').disabled = !enabled || ['stopped', 'ready'].includes(state);
  $('#resetButton').disabled = !enabled || ['running', 'paused'].includes(state);
  els.setTargetButton.disabled = !enabled;
  els.stackSize.disabled = commandPending;
}

function renderCommandFeedback(status, message) {
  els.commandFeedback.className = `command-feedback ${status || 'neutral'}`;
  els.commandFeedback.innerHTML = `${icon('terminal')} <span>${escapeHtml(message || 'Sin comandos pendientes')}</span>`;
}

function renderSummary(summary) {
  els.boxesLastHour.textContent = Number(summary.boxes_last_hour).toLocaleString('es-CO');
  els.boxesLastDay.textContent = Number(summary.boxes_last_24h).toLocaleString('es-CO');
  els.averageCycle.textContent = summary.average_cycle_seconds == null ? '--' : `${summary.average_cycle_seconds} s`;
  els.completedStacks.textContent = Number(summary.stacks_completed).toLocaleString('es-CO');
  els.supervisionTotal.textContent = Number(summary.historical_total).toLocaleString('es-CO');
  els.runningKpi.textContent = formatDuration(summary.running_seconds_24h);
  els.pausedKpi.textContent = formatDuration(summary.paused_seconds_24h);
  renderProductionChart(summary.hourly_production);
  renderCycleTrend(summary.cycle_time_trend || []);
  renderDurationChart(summary.running_seconds_24h, summary.paused_seconds_24h);
}

function renderProductionChart(points) {
  if (!points.length) {
    els.productionChart.innerHTML = '<p class="empty-state">No hay producción registrada en este periodo.</p>';
    return;
  }
  const max = Math.max(...points.map((point) => Number(point.count)), 1);
  els.productionChart.innerHTML = points.map((point) => {
    const height = Math.max(5, Math.round((Number(point.count) / max) * 100));
    return `<div class="bar-column" title="${point.count} cajas"><span class="bar-value">${point.count}</span><span class="bar" style="height:${height}%"></span><small>${formatHour(point.hour)}</small></div>`;
  }).join('');
}

function renderCycleTrend(points) {
  if (points.length < 2) {
    els.cycleTrendChart.innerHTML = '<p class="empty-state">Aún no hay suficientes datos para la tendencia.</p>';
    return;
  }
  const width = 640;
  const height = 230;
  const pad = { left: 42, right: 18, top: 20, bottom: 36 };
  const values = points.map((point) => Number(point.average_seconds));
  const max = Math.max(...values, 1);
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const coords = values.map((value, index) => ({
    x: pad.left + (index / (values.length - 1)) * plotWidth,
    y: pad.top + plotHeight - (value / max) * plotHeight,
    value,
    label: formatHour(points[index].hour),
  }));
  const polyline = coords.map((point) => `${point.x},${point.y}`).join(' ');
  const grid = [0, 0.5, 1].map((ratio) => {
    const y = pad.top + plotHeight - ratio * plotHeight;
    return `<line x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}" class="chart-grid"/><text x="4" y="${y + 4}" class="chart-label">${Math.round(max * ratio)} s</text>`;
  }).join('');
  const dots = coords.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="3.5"><title>${point.value} s · ${point.label}</title></circle>`).join('');
  const labels = coords.filter((_, index) => index === 0 || index === coords.length - 1 || index % Math.ceil(coords.length / 5) === 0)
    .map((point) => `<text x="${point.x}" y="${height - 9}" text-anchor="middle" class="chart-label">${point.label}</text>`).join('');
  els.cycleTrendChart.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Tendencia del tiempo entre cajas">${grid}<polyline points="${polyline}" class="trend-line"/>${dots}${labels}</svg>`;
}

function renderDurationChart(runningSeconds, pausedSeconds) {
  const running = Number(runningSeconds || 0);
  const paused = Number(pausedSeconds || 0);
  const total = Math.max(running + paused, 1);
  const runningPercent = Math.round((running / total) * 100);
  const pausedPercent = Math.round((paused / total) * 100);
  els.durationChart.innerHTML = `
    <div class="duration-item"><span>Marcha</span><div class="duration-track"><i style="width:${runningPercent}%"></i></div><strong>${formatDuration(running)} <small>${runningPercent}%</small></strong></div>
    <div class="duration-item paused"><span>Pausa</span><div class="duration-track"><i style="width:${pausedPercent}%"></i></div><strong>${formatDuration(paused)} <small>${pausedPercent}%</small></strong></div>
  `;
}

function renderEvents(entries) {
  if (!entries.length) {
    els.recentEventsTable.innerHTML = '<tr><td colspan="3">Aún no hay cajas registradas.</td></tr>';
    return;
  }
  els.recentEventsTable.innerHTML = entries.slice(0, 5).map((entry) => `
    <tr><td>${entry.logical_total}</td><td>${formatDateTime(entry.completed_at)}</td><td><span class="event-state">${icon('check')} ${entry.recovered ? 'Recuperada' : 'Terminada'}</span></td></tr>
  `).join('');
}

function renderStacks(entries) {
  if (!entries.length) {
    els.stacksTable.innerHTML = '<tr><td colspan="6">Sin registros</td></tr>';
    return;
  }
  els.stacksTable.innerHTML = entries.map((stack) => `
    <tr><td>#${stack.id}</td><td>${formatDateTime(stack.started_at)}</td><td>${stack.completed_at ? formatDateTime(stack.completed_at) : '—'}</td><td>${stack.target}</td><td>${stack.processed_count}</td><td><span class="table-status ${stack.status}">${stack.status === 'completed' ? 'Terminado' : 'Activo'}</span></td></tr>
  `).join('');
}

function renderIoPoints(container, points) {
  container.innerHTML = points.map((point) => `
    <div class="io-led-card ${point.active ? 'active' : ''}"><span class="io-led" aria-hidden="true"></span><div><strong>${point.name}</strong><span>${point.label}</span><small>Modbus ${point.modbus_address}</small></div><b>${point.active ? 'ON' : 'OFF'}</b></div>
  `).join('');
}

function renderFlags(flags) {
  els.flagList.innerHTML = Object.entries(flags).map(([name, active]) => `
    <span class="flag ${active ? 'active' : ''}">${translateFlag(name)} · ${active ? 'Sí' : 'No'}</span>
  `).join('');
}

function translateFlag(flag) {
  return {
    remote_enabled: 'Remoto',
    machine_ready: 'Lista',
    cycle_active: 'Ciclo activo',
    pause_active: 'Pausa',
    automatic_mode: 'Automático',
    fault_active: 'Falla',
    manual_mode: 'Manual',
    heartbeat_valid: 'Heartbeat',
  }[flag] || flag;
}

async function readConsoleRegisters() {
  try {
    const result = await api('/api/debug/read?address=200&count=20');
    els.consoleRegisterReadout.textContent = JSON.stringify(result.labels, null, 2);
  } catch (error) {
    els.consoleRegisterReadout.textContent = error.message;
  }
}

async function refreshConsoleLog() {
  try {
    const result = await api('/api/debug/log');
    const entries = result.entries.slice(-40).map((entry) => {
      const { time, ...data } = entry;
      return `${formatTime(time)} ${JSON.stringify(data)}`;
    });
    els.consoleDebugLog.textContent = entries.length ? entries.join('\n') : 'Sin eventos de comunicación';
  } catch (error) {
    els.consoleDebugLog.textContent = error.message;
  }
}

function renderBackendError(message) {
  els.connectionText.textContent = 'Backend no disponible';
  els.connectionTrigger.className = 'header-status connection-trigger danger';
  showToast(message, 'error');
}

function showToast(message, type = 'neutral') {
  clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.className = `toast ${type}`;
  els.toast.hidden = false;
  toastTimer = setTimeout(() => { els.toast.hidden = true; }, 4500);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  })[char]);
}

function formatTime(value) {
  return new Intl.DateTimeFormat('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(value));
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function formatHour(value) {
  return new Intl.DateTimeFormat('es-CO', { hour: '2-digit' }).format(new Date(value));
}

function formatDuration(seconds) {
  const minutes = Math.round(Number(seconds || 0) / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

function formatRelative(value) {
  const seconds = Math.max(0, (Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 10) return `hace ${seconds.toFixed(1)} s`;
  return `a las ${formatTime(value)}`;
}

function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const socket = new WebSocket(`${protocol}://${window.location.host}/ws/state`);
  socket.addEventListener('open', () => socket.send('hmi-ready'));
  socket.addEventListener('message', (event) => renderSnapshot(JSON.parse(event.data)));
  socket.addEventListener('close', () => setTimeout(connectWebSocket, 1500));
  socket.addEventListener('error', () => socket.close());
}

connectWebSocket();
Promise.all([refreshStatus(), refreshProduction(), loadSettings()]);
setInterval(refreshStatus, 3000);
setInterval(refreshProduction, 10000);
setInterval(() => {
  if (!$('#consoleView').hidden) refreshConsole();
}, 1000);
