#include "legacy_backup.h"
#include "base/base64.h"
#include "base/json/json_reader.h"
#include "base/json/json_writer.h"
#include "base/strings/string_number_conversions.h"
#include "crypto/aead.h"
#include "crypto/random.h"
#include "crypto/secure_util.h"
#include "crypto/sha2.h"
namespace blanc::sync {
namespace {
constexpr size_t kMaxPlain = 12 * 1024 * 1024;
constexpr size_t kMaxRecord = 17 * 1024 * 1024;
constexpr char kKind[] = "blanc-sync-legacy-backup";
struct Sensitive {
  std::string value;
  ~Sensitive() { crypto::SecureZeroBuffer(base::as_writable_byte_span(value)); }
};
std::string Hash(std::string_view value) { return base::HexEncodeLower(crypto::SHA256HashString(value)); }
std::string Aad(const std::string& source, const std::string& wrapped) {
  return std::string(kKind) + ":v1:" + source + ":" + wrapped;
}
std::optional<std::string> Decode(const std::string& value) {
  auto bytes = base::Base64Decode(value);
  if (!bytes) return {};
  const bool canonical = base::Base64Encode(*bytes) == value;
  std::string result;
  if (canonical) result.assign(bytes->begin(), bytes->end());
  crypto::SecureZeroBuffer(*bytes);
  return canonical ? std::optional<std::string>(std::move(result)) : std::nullopt;
}
}
std::optional<std::string> SealLegacyBackup(const LegacySnapshot& snapshot,
                                          KeyVault& vault, const std::string& source) {
  if (vault.availability() != KeyVault::Status::kOk || !vault.MatchesAccount(source) ||
      snapshot.sync_json.size() > 65536 || snapshot.shared_json.size() > 8 * 1024 * 1024) return {};
  base::DictValue plain;
  plain.Set("sync", base::Base64Encode(snapshot.sync_json));
  plain.Set("shared", base::Base64Encode(snapshot.shared_json));
  plain.Set("syncSha256", Hash(snapshot.sync_json)); plain.Set("sharedSha256", Hash(snapshot.shared_json));
  auto serialized = base::WriteJson(plain); if (!serialized) return {};
  Sensitive body{std::move(*serialized)}; if (body.value.size() > kMaxPlain) return {};
  auto random = crypto::RandBytesAsArray<32>(); auto key = ProtocolKey::Import(random);
  crypto::SecureZeroBuffer(random); if (!key) return {};
  auto wrapped = vault.Protect(*key); if (wrapped.status != KeyVault::Status::kOk) return {};
  const auto nonce = crypto::RandBytesAsArray<12>(); const auto aad = Aad(source, wrapped.blob);
  auto cipher = crypto::aead::Seal(crypto::aead::AES_256_GCM, key->bytes(),
      base::as_byte_span(body.value), nonce, base::as_byte_span(aad));
  if (cipher.size() != body.value.size() + 16) return {};
  base::DictValue record; record.Set("version", 1); record.Set("kind", kKind);
  record.Set("source", source); record.Set("wrappedKey", wrapped.blob);
  record.Set("nonce", base::Base64Encode(nonce)); record.Set("data", base::Base64Encode(cipher));
  auto result = base::WriteJson(record);
  return result && result->size() <= kMaxRecord ? std::move(result) : std::nullopt;
}
std::optional<LegacySnapshot> OpenLegacyBackup(std::string_view backup,
                                             KeyVault& vault, const std::string& source) {
  if (backup.size() > kMaxRecord || vault.availability() != KeyVault::Status::kOk ||
      !vault.MatchesAccount(source)) return {};
  auto record = base::JSONReader::ReadDict(backup, base::JSON_PARSE_RFC, 4);
  if (!record || record->size() != 6 || record->FindInt("version") != 1) return {};
  const auto* kind = record->FindString("kind"); const auto* binding = record->FindString("source");
  const auto* wrapped = record->FindString("wrappedKey"); const auto* nonce_text = record->FindString("nonce");
  const auto* data = record->FindString("data");
  if (!kind || *kind != kKind || !binding || *binding != source || !wrapped || !nonce_text || !data) return {};
  auto nonce = Decode(*nonce_text), cipher = Decode(*data);
  if (!nonce || nonce->size() != 12 || !cipher || cipher->size() < 16 || cipher->size() > kMaxPlain + 16) return {};
  auto key = vault.Unprotect(*wrapped); if (key.status != KeyVault::Status::kOk || !key.key) return {};
  const auto aad = Aad(source, *wrapped);
  auto decrypted = crypto::aead::Open(crypto::aead::AES_256_GCM, key.key->bytes(),
      base::as_byte_span(*cipher), base::as_byte_span(*nonce), base::as_byte_span(aad));
  if (!decrypted) return {};
  Sensitive body{std::string(decrypted->begin(), decrypted->end())}; crypto::SecureZeroBuffer(*decrypted);
  auto plain = base::JSONReader::ReadDict(body.value, base::JSON_PARSE_RFC, 4);
  if (!plain || plain->size() != 4) return {};
  const auto* sync = plain->FindString("sync"); const auto* shared = plain->FindString("shared");
  const auto* sync_hash = plain->FindString("syncSha256"); const auto* shared_hash = plain->FindString("sharedSha256");
  if (!sync || !shared || !sync_hash || !shared_hash) return {};
  auto sync_bytes = Decode(*sync), shared_bytes = Decode(*shared);
  if (!sync_bytes || !shared_bytes) return {};
  LegacySnapshot result; result.sync_json = std::move(*sync_bytes); result.shared_json = std::move(*shared_bytes);
  if (result.sync_json.size() > 65536 || result.shared_json.size() > 8 * 1024 * 1024 ||
      Hash(result.sync_json) != *sync_hash || Hash(result.shared_json) != *shared_hash) return {};
  result.sync_sha256 = *sync_hash; result.shared_sha256 = *shared_hash;
  return std::move(result);
}
}
