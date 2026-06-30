COMMAND_START_REGISTER = 200
COMMAND_REGISTER_COUNT = 4
STATUS_START_REGISTER = 210
STATUS_REGISTER_COUNT = 10
IO_STATUS_START_REGISTER = 220
IO_STATUS_REGISTER_COUNT = 3
CONTRACT_VERSION = 2
X_COIL_START_ADDRESS = 20480
Y_COIL_START_ADDRESS = 24576

# X/Y identifiers use octal numbering in Xinje projects.
USED_INPUTS = [
    ("X0", "Reinicio"),
    ("X1", "Start / paso físico"),
    ("X2", "Selector automático/manual"),
    ("X3", "Parada física"),
    ("X4", "Sensor de proceso sin nombre"),
    ("X5", "Cilindro A final"),
    ("X6", "Cilindro B inicial"),
    ("X7", "Cilindro B final"),
    ("X10", "Cilindro C inicial"),
    ("X11", "Cilindro C final"),
    ("X12", "Cilindro D inicial"),
    ("X13", "Cilindro D final"),
    ("X14", "Cilindro E inicial"),
    ("X15", "Cilindro E final"),
    ("X16", "Cilindro J inicial"),
    ("X17", "Cilindro J final"),
    ("X22", "Sensor ventosa 1"),
    ("X23", "Sensor ventosas 3/4"),
    ("X24", "Sensor ventosa 2"),
    ("X32", "Sensor de presencia"),
]

USED_OUTPUTS = [
    ("Y0", "Válvula A"),
    ("Y1", "Válvula C"),
    ("Y3", "Válvula F / garra"),
    ("Y4", "Válvula J"),
    ("Y5", "Válvula B"),
    ("Y6", "Válvulas D/E"),
    ("Y10", "Ventosa 1"),
    ("Y14", "Ventosa 2"),
    ("Y15", "Ventosas 3/4"),
    ("Y20", "Motor de banda"),
]


def xinje_octal_offset(identifier: str) -> int:
    return int(identifier[1:], 8)

COMMAND_CODES = {
    "none": 0,
    "start": 1,
    "pause": 2,
    "resume": 3,
    "safe_stop": 4,
    "reset_counter": 5,
    "step": 7,
    "set_target": 8,
}

COMMAND_LABELS = {value: key for key, value in COMMAND_CODES.items()}

STATE_LABELS = {
    0: "initializing",
    1: "stopped",
    2: "ready",
    3: "running",
    4: "paused",
    5: "stack_transition",
    6: "reserved",
    7: "fault",
    8: "manual_or_maintenance",
}

FAULT_LABELS = {
    0: "none",
    10: "invalid_stack_size",
    20: "command_not_allowed_while_running",
    21: "command_not_allowed_in_current_state",
    22: "reset_requires_stopped_machine",
    23: "reserved_legacy_command",
    24: "manual_step_requires_manual_mode",
    25: "manual_step_blocked",
    90: "remote_heartbeat_lost",
    99: "unknown_command",
}

STATUS_BITS = {
    0: "remote_enabled",
    1: "machine_ready",
    2: "cycle_active",
    3: "pause_active",
    4: "automatic_mode",
    5: "fault_active",
    6: "manual_mode",
    7: "heartbeat_valid",
}


def state_label(value: int) -> str:
    return STATE_LABELS.get(value, f"unknown_{value}")


def fault_label(value: int) -> str:
    return FAULT_LABELS.get(value, f"fault_{value}")


def decode_status_word(word: int) -> dict:
    return {name: bool(word & (1 << bit)) for bit, name in STATUS_BITS.items()}


def combine_u32(low_word: int, high_word: int) -> int:
    """Combine two Modbus words using Xinje's low-word-first convention."""

    return ((high_word & 0xFFFF) << 16) | (low_word & 0xFFFF)


def split_u32(value: int) -> tuple[int, int]:
    """Split a non-negative 32-bit value into low and high Modbus words."""

    value &= 0xFFFFFFFF
    return value & 0xFFFF, (value >> 16) & 0xFFFF


def status_register_names() -> list:
    return [f"D{STATUS_START_REGISTER + offset}" for offset in range(STATUS_REGISTER_COUNT)]


def io_status_register_names() -> list:
    return [f"D{IO_STATUS_START_REGISTER + offset}" for offset in range(IO_STATUS_REGISTER_COUNT)]
