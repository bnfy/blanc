#ifndef BLANC_DOWNLOADS_VISIBILITY_POLICY_DRAFT_H_
#define BLANC_DOWNLOADS_VISIBILITY_POLICY_DRAFT_H_

namespace blanc::downloads_projection {
// Internal predicate only. Call with a proven-live item on its owning UI
// sequence; these checks are not an authorization or lifetime boundary.
// `trusted_extension` and `show_in_ui` must consult browser-owned objects.
template <typename Item, typename TrustedExtension, typename ShowInUi>
bool VisibleInNativeDownloads(const Item& item,
                              int silent_block_status,
                              TrustedExtension trusted_extension,
                              ShowInUi show_in_ui) {
  if (item.IsTemporary() || item.IsTransient()) return false;
  if (item.GetFileNameToReportUser().empty() ||
      item.GetTargetFilePath().empty() || item.GetURL().is_empty()) return false;
  // A silent block must not turn into a visible review prompt in the draft.
  if (static_cast<int>(item.GetInsecureDownloadStatus()) == silent_block_status)
    return false;
  return !trusted_extension(item) && show_in_ui(item);
}
}  // namespace blanc::downloads_projection
#endif  // BLANC_DOWNLOADS_VISIBILITY_POLICY_DRAFT_H_
