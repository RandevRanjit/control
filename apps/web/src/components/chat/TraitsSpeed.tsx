import type { ProviderDriverKind, ProviderOptionDescriptor } from "@control/contracts";
import { ZapIcon } from "lucide-react";
import { cn } from "~/lib/utils";
import { ComposerControlIcon, type ComposerControlSize } from "./ComposerControl";

export function getTraitsSpeedDisplay(
  descriptor: ProviderOptionDescriptor,
): { label: string; speedIcon: "fast" | null } | null {
  if (descriptor.id === "fastMode" && descriptor.type === "boolean") {
    return {
      label: descriptor.currentValue === true ? "Fast" : "Normal",
      speedIcon: descriptor.currentValue === true ? "fast" : null,
    };
  }
  return null;
}

export function TraitsSpeedIcon({
  provider,
  size = "sm",
}: {
  provider: ProviderDriverKind;
  size?: ComposerControlSize;
}) {
  return (
    <>
      <ComposerControlIcon
        icon={ZapIcon}
        size={size}
        className={cn(
          "fill-current opacity-80",
          size === "xs"
            ? "text-current"
            : provider === "claudeAgent"
              ? "text-[#d97757]"
              : "text-foreground",
        )}
      />
      <span className="sr-only">Fast mode on</span>
    </>
  );
}
