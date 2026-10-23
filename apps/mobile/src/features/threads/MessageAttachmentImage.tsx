import type { EnvironmentId } from "@control/contracts";
import { useId, useMemo, useRef } from "react";
import { ActivityIndicator, Image, Pressable, View } from "react-native";

import type { FilePreviewSource } from "../../components/FilePreviewModal";
import { PresentationSource } from "../../components/NativePresentation";
import { useAssetUrl, useRefreshAssetUrl } from "../../state/assets";

/** A sent picture's tile: a message's attachments, and an answered question's. */
export function MessageAttachmentImage(props: {
  readonly environmentId: EnvironmentId;
  readonly attachmentId: string;
  readonly name: string;
  readonly mimeType: string;
  readonly className: string;
  readonly onPressPreview: (source: FilePreviewSource) => void;
}) {
  const sourceIdentifier = useId();
  const resource = useMemo(
    () => ({
      _tag: "attachment" as const,
      attachmentId: props.attachmentId,
      fileName: props.name,
      mimeType: props.mimeType,
    }),
    [props.attachmentId, props.name, props.mimeType],
  );
  const uri = useAssetUrl(props.environmentId, resource);
  const refreshAssetUrl = useRefreshAssetUrl(props.environmentId, resource);
  const retriedImage = useRef(false);

  if (uri === null) {
    return (
      <View className={`${props.className} items-center justify-center`}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <PresentationSource identifier={sourceIdentifier}>
      <Pressable
        accessibilityRole="imagebutton"
        accessibilityLabel={`Open ${props.name}`}
        onPress={() =>
          // The viewer mints its own URL from the resource so the image survives a refresh.
          props.onPressPreview({
            kind: "image",
            environmentId: props.environmentId,
            resource,
            name: props.name,
            sourceIdentifier,
            actionsSource: {
              name: props.name,
              mimeType: props.mimeType,
              environmentId: props.environmentId,
              resource,
            },
          })
        }
      >
        <Image
          source={{ uri }}
          className={props.className}
          resizeMode="cover"
          onLoad={() => {
            retriedImage.current = false;
          }}
          onError={() => {
            if (retriedImage.current) return;
            retriedImage.current = true;
            void refreshAssetUrl();
          }}
        />
      </Pressable>
    </PresentationSource>
  );
}
