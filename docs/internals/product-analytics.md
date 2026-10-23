# Product analytics

The server owns local recording and opt-out for every connected client. Events stay on the
machine: CONTROL keeps telemetry local so later sessions can read it to tune CONTROL. There is
no identity; every event in the file belongs to this installation. Client-use events require an
authenticated connection.

## Attribution boundaries

Client dimensions belong to the event's WebSocket connection. A server-global
"current client" would misattribute simultaneous web, desktop, and mobile use.
Provider execution has its own events because a turn can outlive the requesting
connection.

Keep client and server dimensions separate. A desktop host can serve a phone or a
remote browser, and a direct connection can cross a network. Older clients omit
metadata. Missing client values must stay unknown rather than being backfilled
from server properties. The legacy `clientType` property describes how the server
runs; use `surface` for the connected client.

## Interpreting events

Use `client.turn.requested` for active-use reports. `client.connected` counts
reconnects, so network behavior can inflate it.

Provider send and completion counts need not match. Providers can emit synthetic
turns without a send request. Collection is best effort, with no scan or backfill
of provider history.

Token totals cover the main agent. Child agents and model rerouting prevent a turn
from representing one provider/model combination's full cost. For provider
comparisons, require complete usage, no observed subagents, and no mixed models;
compare matching model, effort, interaction mode, and terminal status. Aggregate
output/input ratios should divide the summed totals. Averaging per-turn ratios
lets small-input turns dominate.

Unknown counts stay absent. Partial usage contains valid observed counts but
cannot establish a whole-turn total. Keep these distinctions when changing token
normalization or building reports.

## Storage

[The service](../../apps/server/src/telemetry/AnalyticsService.ts) buffers events in
memory, gives each a uuid when it is recorded, and appends them once a second (and on
shutdown) to `telemetry.jsonl` in the server's state folder, one JSON object per line.
Past 10 MB the file rotates to `telemetry.1.jsonl`. A failed write drops its events:
telemetry is best effort.

## Collection boundary

Keep analytics payloads to product metadata and normalized measurements. Do not
record prompts, authentication material, raw provider payloads, user-assigned device
names, or conversation identifiers. Client metadata is best effort; invalid values
must not reject a connection.
