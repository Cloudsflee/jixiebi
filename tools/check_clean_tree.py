"""Report artifacts that are outside the canonical build path."""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BLOCKED_DIRS = {".tmp_three_vendor", "node_modules", "__pycache__"}
BUILD_SUFFIXES = {".o", ".d", ".elf", ".hex", ".bin", ".map"}


def main() -> int:
    found = []
    for path in ROOT.rglob("*"):
        if any(part in BLOCKED_DIRS for part in path.parts):
            found.append(path.relative_to(ROOT).as_posix())
        elif path.is_file() and path.suffix.lower() in BUILD_SUFFIXES:
            found.append(path.relative_to(ROOT).as_posix())
    if found:
        print("clean-tree: candidates")
        print("\n".join(sorted(found)))
        return 1
    print("clean-tree: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
