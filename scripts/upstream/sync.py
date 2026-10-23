"""Upstream T3 Code, renamed into CONTROL's names (docs/operations/upstream.md).

  python3 scripts/upstream/sync.py keep
      Rewrites keep.txt: the T3 names our tree still uses unchanged.
  python3 scripts/upstream/sync.py mirror <upstream-ref> <fork-commit>
      Rewrites upstream's commits after <fork-commit> through the rename table into
      refs/upstream/renamed, and prints the old -> new commit map's path.
  python3 scripts/upstream/sync.py digest [<since>]
      Lists the renamed commits after <since> (default: all) not yet picked, perf first, each
      marked clean, conflict, or gone (touches only files we removed).
  python3 scripts/upstream/sync.py pick <renamed-commit>...
      Cherry-picks them onto the current branch as `Upstream: <subject>` with an
      Upstream-Commit trailer and upstream's author, dropping the rest of upstream's message.

Run from the repository root. Upstream's objects must already be in this repository
(`git fetch https://github.com/pingdotgg/t3code main`).
"""

from __future__ import annotations

import os
import re
import shlex
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import renames  # noqa: E402

ROOT = subprocess.run(
    ["git", "rev-parse", "--show-toplevel"], capture_output=True, check=True, text=True
).stdout.strip()


def git(*args: str, cwd: str = ROOT, input: bytes | None = None) -> bytes:
    return subprocess.run(["git", *args], cwd=cwd, input=input, capture_output=True, check=True).stdout


def keep() -> None:
    """A name one of our files still spells as upstream does is kept there, so patches apply."""
    found = git(
        "grep", "-o", "-I", "-E", r"[A-Za-z0-9_@./:-]*(t3|T3)[A-Za-z0-9_@./:-]*", "HEAD", "--",
        ".", ":!pnpm-lock.yaml", ":!scripts/upstream/keep.txt",
    )
    kept: set[tuple[bytes, bytes]] = set()
    for line in found.splitlines():
        _, path, token = line.split(b":", 2)
        if renames.rename_token(token) != token:
            kept.add((path, token))
        # Prose like "T3 Code" stays where our file still says it.
        if token == b"T3":
            kept.add((path, b"T3"))
    with open(os.path.join(ROOT, "scripts/upstream/keep.txt"), "wb") as file:
        file.write(b"".join(path + b"\t" + token + b"\n" for path, token in sorted(kept)))
    print(f"keep.txt: {len(kept)} names in {len({path for path, _ in kept})} files")


class Blobs:
    """Reads blobs through one `git cat-file --batch`."""

    def __init__(self) -> None:
        self.process = subprocess.Popen(
            ["git", "cat-file", "--batch"], cwd=ROOT, stdin=subprocess.PIPE, stdout=subprocess.PIPE
        )

    def read(self, sha: bytes) -> bytes:
        assert self.process.stdin and self.process.stdout
        self.process.stdin.write(sha + b"\n")
        self.process.stdin.flush()
        size = int(self.process.stdout.readline().split()[2])
        data = self.process.stdout.read(size)
        self.process.stdout.read(1)
        return data


def write_blob(data: bytes) -> bytes:
    return git("hash-object", "-w", "--stdin", input=data).strip()


def renamed_entry(blobs: Blobs, mode: bytes, sha: bytes, path: bytes) -> tuple[bytes, bytes]:
    """The renamed path, and the blob for it: the same one unless its text changes."""
    ours = renames.rename_path(path)
    if mode == b"160000":
        return ours, sha
    data = blobs.read(sha)
    renamed = renames.rename_text(data, ours)
    return ours, sha if renamed == data else write_blob(renamed)


MAP_FILE = "control-upstream-map"
REF = "refs/upstream/renamed"


def mirror(upstream_ref: str, fork: str) -> None:
    """Each upstream commit after `fork`, renamed, on top of the renamed `fork`; incremental."""
    git_dir = git("rev-parse", "--absolute-git-dir").decode().strip()
    map_path = os.path.join(git_dir, MAP_FILE)
    mapping: dict[str, str] = {}
    if os.path.exists(map_path):
        with open(map_path) as file:
            mapping = dict(line.split() for line in file if line.strip())
    env = {**os.environ, "GIT_INDEX_FILE": os.path.join(git_dir, "control-upstream-index")}
    blobs = Blobs()
    fork = git("rev-parse", fork).decode().strip()

    def commit(tree: str, source: str, parent: str | None) -> str:
        fields = git("show", "-s", "--format=%an%x00%ae%x00%aI%x00%cn%x00%ce%x00%cI", source)
        an, ae, ad, cn, ce, cd = fields.decode().strip().split("\0")
        message = git("show", "-s", "--format=%B", source).decode().rstrip()
        message += f"\n\nUpstream-Commit: {source}\n"
        identity = {
            "GIT_AUTHOR_NAME": an, "GIT_AUTHOR_EMAIL": ae, "GIT_AUTHOR_DATE": ad,
            "GIT_COMMITTER_NAME": cn, "GIT_COMMITTER_EMAIL": ce, "GIT_COMMITTER_DATE": cd,
        }
        args = ["git", "commit-tree", tree, *(["-p", parent] if parent else [])]
        return subprocess.run(
            args, cwd=ROOT, env={**env, **identity}, input=message.encode(),
            capture_output=True, check=True,
        ).stdout.decode().strip()

    def index(lines: list[bytes]) -> None:
        if lines:
            subprocess.run(
                ["git", "update-index", "-z", "--index-info"], cwd=ROOT, env=env,
                input=b"".join(lines), check=True,
            )

    def write_tree() -> str:
        return subprocess.run(
            ["git", "write-tree"], cwd=ROOT, env=env, capture_output=True, check=True
        ).stdout.decode().strip()

    if fork not in mapping:
        subprocess.run(["git", "read-tree", "--empty"], cwd=ROOT, env=env, check=True)
        lines = []
        for entry in git("ls-tree", "-r", "-z", fork).split(b"\0"):
            if not entry:
                continue
            meta, path = entry.split(b"\t", 1)
            mode, _, sha = meta.split(b" ")
            ours, blob = renamed_entry(blobs, mode, sha, path)
            lines.append(mode + b" " + blob + b"\t" + ours + b"\0")
        index(lines)
        mapping[fork] = commit(write_tree(), fork, None)
        print(f"base {fork[:9]} -> {mapping[fork][:9]}")

    previous_tip = subprocess.run(
        ["git", "rev-parse", "-q", "--verify", REF], cwd=ROOT, capture_output=True, text=True
    ).stdout.strip()
    commits = git("rev-list", "--reverse", "--first-parent", f"{fork}..{upstream_ref}").decode().split()
    previous = fork
    for source in commits:
        if source in mapping:
            previous = source
            continue
        subprocess.run(["git", "read-tree", mapping[previous]], cwd=ROOT, env=env, check=True)
        lines = []
        raw = git("diff-tree", "-r", "-z", "--no-renames", "--raw", f"{previous}", source)
        fields = raw.split(b"\0")
        for index_at in range(0, len(fields) - 1, 2):
            meta, path = fields[index_at], fields[index_at + 1]
            _, mode, _, sha, status = meta[1:].split(b" ")
            if status == b"D":
                lines.append(b"0 " + b"0" * 40 + b"\t" + renames.rename_path(path) + b"\0")
            else:
                ours, blob = renamed_entry(blobs, mode, sha, path)
                lines.append(mode + b" " + blob + b"\t" + ours + b"\0")
        index(lines)
        mapping[source] = commit(write_tree(), source, mapping[previous])
        previous = source
        with open(map_path, "a") as file:
            file.write(f"{source} {mapping[source]}\n")
    with open(map_path, "w") as file:
        file.write("".join(f"{a} {b}\n" for a, b in mapping.items()))
    git("update-ref", REF, mapping[previous])
    print(f"{REF}: {previous_tip[:9] or 'new'} -> {mapping[previous][:9]} ({len(commits)} upstream commits after {fork[:9]})")
    print(f"map: {map_path}")


UPSTREAM_TRAILER = re.compile(r"^Upstream-Commit: ([0-9a-f]{40})$", re.M)
TYPE_ORDER = ["perf", "fix", "feat", "refactor"]


def digest(since: str | None) -> None:
    """Markdown, perf first: what each unpicked renamed commit would do to HEAD."""
    picked = set(UPSTREAM_TRAILER.findall(git("log", "--format=%B", "HEAD").decode()))
    ours = set(git("ls-tree", "-r", "-z", "--name-only", "HEAD").split(b"\0"))
    base = git("rev-list", "--max-parents=0", REF).decode().split()[0]
    at_fork = set(git("ls-tree", "-r", "-z", "--name-only", base).split(b"\0"))
    log = git("log", "--reverse", "--format=%H%x1f%P%x1f%s%x1f%B%x1e", f"{since}..{REF}" if since else REF)
    groups: dict[str, list[str]] = {}
    for record in log.decode().split("\x1e"):
        if not record.strip():
            continue
        sha, parent, subject, body = record.strip("\n").split("\x1f")
        upstream = UPSTREAM_TRAILER.search(body)
        if not parent or not upstream or upstream.group(1) in picked:
            continue
        paths = set(git("diff-tree", "-r", "-z", "--no-commit-id", "--name-only", sha).split(b"\0")) - {b""}
        if paths and not paths & ours and paths <= at_fork:
            state = "gone"
        else:
            trial = subprocess.run(
                ["git", "merge-tree", "--write-tree", f"--merge-base={parent}", "HEAD", sha],
                cwd=ROOT, capture_output=True,
            )
            state = "clean" if trial.returncode == 0 else "conflict"
        kind = re.match(r"(\w+)", subject)
        group = kind.group(1) if kind and kind.group(1) in TYPE_ORDER else "other"
        groups.setdefault(group, []).append(f"- `{sha[:9]}` {state}: {subject} ({len(paths)} files)")
    for group in [*TYPE_ORDER, "other"]:
        if group in groups:
            print(f"## {group} ({len(groups[group])})\n")
            print("\n".join(groups[group]) + "\n")


def pick_message(sha: str) -> str:
    subject, body = git("show", "-s", "--format=%s%x1f%B", sha).decode().split("\x1f", 1)
    subject = re.sub(r" \(#\d+\)$", "", re.sub(r"^\w+(\([^)]*\))?!?: ", "", subject))
    subject = renames.rename_text(subject.encode()).decode()
    upstream = UPSTREAM_TRAILER.search(body)
    assert upstream, f"{sha} is not a renamed upstream commit"
    if re.match(r"[a-z]+\b(?![-./:@])", subject):
        subject = subject[:1].upper() + subject[1:]
    return f"Upstream: {subject}\n\nUpstream-Commit: {upstream.group(1)}\n"


def pick(shas: list[str]) -> None:
    """Upstream's Co-authored-by lines would credit their tools in our history, so only the
    subject and the Upstream-Commit trailer come across. Committing through `git commit` runs
    our pre-commit formatter, since a renamed name can push a line past the width."""
    message_path = os.path.join(git("rev-parse", "--absolute-git-dir").decode().strip(), "control-upstream-msg")
    for sha in shas:
        with open(message_path, "w") as file:
            file.write(pick_message(sha))
        author, date = git("show", "-s", "--format=%an <%ae>%x1f%aI", sha).decode().strip().split("\x1f")
        commit = ["git", "commit", "-q", f"--author={author}", f"--date={date}", "-F", message_path]
        if subprocess.run(["git", "cherry-pick", "--no-commit", sha], cwd=ROOT).returncode != 0:
            print(f"{sha[:9]} conflicts: resolve it, `git add` it, then\n  {shlex.join(commit)}")
            sys.exit(1)
        subprocess.run(commit, cwd=ROOT, check=True)
        print(pick_message(sha).splitlines()[0])


if __name__ == "__main__":
    command = sys.argv[1] if len(sys.argv) > 1 else ""
    if command == "keep":
        keep()
    elif command == "mirror" and len(sys.argv) == 4:
        mirror(sys.argv[2], sys.argv[3])
    elif command == "digest" and len(sys.argv) <= 3:
        digest(sys.argv[2] if len(sys.argv) == 3 else None)
    elif command == "pick" and len(sys.argv) >= 3:
        pick(sys.argv[2:])
    else:
        print(__doc__)
        sys.exit(2)
