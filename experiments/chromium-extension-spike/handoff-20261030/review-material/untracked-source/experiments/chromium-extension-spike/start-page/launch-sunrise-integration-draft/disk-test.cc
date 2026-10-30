#include <cstdio>
#include <optional>
#include <string>
#include "base/files/file_path.h"
#include "base/files/file_util.h"
#include "base/json/json_reader.h"
#include "base/values.h"

constexpr char kLaunchSunrisePref[] = "blanc.prototype.launch_sunrise";
#include "chrome/browser/ui/launch_sunrise_disk.inc"

int main(int argc, char** argv) {
  if (argc != 2) return 2;
  const base::FilePath root(argv[1]);
  struct Case { const char* file; std::optional<bool> expected; };
  const Case cases[] = {{"missing",std::nullopt},{"invalid.json",std::nullopt},
    {"array.json",std::nullopt},{"wrong.json",std::nullopt},
    {"absent.json",false},{"false.json",false},{"true.json",true},
    {"oversized.json",std::nullopt}};
  for (const auto& test : cases) {
    auto got = ReadSunriseOnDisk(root.AppendASCII(test.file));
    if (got != test.expected) { std::fprintf(stderr,"FAIL %s\n",test.file); return 1; }
    std::printf("PASS %s\n",test.file);
  }
  return 0;
}
