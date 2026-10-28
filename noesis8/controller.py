"""NOESIS 8 bounded engineering-loop prototype; standard library only.

No model API, credential, network, cloud, git mutation, or arbitrary task command.
Only two reviewed fixture programs can be evaluated. This is not a sandbox for
hostile code. A trusted operator must protect controller/oracle/fixture files.
"""
import argparse
import datetime as dt
import hashlib
import json
import os
import platform
import re
import resource
import subprocess
import sys
import time
from pathlib import Path

BASE = Path(__file__).resolve().parent
MAX_ITERATIONS = 5
TIME_LIMIT_SECONDS = 30
PROCESS_TIMEOUT_SECONDS = 5
MAX_OUTPUT_BYTES = 262144
CAPABILITIES = frozenset({"write_synthetic_candidate", "validate_synthetic_candidate"})
APPROVED_FIXTURE_HASHES = frozenset({
    "96bb0bf82b5c39aaa7bd885a507358a08cc16127ccdb8f73036e56eb65a4afcf",
    "2353a299ef7c2a315654254a44f6e996e14f32befe01bf949bc5634fcbf40f25",
})
APPROVED_ORACLE_SHA256 = "08e7467d895723dc5b6628b7669934b2c850dea338635a6756f9f7b76de20dd0"
EXPECTED_CASES = frozenset({
    "valid_restore_and_reopen", "tampered_payload_preserves_state", "wrong_digest_preserves_state",
    "revision_conflict_preserves_state", "interruption_before_commit_preserves_state",
    "invalid_envelope_preserves_state", "extra_field_preserves_state", "malformed_json_preserves_state",
    "invalid_records_preserves_state", "invalid_revision_type_preserves_state", "symlink_target_preserves_state",
})
EXPECTED_ERRORS = {
    "tampered_payload_preserves_state": "INTEGRITY", "wrong_digest_preserves_state": "INTEGRITY",
    "revision_conflict_preserves_state": "CONFLICT", "interruption_before_commit_preserves_state": "INTERRUPTED",
    "invalid_envelope_preserves_state": "SCHEMA", "extra_field_preserves_state": "SCHEMA",
    "malformed_json_preserves_state": "Expecting property name enclosed in double quotes: line 1 column 2 (char 1)",
    "invalid_records_preserves_state": "SCHEMA", "invalid_revision_type_preserves_state": "CONFLICT",
    "symlink_target_preserves_state": "SYMLINK",
}
PLAN = {
    "objective": "Reject corrupted synthetic backup before replacing fixture state",
    "classification": "synthetic",
    "acceptance": ["valid restore reopens exactly", "corruption leaves state byte-identical",
                   "revision conflict leaves state byte-identical", "interruption preserves state",
                   "independent oracle succeeds", "complete evidence chain", "no production capability"],
    "allowed_capabilities": sorted(CAPABILITIES),
    "prohibited": ["merge", "deploy", "cloud_write", "auth_change", "rls_change", "secret_access",
                   "real_data", "external_transmission", "permission_change", "paid_service"],
    "max_iterations": MAX_ITERATIONS,
    "deadline_seconds": TIME_LIMIT_SECONDS,
}


class Blocked(ValueError):
    pass


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode()


def digest(value):
    return hashlib.sha256(value).hexdigest()


def authorize(capability):
    if capability not in CAPABILITIES:
        raise Blocked("DENIED_CAPABILITY")


def validate_task(task):
    required = {"task_id", "classification", "max_iterations"}
    if type(task) is not dict or set(task) != required or task["classification"] != "synthetic":
        raise Blocked("INVALID_TASK_SCHEMA")
    if not isinstance(task["task_id"], str) or not re.fullmatch(r"[a-z][a-z0-9-]{0,47}", task["task_id"]):
        raise Blocked("INVALID_TASK_ID")
    if type(task["max_iterations"]) is not int or not 1 <= task["max_iterations"] <= MAX_ITERATIONS:
        raise Blocked("ITERATION_LIMIT")


def templates():
    flawed = (BASE / "fixtures/restore_v1.py.txt").read_text()
    marker = '    # BUG: only the digest\'s length is checked, not its relationship to the payload.\n'
    if flawed.count(marker) != 1:
        raise Blocked("UNRECOGNIZED_FIXTURE")
    corrected = flawed.replace(marker,
        '    if not hmac.compare_digest(hashlib.sha256(payload).hexdigest(), backup["sha256"]):\n'
        '        raise ValueError("INTEGRITY")\n')
    if {digest(flawed.encode()), digest(corrected.encode())} != APPROVED_FIXTURE_HASHES:
        raise Blocked("UNREVIEWED_FIXTURE")
    return flawed.encode(), corrected.encode()


def ensure_directory(path):
    for parent in (path, *path.parents):
        if parent.is_symlink():
            raise Blocked("SYMLINK_DIRECTORY")


class Journal:
    def __init__(self, path):
        self.path = path
        self.sequence = 0
        self.head = "0" * 64

    def append(self, event, details):
        record = {"sequence": self.sequence, "at": dt.datetime.now(dt.timezone.utc).isoformat(),
                  "event": event, "details": details, "previous": self.head}
        self.head = digest(canonical(record))
        record["hash"] = self.head
        with self.path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(record, sort_keys=True) + "\n")
            handle.flush()
            os.fsync(handle.fileno())
        self.sequence += 1


def verify_journal(path, expected_head, expected_events):
    previous = "0" * 64
    count = 0
    for index, line in enumerate(path.read_text().splitlines()):
        record = json.loads(line)
        reported = record.pop("hash")
        if record["sequence"] != index or record["previous"] != previous or digest(canonical(record)) != reported:
            raise Blocked("EVIDENCE_TAMPERED")
        previous = reported
        count += 1
    if previous != expected_head or count != expected_events or not count:
        raise Blocked("EVIDENCE_INCOMPLETE")
    return True


def child_limits():
    resource.setrlimit(resource.RLIMIT_CPU, (3, 3))
    resource.setrlimit(resource.RLIMIT_AS, (256 * 1024 * 1024, 256 * 1024 * 1024))
    resource.setrlimit(resource.RLIMIT_FSIZE, (1024 * 1024, 1024 * 1024))
    resource.setrlimit(resource.RLIMIT_NOFILE, (64, 64))


def validate_candidate(candidate, run_directory, trusted_hashes, oracle_hash):
    authorize("validate_synthetic_candidate")
    if (candidate.is_symlink() or candidate.parent != run_directory
            or digest(candidate.read_bytes()) not in trusted_hashes.intersection(APPROVED_FIXTURE_HASHES)):
        raise Blocked("UNREVIEWED_CANDIDATE")
    oracle = BASE / "validator.py"
    if oracle_hash != APPROVED_ORACLE_SHA256 or digest(oracle.read_bytes()) != oracle_hash:
        raise Blocked("ORACLE_CHANGED")
    command = [sys.executable, "-I", "-B", str(oracle), str(candidate)]
    child_environment = {"PATH": os.defpath, "LANG": "C.UTF-8"}
    before = resource.getrusage(resource.RUSAGE_CHILDREN)
    start = time.perf_counter()
    try:
        proc = subprocess.run(command, cwd=run_directory, env=child_environment, capture_output=True,
                              timeout=PROCESS_TIMEOUT_SECONDS, check=False, preexec_fn=child_limits)
    except subprocess.TimeoutExpired as exc:
        raise Blocked("VALIDATOR_TIMEOUT") from exc
    after = resource.getrusage(resource.RUSAGE_CHILDREN)
    if len(proc.stdout) + len(proc.stderr) > MAX_OUTPUT_BYTES:
        raise Blocked("VALIDATOR_OUTPUT_LIMIT")
    try:
        report = json.loads(proc.stdout)
    except (ValueError, UnicodeDecodeError) as exc:
        raise Blocked("INVALID_VALIDATOR_OUTPUT") from exc
    if (proc.returncode not in (0, 1) or type(report) is not dict
            or set(report) != {"oracle", "passed", "total", "passed_count", "results"}):
        raise Blocked("VALIDATOR_ERROR")
    if type(report["passed"]) is not bool or (proc.returncode == 0) != report["passed"]:
        raise Blocked("CONTRADICTORY_VALIDATOR_OUTPUT")
    results = report["results"]
    if (not isinstance(results, list) or len(results) != len(EXPECTED_CASES)
            or any(type(r) is not dict or set(r) != {"name", "passed", "observed_error", "state_unchanged"}
                   or type(r["name"]) is not str or type(r["passed"]) is not bool
                   or type(r["state_unchanged"]) is not bool for r in results)
            or {r["name"] for r in results} != EXPECTED_CASES
            or type(report["total"]) is not int or type(report["passed_count"]) is not int
            or report["total"] != len(results)
            or report["passed_count"] != sum(r["passed"] for r in results)
            or report["passed"] != all(r["passed"] for r in results)
            or report["oracle"] != "noesis8-synthetic-restore-v1"):
        raise Blocked("INVALID_ORACLE_COUNTS")
    for result in results:
        if result["passed"] and (result["observed_error"] != EXPECTED_ERRORS.get(result["name"])
                or result["state_unchanged"] != (result["name"] != "valid_restore_and_reopen")):
            raise Blocked("CONTRADICTORY_ORACLE_SEMANTICS")
    return {"command": command, "cwd": str(run_directory), "environment": "minimal; no inherited credentials",
            "exit_code": proc.returncode, "duration_ms": round((time.perf_counter() - start) * 1000, 3),
            "cpu_seconds": round(after.ru_utime + after.ru_stime - before.ru_utime - before.ru_stime, 6),
            "child_peak_rss_kib": after.ru_maxrss, "peak_rss_scope": "cumulative child process high-water mark on Linux",
            "stdout_sha256": digest(proc.stdout), "stderr_sha256": digest(proc.stderr), "report": report}


def run(task, mode="hybrid"):
    validate_task(task)
    if mode not in {"single", "hybrid"}:
        raise Blocked("INVALID_MODE")
    ensure_directory(BASE / "runs")
    (BASE / "runs").mkdir(exist_ok=True)
    directory = BASE / "runs" / task["task_id"]
    try:
        directory.mkdir(mode=0o700)
    except FileExistsError as exc:
        raise Blocked("RUN_EXISTS_PRESERVED") from exc
    start = time.perf_counter()
    journal = Journal(directory / "journal.jsonl")
    journal.append("task_received", {"task": task, "mode": mode})
    oracle_hash = digest((BASE / "validator.py").read_bytes())
    if oracle_hash != APPROVED_ORACLE_SHA256:
        journal.append("stop", {"reason": "UNREVIEWED_ORACLE"})
        raise Blocked("UNREVIEWED_ORACLE")
    try:
        flawed, corrected = templates()
    except Blocked as exc:
        journal.append("stop", {"reason": str(exc)})
        raise
    trusted_hashes = {digest(flawed), digest(corrected)}
    original_plan = canonical(PLAN)
    (directory / "plan.json").write_bytes(original_plan + b"\n")
    journal.append("objective_and_plan", {"task": task, "mode": mode, "plan_sha256": digest(original_plan),
                    "oracle_sha256": oracle_hash, "approved_fixture_hashes": sorted(trusted_hashes)})
    journal.append("context", {"python": sys.version.split()[0], "platform": platform.platform(),
                    "git_or_cloud_write_tools": False, "synthetic_only": True,
                    "is_security_sandbox": False, "model_api_calls": 0})
    iterations = []
    status = "BLOCKED"
    reason = None
    limit = 1 if mode == "single" else task["max_iterations"]
    try:
        for index in range(1, limit + 1):
            if time.perf_counter() - start > TIME_LIMIT_SECONDS:
                raise Blocked("TASK_DEADLINE")
            if canonical(PLAN) != original_plan or digest((BASE / "validator.py").read_bytes()) != oracle_hash:
                raise Blocked("TRUSTED_CONTROL_CHANGED")
            authorize("write_synthetic_candidate")
            candidate = directory / f"candidate-{index}.py"
            candidate.write_bytes(flawed if index == 1 else corrected)
            journal.append("execution", {"iteration": index, "candidate": candidate.name, "sha256": digest(candidate.read_bytes())})
            validation = validate_candidate(candidate, directory, trusted_hashes, oracle_hash)
            (directory / f"validation-{index}.json").write_text(json.dumps(validation, indent=2, sort_keys=True) + "\n")
            journal.append("tests", {"iteration": index, "evidence": f"validation-{index}.json",
                            "sha256": digest((directory / f"validation-{index}.json").read_bytes()),
                            "passed": validation["report"]["passed"], "exit_code": validation["exit_code"]})
            iterations.append(validation)
            if time.perf_counter() - start > TIME_LIMIT_SECONDS:
                raise Blocked("TASK_DEADLINE")
            if validation["report"]["passed"]:
                status = "VALIDATED_SYNTHETIC_ONLY"
                journal.append("validation", {"iteration": index, "production_authorized": False})
                break
            failures = [r["name"] for r in validation["report"]["results"] if not r["passed"]]
            journal.append("critique", {"iteration": index, "failures": failures,
                            "root_cause": "Digest shape checked without binding it to the restored payload"})
            if set(failures) != {"tampered_payload_preserves_state", "wrong_digest_preserves_state"} or index > 1:
                raise Blocked("UNRECOGNIZED_FAILURE_STOP")
            if index < limit:
                journal.append("correction", {"method": "reviewed deterministic fixture patch",
                                "change": "Compare computed SHA-256 with expected digest before any write"})
        else:
            status = "REJECTED"
            reason = "ITERATION_BUDGET_EXHAUSTED" if mode == "hybrid" else "SINGLE_PASS_REJECTED"
    except Blocked as exc:
        status, reason = "BLOCKED", str(exc)
        journal.append("stop", {"reason": reason})
    elapsed = round((time.perf_counter() - start) * 1000, 3)
    journal.append("completed", {"status": status, "reason": reason, "iterations": len(iterations),
                    "duration_ms": elapsed, "production_authorized": False})
    summary = {"status": status, "reason": reason, "mode": mode, "iterations": len(iterations),
               "duration_ms": elapsed, "candidate_results": [v["report"]["passed_count"] for v in iterations],
               "tests_per_candidate": iterations[0]["report"]["total"] if iterations else 0,
               "journal_head": journal.head, "journal_events": journal.sequence,
               "production_authorized": False, "model_api_calls": 0,
               "new_recurring_cost_eur": 0, "billable_api_cost_eur": 0,
               "chatgpt_session_cost_eur": None,
               "cost_limitation": "No billing or token telemetry for the surrounding ChatGPT session",
               "artifact_hashes": {p.name: digest(p.read_bytes()) for p in directory.iterdir() if p.is_file()}}
    verify_journal(journal.path, summary["journal_head"], summary["journal_events"])
    (directory / "summary.json").write_text(json.dumps(summary, indent=2, sort_keys=True) + "\n")
    return summary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--mode", choices=("single", "hybrid"), default="hybrid")
    parser.add_argument("--max-iterations", type=int, default=5)
    args = parser.parse_args()
    try:
        summary = run({"task_id": args.run_id, "classification": "synthetic", "max_iterations": args.max_iterations}, args.mode)
        print(json.dumps(summary, sort_keys=True))
        return 0 if summary["status"] == "VALIDATED_SYNTHETIC_ONLY" else 1
    except Blocked as exc:
        print(json.dumps({"status": "BLOCKED", "reason": str(exc)}))
        return 2


if __name__ == "__main__":
    sys.exit(main())
