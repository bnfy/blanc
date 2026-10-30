#include "wipe_policy.h"
#include "base/at_exit.h"
#include "base/check.h"
#include "base/files/file_util.h"
#include "base/json/json_reader.h"
#include "base/json/json_writer.h"
#include "base/values.h"
int main(int argc, char** argv) {
  base::AtExitManager at_exit; CHECK_EQ(argc, 3);
  std::string input;
  CHECK(base::ReadFileToStringWithMaxSize(base::FilePath::FromUTF8Unsafe(argv[1]), &input, 1024*1024));
  const auto cases = base::JSONReader::ReadList(input, base::JSON_PARSE_RFC); CHECK(cases);
  base::ListValue results;
  for (const auto& item : *cases) {
    const auto& value = item.GetDict();
    const auto decision = blanc::sync::DecideWipe({*value.FindBool("networkError"),
        *value.FindInt("status"), *value.FindString("body")});
    base::DictValue out; out.Set("clearCredentials", decision.clear_credentials);
    out.Set("erasurePending", decision.erasure_pending); out.Set("error", decision.error);
    results.Append(std::move(out));
  }
  CHECK(base::WriteFile(base::FilePath::FromUTF8Unsafe(argv[2]), *base::WriteJson(results)));
}
