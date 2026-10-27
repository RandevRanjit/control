import type { ReactNode } from "react";

import { APP_STAGE_LABEL } from "../../branding";
import { StairLogo } from "../control/bloom";
import { StandalonePage } from "../ui/standalone-page";

/**
 * The CLI-connect authorize and callback pages (design §22, SC5): the stair logo and the build's stage above one
 * raised card on the plain field.
 */
export function AuthSurfaceShell({ children }: { readonly children: ReactNode }) {
  return (
    <StandalonePage
      tone="plain"
      masthead={
        <header className="s-sc-sh flex items-center gap-2 px-6 pt-6 sm:px-8 sm:pt-7">
          <StairLogo />
          <span>{APP_STAGE_LABEL}</span>
        </header>
      }
    >
      <div className="s-sc-root">{children}</div>
    </StandalonePage>
  );
}
