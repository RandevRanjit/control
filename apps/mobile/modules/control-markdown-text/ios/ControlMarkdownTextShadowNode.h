#pragma once

#include <react/renderer/components/ControlMarkdownTextSpec/EventEmitters.h>
#include <react/renderer/components/ControlMarkdownTextSpec/Props.h>
#include <react/renderer/components/view/ConcreteViewShadowNode.h>
#include <react/renderer/textlayoutmanager/TextLayoutManager.h>
#include <react/renderer/core/LayoutContext.h>
#include <react/renderer/core/ShadowNode.h>

#include <string>
#include <vector>

namespace facebook::react {

extern const char ControlMarkdownTextComponentName[];

struct ControlMarkdownTextParagraphStyleRange {
  size_t location;
  size_t length;
  Float firstLineHeadIndent;
  Float headIndent;
  Float paragraphSpacing;
};

struct ControlMarkdownTextAttachmentRange {
  size_t location;
  size_t length;
  std::string imageUri;
  /// Recolor the loaded image with the run's foreground color, like `sf:` symbols.
  bool tintWithForeground;
  Float chipWidth = 0;
  Float chipHeight = 0;
};

inline Float ControlMarkdownTextAttachmentSize(const ControlMarkdownTextAttachmentRange &) {
  return 14;
}

inline Float ControlMarkdownTextAttachmentBaselineOffset(
    const ControlMarkdownTextAttachmentRange &) {
  return -2;
}

class ControlMarkdownTextStateReal final {
 public:
  AttributedString attributedString;
  std::vector<ControlMarkdownTextParagraphStyleRange> paragraphStyleRanges;
  std::vector<ControlMarkdownTextAttachmentRange> attachmentRanges;
};

class ControlMarkdownTextShadowNode final : public ConcreteViewShadowNode<
ControlMarkdownTextComponentName,
ControlMarkdownTextProps,
ControlMarkdownTextEventEmitter,
ControlMarkdownTextStateReal> {
public:
  using ConcreteViewShadowNode::ConcreteViewShadowNode;

  ControlMarkdownTextShadowNode(
   const ShadowNode& sourceShadowNode,
   const ShadowNodeFragment& fragment
  );

  static ShadowNodeTraits BaseTraits() {
    auto traits = ConcreteViewShadowNode::BaseTraits();
    traits.set(ShadowNodeTraits::Trait::LeafYogaNode);
    traits.set(ShadowNodeTraits::Trait::MeasurableYogaNode);
    return traits;
  }

  void layout(LayoutContext layoutContext) override;

  Size measureContent(
      const LayoutContext& layoutContext,
      const LayoutConstraints& layoutConstraints) const override;

private:
  mutable AttributedString _attributedString;
  mutable std::vector<ControlMarkdownTextParagraphStyleRange> _paragraphStyleRanges;
  mutable std::vector<ControlMarkdownTextAttachmentRange> _attachmentRanges;
};
} // namespace facebook::React
