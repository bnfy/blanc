// Reader raster preflight. This performs no fetch and is not a decoder.
#ifndef BLANC_READER_RASTER_H_
#define BLANC_READER_RASTER_H_

#include <cstddef>
#include <cstdint>
#include <optional>
#include <span>
#include <string_view>

namespace blanc::reader {
inline constexpr uint64_t kReaderMaxImageBytes = 5 * 1024 * 1024;
inline constexpr uint64_t kReaderMaxImagePixels = 16 * 1024 * 1024;
inline constexpr uint64_t kReaderMaxTotalPixels = 32 * 1024 * 1024;

struct RasterDimensions {
  uint32_t width;
  uint32_t height;
};

// Returns only a pre-decode bound, never proof that the image is valid. The
// actual decoder must still validate the complete image and its final size.
std::optional<RasterDimensions> ReadRasterDimensions(std::span<const uint8_t> bytes);
bool IsReaderRasterContentType(std::string_view content_type);
bool ReaderRasterWithinLimits(std::span<const uint8_t> bytes,
                              uint64_t previously_decoded_pixels);
}  // namespace blanc::reader
#endif  // BLANC_READER_RASTER_H_
