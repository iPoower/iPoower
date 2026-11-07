"""Regression and fail-closed policy tests, with disposable synthetic directories."""
import importlib.util
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("controller", ROOT / "controller.py")
c = importlib.util.module_from_spec(spec)
spec.loader.exec_module(c)
evidence_spec = importlib.util.spec_from_file_location("verify_evidence", ROOT / "verify_evidence.py")
evidence = importlib.util.module_from_spec(evidence_spec)
evidence_spec.loader.exec_module(evidence)


class HarnessTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="noesis8-unit-")
        self.root = Path(self.temporary.name)
        shutil.copytree(ROOT / "fixtures", self.root / "fixtures")
        shutil.copy2(ROOT / "validator.py", self.root / "validator.py")
        self.base = patch.object(c, "BASE", self.root)
        self.base.start()
        self.task = {"task_id": "unit-fixture", "classification": "synthetic", "max_iterations": 5}

    def tearDown(self):
        self.base.stop()
        self.temporary.cleanup()

    def test_full_loop_detects_repairs_and_revalidates(self):
        result = c.run(self.task)
        self.assertEqual(result["status"], "VALIDATED_SYNTHETIC_ONLY")
        self.assertEqual(result["iterations"], 2)
        self.assertEqual(result["candidate_results"], [9, 11])
        self.assertFalse(result["production_authorized"])
        self.assertEqual(result["model_api_calls"], 0)
        root = self.root / "runs/unit-fixture"
        self.assertTrue(c.verify_journal(root / "journal.jsonl", result["journal_head"], result["journal_events"]))
        for name, expected in result["artifact_hashes"].items():
            self.assertEqual(c.digest((root / name).read_bytes()), expected)
        self.assertTrue(evidence.verify(root, result["journal_head"])["verified"])

    def test_cannot_hide_changed_artifact_by_removing_manifest(self):
        result = c.run(self.task)
        root = self.root / "runs/unit-fixture"
        (root / "validation-2.json").write_text('{"changed":true}')
        result["artifact_hashes"] = {}
        (root / "summary.json").write_text(json.dumps(result))
        with self.assertRaisesRegex(ValueError, "ARTIFACT_MANIFEST_INCOMPLETE"):
            evidence.verify(root, result["journal_head"])

    def test_cannot_rehash_changed_artifact_in_summary(self):
        result = c.run(self.task)
        root = self.root / "runs/unit-fixture"
        path = root / "validation-2.json"
        path.write_text('{"changed":true}')
        result["artifact_hashes"][path.name] = c.digest(path.read_bytes())
        (root / "summary.json").write_text(json.dumps(result))
        with self.assertRaisesRegex(ValueError, "ARTIFACT_CHANGED"):
            evidence.verify(root, result["journal_head"])

    def test_cannot_alter_plan_and_rehash_summary(self):
        result = c.run(self.task)
        root = self.root / "runs/unit-fixture"
        path = root / "plan.json"
        path.write_text('{"changed":true}')
        result["artifact_hashes"][path.name] = c.digest(path.read_bytes())
        (root / "summary.json").write_text(json.dumps(result))
        with self.assertRaisesRegex(ValueError, "PLAN_CHANGED"):
            evidence.verify(root, result["journal_head"])

    def test_cannot_change_summary_status_or_iterations(self):
        result = c.run(self.task)
        root = self.root / "runs/unit-fixture"
        result["iterations"] = 1
        (root / "summary.json").write_text(json.dumps(result))
        with self.assertRaisesRegex(ValueError, "INCONSISTENT_SUMMARY"):
            evidence.verify(root, result["journal_head"])

    def test_one_pass_control_rejects(self):
        result = c.run(self.task, "single")
        self.assertEqual(result["status"], "REJECTED")
        self.assertEqual(result["iterations"], 1)

    def test_iteration_budget_cannot_exceed_five(self):
        for count in (0, 6, -1, True, "5"):
            with self.subTest(count=count), self.assertRaises(c.Blocked):
                c.validate_task({**self.task, "max_iterations": count})

    def test_task_deadline_stops_before_execution(self):
        with patch.object(c, "TIME_LIMIT_SECONDS", -1):
            result = c.run(self.task)
        self.assertEqual((result["status"], result["reason"]), ("BLOCKED", "TASK_DEADLINE"))
        self.assertEqual(result["iterations"], 0)

    def test_budget_one_stops_without_claiming_success(self):
        result = c.run({**self.task, "max_iterations": 1})
        self.assertEqual(result["status"], "REJECTED")
        self.assertEqual(result["reason"], "ITERATION_BUDGET_EXHAUSTED")

    def test_rejects_non_synthetic_data(self):
        with self.assertRaises(c.Blocked):
            c.run({**self.task, "classification": "personal"})

    def test_rejects_commands_and_permission_requests(self):
        for field in ("command", "permissions", "url", "approval", "system_prompt"):
            with self.subTest(field=field), self.assertRaises(c.Blocked):
                c.validate_task({**self.task, field: "untrusted fixture text"})

    def test_rejects_non_mapping_task(self):
        for task in (None, [], "synthetic", 5):
            with self.subTest(task=task), self.assertRaises(c.Blocked):
                c.validate_task(task)

    def test_rejects_path_traversal_and_shell_text(self):
        for name in ("../escape", "/tmp/escape", "a;command", "$(command)", "a b", "A", "a/../b"):
            with self.subTest(name=name), self.assertRaises(c.Blocked):
                c.validate_task({**self.task, "task_id": name})

    def test_denies_sensitive_capabilities(self):
        for action in c.PLAN["prohibited"]:
            with self.subTest(action=action), self.assertRaises(c.Blocked):
                c.authorize(action)

    def test_preserves_existing_run_and_evidence(self):
        first = c.run(self.task)
        path = self.root / "runs/unit-fixture/summary.json"
        before = path.read_bytes()
        with self.assertRaisesRegex(c.Blocked, "RUN_EXISTS_PRESERVED"):
            c.run(self.task)
        self.assertEqual(before, path.read_bytes())
        self.assertEqual(first["iterations"], 2)

    def test_rejects_symlink_run_parent(self):
        outside = self.root / "outside"
        outside.mkdir()
        (self.root / "runs").symlink_to(outside)
        with self.assertRaisesRegex(c.Blocked, "SYMLINK_DIRECTORY"):
            c.run(self.task)
        self.assertEqual(list(outside.iterdir()), [])

    def test_rejects_changed_fixture_before_any_execution(self):
        (self.root / "fixtures/restore_v1.py.txt").write_text("unreviewed fixture")
        with self.assertRaises(c.Blocked):
            c.run(self.task)
        self.assertFalse(list((self.root / "runs/unit-fixture").glob("candidate-*")))

    def test_rejects_changed_fixture_with_preserved_marker(self):
        path = self.root / "fixtures/restore_v1.py.txt"
        path.write_text(path.read_text() + "\n# unexpected change\n")
        with self.assertRaisesRegex(c.Blocked, "UNREVIEWED_FIXTURE"):
            c.templates()

    def test_rejects_unreviewed_candidate_without_execution(self):
        directory = self.root / "isolated"
        directory.mkdir()
        candidate = directory / "candidate.py"
        candidate.write_text("raise RuntimeError('must never execute')")
        with self.assertRaisesRegex(c.Blocked, "UNREVIEWED_CANDIDATE"):
            c.validate_candidate(candidate, directory, c.APPROVED_FIXTURE_HASHES, c.digest((self.root / "validator.py").read_bytes()))

    def test_rejects_symlink_candidate(self):
        directory = self.root / "isolated"
        directory.mkdir()
        target = directory / "approved.py"
        target.write_bytes(c.templates()[0])
        candidate = directory / "candidate.py"
        candidate.symlink_to(target)
        with self.assertRaisesRegex(c.Blocked, "UNREVIEWED_CANDIDATE"):
            c.validate_candidate(candidate, directory, c.APPROVED_FIXTURE_HASHES, c.digest((self.root / "validator.py").read_bytes()))

    def test_rejects_changed_oracle(self):
        directory = self.root / "isolated"
        directory.mkdir()
        candidate = directory / "candidate.py"
        candidate.write_bytes(c.templates()[0])
        with self.assertRaisesRegex(c.Blocked, "ORACLE_CHANGED"):
            c.validate_candidate(candidate, directory, c.APPROVED_FIXTURE_HASHES, "0" * 64)

    def test_rejects_oracle_changed_before_start(self):
        path = self.root / "validator.py"
        path.write_text(path.read_text() + "\n# unreviewed change\n")
        with self.assertRaisesRegex(c.Blocked, "UNREVIEWED_ORACLE"):
            c.run(self.task)
        self.assertFalse(list((self.root / "runs/unit-fixture").glob("candidate-*")))

    def _mock_validation(self, report=None, code=0, timeout=False):
        directory = self.root / "isolated"
        directory.mkdir()
        candidate = directory / "candidate.py"
        candidate.write_bytes(c.templates()[0])
        proc = subprocess.CompletedProcess([], code, json.dumps(report).encode(), b"")
        behavior = {"side_effect": subprocess.TimeoutExpired([], 5)} if timeout else {"return_value": proc}
        with patch.object(c.subprocess, "run", **behavior):
            return c.validate_candidate(candidate, directory, c.APPROVED_FIXTURE_HASHES, c.digest((self.root / "validator.py").read_bytes()))

    def test_validator_timeout_stops(self):
        with self.assertRaisesRegex(c.Blocked, "VALIDATOR_TIMEOUT"):
            self._mock_validation(timeout=True)

    def test_rejects_green_without_test_results(self):
        report = {"oracle": "noesis8-synthetic-restore-v1", "passed": True, "total": 0, "passed_count": 0, "results": []}
        with self.assertRaisesRegex(c.Blocked, "INVALID_ORACLE_COUNTS"):
            self._mock_validation(report)

    def test_rejects_non_object_validator_output(self):
        with self.assertRaisesRegex(c.Blocked, "VALIDATOR_ERROR"):
            self._mock_validation(None)

    def test_rejects_unhashable_test_name(self):
        report = self._green_report()
        report["results"][0]["name"] = []
        with self.assertRaisesRegex(c.Blocked, "INVALID_ORACLE_COUNTS"):
            self._mock_validation(report)

    def test_rejects_contradictory_exit_status(self):
        report = {"oracle": "noesis8-synthetic-restore-v1", "passed": False, "total": 0, "passed_count": 0, "results": []}
        with self.assertRaisesRegex(c.Blocked, "CONTRADICTORY_VALIDATOR_OUTPUT"):
            self._mock_validation(report)

    def _green_report(self):
        return {"oracle": "noesis8-synthetic-restore-v1", "passed": True, "total": 11, "passed_count": 11,
                "results": [{"name": name, "passed": True, "observed_error": c.EXPECTED_ERRORS.get(name),
                             "state_unchanged": name != "valid_restore_and_reopen"} for name in sorted(c.EXPECTED_CASES)]}

    def test_rejects_semantically_inconsistent_green(self):
        report = self._green_report()
        report["results"][0]["observed_error"] = "CONTRADICTORY_ERROR"
        with self.assertRaisesRegex(c.Blocked, "CONTRADICTORY_ORACLE_SEMANTICS"):
            self._mock_validation(report)

    def test_rejects_changed_state_claimed_as_preserved(self):
        report = self._green_report()
        report["results"][0]["state_unchanged"] = False
        with self.assertRaisesRegex(c.Blocked, "CONTRADICTORY_ORACLE_SEMANTICS"):
            self._mock_validation(report)

    def test_rejects_float_test_count(self):
        report = self._green_report()
        report["total"] = 11.0
        with self.assertRaisesRegex(c.Blocked, "INVALID_ORACLE_COUNTS"):
            self._mock_validation(report)

    def test_success_after_deadline_is_blocked(self):
        original = c.validate_candidate
        def delayed(*args):
            result = original(*args)
            c.TIME_LIMIT_SECONDS = -1
            return result
        with patch.object(c, "TIME_LIMIT_SECONDS", 30), patch.object(c, "validate_candidate", side_effect=delayed):
            result = c.run(self.task)
        self.assertEqual((result["status"], result["reason"]), ("BLOCKED", "TASK_DEADLINE"))

    def test_evidence_tampering_detected(self):
        result = c.run(self.task)
        path = self.root / "runs/unit-fixture/journal.jsonl"
        path.write_text(path.read_text().replace("task_received", "task_modified", 1))
        with self.assertRaises(c.Blocked):
            c.verify_journal(path, result["journal_head"], result["journal_events"])

    def test_evidence_truncation_detected(self):
        result = c.run(self.task)
        path = self.root / "runs/unit-fixture/journal.jsonl"
        path.write_text("\n".join(path.read_text().splitlines()[:-1]) + "\n")
        with self.assertRaisesRegex(c.Blocked, "EVIDENCE_INCOMPLETE"):
            c.verify_journal(path, result["journal_head"], result["journal_events"])

    def test_unrecognized_failure_stops_without_repair(self):
        report = {"report": {"passed": False, "passed_count": 0, "total": 1, "results": [{"name": "unexpected", "passed": False}]}, "exit_code": 1}
        with patch.object(c, "validate_candidate", return_value=report):
            result = c.run(self.task)
        self.assertEqual((result["status"], result["reason"]), ("BLOCKED", "UNRECOGNIZED_FAILURE_STOP"))
        self.assertEqual(result["iterations"], 1)


if __name__ == "__main__":
    unittest.main(verbosity=2)
