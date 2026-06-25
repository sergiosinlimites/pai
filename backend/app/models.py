from typing import Dict, Literal, Optional

from pydantic import BaseModel, Field

from .config import RuntimeConfig


CommandName = Literal[
    "start",
    "pause",
    "resume",
    "safe_stop",
    "reset_counter",
    "confirm_stack_removed",
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
    stack_size: Optional[int] = Field(default=None, ge=1, le=9999)


class CommandResponse(BaseModel):
    accepted: bool
    command: CommandName
    command_code: int
    request_id: int
    stack_size: int
    heartbeat: int


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
    raw_registers: Dict[str, int]
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
    contract_version: int


class HealthResponse(BaseModel):
    ok: bool
    service: str
    connected: bool
    simulator: bool
    last_error: Optional[str]
