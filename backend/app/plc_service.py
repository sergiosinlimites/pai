import asyncio
import inspect
import logging
import os
import time
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Awaitable, Callable, Deque, List, Optional

from pymodbus.client import AsyncModbusSerialClient

from .config import RuntimeConfig, validate_runtime_config
from .modbus_contract import (
    COMMAND_CODES,
    COMMAND_START_REGISTER,
    CONTRACT_VERSION,
    IO_STATUS_REGISTER_COUNT,
    IO_STATUS_START_REGISTER,
    STATUS_REGISTER_COUNT,
    STATUS_START_REGISTER,
    USED_INPUTS,
    USED_OUTPUTS,
    X_COIL_START_ADDRESS,
    Y_COIL_START_ADDRESS,
    combine_u32,
    decode_status_word,
    fault_label,
    io_status_register_names,
    split_u32,
    state_label,
    status_register_names,
    xinje_octal_offset,
)
from .models import CommandRequest, CommandResponse, ConfigUpdate, PlcSnapshot
from .production_store import ProductionStore

StateCallback = Callable[[PlcSnapshot], Awaitable[None]]
logger = logging.getLogger(__name__)

STAGE_LABELS = {
    0: "Espera / inicio",
    1: "Alimentación de banda",
    2: "Verificación de presencia",
    3: "Posicionamiento inicial",
    4: "Selección de ruta",
    21: "Transferencia al stack",
    29: "Liberación de ventosas",
    33: "Accionamiento de garra",
    34: "Verificación de stack",
    35: "Movimiento final J",
    36: "Retorno final J",
    37: "Movimiento final alterno",
    38: "Retorno final alterno",
}


class PlcService:
    """Own the Modbus session, simulator and production history."""

    def __init__(
        self,
        config: RuntimeConfig,
        on_state: Optional[StateCallback] = None,
        store: Optional[ProductionStore] = None,
    ) -> None:
        self.config = validate_runtime_config(config)
        self._on_state = on_state
        default_database = Path(__file__).resolve().parents[1] / "data" / "hmi.db"
        self.store = store or ProductionStore(os.getenv("PLC_DATABASE_PATH", str(default_database)))
        self._owns_store = store is None
        self._client: Optional[AsyncModbusSerialClient] = None
        self._lock = asyncio.Lock()
        self._tasks: List[asyncio.Task] = []
        self._running = False
        self._connected = False
        self._last_error: Optional[str] = None
        self._last_poll_at: Optional[str] = None
        self._last_heartbeat_at: Optional[str] = None
        self._last_command_at: Optional[str] = None
        self._heartbeat = 0
        self._request_id = 0
        self._requested_stack_size = 20
        self._pending_stack_size = 20
        self._last_sim_increment = time.monotonic()
        self._sim_manual = False
        self._sim_step_progress = 0
        self._command_status = "idle"
        self._command_message = "Sin comandos pendientes"
        self._debug_log: Deque[dict] = deque(maxlen=300)
        self._debug_registers: dict[int, int] = {}
        simulator_total = self.store.last_plc_total() or 0
        total_low, total_high = split_u32(simulator_total)
        self._registers = [
            2,  # D210 machine state: ready
            0,  # D211 current stack count
            20,  # D212 active stack target
            0,  # D213 acknowledged request id
            0,  # D214 fault/rejection code
            0,  # D215 status word
            0,  # D216 active stage
            CONTRACT_VERSION,  # D217 contract version
            total_low,  # D218 retained total low word
            total_high,  # D219 retained total high word
        ]
        self._io_registers = [0, 0, 0]
        self._set_status_bits(remote=True, ready=True, automatic=True, heartbeat_valid=True)

    async def start(self) -> PlcSnapshot:
        if self._running:
            return self.snapshot()

        self._last_error = None
        self._connected = False
        if self.config.simulator:
            self._connected = True
            logger.info("PLC service started in simulator mode")
        else:
            self._client = AsyncModbusSerialClient(
                port=self.config.port,
                baudrate=self.config.baudrate,
                bytesize=self.config.bytesize,
                parity=self.config.parity,
                stopbits=self.config.stopbits,
                timeout=self.config.timeout_ms / 1000,
                retries=self.config.retries,
                trace_packet=self._trace_packet,
                trace_connect=self._trace_connect,
            )
            try:
                self._connected = bool(await self._client.connect())
                if not self._connected:
                    self._last_error = f"No fue posible abrir el puerto Modbus {self.config.port}"
                    await self._close_client()
            except Exception as exc:  # pragma: no cover - serial hardware
                self._last_error = self._friendly_serial_error(exc)
                logger.exception("Failed to connect to PLC on %s", self.config.port)
                await self._close_client()

        if self._connected:
            self._running = True
            self._tasks = [
                asyncio.create_task(self._poll_loop(), name="plc-poll-loop"),
                asyncio.create_task(self._heartbeat_loop(), name="plc-heartbeat-loop"),
            ]
        await self._publish()
        return self.snapshot()

    async def stop(self) -> PlcSnapshot:
        self._running = False
        for task in self._tasks:
            task.cancel()
        if self._tasks:
            await asyncio.gather(*self._tasks, return_exceptions=True)
        self._tasks = []
        await self._close_client()
        self._connected = False
        await self._publish()
        return self.snapshot()

    async def shutdown(self) -> None:
        await self.stop()
        if self._owns_store:
            self.store.close()

    async def configure(self, update: ConfigUpdate, reconnect: bool = False) -> PlcSnapshot:
        updates = update.dict(exclude_none=True)
        if "parity" in updates and isinstance(updates["parity"], str):
            updates["parity"] = updates["parity"].upper()
        next_config = validate_runtime_config(self.config.copy(update=updates))
        was_running = self._running
        if was_running:
            await self.stop()
        self.config = next_config
        if reconnect or was_running:
            return await self.start()
        await self._publish()
        return self.snapshot()

    async def send_command(self, request: CommandRequest) -> CommandResponse:
        if not self._connected:
            raise RuntimeError("El enlace con el PLC no está conectado")

        if request.stack_size is not None:
            max_stack = self.store.settings()["max_stack_size"]
            if request.stack_size > max_stack:
                raise ValueError(
                    f"El objetivo supera el máximo operativo configurado ({max_stack})"
                )
            self._requested_stack_size = request.stack_size
            self._pending_stack_size = request.stack_size

        command_code = COMMAND_CODES[request.command]
        stack_size = self._requested_stack_size
        self._request_id = 1 if self._request_id >= 32767 else self._request_id + 1
        request_id = self._request_id
        values = [stack_size, command_code, request_id, self._heartbeat]
        self._command_status = "pending"
        self._command_message = "Esperando confirmación del PLC"

        await self._execute_transaction(
            "command write",
            lambda: self._write_command_registers(values),
        )
        self._last_command_at = self._now()
        await self._publish()

        deadline = time.monotonic() + 2.5
        while self._registers[3] != request_id and time.monotonic() < deadline:
            await asyncio.sleep(0.05)

        fault_code = self._registers[4]
        if self._registers[3] != request_id:
            status = "timeout"
            accepted = False
            message = "El PLC no confirmó el comando dentro del tiempo esperado"
        elif fault_code != 0:
            status = "rejected"
            accepted = False
            message = f"Comando rechazado: {fault_label(fault_code)}"
        else:
            status = "confirmed"
            accepted = True
            message = "Comando confirmado por el PLC"

        self._command_status = status
        self._command_message = message
        self._ingest_production()
        await self._publish()
        return CommandResponse(
            accepted=accepted,
            status=status,
            message=message,
            command=request.command,
            command_code=command_code,
            request_id=request_id,
            stack_size=stack_size,
            heartbeat=self._heartbeat,
            fault_code=fault_code,
            fault_label=fault_label(fault_code),
        )

    async def set_simulator_mode(self, manual: bool) -> PlcSnapshot:
        if not self.config.simulator:
            raise RuntimeError("El modo sólo puede cambiarse desde el simulador")
        self._sim_manual = manual
        self._registers[0] = 8 if manual else 2
        self._registers[4] = 0
        self._set_status_bits(
            remote=True,
            ready=not manual,
            automatic=not manual,
            manual=manual,
            heartbeat_valid=True,
        )
        self._ingest_production()
        await self._publish()
        return self.snapshot()

    async def poll_once(self) -> PlcSnapshot:
        if not self._connected:
            return self.snapshot()
        self._registers = await self._execute_transaction(
            "status poll", self._read_status_registers
        )
        self._io_registers = await self._execute_transaction(
            "diagnostic I/O poll", self._read_io_status_registers
        )
        self._last_poll_at = self._now()
        self._ingest_production()
        await self._publish()
        return self.snapshot()

    def _ingest_production(self) -> None:
        timestamp = self._now()
        self.store.ingest_status(
            plc_total=combine_u32(self._registers[8], self._registers[9]),
            stack_count=self._registers[1],
            active_target=max(self._registers[2], 1),
            state_code=self._registers[0],
            state_label=state_label(self._registers[0]),
            fault_code=self._registers[4],
            fault_label=fault_label(self._registers[4]),
            observed_at=timestamp,
        )

    async def _close_client(self) -> None:
        if self._client is None:
            return
        close_result = self._client.close()
        if inspect.isawaitable(close_result):
            await close_result
        self._client = None

    def debug_log(self) -> list[dict]:
        return list(self._debug_log)

    async def debug_read_registers(self, address: int, count: int) -> dict:
        if not self._connected:
            raise RuntimeError("El enlace con el PLC no está conectado")
        if self.config.simulator:
            registers = self._read_simulated_registers(address, count)
        else:
            registers = await self._execute_transaction(
                f"debug read D{address}",
                lambda: self._read_holding_registers("debug_read", address, count),
            )
        return {
            "address": address,
            "count": count,
            "registers": registers,
            "labels": {f"D{address + index}": value for index, value in enumerate(registers)},
        }

    async def debug_read_coils(self, address: int, count: int, prefix: str = "M") -> dict:
        if not self._connected:
            raise RuntimeError("El enlace con el PLC no está conectado")
        if self.config.simulator:
            values = [False for _ in range(count)]
        else:
            values = await self._execute_transaction(
                f"debug read coils {address}",
                lambda: self._read_coils("debug_read_coils", address, count),
            )
        return {
            "address": address,
            "count": count,
            "values": values,
            "labels": {f"{prefix}{index}": value for index, value in enumerate(values)},
        }

    async def read_physical_io(self) -> dict:
        """Read the physical X/Y points used by the current sequential program."""

        if not self._connected:
            raise RuntimeError("El enlace con el PLC no está conectado")

        max_input_offset = max(xinje_octal_offset(name) for name, _ in USED_INPUTS)
        max_output_offset = max(xinje_octal_offset(name) for name, _ in USED_OUTPUTS)
        if self.config.simulator:
            input_values = self._simulated_input_coils(max_input_offset + 1)
            output_values = self._simulated_output_coils(max_output_offset + 1)
        else:
            input_values = await self._execute_transaction(
                "physical input poll",
                lambda: self._read_coils(
                    "physical_inputs", X_COIL_START_ADDRESS, max_input_offset + 1
                ),
            )
            output_values = await self._execute_transaction(
                "physical output poll",
                lambda: self._read_coils(
                    "physical_outputs", Y_COIL_START_ADDRESS, max_output_offset + 1
                ),
            )

        def describe(points: list[tuple[str, str]], values: list[bool], base: int) -> list[dict]:
            return [
                {
                    "name": name,
                    "label": label,
                    "active": bool(values[xinje_octal_offset(name)]),
                    "modbus_address": base + xinje_octal_offset(name),
                }
                for name, label in points
            ]

        observed_at = self._now()
        return {
            "connected": self._connected,
            "simulator": self.config.simulator,
            "observed_at": observed_at,
            "inputs": describe(USED_INPUTS, input_values, X_COIL_START_ADDRESS),
            "outputs": describe(USED_OUTPUTS, output_values, Y_COIL_START_ADDRESS),
        }

    async def heartbeat_once(self) -> PlcSnapshot:
        if not self._connected:
            return self.snapshot()
        self._heartbeat = (self._heartbeat + 1) & 0xFFFF
        await self._execute_transaction(
            "heartbeat write", lambda: self._write_heartbeat(self._heartbeat)
        )
        self._last_heartbeat_at = self._now()
        await self._publish()
        return self.snapshot()

    def snapshot(self) -> PlcSnapshot:
        registers = list(self._registers)
        io_registers = list(self._io_registers)
        raw = {name: registers[index] for index, name in enumerate(status_register_names())}
        raw_io = {
            name: io_registers[index] for index, name in enumerate(io_status_register_names())
        }
        recent = self.store.recent_events(1)
        stage = registers[6]
        return PlcSnapshot(
            config=self.config,
            connected=self._connected,
            running=self._running,
            simulator=self.config.simulator,
            last_error=self._last_error,
            last_poll_at=self._last_poll_at,
            last_heartbeat_at=self._last_heartbeat_at,
            last_command_at=self._last_command_at,
            heartbeat=self._heartbeat,
            next_request_id=1 if self._request_id >= 32767 else self._request_id + 1,
            requested_stack_size=self._requested_stack_size,
            pending_stack_size=self._pending_stack_size,
            raw_registers=raw,
            raw_io_registers=raw_io,
            machine_state=registers[0],
            machine_state_label=state_label(registers[0]),
            processed_count=registers[1],
            accepted_stack_size=registers[2],
            accepted_request_id=registers[3],
            fault_code=registers[4],
            fault_label=fault_label(registers[4]),
            status_word=registers[5],
            flags=decode_status_word(registers[5]),
            stage=stage,
            stage_label=STAGE_LABELS.get(stage, f"Etapa de proceso {stage}"),
            contract_version=registers[7],
            plc_total_count=combine_u32(registers[8], registers[9]),
            historical_total=self.store.logical_total(),
            last_box_at=recent[0]["completed_at"] if recent else None,
            command_status=self._command_status,
            command_message=self._command_message,
            io_counter_value=io_registers[0],
            x1_active=bool(io_registers[1]),
            y1_active=bool(io_registers[2]),
        )

    async def _poll_loop(self) -> None:
        while self._running:
            try:
                await self.poll_once()
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                self._last_error = str(exc)
                logger.warning("Status poll failed: %s", exc)
                await self._publish()
            await asyncio.sleep(self.config.poll_interval_ms / 1000)

    async def _heartbeat_loop(self) -> None:
        while self._running:
            await asyncio.sleep(self.config.heartbeat_interval_ms / 1000)
            try:
                await self.heartbeat_once()
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                self._last_error = str(exc)
                logger.warning("Heartbeat write failed: %s", exc)
                await self._publish()

    async def _execute_transaction(
        self, label: str, operation: Callable[[], Awaitable[List[int]]]
    ) -> List[int]:
        async with self._lock:
            last_error: Optional[Exception] = None
            for attempt in range(self.config.retries + 1):
                try:
                    result = await operation()
                    self._last_error = None
                    return result
                except Exception as exc:  # pragma: no cover - serial hardware
                    last_error = exc
                    if attempt < self.config.retries:
                        await asyncio.sleep(0.05)
            self._last_error = (
                f"{label} failed after {self.config.retries + 1} attempts: {last_error}"
            )
            raise RuntimeError(self._last_error)

    async def _read_status_registers(self) -> List[int]:
        if self.config.simulator:
            self._advance_simulation()
            return list(self._registers)
        if self._client is None:
            raise RuntimeError("Modbus client is not initialized")
        return await self._read_holding_registers(
            "status", STATUS_START_REGISTER, STATUS_REGISTER_COUNT
        )

    async def _read_io_status_registers(self) -> List[int]:
        if self.config.simulator:
            return list(self._io_registers)
        if self._client is None:
            raise RuntimeError("Modbus client is not initialized")
        return await self._read_holding_registers(
            "diagnostic_io", IO_STATUS_START_REGISTER, IO_STATUS_REGISTER_COUNT
        )

    async def _write_command_registers(self, values: List[int]) -> List[int]:
        if self.config.simulator:
            self._apply_simulated_command(values)
            return values
        if self._client is None:
            raise RuntimeError("Modbus client is not initialized")
        await self._write_holding_registers("command", COMMAND_START_REGISTER, values)
        return values

    async def _write_heartbeat(self, heartbeat: int) -> List[int]:
        if self.config.simulator:
            self._registers[5] |= 1 << 7
            return [heartbeat]
        if self._client is None:
            raise RuntimeError("Modbus client is not initialized")
        result = await self._client.write_register(
            address=COMMAND_START_REGISTER + 3,
            value=heartbeat,
            **self._device_kwargs(self._client.write_register),
        )
        if result.isError():
            raise RuntimeError(str(result))
        self._debug(
            "modbus_write_ok",
            label="heartbeat",
            address=COMMAND_START_REGISTER + 3,
            values=[heartbeat],
        )
        return [heartbeat]

    async def _read_holding_registers(
        self, label: str, address: int, count: int
    ) -> List[int]:
        result = await self._client.read_holding_registers(
            address=address,
            count=count,
            **self._device_kwargs(self._client.read_holding_registers),
        )
        if result.isError():
            raise RuntimeError(str(result))
        registers = list(result.registers)
        self._debug(
            "modbus_read_ok",
            label=label,
            address=address,
            count=count,
            registers=registers,
        )
        return registers

    async def _write_holding_registers(
        self, label: str, address: int, values: list[int]
    ) -> None:
        result = await self._client.write_registers(
            address=address,
            values=values,
            **self._device_kwargs(self._client.write_registers),
        )
        if result.isError():
            self._debug(
                "modbus_write_error",
                label=label,
                address=address,
                values=values,
                error=str(result),
            )
            raise RuntimeError(str(result))
        self._debug("modbus_write_ok", label=label, address=address, values=values)

    async def _read_coils(
        self, label: str, address: int, count: int
    ) -> List[bool]:
        result = await self._client.read_coils(
            address=address,
            count=count,
            **self._device_kwargs(self._client.read_coils),
        )
        if result.isError():
            raise RuntimeError(str(result))
        values = list(result.bits[:count])
        self._debug(
            "modbus_read_coils_ok",
            label=label,
            address=address,
            count=count,
            values=values,
        )
        return values

    def _apply_simulated_command(self, values: List[int]) -> None:
        stack_size, command_code, request_id, heartbeat = values
        self._heartbeat = heartbeat
        if request_id == self._registers[3]:
            return
        self._registers[3] = request_id
        self._registers[4] = 0
        self._pending_stack_size = stack_size

        if command_code == COMMAND_CODES["set_target"]:
            if self._registers[1] == 0:
                self._registers[2] = stack_size
            return

        if command_code == COMMAND_CODES["start"]:
            if self._sim_manual:
                self._registers[4] = 21
                return
            if self._registers[1] == 0:
                self._registers[2] = stack_size
            self._registers[0] = 3
            self._registers[6] = 3
            self._last_sim_increment = time.monotonic()
            self._set_status_bits(
                remote=True, active=True, automatic=True, heartbeat_valid=True
            )
            return

        if command_code == COMMAND_CODES["pause"]:
            if self._registers[0] == 3:
                self._registers[0] = 4
                self._set_status_bits(
                    remote=True, paused=True, automatic=True, heartbeat_valid=True
                )
            else:
                self._registers[4] = 21
            return

        if command_code == COMMAND_CODES["resume"]:
            if self._registers[0] == 4 and not self._sim_manual:
                self._registers[0] = 3
                self._set_status_bits(
                    remote=True, active=True, automatic=True, heartbeat_valid=True
                )
            else:
                self._registers[4] = 21
            return

        if command_code == COMMAND_CODES["safe_stop"]:
            self._registers[0] = 1
            self._registers[6] = 0
            self._set_status_bits(
                remote=True,
                automatic=not self._sim_manual,
                manual=self._sim_manual,
                heartbeat_valid=True,
            )
            return

        if command_code == COMMAND_CODES["reset_counter"]:
            if self._registers[0] not in {3, 4}:
                self._registers[1] = 0
                self._registers[6] = 0
            else:
                self._registers[4] = 22
            return

        if command_code == COMMAND_CODES["step"]:
            if not self._sim_manual:
                self._registers[4] = 24
                return
            self._registers[0] = 8
            self._registers[6] = (self._registers[6] + 1) % 39
            self._sim_step_progress += 1
            if self._sim_step_progress >= 4:
                self._sim_step_progress = 0
                self._complete_sim_box()
            self._set_status_bits(
                remote=True, manual=True, heartbeat_valid=True
            )
            return

        self._registers[4] = 99

    def _advance_simulation(self) -> None:
        if self._registers[0] != 3 or self._sim_manual:
            return
        now = time.monotonic()
        if now - self._last_sim_increment < 0.8:
            return
        self._last_sim_increment = now
        self._registers[6] = 10 + (self._registers[1] % 4)
        self._complete_sim_box()

    def _complete_sim_box(self) -> None:
        total = combine_u32(self._registers[8], self._registers[9]) + 1
        self._registers[8], self._registers[9] = split_u32(total)
        self._registers[1] += 1
        self._io_registers[0] = self._registers[1]
        if self._registers[1] >= max(self._registers[2], 1):
            self._registers[0] = 5
            self._registers[1] = 0
            self._registers[2] = self._pending_stack_size
            if self._sim_manual:
                self._registers[0] = 8
            else:
                self._registers[0] = 3

    def _read_simulated_registers(self, address: int, count: int) -> List[int]:
        values = []
        for current in range(address, address + count):
            if current in self._debug_registers:
                values.append(self._debug_registers[current])
            elif STATUS_START_REGISTER <= current < STATUS_START_REGISTER + STATUS_REGISTER_COUNT:
                values.append(self._registers[current - STATUS_START_REGISTER])
            elif (
                IO_STATUS_START_REGISTER
                <= current
                < IO_STATUS_START_REGISTER + IO_STATUS_REGISTER_COUNT
            ):
                values.append(self._io_registers[current - IO_STATUS_START_REGISTER])
            else:
                values.append(0)
        return values

    def _simulated_input_coils(self, count: int) -> List[bool]:
        values = [False for _ in range(count)]
        values[xinje_octal_offset("X2")] = self._sim_manual
        # Presence is shown while the automatic simulator is processing a stack.
        values[xinje_octal_offset("X32")] = self._registers[0] == 3
        return values

    def _simulated_output_coils(self, count: int) -> List[bool]:
        values = [False for _ in range(count)]
        stage = self._registers[6]
        active_by_output = {
            "Y0": {4},
            "Y1": {3, 9, 15, 22, 28},
            "Y3": {33},
            "Y4": {35, 37},
            "Y5": {8, 14, 20, 27},
            "Y6": {32},
            "Y10": {5, 11, 17, 24},
            "Y14": {11, 17, 24},
            "Y15": {17, 24},
            "Y20": {1},
        }
        for name, stages in active_by_output.items():
            offset = xinje_octal_offset(name)
            if offset < count:
                values[offset] = stage in stages
        return values

    def _set_status_bits(
        self,
        *,
        remote: bool = False,
        ready: bool = False,
        active: bool = False,
        paused: bool = False,
        automatic: bool = False,
        fault: bool = False,
        manual: bool = False,
        heartbeat_valid: bool = False,
    ) -> None:
        word = 0
        if remote:
            word |= 1 << 0
        if ready:
            word |= 1 << 1
        if active:
            word |= 1 << 2
        if paused:
            word |= 1 << 3
        if automatic:
            word |= 1 << 4
        if fault:
            word |= 1 << 5
        if manual:
            word |= 1 << 6
        if heartbeat_valid:
            word |= 1 << 7
        self._registers[5] = word

    async def _publish(self) -> None:
        if self._on_state is not None:
            await self._on_state(self.snapshot())

    def _debug(self, event: str, **data) -> None:
        entry = {"time": self._now(), "event": event, **data}
        self._debug_log.append(entry)

    def _trace_packet(self, sending: bool, data: bytes) -> bytes:
        self._debug("rtu_tx" if sending else "rtu_rx", hex=data.hex(" "))
        return data

    def _trace_connect(self, connected: bool) -> None:
        self._debug("serial_connect", port=self.config.port, connected=connected)

    def _friendly_serial_error(self, exc: Exception) -> str:
        text = str(exc)
        normalized = text.lower()
        if any(token in normalized for token in ("access is denied", "permissionerror", "acceso denegado")):
            return (
                f"El puerto {self.config.port} está ocupado o no permite acceso. "
                "Cierre XDPPro u otra aplicación que esté usando el adaptador."
            )
        if any(token in normalized for token in ("filenotfounderror", "no such file", "no se encuentra")):
            return (
                f"El puerto {self.config.port} ya no está disponible. "
                "Actualice la lista y revise el cable USB-RS485."
            )
        return f"No fue posible abrir {self.config.port}: {text}"

    @staticmethod
    def _now() -> str:
        return datetime.now(timezone.utc).isoformat()

    def _device_kwargs(self, method: Callable) -> dict:
        parameters = inspect.signature(method).parameters
        if "device_id" in parameters:
            return {"device_id": self.config.slave_id}
        return {"slave": self.config.slave_id}
