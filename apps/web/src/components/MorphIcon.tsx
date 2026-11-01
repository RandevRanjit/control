import { MorphIcon as BaseMorphIcon, type MorphIconProps } from "morphicons/react";

import { useClientSettings } from "~/hooks/useSettings";

/** Renders `lucide` icon data and morphs between shapes when `icon` changes. Settings > Reduce
 * motion makes every morph a jump; "user" leaves the OS setting to morphicons. */
export function MorphIcon({ reducedMotion, ...props }: MorphIconProps) {
  const reduceMotion = useClientSettings((settings) => settings.reduceMotion);
  return (
    <BaseMorphIcon reducedMotion={reducedMotion ?? (reduceMotion ? "always" : "user")} {...props} />
  );
}
