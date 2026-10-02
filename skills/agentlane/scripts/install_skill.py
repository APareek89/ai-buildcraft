#!/usr/bin/env python3
"""Copy the portable Agentlane skill; never change agent settings or overwrite it."""

import argparse
from pathlib import Path
import shutil
import sys
import tempfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--agent", choices=("codex", "claude", "cursor", "opencode", "agents"))
    parser.add_argument("--scope", choices=("user", "project"), default="user")
    parser.add_argument("--project", type=Path, help="Project root for a project-scoped installation")
    parser.add_argument("--dest", type=Path, help="Explicit destination for the complete agentlane skill directory")
    args = parser.parse_args()
    if bool(args.agent) == bool(args.dest):
        parser.error("choose exactly one of --agent or --dest")
    if args.dest and (args.project or args.scope != "user"):
        parser.error("--dest cannot be combined with --project or --scope project")
    if args.scope == "project" and not args.project:
        parser.error("--scope project requires --project")
    if args.project and args.scope != "project":
        parser.error("--project requires --scope project")

    source = Path(__file__).resolve().parents[1] / "plugins" / "agentlane" / "skills" / "agentlane"
    if not (source / "SKILL.md").is_file():
        parser.error("cannot find packaged Agentlane skill")
    if any(path.is_symlink() for path in source.rglob("*")):
        parser.error("source package contains a symlink; refusing to copy it")

    if args.dest:
        destination = args.dest.expanduser().absolute()
    else:
        folders = {"codex": ".codex", "claude": ".claude", "cursor": ".cursor", "opencode": ".opencode", "agents": ".agents"}
        if args.scope == "project":
            base = args.project.expanduser().resolve()
            if not base.is_dir():
                parser.error("project root must be an existing directory")
            destination = base / folders[args.agent] / "skills" / "agentlane"
        elif args.agent == "opencode":
            destination = Path.home() / ".config" / "opencode" / "skills" / "agentlane"
        else:
            destination = Path.home() / folders[args.agent] / "skills" / "agentlane"

    if destination.exists() or destination.is_symlink():
        parser.error(f"destination already exists; leaving it untouched: {destination}")
    if source == destination or source in destination.parents:
        parser.error("destination cannot be inside the source package")
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = Path(tempfile.mkdtemp(prefix=".agentlane-install-", dir=str(destination.parent)))
    try:
        payload = temporary / "agentlane"
        shutil.copytree(source, payload, ignore=shutil.ignore_patterns("__pycache__", "*.pyc", ".DS_Store"))
        if destination.exists() or destination.is_symlink():
            parser.error(f"destination appeared during installation; leaving it untouched: {destination}")
        payload.rename(destination)
    finally:
        shutil.rmtree(temporary, ignore_errors=True)
    print(f"Installed portable skill: {destination}")
    print("No agent settings were changed. Reload the host's skills or start a new session.")


if __name__ == "__main__":
    try:
        main()
    except OSError as error:
        print(f"Installation failed: {error}", file=sys.stderr)
        raise SystemExit(1)
