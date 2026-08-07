// EXPERIMENT — native NSGlassEffectView (macOS 26+) inserted into an Electron
// window's AppKit view hierarchy.
//
// Electron has no binding for macOS 26's Liquid Glass. `BrowserWindow.vibrancy`
// is NSVisualEffectView with *behind-window* blending: window-shaped, and it
// samples the desktop rather than the page. NSGlassEffectView is a real view we
// can size, corner-round to a pill, and order directly above the page's
// WebContentsView — which is the only way the Island itself can be the glass.
//
// The open question this addon exists to answer: does NSGlassEffectView sample
// the Chromium-composited page in the NSView beneath it, or only the window
// background? Everything else here is plumbing for that measurement.

#include <napi.h>
#import <AppKit/AppKit.h>

namespace {

// Electron hands back a Buffer whose bytes are the NSView* of the window's
// content view (not the NSWindow itself).
NSView* ContentViewFromHandle(const Napi::Buffer<char>& buf) {
  if (buf.Length() < sizeof(void*)) return nil;
  NSView* view = *reinterpret_cast<NSView* const*>(buf.Data());
  return [view isKindOfClass:[NSView class]] ? view : nil;
}

NSGlassEffectView* g_glass = nil;
bool g_below_top = false;

// The island's contents are a separate transparent WebContentsView that must
// render ABOVE the glass, while the page renders below it. Electron's
// addChildView only orders views it owns, so it cannot lift a Chromium view
// over this foreign NSView — the glass has to insert itself into the right slot
// instead: directly beneath the topmost subview (the contents), above the rest.
void PlaceGlass(NSView* content, bool below_top) {
  g_below_top = below_top;
  NSView* top = content.subviews.lastObject;
  if (below_top && top && top != g_glass) {
    [content addSubview:g_glass positioned:NSWindowBelow relativeTo:top];
  } else {
    [content addSubview:g_glass positioned:NSWindowAbove relativeTo:nil];
  }
}

// Falsification test for "NSView sibling order controls stacking against
// Chromium content": drop the glass to the BOTTOM of the subview list. If it
// still appears over the page, ordering is irrelevant — Chromium composites its
// views into one layer that always sits below native siblings.
void PlaceGlassBottom(NSView* content) {
  NSView* bottom = content.subviews.firstObject;
  if (bottom && bottom != g_glass) {
    [content addSubview:g_glass positioned:NSWindowBelow relativeTo:bottom];
  }
}

bool GlassAvailable() {
  if (@available(macOS 26.0, *)) {
    return NSClassFromString(@"NSGlassEffectView") != nil;
  }
  return false;
}

Napi::Value IsSupported(const Napi::CallbackInfo& info) {
  return Napi::Boolean::New(info.Env(), GlassAvailable());
}

// attach(handleBuffer, {x, y, width, height, cornerRadius, style, interactive})
Napi::Value Attach(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (!GlassAvailable()) {
    Napi::Error::New(env, "NSGlassEffectView requires macOS 26+").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  if (info.Length() < 2 || !info[0].IsBuffer() || !info[1].IsObject()) {
    Napi::TypeError::New(env, "attach(handle, opts)").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  NSView* content = ContentViewFromHandle(info[0].As<Napi::Buffer<char>>());
  if (!content) {
    Napi::Error::New(env, "could not resolve NSView from window handle").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  Napi::Object o = info[1].As<Napi::Object>();
  CGFloat x = o.Get("x").ToNumber().DoubleValue();
  CGFloat y = o.Get("y").ToNumber().DoubleValue();
  CGFloat w = o.Get("width").ToNumber().DoubleValue();
  CGFloat h = o.Get("height").ToNumber().DoubleValue();
  CGFloat radius = o.Has("cornerRadius") ? o.Get("cornerRadius").ToNumber().DoubleValue() : h / 2.0;
  bool clear = o.Has("style") && o.Get("style").ToString().Utf8Value() == "clear";
  bool interactive = o.Has("interactive") && o.Get("interactive").ToBoolean().Value();

  if (@available(macOS 26.0, *)) {
    if (!g_glass) {
      g_glass = [[NSGlassEffectView alloc] initWithFrame:NSMakeRect(x, y, w, h)];
      // AppKit's origin is bottom-left; the caller thinks in top-left CSS
      // coordinates, so pin to the top edge and let the height float.
      g_glass.autoresizingMask = NSViewMinYMargin | NSViewWidthSizable;
    }
    g_glass.frame = NSMakeRect(x, y, w, h);
    g_glass.cornerRadius = radius;
    g_glass.style = clear ? NSGlassEffectViewStyleClear : NSGlassEffectViewStyleRegular;
    if (@available(macOS 27.0, *)) {
      g_glass.effectIsInteractive = interactive;
    }
    if (o.Has("zOrder") && o.Get("zOrder").ToString().Utf8Value() == "bottom") {
      PlaceGlassBottom(content);
    } else {
      PlaceGlass(content, o.Has("belowTop") && o.Get("belowTop").ToBoolean().Value());
    }
  }
  return Napi::Boolean::New(env, true);
}

// setFrame({x, y, width, height}) — top-left origin, flipped here.
Napi::Value SetFrame(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (!g_glass || info.Length() < 1 || !info[0].IsObject()) return env.Undefined();
  Napi::Object o = info[0].As<Napi::Object>();
  g_glass.frame = NSMakeRect(o.Get("x").ToNumber().DoubleValue(),
                             o.Get("y").ToNumber().DoubleValue(),
                             o.Get("width").ToNumber().DoubleValue(),
                             o.Get("height").ToNumber().DoubleValue());
  // The resting pill is a capsule and the expanded panel is a 10px-radius card,
  // so radius travels with every frame change rather than being fixed at attach.
  if (o.Has("cornerRadius")) {
    if (@available(macOS 26.0, *)) {
      g_glass.cornerRadius = o.Get("cornerRadius").ToNumber().DoubleValue();
    }
  }
  return env.Undefined();
}

// Electron re-orders subviews whenever a tab view is attached; call this to put
// the glass back on top without recreating it.
Napi::Value Raise(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (!g_glass) return env.Undefined();
  NSView* super_view = g_glass.superview;
  if (super_view) PlaceGlass(super_view, g_below_top);
  return env.Undefined();
}

// A utility sheet is a deliberate modal surface: the glass is hidden outright
// rather than left refracting beneath it. Hiding beats detaching — re-attaching
// would have to re-find its slot in the subview order.
Napi::Value SetHidden(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (!g_glass || info.Length() < 1) return env.Undefined();
  g_glass.hidden = info[0].ToBoolean().Value();
  return env.Undefined();
}

Napi::Value Detach(const Napi::CallbackInfo& info) {
  if (g_glass) {
    [g_glass removeFromSuperview];
    g_glass = nil;
  }
  return info.Env().Undefined();
}

// Diagnostic: Electron's contentView children may be nested inside a container
// rather than being direct subviews of the window's content view, which changes
// where the glass has to be inserted. Dump the real tree instead of assuming.
Napi::Value Describe(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsBuffer()) return env.Undefined();
  NSView* content = ContentViewFromHandle(info[0].As<Napi::Buffer<char>>());
  if (!content) return env.Undefined();

  Napi::Array out = Napi::Array::New(env);
  uint32_t i = 0;
  for (NSView* v in content.subviews) {
    NSMutableString* line = [NSMutableString stringWithFormat:@"%@ frame=%@ kids=%lu",
                             NSStringFromClass([v class]),
                             NSStringFromRect(v.frame),
                             (unsigned long)v.subviews.count];
    for (NSView* k in v.subviews) {
      [line appendFormat:@" | %@ %@", NSStringFromClass([k class]), NSStringFromRect(k.frame)];
    }
    out.Set(i++, Napi::String::New(env, [line UTF8String]));
  }
  return out;
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("describe", Napi::Function::New(env, Describe));
  exports.Set("isSupported", Napi::Function::New(env, IsSupported));
  exports.Set("attach", Napi::Function::New(env, Attach));
  exports.Set("setFrame", Napi::Function::New(env, SetFrame));
  exports.Set("raise", Napi::Function::New(env, Raise));
  exports.Set("setHidden", Napi::Function::New(env, SetHidden));
  exports.Set("detach", Napi::Function::New(env, Detach));
  return exports;
}

}  // namespace

NODE_API_MODULE(glass, Init)
