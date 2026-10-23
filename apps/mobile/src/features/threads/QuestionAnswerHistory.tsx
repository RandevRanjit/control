import type {
  EnvironmentId,
  UserInputAttachmentAnswerPayload,
  UserInputAttachments,
} from "@control/contracts";
import { Linking, Pressable, View } from "react-native";
import { getQuestionAnswerText } from "@control/client-runtime/work-log/user-input";
import { AppText as Text } from "../../components/AppText";
import { useAssetUrl } from "../../state/assets";

function AnswerFile(props: {
  environmentId: EnvironmentId;
  attachment: UserInputAttachments[string][number];
}) {
  const url = useAssetUrl(props.environmentId, {
    _tag: "attachment",
    attachmentId: props.attachment.id,
  });
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={props.attachment.name}
      disabled={!url}
      onPress={() => {
        if (url) void Linking.openURL(url);
      }}
      className="gap-1"
    >
      <Text className="text-sm text-foreground underline">{props.attachment.name}</Text>
    </Pressable>
  );
}

export function QuestionAnswerHistory(props: {
  environmentId: EnvironmentId;
  answer: UserInputAttachmentAnswerPayload;
}) {
  return (
    <View className="gap-2">
      {[
        ...new Set([
          ...Object.keys(props.answer.questionTextById ?? {}),
          ...Object.keys(props.answer.answers),
          ...Object.keys(props.answer.attachmentsByQuestionId),
        ]),
      ].map((questionId) => (
        <View key={questionId} className="gap-1">
          {props.answer.questionTextById?.[questionId] ? (
            <Text className="text-sm text-foreground-muted">
              {props.answer.questionTextById[questionId]}
            </Text>
          ) : null}
          {getQuestionAnswerText(props.answer.answers[questionId]) ? (
            <Text className="ml-3 text-sm text-foreground-muted">
              {getQuestionAnswerText(props.answer.answers[questionId])}
            </Text>
          ) : null}
          {/* Pictures are on the row itself (ThreadWorkLogRow). */}
          {(props.answer.attachmentsByQuestionId[questionId] ?? [])
            .filter((attachment) => attachment.type !== "image")
            .map((attachment) => (
              <AnswerFile
                key={attachment.id}
                environmentId={props.environmentId}
                attachment={attachment}
              />
            ))}
        </View>
      ))}
    </View>
  );
}
