import type { VcsCommit, VcsCommitFile } from "@control/contracts";

/** `git log --format` for {@link parseCommitLog}: fields split by US, commits ended by RS. */
export const COMMIT_LOG_FORMAT = "%H%x1f%P%x1f%an%x1f%aI%x1f%D%x1f%s%x1e";

/**
 * `%D` reads `HEAD -> main, origin/main, origin/HEAD, tag: v1`. The panel shows the names:
 * `HEAD` first when it points here, the remote's symbolic HEAD dropped, tags by their name.
 */
export function parseCommitRefs(decoration: string): string[] {
  return decoration
    .split(", ")
    .map((ref) => ref.trim())
    .filter((ref) => ref.length > 0 && !/^[^/]+\/HEAD$/.test(ref))
    .flatMap((ref) => {
      if (ref.startsWith("HEAD -> ")) return ["HEAD", ref.slice("HEAD -> ".length)];
      if (ref.startsWith("tag: ")) return [ref.slice("tag: ".length)];
      return [ref];
    });
}

export function parseCommitLog(stdout: string): VcsCommit[] {
  return stdout
    .split("\x1e")
    .map((record) => record.replace(/^\n/, ""))
    .filter((record) => record.length > 0)
    .flatMap((record) => {
      const [sha, parents, authorName, authoredAt, decoration, subject] = record.split("\x1f");
      if (!sha || authorName === undefined || authoredAt === undefined) return [];
      return [
        {
          sha,
          parents: parents ? parents.split(" ").filter(Boolean) : [],
          subject: subject ?? "",
          authorName,
          authoredAt,
          refs: parseCommitRefs(decoration ?? ""),
        },
      ];
    });
}

const STATUSES = new Set<VcsCommitFile["status"]>(["A", "M", "D", "T"]);

/**
 * Joins `diff-tree -z --name-status` (letter, path) with `diff-tree -z --numstat`
 * (added, deleted, path); a binary file counts `-` and gets null.
 */
export function parseCommitFiles(
  nameStatus: string,
  numstat: string,
  maxFiles: number,
): { files: VcsCommitFile[]; truncated: boolean } {
  const counts = new Map<string, { additions: number | null; deletions: number | null }>();
  for (const entry of numstat.split("\0")) {
    const [added, deleted, path] = entry.split("\t");
    if (!path) continue;
    counts.set(path, {
      additions: added === "-" ? null : Number(added),
      deletions: deleted === "-" ? null : Number(deleted),
    });
  }
  const tokens = nameStatus.split("\0").filter((token) => token.length > 0);
  const files: VcsCommitFile[] = [];
  for (let index = 0; index + 1 < tokens.length; index += 2) {
    const letter = tokens[index]!.charAt(0) as VcsCommitFile["status"];
    const path = tokens[index + 1]!;
    const count = counts.get(path);
    files.push({
      path,
      status: STATUSES.has(letter) ? letter : "M",
      additions: count?.additions ?? null,
      deletions: count?.deletions ?? null,
    });
  }
  return { files: files.slice(0, maxFiles), truncated: files.length > maxFiles };
}
