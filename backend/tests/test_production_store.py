import tempfile
import unittest
from pathlib import Path

from app.production_store import ProductionStore


class ProductionStoreTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.store = ProductionStore(str(Path(self.tempdir.name) / "production.db"))

    def tearDown(self) -> None:
        self.store.close()
        self.tempdir.cleanup()

    def ingest(self, total: int, stack_count: int, target: int = 2) -> list[dict]:
        return self.store.ingest_status(
            plc_total=total,
            stack_count=stack_count,
            active_target=target,
            state_code=3,
            state_label="running",
            fault_code=0,
            fault_label="none",
        )

    def test_total_never_decreases_and_marks_recovered_events(self) -> None:
        self.ingest(0, 0)
        first = self.ingest(1, 1)
        recovered = self.ingest(4, 0)
        self.ingest(1, 1)

        self.assertEqual(len(first), 1)
        self.assertFalse(first[0]["recovered"])
        self.assertEqual(len(recovered), 3)
        self.assertTrue(all(event["recovered"] for event in recovered))
        self.assertEqual(self.store.logical_total(), 4)

    def test_stack_closes_at_target_and_next_stack_opens(self) -> None:
        self.ingest(0, 0, target=2)
        self.ingest(1, 1, target=2)
        self.ingest(2, 0, target=3)

        stacks = self.store.stacks()
        self.assertEqual(stacks[0]["status"], "active")
        self.assertEqual(stacks[0]["target"], 3)
        self.assertEqual(stacks[1]["status"], "completed")
        self.assertEqual(stacks[1]["processed_count"], 2)

    def test_recovered_delta_can_close_multiple_stacks(self) -> None:
        self.ingest(0, 0, target=2)
        self.ingest(5, 1, target=2)

        stacks = self.store.stacks()
        completed = [stack for stack in stacks if stack["status"] == "completed"]
        self.assertEqual(len(completed), 2)
        self.assertEqual(stacks[0]["processed_count"], 1)

    def test_csv_contains_recorded_boxes(self) -> None:
        self.ingest(0, 0)
        self.ingest(1, 1)
        exported = self.store.export_csv()
        self.assertIn("logical_total,plc_total", exported)
        self.assertIn("1,1", exported)

    def test_operational_settings_are_persisted(self) -> None:
        settings = self.store.update_settings(
            max_stack_size=150,
            timezone_name="America/Bogota",
        )
        self.assertEqual(settings["max_stack_size"], 150)
        self.assertEqual(settings["timezone"], "America/Bogota")


if __name__ == "__main__":
    unittest.main()
