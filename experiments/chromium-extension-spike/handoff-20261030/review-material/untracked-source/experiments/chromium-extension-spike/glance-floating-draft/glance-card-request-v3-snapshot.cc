#include "glance_card_handler.h"

#include <cmath>
#include <string_view>

#include "base/strings/string_number_conversions.h"

namespace blanc::glance::draft {
namespace {
constexpr double kMaxSafeInteger = 9007199254740991.0;
bool IsAction(std::string_view action) {
  return action == "back" || action == "reload" || action == "stop" ||
      action == "change" || action == "openAsTab" || action == "keepSplit" ||
      action == "close" || action == "move" || action == "resize" || action == "reset";
}
bool IsEdge(std::string_view edge) {
  return edge == "n" || edge == "s" || edge == "e" || edge == "w" ||
      edge == "ne" || edge == "nw" || edge == "se" || edge == "sw";
}
bool IsDelta(const base::DictValue& arguments, std::string_view key) {
  const auto value = arguments.FindDouble(key);
  return value && std::isfinite(*value) && std::abs(*value) <= 1000000;
}
}  // namespace

std::optional<CardRequest> ParseCardRequest(const base::ListValue& message) {
  if (message.size() != 3 || !message[0].is_string() ||
      !message[1].is_string() || !message[2].is_dict()) return std::nullopt;
  const std::string& id = message[0].GetString();
  const std::string& action = message[1].GetString();
  const auto& data = message[2].GetDict();
  uint64_t number = 0;
  if (id.empty() || id.size() > 16 || id[0] == '0' ||
      id.find_first_not_of("0123456789") != std::string::npos ||
      !base::StringToUint64(id, &number) || number == 0 ||
      number > static_cast<uint64_t>(kMaxSafeInteger) || !IsAction(action)) return std::nullopt;
  const auto generation = data.FindDouble("generation");
  if (!generation || !std::isfinite(*generation) || *generation < 1 ||
      *generation > kMaxSafeInteger || std::trunc(*generation) != *generation) return std::nullopt;
  if (action == "move" || action == "resize") {
    if (data.size() != (action == "move" ? 3u : 4u) ||
        !IsDelta(data, "dx") || !IsDelta(data, "dy")) return std::nullopt;
    if (action == "resize") {
      const auto* edge = data.FindString("edge");
      if (!edge || !IsEdge(*edge)) return std::nullopt;
    }
  } else if (data.size() != 1u) {
    return std::nullopt;
  }
  return CardRequest{id, action, static_cast<uint64_t>(*generation), data.Clone()};
}

}  // namespace blanc::glance::draft
