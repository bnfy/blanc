#!/usr/bin/env python3
"""Compile the exact proposed bounded method against small fake interfaces."""
from pathlib import Path
import hashlib,json,subprocess
p=Path(__file__).resolve().parent
outputs=[p/'guard-harness.cc',p/'guard-harness',p/'guard-harness.log',p/'guard-harness-result.json']
if any(x.exists() for x in outputs): raise SystemExit('existing results preserved')
s=(p/'candidate/third_party/blink/renderer/core/exported/web_image.cc').read_text()
method='SkBitmap WebImage::FromDataBounded'+s.split('SkBitmap WebImage::FromDataBounded',1)[1].split('SkBitmap WebImage::DecodeSVG',1)[0]
pre=r'''
#include <cassert>
#include <cstdint>
#include <memory>
#include <utility>
namespace gfx { struct Size { int w=0,h=0; Size()=default; Size(int x,int y):w(x),h(y){} int width()const{return w;} int height()const{return h;} int64_t Area64()const{return static_cast<int64_t>(w)*h;} }; }
struct SkBitmap { int w=0,h=0; bool drawsNothing()const{return w<=0||h<=0;} int width()const{return w;} int height()const{return h;} };
struct Behavior { gfx::Size original{10,10},decoded{10,10},frame_size{10,10}; SkBitmap bitmap{10,10},oriented{10,10}; bool create=true,available=true,frames=true,frame=true,failed=false,oriented_mode=false,missing_image=false; int creates=0,decodes=0; } state;
struct SkImage { void asLegacyBitmap(SkBitmap* out) const { *out=state.oriented; } };
namespace cc { enum class AuxImage{kDefault}; struct PaintImage { static PaintImage CreateFromBitmap(SkBitmap){return {};} std::shared_ptr<SkImage> GetSwSkImage(){return state.missing_image?nullptr:std::make_shared<SkImage>();} }; }
namespace blink {
struct WebData {};
enum class ImageOrientationEnum{kDefault,kRotated};
struct ColorBehavior { static int kIgnore; }; int ColorBehavior::kIgnore=0;
struct Platform { static size_t GetMaxDecodedImageBytes(){return 100000000;} };
struct ImageFrame { SkBitmap Bitmap(){return state.bitmap;} };
struct ImageDecoder {
 static constexpr int kAlphaPremultiplied=1,kDefaultBitDepth=2;
 static std::unique_ptr<ImageDecoder> Create(const WebData&, bool,int,int,int,cc::AuxImage,size_t){++state.creates;return state.create?std::make_unique<ImageDecoder>():nullptr;}
 bool IsSizeAvailable(){return state.available;} gfx::Size Size(){return state.original;} gfx::Size DecodedSize(){return state.decoded;} size_t FrameCount(){return state.frames?1:0;} gfx::Size FrameSizeAtIndex(int){return state.frame_size;}
 ImageFrame* DecodeFrameBufferAtIndex(int){++state.decodes;return state.frame?&frame:nullptr;} bool Failed(){return state.failed;} ImageOrientationEnum Orientation(){return state.oriented_mode?ImageOrientationEnum::kRotated:ImageOrientationEnum::kDefault;} ImageFrame frame;
};
struct Image { static cc::PaintImage ResizeAndOrientImage(cc::PaintImage,ImageOrientationEnum){return {};} };
struct WebImage { static SkBitmap FromDataBounded(const WebData&,uint32_t); };
'''
post=r'''
} // namespace blink
int main(){
 using blink::WebImage; blink::WebData input; const uint32_t max=100;
 state={}; assert(WebImage::FromDataBounded(input,0).drawsNothing() && !state.creates);
 state={}; state.create=false; assert(WebImage::FromDataBounded(input,max).drawsNothing() && !state.decodes);
 state={}; state.available=false; assert(WebImage::FromDataBounded(input,max).drawsNothing() && !state.decodes);
 state={}; state.original={11,10}; assert(WebImage::FromDataBounded(input,max).drawsNothing() && !state.decodes);
 state={}; state.original={0,10}; assert(WebImage::FromDataBounded(input,max).drawsNothing() && !state.decodes);
 state={}; state.decoded={10,11}; assert(WebImage::FromDataBounded(input,max).drawsNothing() && !state.decodes);
 state={}; state.frame_size={11,10}; assert(WebImage::FromDataBounded(input,max).drawsNothing() && !state.decodes);
 state={}; state.frames=false; assert(WebImage::FromDataBounded(input,max).drawsNothing() && !state.decodes);
 state={}; assert(!WebImage::FromDataBounded(input,max).drawsNothing() && state.decodes==1);
 state={}; state.frame=false; assert(WebImage::FromDataBounded(input,max).drawsNothing() && state.decodes==1);
 state={}; state.failed=true; assert(WebImage::FromDataBounded(input,max).drawsNothing() && state.decodes==1);
 state={}; state.bitmap={11,10}; assert(WebImage::FromDataBounded(input,max).drawsNothing() && state.decodes==1);
 state={}; state.oriented_mode=true; state.missing_image=true; assert(WebImage::FromDataBounded(input,max).drawsNothing());
 state={}; state.oriented_mode=true; state.oriented={11,10}; assert(WebImage::FromDataBounded(input,max).drawsNothing());
 state={}; state.oriented_mode=true; state.oriented={10,10}; assert(!WebImage::FromDataBounded(input,max).drawsNothing());
}
'''
outputs[0].write_text(pre+method+post)
compiler='<local-home>/Projects/BlancChromium158/src/third_party/llvm-build/Release+Asserts/bin/clang++';sdk='/Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs/MacOSX27.2.sdk'
cmd=[compiler,'-std=c++20','-isysroot',sdk,'-stdlib=libc++','-Wall','-Wextra','-Werror',str(outputs[0]),'-o',str(outputs[1])]
b=subprocess.run(cmd,capture_output=True,text=True);r=subprocess.run([str(outputs[1])],capture_output=True,text=True) if b.returncode==0 else None
outputs[2].write_text(b.stdout+b.stderr+(r.stdout+r.stderr if r else ''))
sha=lambda data:hashlib.sha256(data).hexdigest()
result={'compileExit':b.returncode,'runExit':r.returncode if r else None,'methodSha256':sha(method.encode()),'candidatePatchSha256':sha((p/'candidate.patch').read_bytes()),'testSourceSha256':sha(outputs[0].read_bytes()),'scope':'exact proposed bounded method against fake Blink decoder, bitmap and orientation interfaces; no actual Chromium decoder, Mojo, browser, TLS or network'}
outputs[3].write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result));raise SystemExit(0 if r and r.returncode==0 else 1)
