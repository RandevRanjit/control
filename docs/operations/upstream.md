# Upstream updates

CONTROL is a hard fork of T3 Code (see LICENSE), which keeps shipping fixes and performance work.
This is how to take them, about once a month.

Our tree renames upstream's names (`@t3tools/contracts` is `@control/contracts`, and so on), so a
plain cherry-pick of an upstream commit conflicts on the names or brings the old ones back.
`scripts/upstream/renames.py` is the rename table, and `scripts/upstream/sync.py` rewrites
upstream's commits through it into `refs/upstream/renamed`, which picks onto main like our own
history. On 29 recent upstream performance commits, 16 applied cleanly once renamed; 12 applied
raw, and 2 of those brought T3 names back.

## A round

Run from the repository root:

```sh
git fetch https://github.com/pingdotgg/t3code main
python3 scripts/upstream/sync.py mirror FETCH_HEAD 5e2225671f705fcd33f1ea5591b79ba612fb6974
python3 scripts/upstream/sync.py digest <previous tip> > .plans/upstream-<date>.md
python3 scripts/upstream/sync.py pick <renamed commit>...
```

`5e22256` is the upstream commit CONTROL forked from. `mirror` is incremental through a map in
`.git/control-upstream-map` and prints the ref's previous tip; pass it to `digest` to see only
what's new, or omit it to see everything not yet picked. A fresh clone has no map, so its first
mirror rewrites all of upstream's commits since the fork, which takes a few minutes.

`digest` lists each renamed commit not yet picked, perf first, as:

- **clean**: the patch applies to HEAD. It can still need earlier upstream work: in the first
  round, one pick's test used a helper and another used `NodeSqliteClient.readOnly`, both added
  by upstream commits we hadn't taken. The gate finds these; pick the commit that added the name
  first (`git log -S<name> refs/upstream/renamed`).
- **conflict**: it overlaps our changes, or edits a file upstream added after the fork.
- **gone**: it touches only files we removed, such as other providers'. Skip it.

`pick` takes renamed commits in upstream order and commits each as `Upstream: <subject>` with
upstream's author and an `Upstream-Commit:` trailer, which is how `digest` knows it's picked. The
rest of upstream's message is dropped, so its `Co-authored-by` lines don't credit their tools in
our history. A conflicting pick stops and prints the commit command to run once it's resolved.
Each round of picks goes through the gate like our own work.

## Changing the table

`scripts/upstream/keep.txt` lists the T3 names our tree still uses unchanged, file by file, so a
patch touching one still applies. After renaming one of our own names, commit the rename, then run
`python3 scripts/upstream/sync.py keep`, which reads the committed tree. After any change to `keep.txt` or `renames.py`, delete
`.git/control-upstream-map` and mirror again: the renamed commits change, and the old ones no
longer match.
