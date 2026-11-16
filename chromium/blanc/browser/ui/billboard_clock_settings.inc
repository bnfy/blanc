// The clock is a profile preference, never page-supplied authority. Input
// bounds and independent field validation match shipping start-clock-style.js.
constexpr char kBillboardClockPref[] = "blanc.prototype.billboard_clock";
base::DictValue SanitizeClockUpdate(const base::DictValue& input) {
  base::DictValue out;
  if (const auto* v = input.FindString("newtabClockFont"); v &&
      (*v == "instrument" || *v == "condensed" || *v == "inter" || *v == "flex"))
    out.Set("newtabClockFont", *v);
  if (const auto* v = input.FindString("newtabClockStyle"); v &&
      (*v == "solid" || *v == "glass")) out.Set("newtabClockStyle", *v);
  if (const auto* v = input.FindString("newtabClockColor"); v &&
      (*v == "auto" || *v == "sage" || *v == "sky" || *v == "iris" ||
       *v == "rose" || *v == "clay" || *v == "sand" || *v == "slate" ||
       *v == "graphite")) out.Set("newtabClockColor", *v);
  auto integer = [&](const char* key, int min, int max) {
    auto value = input.FindInt(key);
    if (value && *value >= min && *value <= max) out.Set(key, *value);
  };
  integer("newtabClockWeight", 100, 1000);
  integer("newtabClockTone", 0, 100);
  integer("newtabClockHeight", 100, 300);
  return out;
}
