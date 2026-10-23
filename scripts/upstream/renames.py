"""The rename table: how upstream T3 Code's names become CONTROL's.

One table serves both directions of the work. `sync.py` rewrites upstream commits through it
so they cherry-pick onto main (docs/operations/upstream.md), and renaming one of our own names
means adding or changing a rule here, then running `rename_text` over our tree too.

A token is a run like `@t3tools/contracts`, `T3_HOME` or `t3-context`. A token one of our files
still uses unchanged is kept in that file (keep.txt, refreshed by `sync.py keep`), so a patch
touching it still applies; renaming that name in our tree takes it off the list.
"""

from __future__ import annotations

import os
import re

# Prose first: "T3 Code" spans two tokens.
PHRASES = [
    (re.compile(rb"\bT3 Code\b"), b"Control"),
]

# The first word of CONTROL's MCP tool names, which upstream prefixed with t3_.
_MCP_NOUNS = [
    b"attachment", b"delegate", b"device", b"environment", b"group", b"html", b"local", b"lock",
    b"loose", b"orchestrator", b"pending", b"preview", b"project", b"queue", b"request", b"run",
    b"schedule", b"task", b"terminal", b"thread", b"update", b"delete", b"list", b"worktree",
]

# The phone's native modules, as their names run together after t3.
_NATIVE_MODULES = [
    b"agentnotifications", b"composereditor", b"markdowntext", b"nativecontrols", b"reviewdiff",
    b"subscriptionwidget", b"terminal", b"widgetexpiry",
]

# Test data names a made-up repository rather than ours.
TEST_RULES = [
    (re.compile(rb"(?i)pingdotgg/t3code"), b"acme/control"),
]

# Applied in order to each token that isn't kept.
RULES = [
    (re.compile(rb"github\.com/pingdotgg/t3code"), b"github.com/RandevRanjit/control"),
    (re.compile(rb"(?<![A-Za-z0-9])pingdotgg/t3code"), b"RandevRanjit/control"),
    (re.compile(rb"@t3tools/"), b"@control/"),
    (re.compile(rb"mcp__t3-code__"), b"mcp__control__"),
    # Reverse-DNS ids (Linux desktop entries, D-Bus names, AppStream) take the bundle id's owner.
    (re.compile(rb"com\.t3tools"), b"io.github.randevranjit"),
    (re.compile(rb"/com/t3tools"), b"/io/github/randevranjit"),
    (re.compile(rb"snap-shot@t3\.codes"), b"snap-shot@randevranjit.github.io"),
    # The phone's native modules run their name together in packages, JNI symbols and libraries:
    # expo.modules.t3terminal, Java_expo_modules_t3terminal_..., loadLibrary("t3terminal").
    (re.compile(rb"(?<![A-Za-z0-9])t3(?=(?:" + b"|".join(_NATIVE_MODULES) + rb")(?![A-Za-z0-9]))"), b"control"),
    # React Native codegen prefixes the component name: RCTT3MarkdownTextViewProtocol.
    (re.compile(rb"(?<=RCT)T3(?=[A-Z])"), b"Control"),
    (re.compile(rb"T3_CODE_"), b"CONTROL_"),
    (re.compile(rb"T3CODE_"), b"CONTROL_"),
    (re.compile(rb"T3_"), b"CONTROL_"),
    (re.compile(rb"t3code"), b"control"),
    (re.compile(rb"T3Code"), b"Control"),
    (re.compile(rb"T3CODE"), b"CONTROL"),
    (re.compile(rb"t3tools"), b"control"),
    # Service keys: "t3/orchestration/..." -> "@control/server/orchestration/...".
    (re.compile(rb"^t3/"), b"@control/server/"),
    # MCP tool names lost their prefix (t3_thread_send -> thread_send); other names gained ours.
    (re.compile(rb"(?<![A-Za-z0-9])t3_(?=(?:" + b"|".join(_MCP_NOUNS) + rb")_)"), b""),
    (re.compile(rb"(?<![A-Za-z0-9])t3_"), b"control_"),
    (re.compile(rb"(?<![A-Za-z0-9])t3-code(?![A-Za-z0-9-])"), b"control"),
    (re.compile(rb"(?<![A-Za-z0-9])t3(?=[A-Z])"), b"control"),
    (re.compile(rb"(?<=[a-z])T3(?=[A-Z_]|$)"), b"Control"),
    (re.compile(rb"(?<![A-Za-z0-9])T3(?=[A-Z])"), b"Control"),
    (re.compile(rb"(?<![A-Za-z0-9])t3-"), b"control-"),
    (re.compile(rb"(?<![A-Za-z0-9])\.t3(?![A-Za-z0-9])"), b".control"),
    (re.compile(rb"(?<![A-Za-z0-9])t3(?![A-Za-z0-9])"), b"control"),
    (re.compile(rb"(?<![A-Za-z0-9])T3(?![A-Za-z0-9])"), b"Control"),
]

# Whole paths or path pieces, applied to each path before the token rules.
PATH_RULES = [
    (re.compile(rb"^\.agents/skills/test-t3-(app|mobile)/"), rb".claude/skills/test-\1/"),
    (re.compile(rb"^t3\.json$"), b"control.json"),
]

TOKEN = re.compile(rb"[A-Za-z0-9_@./:-]*(?:t3|T3)[A-Za-z0-9_@./:-]*")

# Base64 data, such as an image inside an SVG, can spell t3 by chance: a long run with digits in
# it is data, and its tokens stay as they are.
BLOB = re.compile(rb"[A-Za-z0-9+/]{60,}")
BLOB_MIN_DIGITS = 4


def _is_name(token: bytes) -> bool:
    """`t3`/`T3` as a name, not inside `uint32`, `result3` or `T35`."""
    for match in re.finditer(rb"t3|T3", token):
        start, end = match.span()
        before = token[start - 1 : start]
        after = token[end : end + 1]
        if after.isdigit():
            continue
        if not before or not before.isalnum():
            return True
        if match.group() == b"T3" and (before.islower() or token[:start].endswith(b"RCT")):
            return True
    return False


_KEEP_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "keep.txt")


def load_keep() -> dict[bytes, frozenset[bytes]]:
    """keep.txt: `<our path>\t<token>` per line."""
    by_path: dict[bytes, set[bytes]] = {}
    try:
        with open(_KEEP_FILE, "rb") as file:
            for line in file:
                path, _, token = line.rstrip(b"\n").partition(b"\t")
                if token:
                    by_path.setdefault(path, set()).add(token)
    except FileNotFoundError:
        pass
    return {path: frozenset(tokens) for path, tokens in by_path.items()}


KEEP = load_keep()


def rename_token(token: bytes, keep: frozenset[bytes] = frozenset()) -> bytes:
    if token in keep or not _is_name(token):
        return token
    for pattern, replacement in RULES:
        token = pattern.sub(replacement, token)
    return token


def rename_text(data: bytes, path: bytes | None = None) -> bytes:
    """`path` is our path for the file, whose kept names stay as they are."""
    if b"t3" not in data and b"T3" not in data:
        return data
    keep = KEEP.get(path, frozenset()) if path is not None else frozenset()
    if path is not None and (b".test." in path or b"/fixtures/" in path):
        for pattern, replacement in TEST_RULES:
            data = pattern.sub(replacement, data)
    for pattern, replacement in PHRASES:
        data = pattern.sub(lambda match: match.group() if b"T3" in keep else replacement, data)
    blobs = [
        blob.span()
        for blob in BLOB.finditer(data)
        if sum(byte in b"0123456789" for byte in blob.group()) >= BLOB_MIN_DIGITS
    ]

    def rename(match: re.Match[bytes]) -> bytes:
        if any(start <= match.start() < end for start, end in blobs):
            return match.group()
        return rename_token(match.group(), keep)

    return TOKEN.sub(rename, data)


def rename_path(path: bytes) -> bytes:
    for pattern, replacement in PATH_RULES:
        path = pattern.sub(replacement, path)
    return b"/".join(TOKEN.sub(lambda match: rename_token(match.group()), part) for part in path.split(b"/"))
