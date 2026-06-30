# Modbus Contract for PC-PLC Xinje XD3 HMI

This contract reserves `D200-D217` for the first local HMI integration. The PC is the only Modbus master. The PLC remains responsible for sequence authority, interlocks, actuators, and safety decisions.

## Quick path

1. Confirm in XDPPro that `D200-D217` are free.
2. Configure the PLC RS-485 port as Modbus RTU slave `1`, `19200 8E1`.
3. Let the PC write commands to `D200-D203` as one block.
4. Let the PC poll `D210-D217` every `250-500 ms`.
5. Treat the PC heartbeat as supervision only, not as a safety function.

## PC to PLC registers

| PLC register | Modbus address | Name | Source | Rule |
|---|---:|---|---|---|
| `D200` | `200` | Requested stack size | PC | Operator target. PLC validates range. |
| `D201` | `201` | Command code | PC | Decoded only when `D202` changes. |
| `D202` | `202` | Request id | PC | Monotonic command id. Prevents duplicate execution. |
| `D203` | `203` | Heartbeat | PC | Changes every `1 s`. |
| `D204` | `204` | Y1 requested state | PC | `0` requests off, `1` requests on. PLC still owns interlocks. |
| `D205` | `205` | Y1 request id | PC | Monotonic id. PLC applies `D204` only when this changes. |

Command writes must use function `16` / `0x10` for `D200-D203` in one transaction.

## Command codes

| Code | Command | PLC expectation |
|---:|---|---|
| `0` | None | No action. |
| `1` | Start | Validate remote enabled, ready state, no fault, valid target. |
| `2` | Pause | Controlled pause at a safe sequence point. |
| `3` | Resume | Continue from controlled pause when valid. |
| `4` | Safe stop | Stop at a safe condition, not emergency stop. |
| `5` | Reset counter | Allowed only when stopped or otherwise explicitly safe. |
| `6` | Confirm stack removed | Clear completed-stack wait state after operator removal. |

## PLC to PC registers

| PLC register | Modbus address | Name | Consumer |
|---|---:|---|---|
| `D210` | `210` | Machine state | HMI state label. |
| `D211` | `211` | Processed count | HMI counter. |
| `D212` | `212` | Accepted stack size | Confirms PLC validation. |
| `D213` | `213` | Accepted request id | Confirms command processing. |
| `D214` | `214` | Fault code | HMI fault indicator. |
| `D215` | `215` | Status word | HMI decoded flags. |
| `D216` | `216` | Current stage | GRAFCET or sequence stage. |
| `D217` | `217` | Contract version | Compatibility check. |
| `D220` | `220` | Example internal counter | HMI simple I/O panel. |
| `D221` | `221` | Example input `X1` state | HMI simple I/O panel, `0` off and `1` on. |
| `D222` | `222` | Example output `Y1` feedback | HMI simple I/O panel, actual PLC feedback. |

## Machine states

| Value | State |
|---:|---|
| `0` | Initializing |
| `1` | Stopped |
| `2` | Ready |
| `3` | Running |
| `4` | Paused |
| `5` | Stack completed |
| `6` | Waiting stack removal |
| `7` | Fault |
| `8` | Manual or maintenance |

## Status word `D215`

| Bit | Flag |
|---:|---|
| `0` | Remote enabled |
| `1` | Machine ready |
| `2` | Cycle active |
| `3` | Pause active |
| `4` | Stack completed |
| `5` | Fault active |
| `6` | Manual mode |
| `7` | Heartbeat valid |
| `8-15` | Reserved |

## Timing and transaction rules

| Topic | Rule |
|---|---|
| Concurrent transactions | Never issue more than one Modbus transaction at a time on the PC. The backend uses an `asyncio.Lock`. |
| Polling | Read `D210-D217` every `250-500 ms`. Default is `300 ms`. |
| Heartbeat | Write `D203` every `1 s`. |
| Timeout | `500 ms`. |
| Retries | `2` retries after the first attempt. |
| Duplicate commands | PLC executes only when `D202` differs from the last processed request id. |

## Safety note

The PC can request a controlled stop but must not implement emergency stop behavior. Emergency stop must remain hardwired and independent.
