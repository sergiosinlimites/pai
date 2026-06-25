#include <Arduino.h>

// Future placeholder only. The first runnable system uses the PC backend as the
// single Modbus RTU master. Do not connect this bridge as a second active master.

constexpr int RS485_RX_PIN = 16;
constexpr int RS485_TX_PIN = 17;
constexpr int RS485_DE_RE_PIN = 4;
constexpr uint32_t PLC_BAUDRATE = 19200;

HardwareSerial PlcSerial(2);

void setTransmitMode(bool enabled) {
  digitalWrite(RS485_DE_RE_PIN, enabled ? HIGH : LOW);
}

void setup() {
  pinMode(RS485_DE_RE_PIN, OUTPUT);
  setTransmitMode(false);

  Serial.begin(115200);
  PlcSerial.begin(PLC_BAUDRATE, SERIAL_8E1, RS485_RX_PIN, RS485_TX_PIN);

  Serial.println("ESP32 RS-485 bridge placeholder ready.");
  Serial.println("Use only after deciding whether ESP32 replaces the PC Modbus master.");
}

void loop() {
  // Placeholder for a future Modbus RTU gateway or master implementation.
  // Keep the PLC as the authority for sequence, interlocks, and actuators.
  delay(1000);
}
