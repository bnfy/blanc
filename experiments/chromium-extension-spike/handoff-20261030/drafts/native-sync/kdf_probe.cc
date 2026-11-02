#include "password_kdf.h"
#include "base/at_exit.h"
#include "base/base64.h"
#include "base/check.h"
#include "base/files/file_util.h"
#include "base/files/memory_mapped_file.h"
#include "base/i18n/icu_util.h"
#include "base/json/json_reader.h"
#include "base/json/json_writer.h"
#include "base/values.h"
#include "crypto/secure_util.h"
#include "third_party/icu/source/common/unicode/uloc.h"
#include <fcntl.h>
#include <iostream>
using namespace blanc::sync;
std::u16string Units(const base::ListValue& list) {
  std::u16string value;
  for (const auto& item : list) {
    CHECK(item.is_int()); CHECK_GE(item.GetInt(), 0); CHECK_LE(item.GetInt(), 65535);
    value.push_back(static_cast<char16_t>(item.GetInt()));
  }
  return value;
}
int main(int argc, char** argv) {
  base::AtExitManager at_exit; CHECK_EQ(argc, 4);
  const int fd = open(argv[3], O_RDONLY); CHECK_GE(fd, 0);
  CHECK(base::i18n::InitializeICUWithFileDescriptor(fd, base::MemoryMappedFile::Region::kWholeFile));
  UErrorCode error = U_ZERO_ERROR; uloc_setDefault("tr_TR", &error); CHECK(U_SUCCESS(error));
  std::string input;
  CHECK(base::ReadFileToStringWithMaxSize(base::FilePath::FromUTF8Unsafe(argv[1]), &input, 8 * 1024 * 1024));
  auto root = base::JSONReader::ReadDict(input, base::JSON_PARSE_RFC); CHECK(root);
  base::ListValue salts;
  for (const auto& item : *root->FindList("normalizations")) {
    const auto salt = PasswordKdf::Salt(Units(item.GetList())); CHECK(salt);
    salts.Append(base::Base64Encode(*salt));
  }
  int derived = 0;
  for (const auto& item : *root->FindList("keys")) {
    const auto& value = item.GetDict();
    auto keys = PasswordKdf::Derive(Units(*value.FindList("handle")), Units(*value.FindList("password")));
    CHECK(keys); CHECK_EQ(keys->account_id, *value.FindString("account"));
    const auto expected_key = base::Base64Decode(*value.FindString("key")); CHECK(expected_key);
    CHECK(crypto::SecureMemEqual(keys->key.bytes(), *expected_key));
    ++derived;
  }
  base::DictValue output; output.Set("salts", std::move(salts)); output.Set("derived", derived);
  CHECK(base::WriteFile(base::FilePath::FromUTF8Unsafe(argv[2]), *base::WriteJson(output)));
  std::cout << "synthetic KDF vectors passed with Turkish default locale\n";
}
