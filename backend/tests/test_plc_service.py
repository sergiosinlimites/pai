import asyncio
import tempfile
import unittest
from pathlib import Path

from app.config import RuntimeConfig
from app.models import CommandRequest
from app.plc_service import PlcService
from app.production_store import ProductionStore


class PlcServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.store = ProductionStore(str(Path(self.tempdir.name) / "service.db"))
        self.service = PlcService(RuntimeConfig(), store=self.store)

    def tearDown(self) -> None:
        self.store.close()
        self.tempdir.cleanup()

    def run_async(self, coroutine):
        return asyncio.run(coroutine)

    def test_default_contract_and_stack_target(self) -> None:
        snapshot = self.service.snapshot()
        self.assertEqual(snapshot.contract_version, 2)
        self.assertEqual(snapshot.accepted_stack_size, 20)
        self.assertEqual(len(snapshot.raw_registers), 10)

    def test_step_is_rejected_in_auto_and_advances_once_in_manual(self) -> None:
        async def scenario() -> None:
            await self.service.start()
            rejected = await self.service.send_command(CommandRequest(command="step"))
            self.assertEqual(rejected.status, "rejected")
            self.assertEqual(rejected.fault_code, 24)

            await self.service.set_simulator_mode(True)
            before = self.service.snapshot().stage
            accepted = await self.service.send_command(CommandRequest(command="step"))
            self.assertEqual(accepted.status, "confirmed")
            self.assertEqual(self.service.snapshot().stage, before + 1)
            await self.service.stop()

        self.run_async(scenario())

    def test_duplicate_request_id_does_not_repeat_manual_step(self) -> None:
        self.run_async(self.service.set_simulator_mode(True))
        values = [20, 7, 25, 0]
        self.service._apply_simulated_command(values)
        stage_after_first = self.service.snapshot().stage
        self.service._apply_simulated_command(values)
        self.assertEqual(self.service.snapshot().stage, stage_after_first)

    def test_target_is_applied_only_at_stack_boundary(self) -> None:
        async def scenario() -> None:
            await self.service.start()
            await self.service.send_command(CommandRequest(command="start", stack_size=2))
            self.service._registers[1] = 1
            await self.service.send_command(
                CommandRequest(command="set_target", stack_size=3)
            )
            self.assertEqual(self.service.snapshot().accepted_stack_size, 2)
            self.service._complete_sim_box()
            self.assertEqual(self.service.snapshot().accepted_stack_size, 3)
            self.assertEqual(self.service.snapshot().processed_count, 0)
            await self.service.stop()

        self.run_async(scenario())

    def test_reset_does_not_change_historical_total(self) -> None:
        async def scenario() -> None:
            await self.service.start()
            await self.service.set_simulator_mode(True)
            for _ in range(4):
                await self.service.send_command(CommandRequest(command="step"))
            self.service._ingest_production()
            before = self.service.snapshot().historical_total
            await self.service.send_command(CommandRequest(command="reset_counter"))
            self.service._ingest_production()
            self.assertEqual(self.service.snapshot().historical_total, before)
            await self.service.stop()

        self.run_async(scenario())

    def test_console_separates_used_inputs_and_outputs(self) -> None:
        async def scenario() -> None:
            await self.service.start()
            await self.service.set_simulator_mode(True)
            result = await self.service.read_physical_io()
            inputs = {item["name"]: item for item in result["inputs"]}
            outputs = {item["name"]: item for item in result["outputs"]}
            self.assertTrue(inputs["X2"]["active"])
            self.assertEqual(inputs["X32"]["modbus_address"], 20506)
            self.assertEqual(outputs["Y20"]["modbus_address"], 24592)
            self.assertNotIn("Y1", inputs)
            self.assertNotIn("X1", outputs)
            await self.service.stop()

        self.run_async(scenario())


if __name__ == "__main__":
    unittest.main()
