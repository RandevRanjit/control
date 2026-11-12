// @effect-diagnostics nodeBuiltinImport:off globalFetch:off preferSchemaOverJson:off - Host-side harness.
/** The session seed.ts writes once its fixture is in place, and how a page signs in to it. */
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import type { Page } from "playwright-core";

export interface DesignCheckSession {
  readonly origin: string;
  readonly bootstrap: string;
  readonly environmentId: string;
  readonly selectedThreadId: string;
  readonly shownAt: number;
}

export function readSession(): DesignCheckSession {
  const file = NodePath.join(NodeOS.tmpdir(), "control-design-check.json");
  return JSON.parse(NodeFS.readFileSync(file, "utf8")) as DesignCheckSession;
}

/** Trades the seeder's bootstrap token for a browser session cookie on `page`. */
export async function signIn(page: Page, session: DesignCheckSession): Promise<void> {
  const tokenResponse = await fetch(`${session.origin}/oauth/token`, {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
      subject_token: session.bootstrap,
      subject_token_type: "urn:control:params:oauth:token-type:environment-bootstrap",
      requested_token_type: "urn:ietf:params:oauth:token-type:access_token",
    }),
  });
  const { access_token } = (await tokenResponse.json()) as { access_token: string };
  const pairing = await fetch(`${session.origin}/api/auth/pairing-token`, {
    method: "POST",
    headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
    body: "{}",
  });
  const { credential } = (await pairing.json()) as { credential: string };
  await page.goto(session.origin);
  const status = await page.evaluate(async (value) => {
    const response = await fetch("/api/auth/browser-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential: value }),
    });
    return `${response.status} ${await response.text()}`;
  }, credential);
  if (!status.startsWith("200")) throw new Error(`Browser sign-in failed: ${status}`);
}
