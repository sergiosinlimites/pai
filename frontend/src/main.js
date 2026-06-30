import './styles.css';

const commandLabels = {
  start: 'Start',
  pause: 'Pause',
  resume: 'Resume',
  safe_stop: 'Safe stop',
  reset_counter: 'Reset counter',
  confirm_stack_removed: 'Confirm stack removed',
};

const app = document.querySelector('#app');

app.innerHTML = `
  <main class="shell">
    <header class="hero">
      <div>
        <p class="eyebrow">Xinje XD3 local HMI scaffold</p>
        <h1>PC-PLC stack controller</h1>
        <p class="subtitle">Local FastAPI + Vite interface for the first Modbus RTU integration pass.</p>
      </div>
      <div class="connection-card">
        <span id="connectionPill" class="pill neutral">Starting</span>
        <span id="transportMode" class="mode">Simulator</span>
      </div>
    </header>

    <section class="grid status-grid" aria-label="Machine status">
      <article class="panel state-panel">
        <span class="label">Machine state</span>
        <strong id="machineState">--</strong>
        <small id="lastPoll">No poll yet</small>
      </article>
      <article class="panel">
        <span class="label">Requested stack</span>
        <strong id="requestedStack">--</strong>
      </article>
      <article class="panel">
        <span class="label">Accepted stack</span>
        <strong id="acceptedStack">--</strong>
      </article>
      <article class="panel">
        <span class="label">Processed count</span>
        <strong id="processedCount">--</strong>
      </article>
      <article class="panel">
        <span class="label">Stage</span>
        <strong id="stage">--</strong>
      </article>
      <article class="panel fault-panel">
        <span class="label">Fault</span>
        <strong id="fault">--</strong>
      </article>
    </section>

    <section class="grid io-grid" aria-label="Simple I/O">
      <article class="panel">
        <span class="label">Counter D220</span>
        <strong id="ioCounter">--</strong>
      </article>
      <article class="panel">
        <span class="label">Input X1 / D221</span>
        <strong id="x1State">--</strong>
      </article>
      <article class="panel">
        <span class="label">Output Y1 / D222</span>
        <strong id="y1State">--</strong>
        <div class="inline-actions">
          <button id="y1OnButton" type="button" class="primary">Y1 ON</button>
          <button id="y1OffButton" type="button">Y1 OFF</button>
        </div>
      </article>
    </section>

    <section class="grid two-columns">
      <article class="panel controls-panel">
        <div class="section-title">
          <h2>Operator controls</h2>
          <p>Commands are written to D200-D203 as one Modbus transaction.</p>
        </div>
        <label class="field">
          <span>Stack size</span>
          <input id="stackSize" type="number" min="1" max="9999" value="20" />
        </label>
        <div class="button-grid" id="commandButtons"></div>
        <p class="safety-note">Emergency stop is intentionally not exposed here. It must remain a physical, independent circuit.</p>
      </article>

      <article class="panel config-panel">
        <div class="section-title">
          <h2>Connection</h2>
          <p>Defaults match Xinje XD3 Modbus RTU: slave 1, 19200 8E1, timeout 500 ms, retries 2.</p>
        </div>
        <form id="configForm" class="config-form">
          <label class="field checkbox-field">
            <input id="simulator" name="simulator" type="checkbox" checked />
            <span>Simulator mode</span>
          </label>
          <label class="field">
            <span>Serial port</span>
            <input id="port" name="port" value="/dev/ttyUSB0" />
          </label>
          <div class="compact-grid">
            <label class="field"><span>Slave</span><input id="slaveId" name="slave_id" type="number" value="1" /></label>
            <label class="field"><span>Baud</span><input id="baudrate" name="baudrate" type="number" value="19200" /></label>
            <label class="field"><span>Poll ms</span><input id="pollInterval" name="poll_interval_ms" type="number" value="300" min="250" max="500" /></label>
          </div>
          <div class="connection-actions">
            <button class="primary" type="submit">Apply config</button>
            <button id="connectButton" type="button">Connect</button>
            <button id="disconnectButton" type="button">Disconnect</button>
          </div>
        </form>
      </article>
    </section>

    <section class="panel details-panel">
      <div class="section-title">
        <h2>Runtime details</h2>
        <p>Useful during bench testing before the PLC logic is wired to motion.</p>
      </div>
      <dl class="details-list">
        <div><dt>Accepted request id</dt><dd id="acceptedRequestId">--</dd></div>
        <div><dt>Next request id</dt><dd id="nextRequestId">--</dd></div>
        <div><dt>Heartbeat</dt><dd id="heartbeat">--</dd></div>
        <div><dt>Status word</dt><dd id="statusWord">--</dd></div>
        <div><dt>Contract version</dt><dd id="contractVersion">--</dd></div>
        <div><dt>Last error</dt><dd id="lastError">None</dd></div>
      </dl>
      <pre id="flags" class="flags" aria-label="Decoded status flags"></pre>
    </section>

    <section class="panel debug-panel">
      <div class="section-title">
        <h2>Modbus debug</h2>
        <p>Raw reads and writes for checking the PLC D-register contract.</p>
      </div>
      <div class="debug-actions">
        <button id="debugReadButton" type="button">Read D204-D222</button>
        <button id="debugLogButton" type="button">Refresh log</button>
      </div>
      <div class="debug-grid">
        <pre id="debugReadout" class="debug-output" aria-label="Raw D register read">No debug read yet</pre>
        <pre id="debugLog" class="debug-output" aria-label="Modbus transaction log">No debug log yet</pre>
      </div>
    </section>
  </main>
`;

const els = {
  connectionPill: document.querySelector('#connectionPill'),
  transportMode: document.querySelector('#transportMode'),
  machineState: document.querySelector('#machineState'),
  lastPoll: document.querySelector('#lastPoll'),
  requestedStack: document.querySelector('#requestedStack'),
  acceptedStack: document.querySelector('#acceptedStack'),
  processedCount: document.querySelector('#processedCount'),
  stage: document.querySelector('#stage'),
  fault: document.querySelector('#fault'),
  ioCounter: document.querySelector('#ioCounter'),
  x1State: document.querySelector('#x1State'),
  y1State: document.querySelector('#y1State'),
  y1OnButton: document.querySelector('#y1OnButton'),
  y1OffButton: document.querySelector('#y1OffButton'),
  stackSize: document.querySelector('#stackSize'),
  commandButtons: document.querySelector('#commandButtons'),
  configForm: document.querySelector('#configForm'),
  simulator: document.querySelector('#simulator'),
  port: document.querySelector('#port'),
  slaveId: document.querySelector('#slaveId'),
  baudrate: document.querySelector('#baudrate'),
  pollInterval: document.querySelector('#pollInterval'),
  connectButton: document.querySelector('#connectButton'),
  disconnectButton: document.querySelector('#disconnectButton'),
  acceptedRequestId: document.querySelector('#acceptedRequestId'),
  nextRequestId: document.querySelector('#nextRequestId'),
  heartbeat: document.querySelector('#heartbeat'),
  statusWord: document.querySelector('#statusWord'),
  contractVersion: document.querySelector('#contractVersion'),
  lastError: document.querySelector('#lastError'),
  flags: document.querySelector('#flags'),
  debugReadButton: document.querySelector('#debugReadButton'),
  debugLogButton: document.querySelector('#debugLogButton'),
  debugReadout: document.querySelector('#debugReadout'),
  debugLog: document.querySelector('#debugLog'),
};

let configDirty = false;

Object.entries(commandLabels).forEach(([command, label]) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.command = command;
  button.textContent = label;
  if (command === 'start') button.classList.add('primary');
  if (command === 'safe_stop') button.classList.add('warning');
  button.addEventListener('click', () => sendCommand(command));
  els.commandButtons.appendChild(button);
});

els.configForm.addEventListener('input', () => {
  configDirty = true;
});

els.configForm.addEventListener('change', () => {
  configDirty = true;
});

els.y1OnButton.addEventListener('click', () => setY1(true));
els.y1OffButton.addEventListener('click', () => setY1(false));
els.debugReadButton.addEventListener('click', readDebugWindow);
els.debugLogButton.addEventListener('click', refreshDebugLog);

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(detail.detail || response.statusText);
  }
  return response.json();
}

async function refreshStatus() {
  try {
    renderSnapshot(await api('/api/status'));
  } catch (error) {
    renderError(error.message);
  }
}

async function sendCommand(command) {
  try {
    await api('/api/command', {
      method: 'POST',
      body: JSON.stringify({ command, stack_size: Number(els.stackSize.value) }),
    });
    await refreshStatus();
  } catch (error) {
    renderError(error.message);
  }
}

async function setY1(active) {
  try {
    await api('/api/io/y1', {
      method: 'POST',
      body: JSON.stringify({ active }),
    });
    await refreshStatus();
    await readDebugWindow();
  } catch (error) {
    renderError(error.message);
  }
}

async function readDebugWindow() {
  try {
    const result = await api('/api/debug/read?address=204&count=19');
    els.debugReadout.textContent = JSON.stringify(result.labels, null, 2);
    await refreshDebugLog();
  } catch (error) {
    renderError(error.message);
    els.debugReadout.textContent = error.message;
  }
}

async function refreshDebugLog() {
  try {
    const result = await api('/api/debug/log');
    const entries = result.entries.slice(-35).map(formatDebugEntry);
    els.debugLog.textContent = entries.length ? entries.join('\n') : 'No debug log yet';
  } catch (error) {
    renderError(error.message);
    els.debugLog.textContent = error.message;
  }
}

function readConfigForm() {
  return {
    simulator: els.simulator.checked,
    port: els.port.value,
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

els.configForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const snapshot = await api('/api/config', { method: 'POST', body: JSON.stringify(readConfigForm()) });
    configDirty = false;
    renderSnapshot(snapshot, { syncConfigForm: true });
  } catch (error) {
    renderError(error.message);
  }
});

els.connectButton.addEventListener('click', async () => {
  try {
    const snapshot = await api('/api/connect', { method: 'POST', body: JSON.stringify(readConfigForm()) });
    configDirty = false;
    renderSnapshot(snapshot, { syncConfigForm: true });
  } catch (error) {
    renderError(error.message);
  }
});

els.disconnectButton.addEventListener('click', async () => {
  try {
    renderSnapshot(await api('/api/disconnect', { method: 'POST' }), { syncConfigForm: !configDirty });
  } catch (error) {
    renderError(error.message);
  }
});

function renderSnapshot(snapshot, options = {}) {
  const hasFault = Number(snapshot.fault_code) !== 0 || snapshot.machine_state_label === 'fault';
  els.connectionPill.textContent = snapshot.connected ? 'Connected' : 'Disconnected';
  els.connectionPill.className = 'pill neutral';
  els.transportMode.textContent = snapshot.simulator ? 'Simulator' : 'Modbus RTU';
  els.machineState.textContent = humanize(snapshot.machine_state_label);
  els.machineState.className = hasFault ? 'fault-text' : '';
  els.lastPoll.textContent = snapshot.last_poll_at ? `Last poll ${formatTime(snapshot.last_poll_at)}` : 'No poll yet';
  els.requestedStack.textContent = snapshot.requested_stack_size;
  els.acceptedStack.textContent = snapshot.accepted_stack_size;
  els.processedCount.textContent = snapshot.processed_count;
  els.stage.textContent = snapshot.stage;
  els.fault.textContent = `${snapshot.fault_code} · ${humanize(snapshot.fault_label)}`;
  els.fault.className = hasFault ? 'fault-text' : '';
  els.ioCounter.textContent = snapshot.io_counter_value ?? '--';
  els.x1State.textContent = snapshot.x1_active ? 'ON' : 'OFF';
  els.x1State.className = snapshot.x1_active ? 'ok-text' : '';
  els.y1State.textContent = snapshot.y1_active ? 'ON' : 'OFF';
  els.y1State.className = snapshot.y1_active ? 'ok-text' : '';
  els.acceptedRequestId.textContent = snapshot.accepted_request_id;
  els.nextRequestId.textContent = snapshot.next_request_id;
  els.heartbeat.textContent = snapshot.heartbeat;
  els.statusWord.textContent = snapshot.status_word;
  els.contractVersion.textContent = snapshot.contract_version;
  els.lastError.textContent = snapshot.last_error || 'None';
  els.flags.textContent = JSON.stringify(snapshot.flags, null, 2);

  if (options.syncConfigForm || !configDirty) {
    syncConfigForm(snapshot.config);
  }
}

function syncConfigForm(config) {
  els.simulator.checked = config.simulator;
  els.port.value = config.port;
  els.slaveId.value = config.slave_id;
  els.baudrate.value = config.baudrate;
  els.pollInterval.value = config.poll_interval_ms;
}

function renderError(message) {
  els.connectionPill.textContent = 'Attention';
  els.connectionPill.className = 'pill warning';
  els.lastError.textContent = message;
}

function humanize(value) {
  return String(value || '--').replaceAll('_', ' ');
}

function formatTime(value) {
  return new Date(value).toLocaleTimeString();
}

function formatDebugEntry(entry) {
  const time = formatTime(entry.time);
  const rest = { ...entry };
  delete rest.time;
  return `${time} ${JSON.stringify(rest)}`;
}

function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const socket = new WebSocket(`${protocol}://${window.location.host}/ws/state`);
  socket.addEventListener('open', () => socket.send('client-ready'));
  socket.addEventListener('message', (event) => renderSnapshot(JSON.parse(event.data)));
  socket.addEventListener('close', () => setTimeout(connectWebSocket, 1500));
  socket.addEventListener('error', () => socket.close());
}

connectWebSocket();
refreshStatus();
setInterval(refreshStatus, 3000);
