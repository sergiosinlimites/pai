# Test Plan for the PC-PLC Xinje XD3 Local HMI

Use this plan to prove the scaffold before connecting it to live motion. Start in simulator mode, then bench Modbus, then machine trials.

## Quick path

1. Build and run the backend in simulator mode.
2. Build and run the Vite HMI.
3. Exercise each command and verify the state broadcast updates.
4. Move to a bench PLC program with outputs disabled.
5. Only then link accepted commands to the real sequence.

## Local simulator checks

| Check | Command | Expected result |
|---|---|---|
| Backend syntax | `python -m compileall backend/app` | All Python files compile. |
| Frontend build | `npm --prefix frontend run build` | Vite creates `frontend/dist`. |
| Health | `GET /api/health` | `connected=true`, `simulator=true` after startup. |
| Start | `POST /api/command {"command":"start","stack_size":5}` | State becomes `running`; accepted stack is `5`. |
| Pause | `pause` command | State becomes `paused`. |
| Resume | `resume` command | State becomes `running`. |
| Safe stop | `safe_stop` command | State becomes `stopped`. |
| Reset counter | `reset_counter` while stopped | Processed count becomes `0`. |
| Stack complete | Let simulator run to target | State becomes `stack_completed`. |
| Confirm removal | `confirm_stack_removed` | State returns to `ready`; count clears. |

## Bench Modbus checks with PLC outputs disabled

| Check | Expected result |
|---|---|
| Read loop | `D210-D217` can be read for at least 100 consecutive polls without errors. |
| Command block | `D200-D203` update together from one Modbus function 16 write. |
| Duplicate request | Repeating the same `D202` does not execute twice. |
| Heartbeat | `D203` changes every second while backend is connected. |
| Heartbeat loss | Stopping the backend triggers the PLC heartbeat watchdog after the configured window. |
| Invalid stack | PLC rejects values outside the real machine range and exposes a fault code. |
| Manual mode | PLC blocks incompatible remote commands while in manual/maintenance mode. |

## Machine trial checks

Run these only after bench checks pass and the safety circuit has been verified independently.

| Scenario | Expected result |
|---|---|
| Start from ready | Machine starts only when all PLC interlocks are valid. |
| Pause during motion | PLC reaches a controlled safe pause point. |
| Resume from pause | Machine resumes only from the expected paused state. |
| Safe stop | PLC stops at a safe controlled condition. |
| Stack complete | Count reaches accepted target and the machine enters completed/waiting state. |
| Confirm removed | Operator confirmation clears the waiting state without unexpected motion. |
| USB disconnect | PLC detects supervision loss and applies the configured safe response. |
| PC app closed | No unexpected start occurs. |
| Emergency stop | Physical emergency stop works independently of PC, USB, Modbus, and network. |

## Evidence to capture

- Serial port settings screenshot from XDPPro.
- Register watch table showing `D200-D217` during each command.
- Backend logs for connect, command writes, poll errors, and reconnect attempts.
- Manual count versus `D211` count for a representative run.
- Any PLC fault code definitions added to `D214`.
