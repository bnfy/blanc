// Copyright 2026 Bananify Creative. MIT; see LICENSE.
#include "blanc/browser/sync/sync_merge.h"

namespace blanc::sync_merge {
Direction FavoriteDirection(const std::optional<Favorite>& local,
                            const std::optional<Favorite>& remote,
                            const std::optional<Favorite>& seen,
                            bool local_only, bool upload_confirmed) {
  if (local_only || local == remote) return Direction::kNone;
  if (!seen) {
    if (remote) return Direction::kApplyRemote;
    return upload_confirmed ? Direction::kPublishLocal : Direction::kAskFirstUpload;
  }
  if (local != seen) return Direction::kPublishLocal;
  return Direction::kApplyRemote;
}
bool RecoverFavoriteWrite(const std::optional<Favorite>& local,
                          const std::optional<Favorite>& before,
                          const std::optional<Favorite>& after, bool edited) {
  return !edited && local == before && local != after;
}
bool LocalItemWins(double local_at, double remote_at, double deleted_at) {
  return local_at > remote_at && local_at > deleted_at;
}
Direction SettingDirection(std::string_view local, std::string_view remote,
                           const std::optional<std::string>& seen,
                           bool supported) {
  if (!supported || local == remote) return Direction::kNone;
  if (!seen || remote != *seen) return Direction::kApplyRemote;
  return Direction::kPublishLocal;
}
}  // namespace blanc::sync_merge
