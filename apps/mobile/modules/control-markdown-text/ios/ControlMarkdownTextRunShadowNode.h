#pragma once

#include <react/renderer/components/ControlMarkdownTextSpec/EventEmitters.h>
#include <react/renderer/components/ControlMarkdownTextSpec/Props.h>
#include <react/renderer/components/ControlMarkdownTextSpec/States.h>
#include <react/renderer/components/view/ConcreteViewShadowNode.h>

namespace facebook::react {
extern const char ControlMarkdownTextRunComponentName[];

using ControlMarkdownTextRunShadowNode = ConcreteViewShadowNode<
    ControlMarkdownTextRunComponentName,
    ControlMarkdownTextRunProps,
    ControlMarkdownTextRunEventEmitter,
    ControlMarkdownTextRunState>;
}
