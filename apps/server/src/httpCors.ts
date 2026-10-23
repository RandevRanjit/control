import {
  LEGACY_ORCHESTRATION_PROTOCOL_HEADER,
  ORCHESTRATION_PROTOCOL_HEADER,
} from "@control/contracts";

export const browserApiCorsAllowedMethods = ["GET", "POST", "OPTIONS"] as const;
export const browserApiCorsAllowedHeaders = [
  "authorization",
  "b3",
  "traceparent",
  "content-type",
  "dpop",
  ORCHESTRATION_PROTOCOL_HEADER,
  LEGACY_ORCHESTRATION_PROTOCOL_HEADER,
] as const;
