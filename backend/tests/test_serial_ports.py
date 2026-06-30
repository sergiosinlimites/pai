import unittest
from types import SimpleNamespace

from app.serial_ports import describe_ports


def port(
    device: str,
    *,
    description: str = "Puerto serial",
    manufacturer=None,
    vid=None,
    pid=None,
    serial_number=None,
    hwid="",
):
    return SimpleNamespace(
        device=device,
        description=description,
        manufacturer=manufacturer,
        vid=vid,
        pid=pid,
        serial_number=serial_number,
        hwid=hwid,
    )


class SerialPortDiscoveryTests(unittest.TestCase):
    def test_single_usb_is_suggested(self) -> None:
        result = describe_ports(
            [
                port("COM3", description="Bluetooth", hwid="BTHENUM\\ABC"),
                port("COM9", description="USB Serial", vid=0x1A86, pid=0x7523),
            ],
            configured_port="COM9",
            last_successful_port=None,
        )
        self.assertEqual(result["suggested_port"], "COM9")
        self.assertEqual(result["suggested_reason"], "single_usb")
        self.assertEqual(result["ports"][0]["kind"], "usb")

    def test_last_successful_port_has_priority(self) -> None:
        result = describe_ports(
            [
                port("COM7", description="USB A", vid=1),
                port("COM9", description="USB B", vid=2),
            ],
            configured_port="COM7",
            last_successful_port="COM9",
        )
        self.assertEqual(result["suggested_port"], "COM9")
        self.assertEqual(result["suggested_reason"], "last_successful")

    def test_bluetooth_is_never_suggested(self) -> None:
        result = describe_ports(
            [port("COM3", description="Bluetooth", hwid="BTHENUM\\ABC")],
            configured_port="COM3",
            last_successful_port="COM3",
        )
        self.assertIsNone(result["suggested_port"])
        self.assertEqual(result["ports"][0]["kind"], "bluetooth")

    def test_missing_last_port_is_reported_but_not_suggested(self) -> None:
        result = describe_ports(
            [port("COM4", description="Puerto estándar")],
            configured_port="COM9",
            last_successful_port="COM9",
        )
        self.assertFalse(result["configured_port_available"])
        self.assertIsNone(result["suggested_port"])
        self.assertEqual(result["last_successful_port"], "COM9")

    def test_empty_port_list(self) -> None:
        result = describe_ports(
            [],
            configured_port="COM9",
            last_successful_port=None,
        )
        self.assertEqual(result["ports"], [])
        self.assertIsNone(result["suggested_port"])

    def test_connected_port_is_marked_in_use(self) -> None:
        result = describe_ports(
            [port("COM9", description="USB Serial", vid=1)],
            configured_port="COM9",
            last_successful_port="COM9",
            current_port_in_use="COM9",
        )
        self.assertTrue(result["ports"][0]["in_use"])


if __name__ == "__main__":
    unittest.main()
