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

const app = document.querySelector('#app');

app.innerHTML = `
  <main class="app-shell">
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true">PAI</span>
        <div>
          <p class="eyebrow">HMI local · Xinje XD3</p>
          <h1>Apilado de cajas predobladas</h1>
        </div>
      </div>
      <div class="system-status" aria-label="Estado general">
        <span id="connectionBadge" class="status-badge neutral"><i></i> Iniciando</span>
        <span id="modeBadge" class="status-badge neutral">Modo --</span>
        <span id="machineBadge" class="status-badge neutral">Estado --</span>
      </div>
    </header>

    <nav class="view-tabs" aria-label="Vistas de la aplicación">
      <button class="tab-button active" type="button" data-view="operation">Operación</button>
      <button class="tab-button" type="button" data-view="supervision">Supervisión</button>
      <button class="tab-button" type="button" data-view="console">Consola</button>
    </nav>

    <div id="alarmBanner" class="alarm-banner" role="alert" hidden>
      <div>
        <strong id="alarmTitle">Atención</strong>
        <span id="alarmMessage"></span>
      </div>
      <span id="alarmCode" class="alarm-code"></span>
    </div>

    <section id="operationView" class="view active" aria-label="Vista de operación">
      <div class="operation-layout">
        <article class="panel production-panel">
          <div class="panel-heading">
            <div>
              <p class="eyebrow">Stack actual</p>
              <h2>Avance de producción</h2>
            </div>
            <span id="lastUpdate" class="muted">Sin datos</span>
          </div>

          <div class="production-focus">
            <div class="count-display">
              <strong id="processedCount">0</strong>
              <span>de <b id="activeTarget">20</b> cajas</span>
            </div>
            <div>
              <strong id="progressPercent" class="progress-percent">0%</strong>
              <span class="muted">completado</span>
            </div>
          </div>
          <div
            id="progressTrack"
            class="progress-track"
            role="progressbar"
            aria-label="Avance del stack"
            aria-valuemin="0"
            aria-valuemax="20"
            aria-valuenow="0"
          >
            <span id="progressBar"></span>
          </div>

          <div class="kpi-grid">
            <div class="kpi">
              <span>Total histórico</span>
              <strong id="historicalTotal">0</strong>
            </div>
            <div class="kpi">
              <span>Próximo objetivo</span>
              <strong id="pendingTarget">20</strong>
            </div>
            <div class="kpi">
              <span>Etapa actual</span>
              <strong id="stageNumber">0</strong>
              <small id="stageLabel">Espera / inicio</small>
            </div>
            <div class="kpi">
              <span>Última caja</span>
              <strong id="lastBoxTime">--:--</strong>
            </div>
          </div>
        </article>

        <aside class="panel controls-panel">
          <div class="panel-heading">
            <div>
              <p class="eyebrow">Mando</p>
              <h2>Control de máquina</h2>
            </div>
          </div>

          <label class="field">
            <span>Objetivo del próximo stack</span>
            <div class="target-control">
              <input id="stackSize" type="number" min="1" max="100" value="20" inputmode="numeric" />
              <button id="setTargetButton" type="button">Programar</button>
            </div>
            <small id="targetHint">Se aplicará al iniciar el siguiente stack.</small>
          </label>

          <div class="primary-controls">
            <button id="startButton" class="command primary" type="button" data-command="start">
              <span aria-hidden="true">▶</span> Iniciar
            </button>
            <button id="pauseButton" class="command" type="button" data-command="pause">
              <span aria-hidden="true">Ⅱ</span> Pausar
            </button>
            <button id="resumeButton" class="command" type="button" data-command="resume">
              <span aria-hidden="true">▶</span> Reanudar
            </button>
            <button id="stepButton" class="command step" type="button" data-command="step">
              <span aria-hidden="true">↦</span> Avanzar un paso
            </button>
          </div>
          <div class="secondary-controls">
            <button id="stopButton" class="command caution" type="button" data-command="safe_stop">
              Parada controlada
            </button>
            <button id="resetButton" class="command quiet" type="button" data-command="reset_counter">
              Reiniciar stack actual
            </button>
          </div>

          <div id="commandFeedback" class="command-feedback neutral" aria-live="polite">
            Sin comandos pendientes
          </div>
          <p class="safety-note">
            <strong>Paro de emergencia:</strong> utilice siempre el circuito físico. Esta pantalla sólo solicita una parada controlada.
          </p>
        </aside>
      </div>

      <article class="panel recent-panel">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">Trazabilidad</p>
            <h2>Últimas cajas terminadas</h2>
          </div>
          <span class="muted">Timestamp registrado por el servidor HMI</span>
        </div>
        <div id="recentEvents" class="event-list">
          <p class="empty-state">Aún no hay cajas registradas.</p>
        </div>
      </article>
    </section>

    <section id="supervisionView" class="view" aria-label="Vista de supervisión" hidden>
      <div class="supervision-kpis">
        <article class="metric-card">
          <span>Cajas última hora</span>
          <strong id="boxesLastHour">0</strong>
        </article>
        <article class="metric-card">
          <span>Cajas últimas 24 h</span>
          <strong id="boxesLastDay">0</strong>
        </article>
        <article class="metric-card">
          <span>Tiempo medio entre cajas</span>
          <strong id="averageCycle">--</strong>
        </article>
        <article class="metric-card">
          <span>Stacks terminados</span>
          <strong id="completedStacks">0</strong>
        </article>
      </div>

      <div class="supervision-grid">
        <article class="panel chart-panel">
          <div class="panel-heading">
            <div>
              <p class="eyebrow">Rendimiento</p>
              <h2>Producción por hora · últimas 24 h</h2>
            </div>
          </div>
          <div id="productionChart" class="bar-chart">
            <p class="empty-state">No hay producción registrada en este periodo.</p>
          </div>
          <div class="duration-row">
            <div><span>En marcha</span><strong id="runningTime">0 min</strong></div>
            <div><span>En pausa</span><strong id="pausedTime">0 min</strong></div>
          </div>
        </article>

        <article class="panel history-panel">
          <div class="panel-heading">
            <div>
              <p class="eyebrow">Lotes</p>
              <h2>Histórico de stacks</h2>
            </div>
            <a class="button-link" href="/api/production/export.csv">Exportar CSV</a>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Stack</th><th>Inicio</th><th>Objetivo</th><th>Procesadas</th><th>Estado</th></tr></thead>
              <tbody id="stacksTable"><tr><td colspan="5">Sin registros</td></tr></tbody>
            </table>
          </div>
        </article>
      </div>

      <div class="supervision-grid configuration-grid">
        <article class="panel">
          <div class="panel-heading">
            <div>
              <p class="eyebrow">Comunicación</p>
              <h2>Conexión PLC</h2>
            </div>
          </div>
          <form id="configForm">
            <label class="switch-field">
              <input id="simulator" type="checkbox" checked />
              <span>Usar simulador local</span>
            </label>
            <label class="field"><span>Puerto serial</span><input id="port" value="COM9" /></label>
            <div class="form-grid">
              <label class="field"><span>Esclavo</span><input id="slaveId" type="number" value="1" /></label>
              <label class="field"><span>Baud</span><input id="baudrate" type="number" value="19200" /></label>
              <label class="field"><span>Poll ms</span><input id="pollInterval" type="number" min="250" max="500" value="300" /></label>
            </div>
            <div class="button-row">
              <button class="primary" type="submit">Aplicar</button>
              <button id="connectButton" type="button">Conectar</button>
              <button id="disconnectButton" type="button">Desconectar</button>
            </div>
          </form>
          <div id="simulatorControls" class="simulator-controls">
            <span>Modo simulado</span>
            <button id="simAutoButton" type="button">Automático</button>
            <button id="simManualButton" type="button">Manual</button>
          </div>
        </article>

        <article class="panel">
          <div class="panel-heading">
            <div>
              <p class="eyebrow">Parámetros</p>
              <h2>Configuración operativa</h2>
            </div>
          </div>
          <form id="settingsForm">
            <label class="field">
              <span>Máximo permitido por la HMI</span>
              <input id="maxStackSize" type="number" min="1" max="32767" value="100" />
              <small>El PLC sólo valida que el objetivo sea positivo.</small>
            </label>
            <label class="field">
              <span>Zona horaria</span>
              <input id="timezone" value="America/Bogota" />
            </label>
            <button class="primary" type="submit">Guardar parámetros</button>
          </form>
        </article>
      </div>

      <article class="panel diagnostics-panel">
        <details>
          <summary>
            <span><b>Diagnóstico técnico</b><small>Registros, flags y comunicación Modbus</small></span>
            <span aria-hidden="true">⌄</span>
          </summary>
          <div class="diagnostic-summary">
            <div><span>Contrato</span><strong id="contractVersion">--</strong></div>
            <div><span>Heartbeat</span><strong id="heartbeat">--</strong></div>
            <div><span>Request confirmado</span><strong id="acceptedRequest">--</strong></div>
            <div><span>Último poll</span><strong id="lastPoll">--</strong></div>
          </div>
          <div id="flagList" class="flag-list"></div>
          <div class="button-row">
            <button id="readRegistersButton" type="button">Leer D200–D219</button>
            <button id="refreshLogButton" type="button">Actualizar log</button>
          </div>
          <div class="debug-grid">
            <pre id="registerReadout">Sin lectura manual</pre>
            <pre id="debugLog">Sin eventos de comunicación</pre>
          </div>
        </details>
      </article>
    </section>

    <section id="consoleView" class="view" aria-label="Consola de diagnóstico" hidden>
      <div class="console-header">
        <div>
          <p class="eyebrow">Diagnóstico en vivo · sólo lectura</p>
          <h2>Entradas y salidas físicas</h2>
          <p class="muted">Los indicadores reflejan los puntos utilizados por el programa secuencial actual.</p>
        </div>
        <div class="console-actions">
          <span id="ioLastUpdate" class="muted">Sin lectura</span>
          <button id="refreshConsoleButton" type="button">Actualizar ahora</button>
        </div>
      </div>

      <div id="consoleError" class="console-error" hidden></div>

      <div class="io-sections">
        <article class="panel io-panel">
          <div class="panel-heading">
            <div>
              <p class="eyebrow">Sensores y pulsadores</p>
              <h2>Entradas X</h2>
            </div>
            <span id="inputActiveCount" class="io-count">0 activas</span>
          </div>
          <div id="inputLedGrid" class="io-led-grid">
            <p class="empty-state">Esperando lectura del PLC.</p>
          </div>
        </article>

        <article class="panel io-panel">
          <div class="panel-heading">
            <div>
              <p class="eyebrow">Actuadores comandados</p>
              <h2>Salidas Y</h2>
            </div>
            <span id="outputActiveCount" class="io-count">0 activas</span>
          </div>
          <div id="outputLedGrid" class="io-led-grid">
            <p class="empty-state">Esperando lectura del PLC.</p>
          </div>
        </article>
      </div>

      <article class="panel console-terminal-panel">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">Consola técnica</p>
            <h2>Registros y transacciones Modbus</h2>
          </div>
          <div class="button-row">
            <button id="consoleReadRegistersButton" type="button">Leer D200–D219</button>
            <button id="consoleRefreshLogButton" type="button">Actualizar log</button>
          </div>
        </div>
        <div class="debug-grid">
          <div>
            <span class="console-label">Registros del contrato</span>
            <pre id="consoleRegisterReadout">Sin lectura manual</pre>
          </div>
          <div>
            <span class="console-label">Log de comunicación</span>
            <pre id="consoleDebugLog">Sin eventos de comunicación</pre>
          </div>
        </div>
      </article>

      <p class="console-disclaimer">
        Esta vista no permite forzar señales. Una salida encendida significa que el PLC la reporta activa; no es un botón de mando.
      </p>
    </section>

    <div id="toast" class="toast" role="status" aria-live="polite" hidden></div>
  </main>
`;

const $ = (selector) => document.querySelector(selector);
const els = {
  connectionBadge: $('#connectionBadge'),
  modeBadge: $('#modeBadge'),
  machineBadge: $('#machineBadge'),
  alarmBanner: $('#alarmBanner'),
  alarmTitle: $('#alarmTitle'),
  alarmMessage: $('#alarmMessage'),
  alarmCode: $('#alarmCode'),
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
  recentEvents: $('#recentEvents'),
  boxesLastHour: $('#boxesLastHour'),
  boxesLastDay: $('#boxesLastDay'),
  averageCycle: $('#averageCycle'),
  completedStacks: $('#completedStacks'),
  productionChart: $('#productionChart'),
  runningTime: $('#runningTime'),
  pausedTime: $('#pausedTime'),
  stacksTable: $('#stacksTable'),
  configForm: $('#configForm'),
  simulator: $('#simulator'),
  port: $('#port'),
  slaveId: $('#slaveId'),
  baudrate: $('#baudrate'),
  pollInterval: $('#pollInterval'),
  connectButton: $('#connectButton'),
  disconnectButton: $('#disconnectButton'),
  simulatorControls: $('#simulatorControls'),
  simAutoButton: $('#simAutoButton'),
  simManualButton: $('#simManualButton'),
  settingsForm: $('#settingsForm'),
  maxStackSize: $('#maxStackSize'),
  timezone: $('#timezone'),
  contractVersion: $('#contractVersion'),
  heartbeat: $('#heartbeat'),
  acceptedRequest: $('#acceptedRequest'),
  lastPoll: $('#lastPoll'),
  flagList: $('#flagList'),
  readRegistersButton: $('#readRegistersButton'),
  refreshLogButton: $('#refreshLogButton'),
  registerReadout: $('#registerReadout'),
  debugLog: $('#debugLog'),
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
  toast: $('#toast'),
};

let latestSnapshot = null;
let configDirty = false;
let commandPending = false;
let toastTimer = null;

document.querySelectorAll('.tab-button').forEach((button) => {
  button.addEventListener('click', () => switchView(button.dataset.view));
});

document.querySelectorAll('.command').forEach((button) => {
  button.addEventListener('click', () => sendCommand(button.dataset.command));
});

els.setTargetButton.addEventListener('click', () => sendCommand('set_target', true));
els.configForm.addEventListener('input', () => { configDirty = true; });
els.configForm.addEventListener('submit', applyConfig);
els.connectButton.addEventListener('click', connectPlc);
els.disconnectButton.addEventListener('click', disconnectPlc);
els.settingsForm.addEventListener('submit', saveSettings);
els.simAutoButton.addEventListener('click', () => setSimulatorMode(false));
els.simManualButton.addEventListener('click', () => setSimulatorMode(true));
els.readRegistersButton.addEventListener('click', readRegisters);
els.refreshLogButton.addEventListener('click', refreshLog);
els.refreshConsoleButton.addEventListener('click', refreshConsole);
els.consoleReadRegistersButton.addEventListener('click', readConsoleRegisters);
els.consoleRefreshLogButton.addEventListener('click', refreshConsoleLog);

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
    renderConnectionError(error.message);
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
    const activeInputs = result.inputs.filter((point) => point.active).length;
    const activeOutputs = result.outputs.filter((point) => point.active).length;
    els.inputActiveCount.textContent = `${activeInputs} ${activeInputs === 1 ? 'activa' : 'activas'}`;
    els.outputActiveCount.textContent = `${activeOutputs} ${activeOutputs === 1 ? 'activa' : 'activas'}`;
    els.ioLastUpdate.textContent = `Actualizado ${formatTime(result.observed_at)}`;
    els.consoleError.hidden = true;
  } catch (error) {
    els.consoleError.textContent = `No fue posible leer las entradas y salidas: ${error.message}`;
    els.consoleError.hidden = false;
  }
}

function renderIoPoints(container, points) {
  container.innerHTML = points.map((point) => `
    <div class="io-led-card ${point.active ? 'active' : ''}">
      <span class="io-led" aria-hidden="true"></span>
      <div>
        <strong>${point.name}</strong>
        <span>${point.label}</span>
        <small>Modbus ${point.modbus_address}</small>
      </div>
      <b class="io-state">${point.active ? 'ON' : 'OFF'}</b>
    </div>
  `).join('');
}

async function loadSettings() {
  try {
    const settings = await api('/api/settings');
    els.maxStackSize.value = settings.max_stack_size;
    els.timezone.value = settings.timezone;
    els.stackSize.max = settings.max_stack_size;
    $('#targetHint').textContent =
      `Se aplicará al siguiente stack. Máximo configurado: ${settings.max_stack_size}.`;
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function renderSnapshot(snapshot) {
  latestSnapshot = snapshot;
  const isManual = Boolean(snapshot.flags.manual_mode);
  const hasFault = Number(snapshot.fault_code) !== 0 || snapshot.machine_state_label === 'fault';
  const isStale = snapshot.last_poll_at
    ? Date.now() - new Date(snapshot.last_poll_at).getTime() > 2500
    : true;

  els.connectionBadge.innerHTML = `<i></i> ${snapshot.connected ? 'PLC conectado' : 'Sin conexión'}`;
  els.connectionBadge.className = `status-badge ${snapshot.connected && !isStale ? 'ok' : 'warning'}`;
  els.modeBadge.textContent = isManual ? 'Modo manual' : 'Modo automático';
  els.modeBadge.className = `status-badge ${isManual ? 'manual' : 'neutral'}`;
  els.machineBadge.textContent = stateLabels[snapshot.machine_state_label] || snapshot.machine_state_label;
  els.machineBadge.className = `status-badge ${hasFault ? 'danger' : 'neutral'}`;

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
  els.lastUpdate.textContent = snapshot.last_poll_at
    ? `Actualizado ${formatTime(snapshot.last_poll_at)}`
    : 'Sin lectura del PLC';

  els.contractVersion.textContent = snapshot.contract_version;
  els.heartbeat.textContent = snapshot.heartbeat;
  els.acceptedRequest.textContent = snapshot.accepted_request_id;
  els.lastPoll.textContent = snapshot.last_poll_at ? formatTime(snapshot.last_poll_at) : '--';
  renderFlags(snapshot.flags);
  renderAlarm(snapshot, hasFault, isStale);
  renderCommandFeedback(snapshot.command_status, snapshot.command_message);

  if (!configDirty) syncConfig(snapshot.config);
  els.simulatorControls.hidden = !snapshot.simulator;
  renderControlAvailability();
}

function renderAlarm(snapshot, hasFault, isStale) {
  let title = '';
  let message = '';
  let code = '';
  if (!snapshot.connected) {
    title = 'Sin comunicación con el PLC';
    message = 'Los mandos están bloqueados. Revise la conexión en Supervisión.';
  } else if (snapshot.last_error) {
    title = 'Error de comunicación';
    message = snapshot.last_error;
  } else if (hasFault) {
    title = faultLabels[snapshot.fault_label] || snapshot.fault_label;
    message = faultAction(snapshot.fault_code);
    code = `F${snapshot.fault_code}`;
  } else if (isStale) {
    title = 'Datos sin actualizar';
    message = 'La última lectura del PLC superó el tiempo esperado.';
  }
  els.alarmBanner.hidden = !title;
  if (title) {
    els.alarmTitle.textContent = title;
    els.alarmMessage.textContent = message;
    els.alarmCode.textContent = code;
  }
}

function faultAction(code) {
  if (code === 24) return 'Cambie el selector físico X2 a modo manual antes de solicitar un paso.';
  if (code === 90) return 'Revise el puerto y el heartbeat antes de reanudar.';
  if (code === 10) return 'Corrija el objetivo configurado para el próximo stack.';
  return 'Revise las condiciones de máquina y el diagnóstico antes de reintentar.';
}

function renderControlAvailability() {
  if (!latestSnapshot) return;
  const connected = latestSnapshot.connected && !commandPending;
  const manual = Boolean(latestSnapshot.flags.manual_mode);
  const state = latestSnapshot.machine_state_label;
  const hasFault = Number(latestSnapshot.fault_code) !== 0 && latestSnapshot.fault_code >= 90;

  $('#startButton').disabled = !connected || manual || !['ready', 'stopped'].includes(state) || hasFault;
  $('#pauseButton').disabled = !connected || manual || state !== 'running';
  $('#resumeButton').disabled = !connected || manual || state !== 'paused';
  $('#stepButton').disabled = !connected || !manual || hasFault;
  $('#stopButton').disabled = !connected || ['stopped', 'ready'].includes(state);
  $('#resetButton').disabled = !connected || ['running', 'paused'].includes(state);
  els.setTargetButton.disabled = !connected;
  els.stackSize.disabled = commandPending;
}

function renderCommandFeedback(status, message) {
  els.commandFeedback.className = `command-feedback ${status || 'neutral'}`;
  els.commandFeedback.textContent = message || 'Sin comandos pendientes';
}

function renderSummary(summary) {
  els.historicalTotal.textContent = Number(summary.historical_total).toLocaleString('es-CO');
  els.boxesLastHour.textContent = Number(summary.boxes_last_hour).toLocaleString('es-CO');
  els.boxesLastDay.textContent = Number(summary.boxes_last_24h).toLocaleString('es-CO');
  els.averageCycle.textContent = summary.average_cycle_seconds == null
    ? '--'
    : `${summary.average_cycle_seconds} s`;
  els.completedStacks.textContent = Number(summary.stacks_completed).toLocaleString('es-CO');
  els.runningTime.textContent = formatDuration(summary.running_seconds_24h);
  els.pausedTime.textContent = formatDuration(summary.paused_seconds_24h);
  renderChart(summary.hourly_production);
}

function renderChart(points) {
  if (!points.length) {
    els.productionChart.innerHTML = '<p class="empty-state">No hay producción registrada en este periodo.</p>';
    return;
  }
  const max = Math.max(...points.map((point) => Number(point.count)), 1);
  els.productionChart.innerHTML = points.map((point) => {
    const height = Math.max(8, Math.round((Number(point.count) / max) * 100));
    return `
      <div class="bar-column" title="${point.count} cajas">
        <span class="bar-value">${point.count}</span>
        <span class="bar" style="height:${height}%"></span>
        <small>${formatHour(point.hour)}</small>
      </div>
    `;
  }).join('');
}

function renderEvents(entries) {
  if (!entries.length) {
    els.recentEvents.innerHTML = '<p class="empty-state">Aún no hay cajas registradas.</p>';
    return;
  }
  els.recentEvents.innerHTML = entries.map((entry) => `
    <div class="event-row">
      <span class="event-icon" aria-hidden="true">✓</span>
      <div><strong>Caja #${entry.logical_total}</strong><small>${entry.recovered ? 'Recuperada después de una desconexión' : 'Terminada correctamente'}</small></div>
      <time datetime="${entry.completed_at}">${formatDateTime(entry.completed_at)}</time>
    </div>
  `).join('');
}

function renderStacks(entries) {
  if (!entries.length) {
    els.stacksTable.innerHTML = '<tr><td colspan="5">Sin registros</td></tr>';
    return;
  }
  els.stacksTable.innerHTML = entries.map((stack) => `
    <tr>
      <td>#${stack.id}</td>
      <td>${formatDateTime(stack.started_at)}</td>
      <td>${stack.target}</td>
      <td>${stack.processed_count}</td>
      <td><span class="table-status ${stack.status}">${stack.status === 'completed' ? 'Terminado' : 'Activo'}</span></td>
    </tr>
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
    heartbeat_valid: 'Heartbeat válido',
  }[flag] || flag;
}

async function applyConfig(event) {
  event.preventDefault();
  try {
    const snapshot = await api('/api/config', {
      method: 'POST',
      body: JSON.stringify(readConfig()),
    });
    configDirty = false;
    renderSnapshot(snapshot);
    showToast('Configuración aplicada', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function connectPlc() {
  try {
    const snapshot = await api('/api/connect', {
      method: 'POST',
      body: JSON.stringify(readConfig()),
    });
    configDirty = false;
    renderSnapshot(snapshot);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function disconnectPlc() {
  try {
    renderSnapshot(await api('/api/disconnect', { method: 'POST' }));
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function saveSettings(event) {
  event.preventDefault();
  try {
    const settings = await api('/api/settings', {
      method: 'PUT',
      body: JSON.stringify({
        max_stack_size: Number(els.maxStackSize.value),
        timezone: els.timezone.value.trim(),
      }),
    });
    els.stackSize.max = settings.max_stack_size;
    $('#targetHint').textContent =
      `Se aplicará al siguiente stack. Máximo configurado: ${settings.max_stack_size}.`;
    showToast('Parámetros guardados', 'success');
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

async function readRegisters() {
  try {
    const result = await api('/api/debug/read?address=200&count=20');
    els.registerReadout.textContent = JSON.stringify(result.labels, null, 2);
  } catch (error) {
    els.registerReadout.textContent = error.message;
  }
}

async function refreshLog() {
  try {
    const result = await api('/api/debug/log');
    const entries = result.entries.slice(-30).map((entry) => {
      const { time, ...data } = entry;
      return `${formatTime(time)} ${JSON.stringify(data)}`;
    });
    els.debugLog.textContent = entries.length ? entries.join('\n') : 'Sin eventos de comunicación';
  } catch (error) {
    els.debugLog.textContent = error.message;
  }
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
    els.consoleDebugLog.textContent = entries.length
      ? entries.join('\n')
      : 'Sin eventos de comunicación';
  } catch (error) {
    els.consoleDebugLog.textContent = error.message;
  }
}

function readConfig() {
  return {
    simulator: els.simulator.checked,
    port: els.port.value.trim(),
    slave_id: Number(els.slaveId.value),
    baudrate: Number(els.baudrate.value),
    bytesize: 8,
    parity: 'E',
    stopbits: 1,
    timeout_ms: 500,
    retries: 2,
    poll_interval_ms: Number(els.pollInterval.value),
    heartbeat_interval_ms: 1000,
  };
}

function syncConfig(config) {
  els.simulator.checked = config.simulator;
  els.port.value = config.port;
  els.slaveId.value = config.slave_id;
  els.baudrate.value = config.baudrate;
  els.pollInterval.value = config.poll_interval_ms;
}

function renderConnectionError(message) {
  els.connectionBadge.innerHTML = '<i></i> Sin backend';
  els.connectionBadge.className = 'status-badge danger';
  showToast(message, 'error');
}

function showToast(message, type = 'neutral') {
  clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.className = `toast ${type}`;
  els.toast.hidden = false;
  toastTimer = setTimeout(() => { els.toast.hidden = true; }, 4500);
}

function formatTime(value) {
  return new Intl.DateTimeFormat('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value));
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatHour(value) {
  return new Intl.DateTimeFormat('es-CO', { hour: '2-digit' }).format(new Date(value));
}

function formatDuration(seconds) {
  const minutes = Math.round(Number(seconds || 0) / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
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
