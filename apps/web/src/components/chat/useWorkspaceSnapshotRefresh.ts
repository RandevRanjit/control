import {
  PROVIDER_WORKSPACE_SNAPSHOT_TTL_MS,
  type EnvironmentId,
  type ServerProvider,
} from "@control/contracts";
import {
  hasCurrentProviderWorkspaceSnapshot,
  hasRefreshedProviderWorkspaceSnapshot,
  providerWorkspaceSnapshotState,
} from "@control/client-runtime/providerSkills";
import { RegistryContext } from "@effect/atom-react";
import { useContext, useEffect, useRef, useState } from "react";

import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";

const WORKSPACE_SNAPSHOT_RETRY_COOLDOWN_MS = 10_000;
// A cwd that never scans, such as a deleted worktree, would otherwise retry forever.
const WORKSPACE_SNAPSHOT_MAX_ATTEMPTS = 3;

/**
 * Keeps the composer's provider scanning `cwd` for workspace commands and skills: one scan
 * per snapshot TTL, a cooldown retry for a failed or partial scan, at most three failed
 * attempts per cwd, and a fresh start when the cwd's snapshot is dropped.
 */
export function useWorkspaceSnapshotRefresh({
  environmentId,
  instanceId,
  cwd,
  providerStatus,
  draft,
}: {
  readonly environmentId: EnvironmentId;
  readonly instanceId: ServerProvider["instanceId"] | undefined;
  readonly cwd: string | null;
  readonly providerStatus: ServerProvider | null;
  /** Each edit re-checks, so a retry waiting for one runs then. */
  readonly draft: string;
}) {
  const refreshProviders = useAtomCommand(serverEnvironment.refreshProviders, {
    reportFailure: false,
  });
  const registry = useContext(RegistryContext);
  const workspaceSnapshotState = providerWorkspaceSnapshotState(providerStatus, cwd);
  // The last scan this composer asked for. A request inside the TTL is not
  // repeated, so a client clock ahead of the server's cannot loop rescans.
  const workspaceRefreshKeyRef = useRef<{ key: string; requestedAt: number } | null>(null);
  // Failed scans per scope, so a cwd that never answers keeps its limit while others are used.
  const failedRefreshesRef = useRef(new Map<string, number>());
  // `armed`: the provider answers with workspace snapshots, so the retry fires on its own.
  // Otherwise it waits for a published partial snapshot or the next edit.
  const [workspaceRefreshRetry, setWorkspaceRefreshRetry] = useState<{
    key: string;
    notBefore: number;
    armed: boolean;
  } | null>(null);
  const workspaceRefreshScopeKey =
    cwd && instanceId ? `${environmentId}:${instanceId}:${cwd}` : null;
  useEffect(() => {
    if (
      !workspaceRefreshRetry ||
      workspaceRefreshRetry.key !== workspaceRefreshScopeKey ||
      (!workspaceRefreshRetry.armed && workspaceSnapshotState !== "pending")
    )
      return;
    const timeout = setTimeout(
      () => {
        setWorkspaceRefreshRetry((current) => (current === workspaceRefreshRetry ? null : current));
      },
      Math.max(0, workspaceRefreshRetry.notBefore - Date.now()),
    );
    return () => clearTimeout(timeout);
  }, [workspaceRefreshRetry, workspaceRefreshScopeKey, workspaceSnapshotState]);
  const lastWorkspaceSnapshotRef = useRef<{
    key: string | null;
    state: typeof workspaceSnapshotState;
  } | null>(null);
  useEffect(() => {
    const last = lastWorkspaceSnapshotRef.current;
    lastWorkspaceSnapshotRef.current = {
      key: workspaceRefreshScopeKey,
      state: workspaceSnapshotState,
    };
    if (workspaceRefreshScopeKey === null || last?.key !== workspaceRefreshScopeKey) return;
    // A finished snapshot shows the cwd answers, so earlier failed scans no longer count.
    if (workspaceSnapshotState === "complete" && last.state !== "complete") {
      failedRefreshesRef.current.delete(workspaceRefreshScopeKey);
    }
    const lost =
      (last.state === "complete" && workspaceSnapshotState !== "complete") ||
      (last.state === "pending" && workspaceSnapshotState === "absent");
    if (!lost) return;
    // This cwd's snapshot was dropped (a reconfigure, or a rescan the server started over),
    // so earlier scans and failed attempts say nothing about the next one.
    workspaceRefreshKeyRef.current = null;
    failedRefreshesRef.current.delete(workspaceRefreshScopeKey);
    setWorkspaceRefreshRetry(null);
  }, [workspaceRefreshScopeKey, workspaceSnapshotState]);
  useEffect(() => {
    if (!cwd || !instanceId) return;
    const key = `${environmentId}:${instanceId}:${cwd}`;
    const now = Date.now();
    const lastRequest = workspaceRefreshKeyRef.current;
    if (
      lastRequest?.key === key &&
      now - lastRequest.requestedAt < PROVIDER_WORKSPACE_SNAPSHOT_TTL_MS
    )
      return;
    if (hasCurrentProviderWorkspaceSnapshot(providerStatus, cwd, now)) {
      setWorkspaceRefreshRetry(null);
      return;
    }
    const retry = workspaceRefreshRetry;
    if (retry?.key === key && now < retry.notBefore) return;
    const request = { key, requestedAt: now };
    workspaceRefreshKeyRef.current = request;
    const retryLater = (armed: boolean) => {
      if (workspaceRefreshKeyRef.current !== request) return;
      const count = (failedRefreshesRef.current.get(key) ?? 0) + 1;
      failedRefreshesRef.current.set(key, count);
      // Keeping the request marker lets the TTL hold off the next scan.
      if (count >= WORKSPACE_SNAPSHOT_MAX_ATTEMPTS) return;
      workspaceRefreshKeyRef.current = null;
      setWorkspaceRefreshRetry({
        key,
        notBefore: Date.now() + WORKSPACE_SNAPSHOT_RETRY_COOLDOWN_MS,
        armed,
      });
    };
    void refreshProviders({ environmentId, input: { instanceId, cwd } }).then(
      (result) => {
        if (result._tag !== "Success") return retryLater(true);
        const answered = result.value.providers.find(
          (provider) => provider.instanceId === instanceId,
        );
        if (
          hasRefreshedProviderWorkspaceSnapshot(
            registry.get(serverEnvironment.configValueAtom(environmentId)),
            result.value.providers,
            instanceId,
            cwd,
          )
        ) {
          failedRefreshesRef.current.delete(key);
          return;
        }
        // An answer without this cwd's snapshot comes from a provider without workspace discovery.
        retryLater(providerWorkspaceSnapshotState(answered, cwd) !== "absent");
      },
      () => retryLater(true),
    );
  }, [
    cwd,
    draft,
    environmentId,
    instanceId,
    providerStatus,
    refreshProviders,
    registry,
    workspaceRefreshRetry,
  ]);
}
