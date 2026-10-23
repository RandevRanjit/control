#pragma once

#include "ControlMarkdownTextRunShadowNode.h"

#include <react/renderer/core/ConcreteComponentDescriptor.h>
#include <react/renderer/componentregistry/ComponentDescriptorProviderRegistry.h>

namespace facebook::react {
using ControlMarkdownTextRunComponentDescriptor = ConcreteComponentDescriptor<ControlMarkdownTextRunShadowNode>;

void ControlMarkdownTextRunSpec_registerComponentDescriptorsFromCodegen(
  std::shared_ptr<const ComponentDescriptorProviderRegistry> registry);
}
