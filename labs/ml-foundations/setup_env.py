"""Apply project-local compatibility fixes after installing requirements.

Run this with the virtual environment's Python. It is intentionally idempotent
and never writes outside this lab directory.
"""

from __future__ import annotations

import platform
import site
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parent


def add_openmp_rpath() -> None:
    if platform.system() != "Darwin":
        print("OpenMP rpath: not needed on this platform")
        return

    site_packages = Path(site.getsitepackages()[0]).resolve()
    if ROOT not in site_packages.parents:
        raise RuntimeError("Run setup_env.py with .venv/bin/python from this lab folder")

    openmp_dir = site_packages / "sklearn" / ".dylibs"
    openmp_library = openmp_dir / "libomp.dylib"
    if not openmp_library.exists():
        raise RuntimeError(f"Bundled OpenMP runtime not found: {openmp_library}")

    targets = (
        site_packages / "lightgbm" / "lib" / "lib_lightgbm.dylib",
        site_packages / "xgboost" / "lib" / "libxgboost.dylib",
    )
    relative_rpath = "@loader_path/../../sklearn/.dylibs"

    for target in targets:
        if not target.exists():
            raise RuntimeError(f"Expected library not found: {target}")
        metadata = subprocess.run(
            ["otool", "-l", str(target)],
            check=True,
            capture_output=True,
            text=True,
        ).stdout
        if relative_rpath in metadata:
            print(f"OpenMP rpath: already configured for {target.parent.parent.name}")
            continue
        subprocess.run(
            ["install_name_tool", "-add_rpath", relative_rpath, str(target)],
            check=True,
        )
        print(f"OpenMP rpath: configured for {target.parent.parent.name}")


if __name__ == "__main__":
    add_openmp_rpath()
