import type { AssetResource, EnvironmentId } from "@control/contracts";
import { useEffect, useRef, useState } from "react";

import { useAssetUrlState } from "~/assets/assetUrls";

import { AudioPreview } from "./AudioPreview";

export function InlineAudioPreview(props: {
  readonly name: string;
  readonly environmentId?: EnvironmentId;
  readonly resource?: AssetResource;
  readonly src?: string;
  readonly copyMarkdown?: string;
  readonly onOpen?: () => void;
}) {
  const container = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const asset = useAssetUrlState(
    visible ? (props.environmentId ?? null) : null,
    visible ? (props.resource ?? null) : null,
  );
  const src = visible ? (asset._tag === "Success" ? asset.url : props.src) : undefined;
  const failed = asset._tag === "Failure" || (src !== undefined && failedSrc === src);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    // Find indexes no media text, so the player's labels must not highlight either.
    <span ref={container} data-markdown-copy={props.copyMarkdown} data-thread-find-ignore="">
      <AudioPreview
        compact
        name={props.name}
        src={src ?? ""}
        revision={
          props.resource
            ? JSON.stringify([props.environmentId, props.resource])
            : (props.src ?? null)
        }
        failed={failed}
        onOpen={props.onOpen}
        onRetry={() => setFailedSrc(null)}
        onError={() => setFailedSrc(src ?? null)}
      />
    </span>
  );
}
