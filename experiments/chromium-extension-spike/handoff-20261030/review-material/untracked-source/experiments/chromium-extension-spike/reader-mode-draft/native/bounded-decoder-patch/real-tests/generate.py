#!/usr/bin/env python3
from pathlib import Path
import difflib,hashlib,json
src=Path('<local-home>/Projects/BlancChromium158/src');out=Path(__file__).resolve().parent
files=['third_party/blink/renderer/core/exported/web_image_test.cc','services/data_decoder/image_decoder_impl_unittest.cc']
orig={f:(src/f).read_text() for f in files}
if (out/"manifest.json").exists():
 pinned=json.loads((out/"manifest.json").read_text())["inputs"]
 for f in files:
  if hashlib.sha256(orig[f].encode()).hexdigest()!=pinned[f]: raise SystemExit(f"source preimage changed: {f}")
new=orig.copy()
def insert(f,needle,content):
 assert new[f].count(needle)==1,f
 new[f]=new[f].replace(needle,content+needle)
insert(files[0],'TEST_F(WebImageTest, ICOImage) {','''// The candidate bounded path uses real Blink image decoders.
TEST_F(WebImageTest, BoundedDecodeDimensionLimits) {
  scoped_refptr<SharedBuffer> png = ReadFile("notifications/48x48.png");
  EXPECT_TRUE(WebImage::FromDataBounded(WebData(png), 0).isNull());
  EXPECT_TRUE(WebImage::FromDataBounded(WebData(png), 48 * 48 - 1).isNull());
  SkBitmap within = WebImage::FromDataBounded(WebData(png), 48 * 48);
  ASSERT_FALSE(within.isNull());
  EXPECT_EQ(within.width(), 48);
  EXPECT_EQ(within.height(), 48);

  const auto invalid = base::byte_span_from_cstring("not a raster image");
  EXPECT_TRUE(WebImage::FromDataBounded(WebData(invalid), 100).isNull());
}

TEST_F(WebImageTest, BoundedDecodePreservesExifOrientation) {
  scoped_refptr<SharedBuffer> data = ReadFile("exif-orientation-5-lu.jpg");
  SkBitmap normal = WebImage::FromData(WebData(data), gfx::Size());
  ASSERT_FALSE(normal.isNull());
  SkBitmap bounded = WebImage::FromDataBounded(WebData(data), 16 * 1024 * 1024);
  ASSERT_FALSE(bounded.isNull());
  EXPECT_EQ(normal.width(), bounded.width());
  EXPECT_EQ(normal.height(), bounded.height());
  EXPECT_EQ(normal.getColor(0, 0), bounded.getColor(0, 0));
}

''')
insert(files[1],'TEST_F(ImageDecoderImplTest, DecodeImageFailed) {','''// Exercise the bounded service against the actual JPEG and Blink decoders.
TEST_F(ImageDecoderImplTest, DecodeImageBoundedLimits) {
  auto jpeg = CreateJPEGImage(32, 16, SK_ColorRED);
  ASSERT_TRUE(jpeg);
  auto decode = [this](const std::vector<uint8_t>& data, uint32_t max_pixels) {
    SkBitmap result;
    bool replied = false;
    decoder()->DecodeImageBounded(
        {data}, max_pixels,
        base::BindLambdaForTesting([&](const SkBitmap& image) {
          result = image;
          replied = true;
        }));
    EXPECT_TRUE(replied);
    return result;
  };
  EXPECT_TRUE(decode(*jpeg, 0).isNull());
  EXPECT_TRUE(decode(*jpeg, 32 * 16 - 1).isNull());
  SkBitmap exact = decode(*jpeg, 32 * 16);
  ASSERT_FALSE(exact.isNull());
  EXPECT_EQ(exact.width(), 32);
  EXPECT_EQ(exact.height(), 16);
  EXPECT_TRUE(decode(*jpeg, 16 * 1024 * 1024 + 1).isNull());
  EXPECT_TRUE(decode({}, 1).isNull());
  EXPECT_TRUE(decode(std::vector<uint8_t>(5 * 1024 * 1024 + 1), 1).isNull());
  EXPECT_TRUE(decode(std::vector<uint8_t>{0, 1, 2}, 1).isNull());
}

''')
sha=lambda s:hashlib.sha256(s.encode()).hexdigest()
for f in files:
 for label,data in [('preimage',orig[f]),('candidate',new[f])]:
  p=out/label/f;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(data)
patch=''.join(''.join(difflib.unified_diff(orig[f].splitlines(keepends=True),new[f].splitlines(keepends=True),fromfile='a/'+f,tofile='b/'+f)) for f in files)
(out/'real-tests.patch').write_text(patch);(out/'manifest.json').write_text(json.dumps({'status':'proposed tests; not compiled or run','inputs':{f:sha(orig[f]) for f in files},'outputs':{f:sha(new[f]) for f in files},'patchSha256':sha(patch)},indent=2)+'\n');print('isolated real-codec test patch generated')
