#!/usr/bin/env python3
"""Produce an isolated candidate patch; never write to the Chromium checkout."""
from pathlib import Path
import difflib, hashlib, json
src=Path('<local-home>/Projects/BlancChromium158/src')
out=Path(__file__).resolve().parent
files=['third_party/blink/public/web/web_image.h','third_party/blink/renderer/core/exported/web_image.cc','services/data_decoder/public/mojom/image_decoder.mojom','services/data_decoder/image_decoder_impl.h','services/data_decoder/image_decoder_impl.cc']
orig={f:(src/f).read_text() for f in files}
new=orig.copy()
def once(f,old,replacement):
 assert new[f].count(old)==1, f
 new[f]=new[f].replace(old,replacement)
h=files[0];once(h,'#include <vector>','#include <cstdint>\n#include <vector>')
once(h,'  static SkBitmap FromData(const WebData&, const gfx::Size& desired_size);','''  static SkBitmap FromData(const WebData&, const gfx::Size& desired_size);

  // Decode the first raster frame only after checking decoder-reported image,
  // decoded, and frame dimensions against a caller-provided pixel bound.
  static SkBitmap FromDataBounded(const WebData&, uint32_t max_pixels);''')
c=files[1];needle='SkBitmap WebImage::DecodeSVG(const WebData& data,'
impl='''SkBitmap WebImage::FromDataBounded(const WebData& data,
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
  image.GetSwSkImage()->asLegacyBitmap(&bitmap);
  if (!within_bound(gfx::Size(bitmap.width(), bitmap.height())))
    return {};
  return bitmap;
}

'''
once(c,needle,impl+needle)
m=files[2];needle='  // Decodes the image in |encoded_data|. This will return all frames in the'
once(m,needle,'''  // Decodes only the first raster frame, checking decoder-reported dimensions
  // before requesting pixel data. The service enforces its own absolute cap.
  DecodeImageBounded(mojo_base.mojom.BigBuffer encoded_data, uint32 max_pixels)
      => (skia.mojom.BitmapN32? decoded_image);

'''+needle)
h=files[3];needle='  void DecodeAnimation(mojo_base::BigBuffer encoded_data,'
once(h,needle,'''  void DecodeImageBounded(mojo_base::BigBuffer encoded_data,
                          uint32_t max_pixels,
                          DecodeImageBoundedCallback callback) override;
'''+needle)
c=files[4];needle='void ImageDecoderImpl::DecodeAnimation(mojo_base::BigBuffer encoded_data,'
once(c,needle,'''void ImageDecoderImpl::DecodeImageBounded(
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

'''+needle)
patch=''.join(''.join(difflib.unified_diff(orig[f].splitlines(keepends=True),new[f].splitlines(keepends=True),fromfile='a/'+f,tofile='b/'+f)) for f in files)
for f in files:
 for prefix,content in [('preimage',orig[f]),('candidate',new[f])]:
  p=out/prefix/f;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(content)
(out/'candidate.patch').write_text(patch)
sha=lambda b:hashlib.sha256(b.encode()).hexdigest()
(out/'manifest.json').write_text(json.dumps({'status':'unintegrated draft; no build or runtime proof','sourceRoot':str(src),'inputs':{f:sha(orig[f]) for f in files},'outputs':{f:sha(new[f]) for f in files},'patchSha256':sha(patch)},indent=2)+'\n')
print('candidate patch generated; active checkout unchanged')
