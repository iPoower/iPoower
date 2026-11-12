"""Independent, fixed oracle for the reviewed synthetic restore fixtures.

The candidate is executed only after the controller recognizes an approved digest.
This separate process is a verification boundary, not an OS security sandbox.
"""
import hashlib
import importlib.util
import json
import sys
import tempfile
from pathlib import Path


def check(candidate):
    spec = importlib.util.spec_from_file_location("synthetic_candidate", candidate)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    results = []
    payload = json.dumps({"records": [{"id": "fixture-b", "value": 42}]}, sort_keys=True).encode()
    good = {"schema": 1, "payload_hex": payload.hex(), "sha256": hashlib.sha256(payload).hexdigest()}

    def case(name, mutate=None, expected_error=None, revision=7, interrupt=False, symlink=False):
        with tempfile.TemporaryDirectory(prefix="noesis8-oracle-") as directory:
            root = Path(directory)
            target = root / "state.json"
            initial = {"revision": 7, "records": [{"id": "fixture-a", "value": 41}], "settings": {"keep": True}}
            target.write_text(json.dumps(initial, sort_keys=True))
            before = target.read_bytes()
            if symlink:
                link = root / "link.json"
                link.symlink_to(target)
                target = link
            envelope = dict(good)
            if mutate:
                mutate(envelope)
            error = None
            try:
                module.restore(target, envelope, revision, interrupt=interrupt)
            except ValueError as exc:
                error = str(exc)
            except Exception as exc:
                error = type(exc).__name__
            after = target.read_bytes()
            if expected_error:
                passed = error == expected_error and after == before
            else:
                restored = json.loads(after)
                passed = error is None and restored == {**initial, "revision": 8, "records": [{"id": "fixture-b", "value": 42}]}
            passed = passed and not list(root.glob(".restore-*"))
            results.append({"name": name, "passed": passed, "observed_error": error,
                            "state_unchanged": after == before})

    case("valid_restore_and_reopen")
    changed = json.dumps({"records": [{"id": "fixture-b", "value": 999}]}, sort_keys=True).encode()
    case("tampered_payload_preserves_state", lambda b: b.update(payload_hex=changed.hex()), "INTEGRITY")
    case("wrong_digest_preserves_state", lambda b: b.update(sha256="0" * 64), "INTEGRITY")
    case("revision_conflict_preserves_state", expected_error="CONFLICT", revision=6)
    case("interruption_before_commit_preserves_state", expected_error="INTERRUPTED", interrupt=True)
    case("invalid_envelope_preserves_state", lambda b: b.update(schema=2), "SCHEMA")
    case("extra_field_preserves_state", lambda b: b.update(command="synthetic-denied"), "SCHEMA")
    invalid = b"{"
    case("malformed_json_preserves_state", lambda b: b.update(payload_hex=invalid.hex(), sha256=hashlib.sha256(invalid).hexdigest()), "Expecting property name enclosed in double quotes: line 1 column 2 (char 1)")
    invalid = b'{"records":null}'
    case("invalid_records_preserves_state", lambda b: b.update(payload_hex=invalid.hex(), sha256=hashlib.sha256(invalid).hexdigest()), "SCHEMA")
    case("invalid_revision_type_preserves_state", expected_error="CONFLICT", revision="7")
    case("symlink_target_preserves_state", expected_error="SYMLINK", symlink=True)
    return {"oracle": "noesis8-synthetic-restore-v1", "passed": all(r["passed"] for r in results),
            "total": len(results), "passed_count": sum(r["passed"] for r in results), "results": results}


if __name__ == "__main__":
    try:
        report = check(Path(sys.argv[1]))
        print(json.dumps(report, sort_keys=True))
        sys.exit(0 if report["passed"] else 1)
    except Exception as exc:
        print(json.dumps({"passed": False, "error": type(exc).__name__}))
        sys.exit(2)
