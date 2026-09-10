
from pathlib import Path
import subprocess
import sys

# ============================================================
# CONFIG
# ============================================================

ROOT = Path.cwd()

# Folders that should NOT appear in the generated structure
IGNORED_DIRS = {
    ".git",
    "node_modules",
    "venv",
    ".venv",
    "env",
    ".env",
    "__pycache__",
    ".pytest_cache",
    ".mypy_cache",
    ".ruff_cache",
    ".idea",
    ".vscode",
    "dist",
    "build",
    "coverage",
    ".next",
    ".nuxt",
}

# Files that should not be included in the structure
IGNORED_FILES = {
    ".DS_Store",
    "Thumbs.db",
}

STRUCTURE_FILE = "PROJECT_STRUCTURE.txt"
GITIGNORE_FILE = ".gitignore"


# ============================================================
# HELPERS
# ============================================================

def run_command(command):
    """Run a shell command and print output."""
    print(f"\n> {' '.join(command)}")

    result = subprocess.run(
        command,
        text=True,
        capture_output=True
    )

    if result.stdout:
        print(result.stdout)

    if result.returncode != 0:
        if result.stderr:
            print(result.stderr)

        return False

    return True


def generate_structure():
    """Generate project structure into PROJECT_STRUCTURE.txt."""

    csv_count = 0
    file_count = 0
    folder_count = 0

    lines = []

    lines.append("=" * 70)
    lines.append("PROJECT STRUCTURE")
    lines.append("=" * 70)
    lines.append(f"Root: {ROOT}")
    lines.append("")

    def scan(directory, prefix=""):
        nonlocal csv_count, file_count, folder_count

        try:
            items = sorted(
                directory.iterdir(),
                key=lambda p: (p.is_file(), p.name.lower())
            )
        except PermissionError:
            lines.append(prefix + "└── [Permission Denied]")
            return

        visible_items = []

        for item in items:
            if item.is_dir() and item.name in IGNORED_DIRS:
                continue

            if item.is_file() and item.name in IGNORED_FILES:
                continue

            # Never include the generated structure file itself
            if item.name == STRUCTURE_FILE:
                continue

            visible_items.append(item)

        for index, item in enumerate(visible_items):
            is_last = index == len(visible_items) - 1

            branch = "└── " if is_last else "├── "
            child_prefix = "    " if is_last else "│   "

            if item.is_dir():
                folder_count += 1

                lines.append(
                    prefix + branch + item.name + "/"
                )

                scan(
                    item,
                    prefix + child_prefix
                )

            else:
                file_count += 1

                if item.suffix.lower() == ".csv":
                    csv_count += 1
                    # Do NOT list CSV filename
                    continue

                lines.append(
                    prefix + branch + item.name
                )

    scan(ROOT)

    lines.append("")
    lines.append("=" * 70)
    lines.append("SUMMARY")
    lines.append("=" * 70)
    lines.append(f"Folders: {folder_count}")
    lines.append(f"Files shown: {file_count - csv_count}")
    lines.append(f"CSV files: {csv_count}")
    lines.append("=" * 70)

    Path(STRUCTURE_FILE).write_text(
        "\n".join(lines),
        encoding="utf-8"
    )

    print(f"\nCreated: {STRUCTURE_FILE}")
    print(f"CSV files found: {csv_count}")


def update_gitignore():
    """Create/update .gitignore and optionally add a user-selected file."""

    default_entries = [
        "# Python",
        "__pycache__/",
        "*.py[cod]",
        "*.pyo",
        "*.pyd",
        ".Python",

        "",
        "# Virtual environments",
        "venv/",
        ".venv/",
        "env/",
        ".env/",
        "ENV/",

        "",
        "# Node",
        "node_modules/",
        "npm-debug.log*",
        "yarn-debug.log*",
        "yarn-error.log*",

        "",
        "# Build / cache",
        "dist/",
        "build/",
        "coverage/",
        ".pytest_cache/",
        ".mypy_cache/",
        ".ruff_cache/",

        "",
        "# IDE",
        ".idea/",
        ".vscode/",

        "",
        "# OS",
        ".DS_Store",
        "Thumbs.db",

        "",
        "# Environment / secrets",
        ".env",
        ".env.*",
        "!.env.example",

        "",
        "# Git",
        ".git/",
    ]

    gitignore_path = ROOT / GITIGNORE_FILE

    if gitignore_path.exists():
        existing = gitignore_path.read_text(
            encoding="utf-8",
            errors="ignore"
        ).splitlines()
    else:
        existing = []

    existing_set = set(existing)

    added = []

    for entry in default_entries:
        if entry and entry not in existing_set:
            existing.append(entry)
            existing_set.add(entry)
            added.append(entry)

    print("\n----------------------------------------")
    print("Optional file to add to .gitignore")
    print("----------------------------------------")
    print("Example: config.json")
    print("Example: data/large_file.pkl")
    print("Example: secrets/api_key.txt")
    print("Press ENTER to skip.")

    user_file = input("\nFile/folder to ignore: ").strip()

    if user_file:
        user_file = user_file.replace("\\", "/")

        if user_file not in existing_set:
            existing.append(user_file)
            added.append(user_file)

            print(f"Added to .gitignore: {user_file}")
        else:
            print("Already present in .gitignore.")

    gitignore_path.write_text(
        "\n".join(existing).rstrip() + "\n",
        encoding="utf-8"
    )

    print(f"\nCreated/updated: {GITIGNORE_FILE}")


def git_setup():
    """Initialize Git and prepare repository."""

    print("\n========================================")
    print("GIT SETUP")
    print("========================================")

    if (ROOT / ".git").exists():
        print("Git repository already initialized.")
    else:
        if not run_command(["git", "init"]):
            return False

    # Make sure main branch is used
    if not run_command(["git", "branch", "-M", "main"]):
        return False

    print("\nCurrent Git status:")
    run_command(["git", "status"])

    return True


def git_commit():
    """Stage and commit files."""

    print("\n========================================")
    print("ADDING FILES")
    print("========================================")

    if not run_command(["git", "add", "."]):
        return False

    print("\nFiles staged:")
    run_command(["git", "status"])

    commit_message = input(
        "\nCommit message [Initial commit]: "
    ).strip()

    if not commit_message:
        commit_message = "Initial commit"

    if not run_command([
        "git",
        "commit",
        "-m",
        commit_message
    ]):
        return False

    return True


def add_remote_and_push():
    """Add GitHub remote and push."""

    print("\n========================================")
    print("GITHUB PUSH")
    print("========================================")

    # Check existing remote
    result = subprocess.run(
        ["git", "remote", "-v"],
        text=True,
        capture_output=True
    )

    if result.stdout.strip():
        print("\nExisting remote:")
        print(result.stdout)

        change_remote = input(
            "Do you want to replace the remote? (y/N): "
        ).strip().lower()

        if change_remote == "y":
            remote_url = input(
                "\nEnter GitHub repository HTTPS URL: "
            ).strip()

            run_command([
                "git",
                "remote",
                "set-url",
                "origin",
                remote_url
            ])
        else:
            remote_url = None

    else:
        remote_url = input(
            "\nEnter GitHub repository HTTPS URL: "
        ).strip()

        if not remote_url:
            print("No remote URL provided.")
            return False

        if not run_command([
            "git",
            "remote",
            "add",
            "origin",
            remote_url
        ]):
            return False

    print("\nRemote:")
    run_command(["git", "remote", "-v"])

    push = input(
        "\nPush project to GitHub now? (y/N): "
    ).strip().lower()

    if push == "y":
        return run_command([
            "git",
            "push",
            "-u",
            "origin",
            "main"
        ])

    print("\nPush skipped.")
    print("Later run:")
    print("git push -u origin main")

    return True


# ============================================================
# MAIN
# ============================================================

def main():
    print("=" * 70)
    print("PROJECT → PRIVATE GITHUB SETUP")
    print("=" * 70)
    print(f"Project folder: {ROOT}")

    print("\n[1/4] Generating project structure...")
    generate_structure()

    print("\n[2/4] Creating/updating .gitignore...")
    update_gitignore()

    print("\n[3/4] Initializing Git...")
    if not git_setup():
        print("\nGit setup failed.")
        sys.exit(1)

    print("\n[4/4] Commit & GitHub...")
    if not git_commit():
        print("\nCommit failed.")
        sys.exit(1)

    add_remote_and_push()

    print("\n" + "=" * 70)
    print("DONE")
    print("=" * 70)


if __name__ == "__main__":
    main()
