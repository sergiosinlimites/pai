import os
from typing import List

from pydantic import BaseModel, Field

DEFAULT_SERIAL_PORT = "COM9" if os.name == "nt" else "/dev/ttyUSB0"


class RuntimeConfig(BaseModel):
    """Runtime communication settings for the PLC link."""

    port: str = Field(default=DEFAULT_SERIAL_PORT, description="Serial port for the USB-RS485 adapter")
    slave_id: int = Field(default=1, ge=1, le=247)
    baudrate: int = Field(default=19200)
    bytesize: int = Field(default=8)
    parity: str = Field(default="E", min_length=1, max_length=1)
    stopbits: int = Field(default=1)
    timeout_ms: int = Field(default=500, ge=50, le=5000)
    retries: int = Field(default=2, ge=0, le=10)
    poll_interval_ms: int = Field(default=300, ge=250, le=500)
    heartbeat_interval_ms: int = Field(default=1000, ge=250, le=5000)
    simulator: bool = Field(default=True)
    auto_connect: bool = Field(default=True)


def _bool_env(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _int_env(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None or value.strip() == "":
        return default
    return int(value)


def load_runtime_config() -> RuntimeConfig:
    """Load defaults from environment variables without requiring pydantic-settings."""

    return validate_runtime_config(
        RuntimeConfig(
            port=os.getenv("PLC_SERIAL_PORT", DEFAULT_SERIAL_PORT),
            slave_id=_int_env("PLC_SLAVE_ID", 1),
            baudrate=_int_env("PLC_BAUDRATE", 19200),
            bytesize=_int_env("PLC_BYTESIZE", 8),
            parity=os.getenv("PLC_PARITY", "E").upper(),
            stopbits=_int_env("PLC_STOPBITS", 1),
            timeout_ms=_int_env("PLC_TIMEOUT_MS", 500),
            retries=_int_env("PLC_RETRIES", 2),
            poll_interval_ms=_int_env("PLC_POLL_INTERVAL_MS", 300),
            heartbeat_interval_ms=_int_env("PLC_HEARTBEAT_INTERVAL_MS", 1000),
            simulator=_bool_env("PLC_SIMULATOR", True),
            auto_connect=_bool_env("PLC_AUTO_CONNECT", True),
        )
    )


def validate_runtime_config(config: RuntimeConfig) -> RuntimeConfig:
    """Validate cross-field constraints that matter for the Xinje XD3 link."""

    errors: List[str] = []
    if config.slave_id != 1:
        errors.append("This scaffold is configured for Xinje slave id 1")
    if config.baudrate != 19200:
        errors.append("Expected baudrate is 19200")
    if config.bytesize != 8:
        errors.append("Expected bytesize is 8")
    if config.parity.upper() != "E":
        errors.append("Expected parity is E/even")
    if config.stopbits != 1:
        errors.append("Expected stopbits is 1")
    if config.timeout_ms != 500:
        errors.append("Expected Modbus timeout is 500 ms")
    if config.retries != 2:
        errors.append("Expected Modbus retries is 2")
    if not 250 <= config.poll_interval_ms <= 500:
        errors.append("Poll interval must stay between 250 and 500 ms")
    if config.heartbeat_interval_ms != 1000:
        errors.append("Expected heartbeat interval is 1000 ms")
    if errors:
        raise ValueError("; ".join(errors))
    config.parity = config.parity.upper()
    return config
