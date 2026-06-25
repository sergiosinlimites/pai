# PLC/XDPPro Rung Guide for the Local HMI Contract

Implement this as a small communication layer around the existing PLC sequence. The PC writes requests; the PLC decides whether to accept them.

## Quick path

1. Reserve and document `D200-D217`.
2. Configure Port 2 / RS-485 as Modbus RTU slave `1`, `19200 8E1`.
3. Add request-edge detection using `D202`.
4. Decode command `D201` only after a new request id appears.
5. Mirror machine state, counters, faults, status word, and sequence stage into `D210-D217`.
6. Add a heartbeat watchdog for `D203`.
7. Bench test with outputs disabled before linking commands to motion.

## Suggested internal PLC memory

| Symbol | Purpose |
|---|---|
| `LastRequestId` | Previous accepted value from `D202`. |
| `NewRequestPulse` | One-scan pulse when `D202 <> LastRequestId`. |
| `HeartbeatLast` | Previous heartbeat value from `D203`. |
| `HeartbeatTimer` | Timer that detects heartbeat not changing for about `3 s`. |
| `RemoteCommandAllowed` | Existing interlocks plus remote-enabled condition. |
| `AcceptedStackSize` | Validated copy of `D200`. |

Use the actual XDPPro symbol/register style used by the project. The names above are conceptual.

## Rung guide

### 1. Communication map guard

- Confirm `D200-D217` are not used by the existing ladder.
- Add comments in XDPPro for every register.
- Do not map a PC command directly to a physical output coil.

### 2. Stack size validation

On a new command request:

1. Read `D200`.
2. Validate against the machine's real range.
3. If valid, copy to `D212`.
4. If invalid, set a fault code in `D214` and reject start.

The initial software allows `1-9999`, but the final PLC range should be the real mechanical limit.

### 3. Request id edge detection

```text
IF D202 <> LastRequestId THEN
    NewRequestPulse = ON for one scan
    LastRequestId = D202
    D213 = D202
END_IF
```

This prevents a repeated Modbus write or browser retry from executing the same command twice.

### 4. Command decode

Decode `D201` only on `NewRequestPulse`:

| Command | PLC action |
|---:|---|
| `1` | Start only if remote is enabled, machine is ready, no fault exists, target is valid, and actuators are in a valid initial condition. |
| `2` | Pause at the next safe sequence boundary. |
| `3` | Resume only from a valid paused state. |
| `4` | Stop at a safe controlled condition. |
| `5` | Reset count only in stopped/ready states. |
| `6` | Clear completed-stack wait state after the operator confirms removal. |

### 5. State exposure

Update these every scan or at a stable sequence boundary:

| Register | Update rule |
|---|---|
| `D210` | Main machine state. |
| `D211` | Count of completed cycles or verified products. Be explicit which one it means. |
| `D212` | Current accepted stack size. |
| `D214` | Current fault code, `0` when no fault. |
| `D215` | Bit flags for remote enabled, ready, active, paused, complete, fault, manual, heartbeat valid. |
| `D216` | Current GRAFCET/sequence stage. |
| `D217` | Contract version, currently `1`. |

### 6. Heartbeat watchdog

- Compare `D203` with `HeartbeatLast`.
- Reset the watchdog timer whenever it changes.
- If it does not change for the chosen window, initially about `3 s`, clear `D215.7` and request the safest controlled response for the current state.
- Do not treat heartbeat loss as an emergency stop substitute.

### 7. Bench-test mode

Before linking remote commands to movement:

- Disable or isolate physical outputs.
- Verify each command updates only internal state.
- Confirm duplicate `D202` values do not run twice.
- Confirm the heartbeat fault appears when the PC process stops.
- Confirm manual mode blocks incompatible remote commands.

## Checklist

- [ ] `D200-D217` are reserved and commented.
- [ ] PLC serial settings match `19200 8E1`, slave `1`.
- [ ] Request id edge detection is implemented.
- [ ] Command `6` cannot restart motion; it only confirms stack removal.
- [ ] Emergency stop remains hardwired and independent.
