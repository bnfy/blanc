
#include <cassert>
#include <cstddef>
#include <cstdint>
#include <utility>
struct SkBitmap { int marker=0; };
namespace mojo_base { struct BigBuffer { size_t n; size_t size()const{return n;} }; }
namespace base { int as_byte_span(const mojo_base::BigBuffer&){return 1;} }
int decodes=0;
namespace blink { struct WebData { explicit WebData(int){} }; struct WebImage { static SkBitmap FromDataBounded(WebData,uint32_t){++decodes;return {1};} }; }
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


}
int main(){ data_decoder::ImageDecoderImpl d; SkBitmap result{};
 auto call=[&](size_t bytes,uint32_t pixels){decodes=0;result.marker=-1;d.DecodeImageBounded({bytes},pixels,{&result});};
 call(0,1);assert(result.marker==0&&!decodes);
 call(5*1024*1024+1,1);assert(result.marker==0&&!decodes);
 call(1,0);assert(result.marker==0&&!decodes);
 call(1,16*1024*1024+1);assert(result.marker==0&&!decodes);
 call(5*1024*1024,16*1024*1024);assert(result.marker==1&&decodes==1);
 call(1,1);assert(result.marker==1&&decodes==1);
}
