from __future__ import annotations

import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile


ROOT = Path(__file__).resolve().parent.parent
DIST_DIR = ROOT / "dist"
PACKAGE_JSON = ROOT / "package.json"


def main() -> None:
    if not DIST_DIR.exists():
        raise SystemExit("dist/ does not exist. Run the build first.")

    package = json.loads(PACKAGE_JSON.read_text(encoding="utf-8"))
    name = package["name"]
    version = package["version"]
    output = ROOT / f"{name}-{version}.xpi"

    with ZipFile(output, "w", compression=ZIP_DEFLATED) as archive:
        for path in sorted(DIST_DIR.rglob("*")):
            if path.is_file():
                archive.write(path, path.relative_to(DIST_DIR))

    print(output)


if __name__ == "__main__":
    main()
