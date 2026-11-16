"""Verify synthetic-run evidence against an externally retained journal head.

Hashes detect changes relative to the retained checkpoint. They do not provide
an authenticated signature or protection from a writer replacing both sides.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path


def sha(data):
    return hashlib.sha256(data).hexdigest()


def verify(directory, checkpoint):
    if not re.fullmatch(r"[0-9a-f]{64}", checkpoint):
        raise ValueError("INVALID_CHECKPOINT")
    summary = json.loads((directory / "summary.json").read_text())
    if summary["journal_head"] != checkpoint:
        raise ValueError("CHECKPOINT_MISMATCH")
    previous = "0" * 64
    records = []
    for index, line in enumerate((directory / "journal.jsonl").read_text().splitlines()):
        row = json.loads(line)
        expected = row.pop("hash")
        canonical = json.dumps(row, sort_keys=True, separators=(",", ":")).encode()
        if row["previous"] != previous or row["sequence"] != index or sha(canonical) != expected:
            raise ValueError("JOURNAL_TAMPERED")
        previous = expected
        records.append(row)
    if previous != checkpoint or len(records) != summary["journal_events"] or not records:
        raise ValueError("JOURNAL_TRUNCATED")
    required = {"plan.json": None, "journal.jsonl": sha((directory / "journal.jsonl").read_bytes())}
    validations = []
    plan_events = [r for r in records if r["event"] == "objective_and_plan"]
    if len(plan_events) != 1:
        raise ValueError("PLAN_MISSING")
    plan = json.loads((directory / "plan.json").read_text())
    plan_bytes = json.dumps(plan, sort_keys=True, separators=(",", ":")).encode()
    if sha(plan_bytes) != plan_events[0]["details"]["plan_sha256"]:
        raise ValueError("PLAN_CHANGED")
    for row in records:
        if row["event"] in {"execution", "tests"}:
            field = "candidate" if row["event"] == "execution" else "evidence"
            name = row["details"][field]
            if name in required:
                raise ValueError("DUPLICATE_ARTIFACT")
            required[name] = row["details"]["sha256"]
            if row["event"] == "tests":
                validations.append(row["details"])
    manifest = summary["artifact_hashes"]
    if type(manifest) is not dict or set(manifest) != set(required):
        raise ValueError("ARTIFACT_MANIFEST_INCOMPLETE")
    actual_files = {p.name for p in directory.iterdir()}
    if actual_files != set(required) | {"summary.json"}:
        raise ValueError("UNEXPECTED_RUN_FILES")
    for name, expected in manifest.items():
        if Path(name).name != name or name in {".", ".."}:
            raise ValueError("INVALID_ARTIFACT_PATH")
        path = directory / name
        actual = sha(path.read_bytes())
        if path.is_symlink() or actual != expected or required[name] is not None and actual != required[name]:
            raise ValueError("ARTIFACT_CHANGED")
    if summary["production_authorized"] is not False:
        raise ValueError("INVALID_PRODUCTION_CLAIM")
    completed = records[-1]
    if completed["event"] != "completed" or completed["details"]["status"] != summary["status"]:
        raise ValueError("INCONSISTENT_COMPLETION")
    for field in ("iterations", "reason", "duration_ms", "production_authorized"):
        if completed["details"][field] != summary[field]:
            raise ValueError("INCONSISTENT_SUMMARY")
    if len(validations) != summary["iterations"]:
        raise ValueError("MISSING_VALIDATION")
    counts = []
    for event in validations:
        report = json.loads((directory / event["evidence"]).read_text())["report"]
        if report["passed"] != event["passed"] or report["total"] != summary["tests_per_candidate"]:
            raise ValueError("INCONSISTENT_VALIDATION")
        counts.append(report["passed_count"])
    if counts != summary["candidate_results"]:
        raise ValueError("INCONSISTENT_COUNTS")
    return {"verified": True, "status": summary["status"], "journal_events": len(records),
            "artifact_count": len(summary["artifact_hashes"]), "production_authorized": False,
            "limitation": "Unsigned checkpoint; requires trusted external retention"}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument("--head", required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(verify(args.directory, args.head), sort_keys=True))
    except (ValueError, OSError, KeyError, TypeError) as exc:
        print(json.dumps({"verified": False, "error": type(exc).__name__, "reason": str(exc)}))
        raise SystemExit(1)
