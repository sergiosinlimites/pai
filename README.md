# PC-PLC Xinje XD3 Local HMI Scaffold

First runnable scaffold for a local PC HMI that talks to a Xinje XD3 PLC over Modbus RTU through a USB-RS485 adapter. The backend owns the only Modbus master connection; the browser talks to the backend through HTTP and WebSocket.

## Quick path: run without a PLC

1. Start the backend in simulator mode:

   ```bash
   cd backend
   python -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
   ```

2. Start the HMI:

   ```bash
   cd frontend
   npm install
   npm run dev
   ```

3. Open the Vite URL, usually `http://127.0.0.1:5173`.

Simulator mode is enabled by default so the HMI can be exercised before the PLC program is ready.

## Windows setup used on this machine

This workspace has been prepared on Windows with:

| Tool | Value |
|---|---|
| Node | `v26.1.0` |
| npm | `11.13.0` via `npm.cmd` |
| Python | `3.12.13` installed with `mise` |
| Backend venv | `backend\.venv` |
| Detected RS485 port | `COM9` |

PowerShell blocks `npm.ps1` on many Windows installs. Use `npm.cmd` in commands below.

Start the backend in simulator mode:

```powershell
cd C:\Users\sergi\Desktop\Universidad\PAI\pai\backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

In a second PowerShell window, start the HMI:

```powershell
cd C:\Users\sergi\Desktop\Universidad\PAI\pai
npm.cmd --prefix frontend run dev
```

Open `http://localhost:5173/`.

## Run against the PLC

Set the real serial port and disable the simulator before starting the backend:

```bash
export PLC_SIMULATOR=false
export PLC_SERIAL_PORT=/dev/ttyUSB0   # Windows example: COM4
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

PowerShell equivalent for the detected Windows adapter, run from `backend`:

```powershell
$env:PLC_SIMULATOR = "false"
$env:PLC_SERIAL_PORT = "COM9"
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

You can also switch from the HMI:

1. Open `http://localhost:5173/`.
2. In `Connection`, clear `Simulator mode`.
3. Set `Serial port` to `COM9`.
4. Keep `Slave` as `1`, `Baud` as `19200`, and `Poll ms` between `250` and `500`.
5. Click `Apply config`.
6. Click `Connect`.
7. Confirm the header changes to `Connected` and `Modbus RTU`.

The scaffold intentionally validates the first target link settings:

| Parameter | Value |
|---|---:|
| Slave id | `1` |
| Baudrate | `19200` |
| Bytesize | `8` |
| Parity | `E` / even |
| Stopbits | `1` |
| Timeout | `500 ms` |
| Retries | `2` |
| Poll interval | `250-500 ms` |
| Heartbeat | `1000 ms` |

## API surface

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | Basic service and connection health. |
| `GET /api/status` | Latest decoded PLC state. |
| `POST /api/connect` | Open simulator or Modbus RTU session. Optional config body. |
| `POST /api/disconnect` | Close the active session. |
| `POST /api/config` | Update communication config; reconnects only if already running. |
| `POST /api/command` | Write command block `D200-D203` in one transaction. |
| `WS /ws/state` | Broadcast latest decoded state. |

Command body example:

```json
{
  "command": "start",
  "stack_size": 25
}
```

Supported commands: `start`, `pause`, `resume`, `safe_stop`, `reset_counter`, `confirm_stack_removed`.

## Safety boundary

The HMI provides controlled requests only. It does not expose an emergency stop control. Emergency stop must remain a physical, independent safety circuit outside the PC, browser, USB adapter, Modbus link, and local network.

## Project layout

| Path | Role |
|---|---|
| `backend/app/` | FastAPI service, Modbus contract, simulator, single-transaction PLC service. |
| `frontend/` | Vite vanilla JS HMI. |
| `docs/modbus-contract.md` | Register map and command contract. |
| `docs/plc-xdppro-rung-guide.md` | PLC/XDPPro implementation guide. |
| `docs/README-xinje-comunicacion.md` | Xinje read/write examples and full PC-PLC data diagram. |
| `docs/README-plan-stack-final-xinje.md` | Planning and rung diagram for stack target and processed count integration. |
| `docs/README-secuencialol-ladder.md` | Extracted readable summary of `SECUENCIALOL.xdp`. |
| `docs/test-plan.md` | Simulator, bench, and machine verification plan. |
| `firmware/esp32-bridge/` | Future ESP32 route notes and placeholder scaffold. |

## Verification commands

```bash
python -m compileall backend/app
npm --prefix frontend install
npm --prefix frontend run build
```
