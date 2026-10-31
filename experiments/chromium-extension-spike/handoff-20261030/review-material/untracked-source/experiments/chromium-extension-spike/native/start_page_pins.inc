// Local profile Start Page pins; shipping cap and sanitization contract.
// Sync and favicon enrichment are separate integration work.
constexpr char kStartPagePinsPref[] = "blanc.prototype.start_page_pins";
constexpr size_t kStartPageMaxPins = 8;
std::optional<base::DictValue> SanitizeStartPin(const base::Value& value) {
  if (!value.is_dict()) return std::nullopt;
  const auto& entry = value.GetDict();
  const auto* raw_url = entry.FindString("url");
  if (!raw_url || base::UTF8ToUTF16(*raw_url).size() > 4096) return std::nullopt;
  const GURL url(*raw_url);
  if (!url.is_valid() || !url.SchemeIsHTTPOrHTTPS() ||
      base::UTF8ToUTF16(url.spec()).size() > 4096) return std::nullopt;
  std::u16string title;
  if (const auto* raw_title = entry.FindString("title")) title = base::UTF8ToUTF16(*raw_title);
  base::TrimWhitespace(title, base::TRIM_ALL, &title);
  if (title.size() > 200) title.resize(200);
  if (title.empty()) {
    std::string hostname(url.host());
    if (base::StartsWith(hostname, "www.")) hostname.erase(0, 4);
    title = base::UTF8ToUTF16(hostname);
  }
  base::DictValue pin;
  pin.Set("url", url.spec());
  pin.Set("title", base::UTF16ToUTF8(title));
  return pin;
}
base::ListValue SanitizeStartPins(const base::ListValue& input) {
  base::ListValue result;
  std::set<std::string> seen;
  for (const auto& value : input) {
    auto pin = SanitizeStartPin(value);
    if (!pin || !seen.insert(*pin->FindString("url")).second) continue;
    result.Append(std::move(*pin));
    if (result.size() == kStartPageMaxPins) break;
  }
  return result;
}
