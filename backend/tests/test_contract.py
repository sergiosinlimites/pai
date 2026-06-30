import unittest

from app.modbus_contract import combine_u32, split_u32, xinje_octal_offset


class ModbusContractTests(unittest.TestCase):
    def test_u32_word_round_trip(self) -> None:
        for value in (0, 1, 65535, 65536, 123456789, 0xFFFFFFFF):
            low, high = split_u32(value)
            self.assertEqual(combine_u32(low, high), value)

    def test_xinje_io_identifiers_use_octal_offsets(self) -> None:
        self.assertEqual(xinje_octal_offset("X10"), 8)
        self.assertEqual(xinje_octal_offset("X32"), 26)
        self.assertEqual(xinje_octal_offset("Y20"), 16)


if __name__ == "__main__":
    unittest.main()
