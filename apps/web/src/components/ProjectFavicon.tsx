import type { EnvironmentProject } from "@control/client-runtime/state/shell";
import {
  getProjectFaviconResourceKey,
  isProjectFaviconFallbackUrl,
} from "@control/shared/projectFavicon";
import { FolderCodeIcon } from "lucide-react";
import type { ComponentType } from "react";
import { createElement, lazy, Suspense, useState } from "react";
import { useAtomValue } from "@effect/atom-react";
import { projectFaviconUrlAtom } from "../state/assets";
import { projectIconColorClassName } from "../projectIconColors";
import { projectMonogram, projectTint } from "./control/cardState";
import { ProjectMonogram } from "./ProjectMonogram";
import { cn } from "~/lib/utils";

// All lucide icons load as one chunk, only once a project uses a lucide override.
const LucideProjectIcon = lazy(() =>
  import("../lib/lucideIconByName").then(({ lucideIconByName }) => ({
    default: function LucideProjectIcon(props: { name: string; className: string }) {
      return createElement(lucideIconByName(props.name) ?? FolderCodeIcon, {
        className: props.className,
      });
    },
  })),
);

function DynamicProjectIconFallback() {
  return <FolderCodeIcon className="size-full text-inherit" />;
}

// The slice of a project that decides its icon. Every surface must pass the
// project record itself (or a snapshot spread from it) so the saved title, favicon
// and icon override always travel together. Passing a display label as the title
// changes the automatic icon, which is how the command palette drifted once.
export type ProjectFaviconProject = Pick<
  EnvironmentProject,
  "id" | "environmentId" | "workspaceRoot" | "title" | "faviconPath" | "projectIcon" | "tint"
>;
export function ProjectFavicon(input: {
  project: ProjectFaviconProject;
  className?: string | undefined;
  fallbackIcon?: ComponentType<{ className?: string }>;
}) {
  const { project } = input;
  const src = useAtomValue(
    projectFaviconUrlAtom({
      environmentId: project.environmentId,
      cwd: project.workspaceRoot,
      faviconPath: project.faviconPath,
    }),
  );
  if (project.projectIcon?.kind === "monogram") {
    return (
      <ProjectMonogram
        text={project.projectIcon.text}
        color={project.projectIcon.color}
        className={input.className}
      />
    );
  }
  if (project.projectIcon?.kind === "emoji") {
    return (
      <ProjectFaviconFallback
        className={input.className}
        icon={FolderCodeIcon}
        emoji={project.projectIcon.emoji}
      />
    );
  }
  if (project.projectIcon?.kind === "lucide") {
    const colorClassName = projectIconColorClassName(project.projectIcon.color);
    const iconClassName = cn(
      "inline-flex size-3.5 shrink-0 items-center justify-center",
      colorClassName,
      input.className,
    );
    return (
      <span aria-hidden="true" className={iconClassName}>
        <Suspense fallback={<DynamicProjectIconFallback />}>
          <LucideProjectIcon
            name={project.projectIcon.name}
            className={cn("size-full", colorClassName)}
          />
        </Suspense>
      </span>
    );
  }
  const FallbackIcon = input.fallbackIcon ?? FolderCodeIcon;

  if (!src || isProjectFaviconFallbackUrl(src)) {
    return (
      <ProjectFaviconFallback className={input.className} icon={FallbackIcon} project={project} />
    );
  }

  const cacheKey = getProjectFaviconResourceKey(
    project.environmentId,
    project.workspaceRoot,
    project.faviconPath,
  );

  return (
    <ProjectFaviconImage
      key={cacheKey}
      src={src}
      className={input.className}
      fallbackIcon={FallbackIcon}
      fallbackProject={project}
    />
  );
}

// The sidebar card's project mark (.t3-fav): the monogram on the project's identity
// tint, scaled to whatever slot the surface gives it.
function ProjectMark({
  project,
  className,
}: {
  readonly project: ProjectFaviconProject;
  readonly className?: string | undefined;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-flex size-4 shrink-0 items-center justify-center", className)}
    >
      <svg
        viewBox="0 0 16 16"
        className="size-full rounded-[25%] select-none"
        style={{ background: `var(--id-${project.tint ?? projectTint(project.id)})` }}
      >
        <text
          x="8"
          y="10.7"
          textAnchor="middle"
          fontSize="7.5"
          fontWeight="600"
          style={{ fill: "var(--raised)", fontFamily: "var(--f-mono)" }}
        >
          {projectMonogram(project.title)}
        </text>
      </svg>
    </span>
  );
}

function ProjectFaviconFallback({
  className,
  icon: Icon,
  emoji,
  project,
}: {
  readonly className?: string | undefined;
  readonly icon: ComponentType<{ className?: string }>;
  readonly emoji?: string | undefined;
  readonly project?: ProjectFaviconProject | undefined;
}) {
  if (project && project.title.trim().length > 0) {
    return <ProjectMark project={project} className={className} />;
  }

  if (emoji) {
    return (
      <span
        aria-hidden="true"
        className={cn(
          "inline-flex size-3.5 shrink-0 items-center justify-center leading-none [container-type:size]",
          className,
        )}
      >
        <span className="text-[length:80cqh] leading-none">{emoji}</span>
      </span>
    );
  }

  return <Icon className={cn("size-3.5 shrink-0 text-icon-muted", className)} />;
}

function ProjectFaviconImage({
  src,
  className,
  fallbackIcon: FallbackIcon,
  fallbackProject,
}: {
  readonly src: string;
  readonly className?: string | undefined;
  readonly fallbackIcon: ComponentType<{ className?: string }>;
  readonly fallbackProject?: ProjectFaviconProject | undefined;
}) {
  const [displayedSrc, setDisplayedSrc] = useState<string | null>(() =>
    src.startsWith("data:image/") ? src : null,
  );
  const isLoading = displayedSrc !== src;
  const handleLoadError = (failedSrc: string) => {
    setDisplayedSrc((currentSrc) => (currentSrc === failedSrc ? null : currentSrc));
  };

  return (
    <>
      {displayedSrc === null ? (
        <ProjectFaviconFallback
          className={className}
          icon={FallbackIcon}
          project={fallbackProject}
        />
      ) : null}
      {displayedSrc ? (
        <img
          src={displayedSrc}
          alt=""
          className={cn("size-3.5 shrink-0 rounded-[25%] object-contain", className)}
          onError={() => handleLoadError(displayedSrc)}
        />
      ) : null}
      {isLoading ? (
        <img
          src={src}
          alt=""
          className="hidden"
          onLoad={() => {
            setDisplayedSrc(src);
          }}
          onError={() => handleLoadError(src)}
        />
      ) : null}
    </>
  );
}
