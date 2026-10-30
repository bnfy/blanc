
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
SkBitmap WebImage::FromDataBounded(const WebData& data,
                                   uint32_t max_pixels) {
  if (!max_pixels)
    return {};
  const bool data_complete = true;
  std::unique_ptr<ImageDecoder> decoder(ImageDecoder::Create(
      data, data_complete, ImageDecoder::kAlphaPremultiplied,
      ImageDecoder::kDefaultBitDepth, ColorBehavior::kIgnore,
      cc::AuxImage::kDefault, Platform::GetMaxDecodedImageBytes()));
  if (!decoder || !decoder->IsSizeAvailable())
    return {};
  const auto within_bound = [max_pixels](const gfx::Size& size) {
    return size.width() > 0 && size.height() > 0 &&
           size.Area64() <= max_pixels;
  };
  // The service-level max_size_in_bytes is a post-decode output limit.
  // Check dimensions from this same decoder before requesting pixel data.
  if (!within_bound(decoder->Size()) ||
      !within_bound(decoder->DecodedSize()) || !decoder->FrameCount() ||
      !within_bound(decoder->FrameSizeAtIndex(0)))
    return {};
  ImageFrame* frame = decoder->DecodeFrameBufferAtIndex(0);
  if (!frame || decoder->Failed() || frame->Bitmap().drawsNothing() ||
      !within_bound(gfx::Size(frame->Bitmap().width(), frame->Bitmap().height())))
    return {};
  if (decoder->Orientation() == ImageOrientationEnum::kDefault)
    return frame->Bitmap();
  cc::PaintImage image(Image::ResizeAndOrientImage(
      cc::PaintImage::CreateFromBitmap(frame->Bitmap()),
      decoder->Orientation()));
  SkBitmap bitmap;
  auto sk_image = image.GetSwSkImage();
  if (!sk_image)
    return {};
  sk_image->asLegacyBitmap(&bitmap);
  if (!within_bound(gfx::Size(bitmap.width(), bitmap.height())))
    return {};
  return bitmap;
}


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
