import re
from datetime import datetime, timezone
from typing import Iterable, Optional

from serial.tools import list_ports


def _port_kind(port) -> str:
    text = " ".join(
        str(value or "")
        for value in (port.device, port.description, port.manufacturer, port.hwid)
    ).upper()
    if "BTHENUM" in text or "BLUETOOTH" in text or "RFCOMM" in text:
        return "bluetooth"
    if port.vid is not None or "USB" in text:
        return "usb"
    if any(token in text for token in ("VIRTUAL", "VSP", "PTY")):
        return "virtual"
    return "other"


def _natural_device_key(device: str) -> tuple:
    parts = re.split(r"(\d+)", device.upper())
    return tuple(int(part) if part.isdigit() else part for part in parts)


def describe_ports(
    ports: Iterable,
    *,
    configured_port: str,
    last_successful_port: Optional[str],
    current_port_in_use: Optional[str] = None,
) -> dict:
    described = []
    for port in ports:
        kind = _port_kind(port)
        described.append(
            {
                "device": port.device,
                "description": port.description or "Puerto serial",
                "manufacturer": port.manufacturer,
                "serial_number": port.serial_number,
                "vid": port.vid,
                "pid": port.pid,
                "hwid": port.hwid,
                "kind": kind,
                "available": True,
                "in_use": bool(
                    current_port_in_use
                    and port.device.upper() == current_port_in_use.upper()
                ),
            }
        )

    rank = {"usb": 0, "other": 1, "virtual": 2, "bluetooth": 3}
    described.sort(key=lambda item: (rank[item["kind"]], _natural_device_key(item["device"])))
    by_device = {item["device"].upper(): item for item in described}

    suggested_port = None
    suggested_reason = "none"
    if (
        last_successful_port
        and last_successful_port.upper() in by_device
        and by_device[last_successful_port.upper()]["kind"] != "bluetooth"
    ):
        suggested_port = by_device[last_successful_port.upper()]["device"]
        suggested_reason = "last_successful"
    else:
        usb_ports = [item for item in described if item["kind"] == "usb"]
        if len(usb_ports) == 1:
            suggested_port = usb_ports[0]["device"]
            suggested_reason = "single_usb"

    return {
        "ports": described,
        "configured_port": configured_port,
        "configured_port_available": configured_port.upper() in by_device,
        "last_successful_port": last_successful_port,
        "suggested_port": suggested_port,
        "suggested_reason": suggested_reason,
        "refreshed_at": datetime.now(timezone.utc).isoformat(),
    }


def discover_serial_ports(
    *,
    configured_port: str,
    last_successful_port: Optional[str],
    current_port_in_use: Optional[str] = None,
) -> dict:
    return describe_ports(
        list_ports.comports(),
        configured_port=configured_port,
        last_successful_port=last_successful_port,
        current_port_in_use=current_port_in_use,
    )
