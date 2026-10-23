# Backlog

Work the owner wants, not yet scheduled. Newest last.

- **Upstream watch (9 Oct).** Watch `pingdotgg/t3code` (main and the nightly tags) for new features, changelogs and bug fixes, and port the ones worth having into CONTROL, since the engine is the same. A scheduled job (CI or a CONTROL task) writes a digest of what changed and why, grouped by area (Claude provider, orchestration, server, web, desktop); the owner picks, and each pick is ported by hand. After the internal-id rename, upstream patches no longer apply as-is, so the digest has to explain the change, not just link the patch.
