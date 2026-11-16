#ifndef BLANC_SYNC_LEGACY_BACKUP_H_
#define BLANC_SYNC_LEGACY_BACKUP_H_
#include "key_vault.h"
#include "legacy_snapshot.h"
namespace blanc::sync {
// Local backup format, not the endpoint protocol. Vault context must use the
// trusted destination profile and domain-separated source binding as account.
// No filesystem, source-closure authority or import permission is provided.
std::optional<std::string> SealLegacyBackup(const LegacySnapshot& snapshot,
                                          KeyVault& vault, const std::string& source_binding);
std::optional<LegacySnapshot> OpenLegacyBackup(std::string_view backup,
                                             KeyVault& vault, const std::string& source_binding);
}
#endif
