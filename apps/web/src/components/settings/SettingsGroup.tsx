import type { ComponentProps } from "react";

import { cn } from "../../lib/utils";

/** Shared settings card surface (design §22, SC2), with optional seams between rows. */
export function SettingsGroup({
  variant = "grouped",
  divided = true,
  className,
  ...props
}: ComponentProps<"div"> & {
  variant?: "grouped" | "plain";
  divided?: boolean;
}) {
  return (
    <div
      {...props}
      data-divided={variant === "grouped" && divided ? "" : undefined}
      className={cn(
        "relative overflow-visible text-foreground",
        variant === "grouped" ? "s-sc-grp" : "space-y-1",
        variant === "grouped" && divided && "[&>[data-slot=settings-row]]:rounded-none",
        className,
      )}
    />
  );
}
