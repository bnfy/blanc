#include "reader_image_budget.h"

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
struct WebData { WebData()=default; explicit WebData(int){} };
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
namespace mojo_base { struct BigBuffer { const std::vector<uint8_t>& bytes; size_t size()const{return bytes.size();} }; }
namespace base { int as_byte_span(const mojo_base::BigBuffer&){return 1;} }
struct Callback { SkBitmap* result; void Run(SkBitmap value){*result=value;} };
namespace data_decoder { using DecodeImageBoundedCallback=Callback; struct ImageDecoderImpl { void DecodeImageBounded(mojo_base::BigBuffer,uint32_t,DecodeImageBoundedCallback); };
void ImageDecoderImpl::DecodeImageBounded(
    mojo_base::BigBuffer encoded_data,
    uint32_t max_pixels,
    DecodeImageBoundedCallback callback) {
  constexpr uint32_t kMaxPixels = 16 * 1024 * 1024;
  constexpr size_t kMaxEncodedBytes = 5 * 1024 * 1024;
  if (encoded_data.size() == 0 || encoded_data.size() > kMaxEncodedBytes ||
      max_pixels == 0 || max_pixels > kMaxPixels) {
    std::move(callback).Run(SkBitmap());
    return;
  }
  SkBitmap image = blink::WebImage::FromDataBounded(
      blink::WebData(base::as_byte_span(encoded_data)), max_pixels);
  std::move(callback).Run(image);
}


} // namespace data_decoder
std::vector<uint8_t> Png(uint32_t w,uint32_t h){std::vector<uint8_t>b={137,80,78,71,13,10,26,10,0,0,0,13,'I','H','D','R',0,0,0,0,0,0,0,0};for(int i=0;i<4;i++){b[16+i]=static_cast<uint8_t>(w>>(24-i*8));b[20+i]=static_cast<uint8_t>(h>>(24-i*8));}return b;}
int main(){using blanc::reader::ReaderImageBudget;ReaderImageBudget::Time now{};ReaderImageBudget budget(3);data_decoder::ImageDecoderImpl service;SkBitmap result{};
 auto a=budget.Begin(0,now);auto input=budget.BeginDecode(a.token,now,Png(10,10));assert(input&&input->max_pixels==100);
 state={};state.original={11,10};service.DecodeImageBounded({*input->bytes},input->max_pixels,{&result});assert(result.drawsNothing()&&state.decodes==0);budget.Reject(a.token);assert(budget.reserved_pixels()==0);
 auto b=budget.Begin(1,now);input=budget.BeginDecode(b.token,now,Png(10,10));assert(input&&input->max_pixels==100);state={};service.DecodeImageBounded({*input->bytes},input->max_pixels,{&result});assert(!result.drawsNothing()&&state.decodes==1);assert(budget.Commit(b.token,now,result.width(),result.height(),100));assert(budget.pixels()==100);
 auto c=budget.Begin(2,now);input=budget.BeginDecode(c.token,now,Png(10,10));assert(input&&input->max_pixels==100);assert(!budget.Commit(c.token,now,11,10,100));assert(budget.pixels()==100&&budget.reserved_pixels()==0);
}
