#ifndef BLANC_SYNC_PASSWORD_KDF_H_
#define BLANC_SYNC_PASSWORD_KDF_H_
#include "protocol_cipher.h"

namespace blanc::sync {
struct AccountKeys {
  std::string account_id;
  ProtocolKey key;
};
// Internal compatibility implementation, not a renderer or transport API.
// Requires the dedicated SubtlePassKey compatibility patch to be reviewed
// before application integration. Run on a non-UI worker. The caller owns and
// must clear its input buffers; local root/key/password buffers are zeroed.
class PasswordKdf {
 public:
  static std::optional<AccountKeys> Derive(std::u16string_view handle,
                                          std::u16string_view passphrase);
  // UTF-8 salt including the released prefix, using ECMAScript trim and
  // locale-independent lowercase. No Unicode normalization is applied.
  static std::optional<std::string> Salt(std::u16string_view handle);
};
}  // namespace blanc::sync
#endif
