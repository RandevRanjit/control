#!/usr/bin/env bash
# Builds Control from this checkout's main and installs it into /Applications.
#
#   scripts/update-mac-app.sh
#
# Refuses uncommitted changes, since the build reads the working tree. Control keeps
# running through the build; the script quits it only for the swap, after asking. The
# database and the old app go to a dated folder in ~/control-v1-backup.noindex first.
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
target="/Applications/Control.app"
userdata="${CONTROL_HOME:-$HOME/.control}/userdata"
backup="$HOME/control-v1-backup.noindex/$(date +%Y-%m-%d-%H%M%S)"
log="${TMPDIR:-/tmp}/control-update.log"

die() {
  echo "update-mac-app: $*" >&2
  exit 1
}

cd "$repo"
[[ "$(git symbolic-ref --short HEAD)" == "main" ]] || die "the checkout isn't on main."
[[ -z "$(git status --porcelain --untracked-files=no)" ]] ||
  die "the checkout has uncommitted changes; an agent may be mid-edit. Nothing was changed."
commit="$(git rev-parse --short=12 HEAD)"

# The repo pins Node 24, and a newer default node can't build it.
node_bin=""
for candidate in "$(command -v node || true)" "${N_PREFIX:-$HOME/.local/n}/bin/node"; do
  if [[ -x "$candidate" && "$("$candidate" --version)" == v24.* ]]; then
    node_bin="$candidate"
    break
  fi
done
[[ -n "$node_bin" ]] || die "needs Node 24 on PATH."
export PATH="$(dirname "$node_bin"):$repo/node_modules/.bin:$PATH"

case "$(uname -m)" in
  arm64) arch="arm64" ;;
  x86_64) arch="x64" ;;
  *) die "unsupported architecture $(uname -m)." ;;
esac

# The build stages the app under TMPDIR, so a private one makes it easy to find and remove.
build_tmp="$(mktemp -d -t control-update)"
trap 'rm -rf "$build_tmp"' EXIT

echo "Building Control from $commit (a few minutes; log: $log)…"
corepack pnpm install --frozen-lockfile >"$log" 2>&1 || die "installing dependencies failed; see $log."
TMPDIR="$build_tmp" node scripts/build-desktop-artifact.ts --platform mac --target dir \
  --arch "$arch" --keep-stage --output-dir "$build_tmp/out" >>"$log" 2>&1 ||
  die "the build failed; see $log. Nothing was changed."
built="$(echo "$build_tmp"/control-desktop-mac-stage-*/app/dist/mac-*/Control.app)"
[[ -d "$built" ]] || die "the build finished but its Control.app is missing; see $log."
version="$(plutil -extract CFBundleShortVersionString raw "$built/Contents/Info.plist")"
bundle_id="$(plutil -extract CFBundleIdentifier raw "$built/Contents/Info.plist")"
echo "Built Control $version ($commit)."

running() { [[ "$(osascript -e "application id \"$bundle_id\" is running")" == "true" ]]; }
if running; then
  read -r -p "Quit Control now? Check no chat is mid-turn. [y/N] " answer
  [[ "$answer" == [yY]* ]] || die "left Control running. Nothing was changed."
  osascript -e "tell application id \"$bundle_id\" to quit" >/dev/null || true
  # The server closes the database after the window goes, so wait for both.
  for _ in $(seq 120); do
    if ! running && [[ -z "$(lsof -t "$userdata/statev2.sqlite" 2>/dev/null)" ]]; then break; fi
    sleep 1
  done
  if running || [[ -n "$(lsof -t "$userdata/statev2.sqlite" 2>/dev/null)" ]]; then
    die "Control didn't quit within 2 minutes. Nothing was changed."
  fi
fi

mkdir -p "$backup"
cp "$userdata"/statev2.sqlite* "$backup/"
# A run that stopped after this move left no app behind, so a rerun skips it.
if [[ -d "$target" ]]; then mv "$target" "$backup/"; fi
ditto "$built" "$target"
open "$target"

installed="$(plutil -extract CFBundleShortVersionString raw "$target/Contents/Info.plist")"
echo "Installed Control $installed ($commit); the old app and database are in $backup."
echo "Check Control → About Control reads Version $installed ($commit)."
