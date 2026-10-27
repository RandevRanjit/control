import { CheckIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "../../lib/utils";
import { AnimatedHeight } from "../AnimatedHeight";
import { DialogPopup, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./dialog";

/** Compose a wizard from its header, panel, and footer; flow logic stays with the caller. */
export function WizardPopup({
  children,
  size = "default",
  ...props
}: Omit<ComponentProps<typeof DialogPopup>, "className" | "style"> & {
  readonly size?: "default" | "wide";
}) {
  return (
    <DialogPopup
      {...props}
      className={cn(
        "overflow-x-hidden overflow-y-auto",
        size === "wide" ? "max-w-3xl" : "max-w-xl",
      )}
    >
      <div className="flex min-h-0 flex-col">{children}</div>
    </DialogPopup>
  );
}

export function WizardHeader({
  title,
  description,
  identity,
  children,
}: {
  readonly title: ReactNode;
  readonly description?: ReactNode;
  /** Optional branding shown in place of the visible title. The title remains accessible. */
  readonly identity?: ReactNode;
  readonly children?: ReactNode;
}) {
  return (
    <DialogHeader>
      <DialogTitle className={identity ? "sr-only" : undefined}>{title}</DialogTitle>
      {identity}
      {description ? <DialogDescription>{description}</DialogDescription> : null}
      {children}
    </DialogHeader>
  );
}

export function WizardFooter({
  children,
  leading,
}: {
  readonly children: ReactNode;
  readonly leading?: ReactNode;
}) {
  return (
    <DialogFooter variant="bare" className={leading ? "sm:justify-between" : undefined}>
      {leading}
      {leading ? (
        <div className="flex flex-col-reverse gap-2 sm:flex-row">{children}</div>
      ) : (
        children
      )}
    </DialogFooter>
  );
}

export function WizardSteps({
  steps,
  currentStep,
  summaries,
  showSummaries = false,
  onStepChange,
  isStepDisabled,
}: {
  readonly steps: readonly string[];
  readonly currentStep: number;
  readonly summaries?: readonly (string | null)[];
  readonly showSummaries?: boolean;
  readonly isStepDisabled?: (step: number) => boolean;
  readonly onStepChange?: (step: number) => void;
}) {
  const Step = onStepChange ? "button" : "div";
  // Design §22 (SC4): the steps are pearls joined by a seam, the current one in strong ink.
  return (
    <ol className="s-sc-steps" role="list" aria-label="Setup progress">
      {steps.map((step, index) => (
        <li key={step} className="flex min-w-0 items-center">
          <Step
            {...(onStepChange
              ? { type: "button" as const, disabled: isStepDisabled?.(index) }
              : {})}
            className={cn(
              "s-sc-step min-w-0 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring",
              onStepChange && "cursor-pointer disabled:cursor-default",
            )}
            data-on={index === currentStep ? "" : undefined}
            aria-current={index === currentStep ? "step" : undefined}
            aria-label={`${step}, step ${index + 1}${index < currentStep && summaries?.[index] ? `, ${summaries?.[index]}` : ""}`}
            onClick={onStepChange ? () => onStepChange(index) : undefined}
          >
            <span className="pearl count" aria-hidden>
              {index < currentStep ? <CheckIcon className="size-3 shrink-0" /> : index + 1}
            </span>
            <span className="min-w-0 truncate max-sm:hidden">
              {step}
              {showSummaries && index < currentStep && summaries?.[index]
                ? `: ${summaries[index]}`
                : null}
            </span>
          </Step>
        </li>
      ))}
    </ol>
  );
}

export function WizardPanel({
  children,
  holdHeight = false,
  className,
}: {
  readonly children: ReactNode;
  readonly holdHeight?: boolean;
  readonly className?: string;
}) {
  return (
    <div data-slot="dialog-panel" className={cn("min-w-0 space-y-4 px-6 py-5", className)}>
      <AnimatedHeight holdHeight={holdHeight}>{children}</AnimatedHeight>
    </div>
  );
}
