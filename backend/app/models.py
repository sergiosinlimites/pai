from typing import Dict, Literal, Optional

from pydantic import BaseModel, Field

from .config import RuntimeConfig


CommandName = Literal[
    "start",
    "pause",
    "resume",
    "safe_stop",
    "reset_counter",
    "step",
    "set_target",
]


class ConfigUpdate(BaseModel):
    port: Optional[str] = None
    slave_id: Optional[int] = Field(default=None, ge=1, le=247)
    baudrate: Optional[int] = None
    bytesize: Optional[int] = None
    parity: Optional[str] = None
    stopbits: Optional[int] = None
    timeout_ms: Optional[int] = Field(default=None, ge=50, le=5000)
    retries: Optional[int] = Field(default=None, ge=0, le=10)
    poll_interval_ms: Optional[int] = Field(default=None, ge=250, le=500)
    heartbeat_interval_ms: Optional[int] = Field(default=None, ge=250, le=5000)
    simulator: Optional[bool] = None
    auto_connect: Optional[bool] = None


class CommandRequest(BaseModel):
    command: CommandName
    stack_size: Optional[int] = Field(default=None, ge=1, le=32767)


class CommandResponse(BaseModel):
    accepted: bool
    status: Literal["confirmed", "rejected", "timeout"]
    message: str
    command: CommandName
    command_code: int
    request_id: int
    stack_size: int
    heartbeat: int
    fault_code: int
    fault_label: str


class PlcSnapshot(BaseModel):
    config: RuntimeConfig
    connected: bool
    running: bool
    simulator: bool
    last_error: Optional[str]
    last_poll_at: Optional[str]
    last_heartbeat_at: Optional[str]
    last_command_at: Optional[str]
    heartbeat: int
    next_request_id: int
    requested_stack_size: int
    pending_stack_size: int
    raw_registers: Dict[str, int]
    raw_io_registers: Dict[str, int]
    machine_state: int
    machine_state_label: str
    processed_count: int
    accepted_stack_size: int
    accepted_request_id: int
    fault_code: int
    fault_label: str
    status_word: int
    flags: Dict[str, bool]
    stage: int
    stage_label: str
    contract_version: int
    plc_total_count: int
    historical_total: int
    last_box_at: Optional[str]
    command_status: str
    command_message: str
    io_counter_value: int
    x1_active: bool
    y1_active: bool


class HealthResponse(BaseModel):
    ok: bool
    service: str
    connected: bool
    simulator: bool
    last_error: Optional[str]


class SettingsResponse(BaseModel):
    max_stack_size: int
    timezone: str
    last_serial_port: Optional[str]


class SettingsUpdate(BaseModel):
    max_stack_size: Optional[int] = Field(default=None, ge=1, le=32767)
    timezone: Optional[str] = None


class SimulatorModeRequest(BaseModel):
    manual: bool
