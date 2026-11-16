#include "bang_disk_confirmation.h"
#include "base/files/file_util.h"
#include "base/json/json_reader.h"
#include "bang_pref_registration.h"
namespace blanc::bangs::draft {
bool ConfirmBangPrefOnDisk(const base::FilePath& path, SavedBangPref pref,
                           const base::Value& expected) {
  std::string bytes;
  if (path.empty() || !base::ReadFileToStringWithMaxSize(path, &bytes, 32 * 1024 * 1024)) return false;
  auto data = base::JSONReader::ReadDict(bytes, base::JSON_PARSE_CHROMIUM_EXTENSIONS);
  if (!data) return false;
  const char* key = pref == SavedBangPref::kEnabled ? kBangEnabled : kBangCustom;
  const base::Value* actual = data->FindByDottedPath(key);
  return actual && *actual == expected;
}
}  // namespace blanc::bangs::draft
