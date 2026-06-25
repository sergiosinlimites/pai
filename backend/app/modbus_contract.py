COMMAND_START_REGISTER = 200
COMMAND_REGISTER_COUNT = 4
STATUS_START_REGISTER = 210
STATUS_REGISTER_COUNT = 8
CONTRACT_VERSION = 1

COMMAND_CODES = {
    "none": 0,
    "start": 1,
    "pause": 2,
    "resume": 3,
    "safe_stop": 4,
    "reset_counter": 5,
    "confirm_stack_removed": 6,
}

COMMAND_LABELS = {value: key for key, value in COMMAND_CODES.items()}

STATE_LABELS = {
    0: "initializing",
    1: "stopped",
    2: "ready",
    3: "running",
    4: "paused",
    5: "stack_completed",
    6: "waiting_stack_removal",
    7: "fault",
    8: "manual_or_maintenance",
}

FAULT_LABELS = {
    0: "none",
    10: "invalid_stack_size",
    20: "command_not_allowed_while_running",
    21: "command_not_allowed_in_current_state",
    22: "reset_requires_stopped_machine",
    23: "stack_removal_not_expected",
    90: "remote_heartbeat_lost",
    99: "unknown_command",
}

STATUS_BITS = {
    0: "remote_enabled",
    1: "machine_ready",
    2: "cycle_active",
    3: "pause_active",
    4: "stack_completed",
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


def status_register_names() -> list:
    return [f"D{STATUS_START_REGISTER + offset}" for offset in range(STATUS_REGISTER_COUNT)]
