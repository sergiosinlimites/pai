# Future ESP32 RS-485 Bridge Placeholder

The first runnable implementation is PC-first: the computer is the only Modbus RTU master on the RS-485 bus. This folder is a placeholder for a later ESP32 route and must not be wired as a second active master while the PC is connected.

## Intended future shape

| Layer | Candidate |
|---|---|
| MCU | ESP32 with UART2 |
| RS-485 transceiver | 3.3 V-compatible isolated transceiver preferred |
| Firmware style | Arduino initially, ESP-IDF if the bridge becomes production-critical |
| Protocol role | One Modbus RTU master only, or a gateway that replaces the PC master |
| Network | Wi-Fi or Ethernet depending on plant reliability requirements |

## Safety and architecture notes

- Do not connect PC and ESP32 as simultaneous Modbus masters.
- Prefer an isolated RS-485 transceiver for permanent installation.
- Keep emergency stop independent of ESP32, Wi-Fi, HTTP, and Modbus.
- The PLC still owns sequence authority, interlocks, actuators, and safe-state decisions.

## Placeholder files

- `platformio.ini` gives a minimal Arduino-oriented build target.
- `src/main.cpp` contains a non-production UART/RS-485 skeleton with direction-control notes.

## Next decision before implementation

Choose whether the ESP32 replaces the PC backend or acts only as a serial-to-network gateway. That decision changes ownership of command validation, WebSocket broadcasting, logging, and retry behavior.
