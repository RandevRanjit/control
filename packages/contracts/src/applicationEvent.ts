import * as Schema from "effect/Schema";

import {
  ApprovalRequestId,
  ClientSurface,
  CommandId,
  EventId,
  GroupId,
  IsoDateTime,
  NonNegativeInt,
  ProjectId,
  ProviderItemId,
  TrimmedNonEmptyString,
} from "./baseSchemas.ts";
import { RepositoryIdentity, ThreadEnvMode } from "./environment.ts";
import { GroupTint } from "./group.ts";
import { ModelSelection } from "./modelSelection.ts";
import type { OrchestrationV2StoredEvent } from "./orchestrationV2.ts";
import { ProjectScript, StoredProjectIcon } from "./project.ts";

/**
 * Which client dispatched the command that produced this event (#7774).
 * Stamped by the orchestration engine on client-dispatched commands; absent on
 * provider/server-originated events and on commands from clients too old to
 * report it.
 */
export const OrchestrationClientOrigin = Schema.Struct({
  surface: Schema.optional(ClientSurface),
  appVersion: Schema.optional(TrimmedNonEmptyString),
});
export type OrchestrationClientOrigin = typeof OrchestrationClientOrigin.Type;

/** Metadata retained by the shared application event source. */
export const ApplicationEventMetadata = Schema.Struct({
  deferredTurn: Schema.optional(Schema.Boolean),
  providerTurnId: Schema.optional(TrimmedNonEmptyString),
  providerItemId: Schema.optional(ProviderItemId),
  adapterKey: Schema.optional(TrimmedNonEmptyString),
  requestId: Schema.optional(ApprovalRequestId),
  ingestedAt: Schema.optional(IsoDateTime),
  origin: Schema.optional(OrchestrationClientOrigin),
});
export type ApplicationEventMetadata = typeof ApplicationEventMetadata.Type;

export const ApplicationProjectCreatedPayload = Schema.Struct({
  projectId: ProjectId,
  title: TrimmedNonEmptyString,
  workspaceRoot: TrimmedNonEmptyString,
  repositoryIdentity: Schema.optional(Schema.NullOr(RepositoryIdentity)),
  defaultModelSelection: Schema.NullOr(ModelSelection),
  // Per-project override for where new threads start; optional so persisted
  // events from older servers still decode.
  defaultThreadEnvMode: Schema.optional(Schema.NullOr(ThreadEnvMode)),
  // Optional so persisted events from older servers still decode.
  faviconPath: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  projectIcon: Schema.optional(Schema.NullOr(StoredProjectIcon)),
  scripts: Schema.Array(ProjectScript),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type ApplicationProjectCreatedPayload = typeof ApplicationProjectCreatedPayload.Type;

export const ApplicationProjectMetaUpdatedPayload = Schema.Struct({
  projectId: ProjectId,
  title: Schema.optional(TrimmedNonEmptyString),
  workspaceRoot: Schema.optional(TrimmedNonEmptyString),
  repositoryIdentity: Schema.optional(Schema.NullOr(RepositoryIdentity)),
  defaultModelSelection: Schema.optional(Schema.NullOr(ModelSelection)),
  // Absent = leave unchanged; null = clear the override.
  defaultThreadEnvMode: Schema.optional(Schema.NullOr(ThreadEnvMode)),
  autoPull: Schema.optional(Schema.Boolean),
  faviconPath: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  projectIcon: Schema.optional(Schema.NullOr(StoredProjectIcon)),
  tint: Schema.optional(Schema.NullOr(GroupTint)),
  scripts: Schema.optional(Schema.Array(ProjectScript)),
  updatedAt: IsoDateTime,
});
export type ApplicationProjectMetaUpdatedPayload = typeof ApplicationProjectMetaUpdatedPayload.Type;

export const ApplicationProjectDeletedPayload = Schema.Struct({
  projectId: ProjectId,
  deletedAt: IsoDateTime,
});
export type ApplicationProjectDeletedPayload = typeof ApplicationProjectDeletedPayload.Type;

const ApplicationProjectEventBaseFields = {
  sequence: NonNegativeInt,
  eventId: EventId,
  aggregateKind: Schema.Literal("project"),
  aggregateId: ProjectId,
  occurredAt: IsoDateTime,
  commandId: Schema.NullOr(CommandId),
  causationEventId: Schema.NullOr(EventId),
  correlationId: Schema.NullOr(CommandId),
  metadata: ApplicationEventMetadata,
} as const;

export const ApplicationProjectCreatedEvent = Schema.Struct({
  ...ApplicationProjectEventBaseFields,
  type: Schema.Literal("project.created"),
  payload: ApplicationProjectCreatedPayload,
});
export type ApplicationProjectCreatedEvent = typeof ApplicationProjectCreatedEvent.Type;

export const ApplicationProjectMetaUpdatedEvent = Schema.Struct({
  ...ApplicationProjectEventBaseFields,
  type: Schema.Literal("project.meta-updated"),
  payload: ApplicationProjectMetaUpdatedPayload,
});
export type ApplicationProjectMetaUpdatedEvent = typeof ApplicationProjectMetaUpdatedEvent.Type;

export const ApplicationProjectDeletedEvent = Schema.Struct({
  ...ApplicationProjectEventBaseFields,
  type: Schema.Literal("project.deleted"),
  payload: ApplicationProjectDeletedPayload,
});
export type ApplicationProjectDeletedEvent = typeof ApplicationProjectDeletedEvent.Type;

export const ApplicationProjectEvent = Schema.Union([
  ApplicationProjectCreatedEvent,
  ApplicationProjectMetaUpdatedEvent,
  ApplicationProjectDeletedEvent,
]);
export type ApplicationProjectEvent = typeof ApplicationProjectEvent.Type;

export const ApplicationGroupCreatedPayload = Schema.Struct({
  groupId: GroupId,
  name: TrimmedNonEmptyString,
  tint: GroupTint,
  homeFolder: Schema.NullOr(TrimmedNonEmptyString),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type ApplicationGroupCreatedPayload = typeof ApplicationGroupCreatedPayload.Type;

export const ApplicationGroupMetaUpdatedPayload = Schema.Struct({
  groupId: GroupId,
  name: Schema.optional(TrimmedNonEmptyString),
  tint: Schema.optional(GroupTint),
  homeFolder: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  lockedUntil: Schema.optional(IsoDateTime),
  updatedAt: IsoDateTime,
});
export type ApplicationGroupMetaUpdatedPayload = typeof ApplicationGroupMetaUpdatedPayload.Type;

export const ApplicationGroupDeletedPayload = Schema.Struct({
  groupId: GroupId,
  deletedAt: IsoDateTime,
});
export type ApplicationGroupDeletedPayload = typeof ApplicationGroupDeletedPayload.Type;

const ApplicationGroupEventBaseFields = {
  ...ApplicationProjectEventBaseFields,
  aggregateKind: Schema.Literal("group"),
  aggregateId: GroupId,
} as const;

export const ApplicationGroupCreatedEvent = Schema.Struct({
  ...ApplicationGroupEventBaseFields,
  type: Schema.Literal("group.created"),
  payload: ApplicationGroupCreatedPayload,
});
export type ApplicationGroupCreatedEvent = typeof ApplicationGroupCreatedEvent.Type;

export const ApplicationGroupMetaUpdatedEvent = Schema.Struct({
  ...ApplicationGroupEventBaseFields,
  type: Schema.Literal("group.meta-updated"),
  payload: ApplicationGroupMetaUpdatedPayload,
});
export type ApplicationGroupMetaUpdatedEvent = typeof ApplicationGroupMetaUpdatedEvent.Type;

export const ApplicationGroupDeletedEvent = Schema.Struct({
  ...ApplicationGroupEventBaseFields,
  type: Schema.Literal("group.deleted"),
  payload: ApplicationGroupDeletedPayload,
});
export type ApplicationGroupDeletedEvent = typeof ApplicationGroupDeletedEvent.Type;

export const ApplicationGroupEvent = Schema.Union([
  ApplicationGroupCreatedEvent,
  ApplicationGroupMetaUpdatedEvent,
  ApplicationGroupDeletedEvent,
]);
export type ApplicationGroupEvent = typeof ApplicationGroupEvent.Type;

/** Events exposed by the retained application event source. */
export type ApplicationStoredEvent =
  | ApplicationProjectEvent
  | ApplicationGroupEvent
  | OrchestrationV2StoredEvent;
