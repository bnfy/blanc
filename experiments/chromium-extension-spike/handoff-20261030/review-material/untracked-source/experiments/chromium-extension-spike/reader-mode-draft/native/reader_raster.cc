#include "reader_raster.h"

#include <algorithm>
#include <array>
#include <cctype>
#include <string>

namespace blanc::reader {
namespace {
uint16_t BE16(std::span<const uint8_t> b, size_t at) {
  return (static_cast<uint16_t>(b[at]) << 8) | b[at + 1];
}
uint16_t LE16(std::span<const uint8_t> b, size_t at) {
  return b[at] | (static_cast<uint16_t>(b[at + 1]) << 8);
}
uint32_t BE32(std::span<const uint8_t> b, size_t at) {
  return (static_cast<uint32_t>(b[at]) << 24) |
         (static_cast<uint32_t>(b[at + 1]) << 16) |
         (static_cast<uint32_t>(b[at + 2]) << 8) | b[at + 3];
}
uint32_t LE24(std::span<const uint8_t> b, size_t at) {
  return b[at] | (static_cast<uint32_t>(b[at + 1]) << 8) |
         (static_cast<uint32_t>(b[at + 2]) << 16);
}
bool FourCC(std::span<const uint8_t> b, size_t at, std::string_view s) {
  return at <= b.size() && s.size() <= b.size() - at &&
         std::equal(s.begin(), s.end(), b.begin() + at);
}
}  // namespace

std::optional<RasterDimensions> ReadRasterDimensions(std::span<const uint8_t> b) {
  constexpr std::array<uint8_t, 8> kPng = {137, 80, 78, 71, 13, 10, 26, 10};
  if (b.size() >= 24 && std::equal(kPng.begin(), kPng.end(), b.begin()) &&
      BE32(b, 8) == 13 && FourCC(b, 12, "IHDR")) {
    return RasterDimensions{BE32(b, 16), BE32(b, 20)};
  }
  if (b.size() >= 10 && (FourCC(b, 0, "GIF8") &&
      (b[4] == '7' || b[4] == '9') && b[5] == 'a')) {
    return RasterDimensions{LE16(b, 6), LE16(b, 8)};
  }
  if (b.size() >= 10 && b[0] == 0xff && b[1] == 0xd8) {
    for (size_t at = 2; at + 8 < b.size();) {
      if (b[at] != 0xff) return std::nullopt;
      const uint8_t marker = b[at + 1];
      if (marker == 0xff) { ++at; continue; }
      if (marker == 0xd9 || marker == 0xda) break;
      const uint16_t length = BE16(b, at + 2);
      if (length < 2 || length > b.size() - at - 2) return std::nullopt;
      if (marker == 0xc0 || marker == 0xc1 || marker == 0xc2) {
        if (length < 7) return std::nullopt;
        return RasterDimensions{BE16(b, at + 7), BE16(b, at + 5)};
      }
      at += static_cast<size_t>(length) + 2;
    }
    return std::nullopt;
  }
  if (b.size() >= 30 && FourCC(b, 0, "RIFF") && FourCC(b, 8, "WEBP")) {
    if (FourCC(b, 12, "VP8X")) return RasterDimensions{LE24(b, 24) + 1, LE24(b, 27) + 1};
    if (FourCC(b, 12, "VP8 ") && b[23] == 0x9d && b[24] == 1 && b[25] == 0x2a)
      return RasterDimensions{static_cast<uint32_t>(LE16(b, 26) & 0x3fff),
                              static_cast<uint32_t>(LE16(b, 28) & 0x3fff)};
    if (FourCC(b, 12, "VP8L") && b[20] == 0x2f)
      return RasterDimensions{1u + b[21] + ((b[22] & 0x3fu) << 8),
                              1u + (b[22] >> 6) + (static_cast<uint32_t>(b[23]) << 2) +
                                  ((b[24] & 0x0fu) << 10)};
  }
  return std::nullopt;
}

bool IsReaderRasterContentType(std::string_view content_type) {
  const size_t separator = content_type.find(';');
  auto type = content_type.substr(0, separator);
  while (!type.empty() && (type.front() == ' ' || type.front() == '\t')) type.remove_prefix(1);
  while (!type.empty() && (type.back() == ' ' || type.back() == '\t')) type.remove_suffix(1);
  if (type.size() > 64) return false;
  std::string lower(type);
  std::transform(lower.begin(), lower.end(), lower.begin(),
                 [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
  return lower == "image/png" || lower == "image/jpeg" || lower == "image/webp" || lower == "image/gif";
}

bool ReaderRasterWithinLimits(std::span<const uint8_t> bytes, uint64_t previous) {
  if (bytes.size() > kReaderMaxImageBytes || previous > kReaderMaxTotalPixels) return false;
  auto dimensions = ReadRasterDimensions(bytes);
  if (!dimensions || !dimensions->width || !dimensions->height) return false;
  const uint64_t pixels = static_cast<uint64_t>(dimensions->width) * dimensions->height;
  return pixels <= kReaderMaxImagePixels && pixels <= kReaderMaxTotalPixels - previous;
}
}  // namespace blanc::reader
