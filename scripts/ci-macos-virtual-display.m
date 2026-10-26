// CI only, never packaged: give a disposable Mac VM a large native desktop.
// CoreGraphics SPI names are documented by Chromium's own test utility:
// https://chromium.googlesource.com/chromium/src/+/HEAD/ui/display/mac/test/virtual_display_util_mac.mm
// The display exists only while this process lives. No host settings change.
#import <Foundation/Foundation.h>
#import <CoreGraphics/CoreGraphics.h>
#include <signal.h>
#include <stdio.h>

@interface CGVirtualDisplayDescriptor : NSObject
@property(nonatomic) unsigned int vendorID, productID, serialNum, serialNumber;
@property(nonatomic) unsigned int maxPixelsWide, maxPixelsHigh;
@property(nonatomic) CGSize sizeInMillimeters;
@property(nonatomic) CGPoint redPrimary, greenPrimary, bluePrimary, whitePoint;
@property(strong, nonatomic) NSString *name;
@property(strong, nonatomic) id queue;
@end
@interface CGVirtualDisplayMode : NSObject
- (id)initWithWidth:(unsigned int)width height:(unsigned int)height refreshRate:(double)rate;
@end
@interface CGVirtualDisplaySettings : NSObject
@property(strong, nonatomic) NSArray *modes;
@property(nonatomic) unsigned int hiDPI, rotation;
@end
@interface CGVirtualDisplay : NSObject
@property(readonly, nonatomic) unsigned int displayID;
- (id)initWithDescriptor:(id)descriptor;
- (BOOL)applySettings:(id)settings;
@end

static volatile sig_atomic_t alive = 1;
static CGVirtualDisplay *display;
static void stop(int signalNumber) { (void)signalNumber; alive = 0; }
static void pump(void) {
  [[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:0.1]];
  [NSThread sleepForTimeInterval:0.05];
}

int main(int argc, const char *argv[]) {
  @autoreleasepool {
    if (argc != 2) { fprintf(stderr, "usage: blanc-ci-display READY_FILE\n"); return 2; }
    Class descriptorClass = NSClassFromString(@"CGVirtualDisplayDescriptor");
    Class modeClass = NSClassFromString(@"CGVirtualDisplayMode");
    Class settingsClass = NSClassFromString(@"CGVirtualDisplaySettings");
    Class displayClass = NSClassFromString(@"CGVirtualDisplay");
    if (!descriptorClass || !modeClass || !settingsClass || !displayClass) {
      fprintf(stderr, "CoreGraphics virtual-display support unavailable\n"); return 1;
    }
    CGVirtualDisplayDescriptor *descriptor = [[descriptorClass alloc] init];
    descriptor.name = @"Blanc isolated CI";
    descriptor.vendorID = 0x424c;
    descriptor.productID = 1;
    descriptor.serialNum = descriptor.serialNumber = 1;
    descriptor.maxPixelsWide = 1920;
    descriptor.maxPixelsHigh = 1200;
    descriptor.sizeInMillimeters = CGSizeMake(508, 317.5);
    descriptor.redPrimary = CGPointMake(0.64, 0.33);
    descriptor.greenPrimary = CGPointMake(0.30, 0.60);
    descriptor.bluePrimary = CGPointMake(0.15, 0.06);
    descriptor.whitePoint = CGPointMake(0.3127, 0.3290);
    descriptor.queue = dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0);
    display = [[displayClass alloc] initWithDescriptor:descriptor];
    CGVirtualDisplaySettings *settings = [[settingsClass alloc] init];
    settings.hiDPI = 0;
    settings.rotation = 0;
    settings.modes = @[[[modeClass alloc] initWithWidth:1920 height:1200 refreshRate:60]];
    if (!display || ![display applySettings:settings]) {
      fprintf(stderr, "could not create CI virtual display\n"); return 1;
    }
    for (int attempt = 0; attempt < 100; attempt++) {
      pump();
      if (CGDisplayIsActive(display.displayID)) break;
    }
    CGDirectDisplayID ids[32];
    uint32_t count = 0;
    CGDisplayConfigRef config = NULL;
    if (CGGetActiveDisplayList(32, ids, &count) != kCGErrorSuccess ||
        CGBeginDisplayConfiguration(&config) != kCGErrorSuccess) return 1;
    int offset = 1920;
    for (uint32_t i = 0; i < count; i++) {
      if (ids[i] == display.displayID) continue;
      if (CGConfigureDisplayOrigin(config, ids[i], offset, 0) != kCGErrorSuccess) {
        CGCancelDisplayConfiguration(config); return 1;
      }
      offset += (int)CGDisplayBounds(ids[i]).size.width;
    }
    if (CGConfigureDisplayOrigin(config, display.displayID, 0, 0) != kCGErrorSuccess ||
        CGCompleteDisplayConfiguration(config, kCGConfigureForSession) != kCGErrorSuccess) return 1;
    for (int attempt = 0; attempt < 100 && CGMainDisplayID() != display.displayID; attempt++) pump();
    CGRect bounds = CGDisplayBounds(display.displayID);
    if (CGMainDisplayID() != display.displayID || bounds.size.width < 1920 || bounds.size.height < 1200) {
      fprintf(stderr, "CI virtual display is not the required primary desktop\n"); return 1;
    }
    NSString *ready = [NSString stringWithUTF8String:argv[1]];
    NSString *record = [NSString stringWithFormat:@"display=%u width=%.0f height=%.0f\n", display.displayID, bounds.size.width, bounds.size.height];
    if (![record writeToFile:ready atomically:YES encoding:NSUTF8StringEncoding error:nil]) return 1;
    printf("%s", record.UTF8String); fflush(stdout);
    signal(SIGTERM, stop);
    signal(SIGINT, stop);
    while (alive) pump();
    display = nil;
  }
  return 0;
}
