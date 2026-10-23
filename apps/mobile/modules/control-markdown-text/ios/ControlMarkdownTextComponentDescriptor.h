#pragma once

#include "ControlMarkdownTextShadowNode.h"

#include <react/renderer/core/ConcreteComponentDescriptor.h>
#include <react/renderer/componentregistry/ComponentDescriptorProviderRegistry.h>

namespace facebook::react {
using ControlMarkdownTextComponentDescriptor = ConcreteComponentDescriptor<ControlMarkdownTextShadowNode>;

void ControlMarkdownTextSpec_registerComponentDescriptorsFromCodegen(
  std::shared_ptr<const ComponentDescriptorProviderRegistry> registry);
}
