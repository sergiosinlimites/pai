import asyncio
import inspect
import logging
import time
from datetime import datetime, timezone
from typing import Awaitable, Callable, List, Optional

from pymodbus.client import AsyncModbusSerialClient

from .config import RuntimeConfig, validate_runtime_config
from .modbus_contract import (
    COMMAND_CODES,
    COMMAND_START_REGISTER,
    CONTRACT_VERSION,
    STATUS_REGISTER_COUNT,
    STATUS_START_REGISTER,
    decode_status_word,
    fault_label,
    state_label,
    status_register_names,
)
from .models import CommandRequest, CommandResponse, ConfigUpdate, PlcSnapshot

StateCallback = Callable[[PlcSnapshot], Awaitable[None]]
logger = logging.getLogger(__name__)


class PlcService:
    """Owns the single Modbus master session and simulator state."""

    def __init__(self, config: RuntimeConfig, on_state: Optional[StateCallback] = None) -> None:
        self.config = validate_runtime_config(config)
        self._on_state = on_state
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
        self._requested_stack_size = 1
        self._last_sim_increment = time.monotonic()
        self._registers = [
            2,  # D210 machine state: ready
            0,  # D211 processed count
            0,  # D212 accepted stack size
            0,  # D213 accepted request id
            0,  # D214 fault code
            0,  # D215 status word
            0,  # D216 stage
            CONTRACT_VERSION,  # D217 contract version
        ]
        self._set_status_bits(remote=True, ready=True, heartbeat_valid=True)

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
            )
            try:
                self._connected = bool(await self._client.connect())
                if not self._connected:
                    self._last_error = f"Could not open serial Modbus port {self.config.port}"
                    logger.error(self._last_error)
                else:
                    logger.info("Connected to PLC on %s", self.config.port)
            except Exception as exc:  # pragma: no cover - depends on local serial hardware
                self._last_error = str(exc)
                self._connected = False
                logger.exception("Failed to connect to PLC on %s", self.config.port)

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

        if self._client is not None:
            close_result = self._client.close()
            if asyncio.iscoroutine(close_result):
                await close_result
            self._client = None

        self._connected = False
        logger.info("PLC service stopped")
        await self._publish()
        return self.snapshot()

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
            raise RuntimeError("PLC link is not connected")

        command_code = COMMAND_CODES[request.command]
        if request.stack_size is not None:
            self._requested_stack_size = request.stack_size
        stack_size = self._requested_stack_size
        self._request_id = 1 if self._request_id >= 32767 else self._request_id + 1
        values = [stack_size, command_code, self._request_id, self._heartbeat]

        await self._execute_transaction(
            "command write",
            lambda: self._write_command_registers(values),
        )
        self._last_command_at = self._now()
        logger.info(
            "Command sent: command=%s code=%s request_id=%s stack_size=%s heartbeat=%s",
            request.command,
            command_code,
            self._request_id,
            stack_size,
            self._heartbeat,
        )
        await self._publish()
        return CommandResponse(
            accepted=True,
            command=request.command,
            command_code=command_code,
            request_id=self._request_id,
            stack_size=stack_size,
            heartbeat=self._heartbeat,
        )

    async def poll_once(self) -> PlcSnapshot:
        if not self._connected:
            return self.snapshot()
        self._registers = await self._execute_transaction(
            "status poll",
            self._read_status_registers,
        )
        self._last_poll_at = self._now()
        await self._publish()
        return self.snapshot()

    async def heartbeat_once(self) -> PlcSnapshot:
        if not self._connected:
            return self.snapshot()
        self._heartbeat = (self._heartbeat + 1) & 0xFFFF
        await self._execute_transaction(
            "heartbeat write",
            lambda: self._write_heartbeat(self._heartbeat),
        )
        self._last_heartbeat_at = self._now()
        await self._publish()
        return self.snapshot()

    def snapshot(self) -> PlcSnapshot:
        registers = list(self._registers)
        raw = {name: registers[index] for index, name in enumerate(status_register_names())}
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
            raw_registers=raw,
            machine_state=registers[0],
            machine_state_label=state_label(registers[0]),
            processed_count=registers[1],
            accepted_stack_size=registers[2],
            accepted_request_id=registers[3],
            fault_code=registers[4],
            fault_label=fault_label(registers[4]),
            status_word=registers[5],
            flags=decode_status_word(registers[5]),
            stage=registers[6],
            contract_version=registers[7],
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

    async def _execute_transaction(self, label: str, operation: Callable[[], Awaitable[List[int]]]) -> List[int]:
        async with self._lock:
            last_error: Optional[Exception] = None
            for attempt in range(self.config.retries + 1):
                try:
                    result = await operation()
                    self._last_error = None
                    return result
                except Exception as exc:  # pragma: no cover - serial failures depend on hardware
                    last_error = exc
                    logger.warning("%s attempt %s failed: %s", label, attempt + 1, exc)
                    if attempt < self.config.retries:
                        await asyncio.sleep(0.05)
            self._last_error = f"{label} failed after {self.config.retries + 1} attempts: {last_error}"
            logger.error(self._last_error)
            raise RuntimeError(self._last_error)

    async def _read_status_registers(self) -> List[int]:
        if self.config.simulator:
            self._advance_simulation()
            return list(self._registers)

        if self._client is None:
            raise RuntimeError("Modbus client is not initialized")
        result = await self._client.read_holding_registers(
            address=STATUS_START_REGISTER,
            count=STATUS_REGISTER_COUNT,
            **self._device_kwargs(self._client.read_holding_registers),
        )
        if result.isError():
            raise RuntimeError(str(result))
        return list(result.registers)

    async def _write_command_registers(self, values: List[int]) -> List[int]:
        if self.config.simulator:
            self._apply_simulated_command(values)
            return values

        if self._client is None:
            raise RuntimeError("Modbus client is not initialized")
        result = await self._client.write_registers(
            address=COMMAND_START_REGISTER,
            values=values,
            **self._device_kwargs(self._client.write_registers),
        )
        if result.isError():
            raise RuntimeError(str(result))
        return values

    async def _write_heartbeat(self, heartbeat: int) -> List[int]:
        if self.config.simulator:
            self._registers[5] = self._registers[5] | (1 << 7)
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
        return [heartbeat]

    def _apply_simulated_command(self, values: List[int]) -> None:
        stack_size, command_code, request_id, heartbeat = values
        self._heartbeat = heartbeat
        if request_id == self._registers[3]:
            return

        self._registers[3] = request_id
        self._registers[4] = 0

        if command_code == COMMAND_CODES["start"]:
            if stack_size < 1:
                self._fault(10)
                return
            self._requested_stack_size = stack_size
            self._registers[1] = 0
            self._registers[2] = stack_size
            self._registers[0] = 3
            self._registers[6] = 10
            self._last_sim_increment = time.monotonic()
            self._set_status_bits(remote=True, active=True, heartbeat_valid=True)
            return

        if command_code == COMMAND_CODES["pause"]:
            if self._registers[0] == 3:
                self._registers[0] = 4
                self._registers[6] = 40
                self._set_status_bits(remote=True, paused=True, heartbeat_valid=True)
            else:
                self._fault(21)
            return

        if command_code == COMMAND_CODES["resume"]:
            if self._registers[0] == 4:
                self._registers[0] = 3
                self._registers[6] = 10
                self._set_status_bits(remote=True, active=True, heartbeat_valid=True)
            else:
                self._fault(21)
            return

        if command_code == COMMAND_CODES["safe_stop"]:
            self._registers[0] = 1
            self._registers[6] = 0
            self._set_status_bits(remote=True, heartbeat_valid=True)
            return

        if command_code == COMMAND_CODES["reset_counter"]:
            if self._registers[0] in {1, 2, 5, 6, 7}:
                self._registers[1] = 0
                self._registers[0] = 2
                self._registers[6] = 0
                self._set_status_bits(remote=True, ready=True, heartbeat_valid=True)
            else:
                self._fault(22)
            return

        if command_code == COMMAND_CODES["confirm_stack_removed"]:
            if self._registers[0] in {5, 6}:
                self._registers[1] = 0
                self._registers[0] = 2
                self._registers[6] = 0
                self._set_status_bits(remote=True, ready=True, heartbeat_valid=True)
            else:
                self._fault(23)
            return

        self._fault(99)

    def _advance_simulation(self) -> None:
        if self._registers[0] != 3:
            return
        accepted_target = self._registers[2]
        if accepted_target <= 0:
            return
        now = time.monotonic()
        if now - self._last_sim_increment < 0.8:
            return
        self._last_sim_increment = now
        self._registers[1] = min(self._registers[1] + 1, accepted_target)
        self._registers[6] = 10 + (self._registers[1] % 4)
        if self._registers[1] >= accepted_target:
            self._registers[0] = 5
            self._registers[6] = 90
            self._set_status_bits(remote=True, completed=True, heartbeat_valid=True)

    def _fault(self, fault_code: int) -> None:
        self._registers[0] = 7
        self._registers[4] = fault_code
        self._set_status_bits(remote=True, fault=True, heartbeat_valid=True)

    def _set_status_bits(
        self,
        *,
        remote: bool = False,
        ready: bool = False,
        active: bool = False,
        paused: bool = False,
        completed: bool = False,
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
        if completed:
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

    @staticmethod
    def _now() -> str:
        return datetime.now(timezone.utc).isoformat()

    def _device_kwargs(self, method: Callable) -> dict:
        """Return the unit-id keyword expected by the installed PyModbus version.

        PyModbus 3.x has used both `slave` and `device_id` across releases.
        The project allows any compatible 3.x version, so detect the bound
        method signature instead of hard-coding one spelling.
        """

        parameters = inspect.signature(method).parameters
        if "device_id" in parameters:
            return {"device_id": self.config.slave_id}
        return {"slave": self.config.slave_id}
