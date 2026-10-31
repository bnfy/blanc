#include "protocol_cipher.h"
#include "base/at_exit.h"
#include "base/base64.h"
#include "base/check.h"
#include "base/files/file_util.h"
#include "base/json/json_reader.h"
#include "base/json/json_writer.h"
#include "base/values.h"
#include "crypto/secure_util.h"
#include <iostream>
using namespace blanc::sync;
int main(int argc, char** argv) {
  base::AtExitManager at_exit;
  CHECK_EQ(argc, 3);
  std::string input;
  CHECK(base::ReadFileToStringWithMaxSize(base::FilePath::FromUTF8Unsafe(argv[1]), &input, 4 * 1024 * 1024));
  auto root = base::JSONReader::ReadDict(input, base::JSON_PARSE_RFC); CHECK(root);
  auto key_bytes = base::Base64Decode(*root->FindString("key")); CHECK(key_bytes);
  auto key = ProtocolKey::Import(*key_bytes); CHECK(key);
  crypto::SecureZeroBuffer(*key_bytes);
  ProtocolKey moved(std::move(*key));
  CHECK(!Encrypt(*key, "moved-from"));
  CHECK(!ProtocolKey::Import(std::array<uint8_t, 31>{}));
  const auto read_blob = [](const base::DictValue& value) {
    return Envelope{*value.FindInt("v"), *value.FindString("iv"),
                    *value.FindString("ct"), *value.FindString("tag")};
  };
  base::ListValue encrypted;
  const auto* good = root->FindList("good"); CHECK(good);
  for (const auto& item : *good) {
    const auto& value = item.GetDict();
    const auto clear = Decrypt(moved, read_blob(*value.FindDict("blob")));
    CHECK(clear);
    CHECK_EQ(base::Base64Encode(*clear), *value.FindString("plain"));
    const auto sealed = Encrypt(moved, *clear); CHECK(sealed);
    CHECK(Decrypt(moved, *sealed) == clear);
    base::DictValue out; out.Set("v", sealed->version); out.Set("iv", sealed->iv);
    out.Set("ct", sealed->ct); out.Set("tag", sealed->tag);
    encrypted.Append(std::move(out));
  }
  const auto* bad = root->FindList("bad"); CHECK(bad);
  for (const auto& item : *bad) CHECK(!Decrypt(moved, read_blob(item.GetDict())));
  const int boundary = *root->FindInt("boundary");
  CHECK(Encrypt(moved, std::string(boundary, 'x')));
  CHECK(!Encrypt(moved, std::string(boundary + 1, 'x')));
  CHECK(!Encrypt(moved, std::string("\xff", 1)));
  const auto output = base::WriteJson(encrypted); CHECK(output);
  CHECK(base::WriteFile(base::FilePath::FromUTF8Unsafe(argv[2]), *output));
  std::cout << "native envelope and key lifecycle checks passed\n";
}
