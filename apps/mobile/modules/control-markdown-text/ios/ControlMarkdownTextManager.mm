#import <React/RCTViewManager.h>
#import <React/RCTUIManager.h>
#import "Utils.h"

@interface ControlMarkdownTextManager : RCTViewManager
@end

@implementation ControlMarkdownTextManager

RCT_EXPORT_MODULE(ControlMarkdownText)

- (UIView *)view
{
  return [[UIView alloc] init];
}

RCT_CUSTOM_VIEW_PROPERTY(color, NSString, UIView)
{
}

@end

@interface ControlMarkdownTextRunManager : RCTViewManager
@end

@implementation ControlMarkdownTextRunManager

RCT_EXPORT_MODULE(ControlMarkdownTextRun)

- (UIView *)view
{
  return nil;
}

@end
