#ifndef BLANC_DOWNLOADS_NATIVE_CONTROLLER_CANDIDATE_H_
#define BLANC_DOWNLOADS_NATIVE_CONTROLLER_CANDIDATE_H_

#include <cstdint>
#include <map>
#include <memory>
#include <optional>
#include <string>
#include <vector>
#include "base/memory/raw_ptr.h"
#include "base/memory/weak_ptr.h"
#include "base/sequence_checker.h"
#include "base/unguessable_token.h"
#include "content/public/browser/blanc_download_lifecycle.h"
#include "components/download/public/common/download_item.h"
#include "item-lifetime.h"
#include "trusted-document.h"
#include "snapshot-gate.h"
#include "../native-read-only/scope.h"

class Profile;
namespace content { class DownloadManager; class RenderFrameHost; class WebContents; }

namespace blanc::downloads_projection {
// Browser-side experiment, not an IPC endpoint. The owner must authenticate
// the current document/window and only issue handles for visible rows. GUIDs
// never come from the renderer. Call ResetDocument on every document change.
// This uses the separate unlanded context lifetime candidate and the
// supported UI-sequence shutdown contract; it must not be exposed as-is.
class DownloadController {
 public:
  enum class Dispatch { kRejected, kAlreadyIssued, kIssued };
  using SnapshotId = SnapshotGate<base::UnguessableToken, uint64_t>::Ticket;
  explicit DownloadController(Profile* regular_owner);
  ~DownloadController();
  DownloadController(const DownloadController&) = delete;
  DownloadController& operator=(const DownloadController&) = delete;

  // Trusted browser code calls this after authenticating a new document.
  // Previously issued handles are invalidated even for a same-URL navigation.
  void ResetDocument();
  // Host and frame come from the owning browser window, not from renderer data.
  bool BindDocument(content::WebContents* host, content::RenderFrameHost* frame,
                    Profile* expected_context);
  // Minted by browser code before beginning each complete asynchronous snapshot.
  std::optional<SnapshotId> BeginSnapshot(content::RenderFrameHost* caller);
  // Only for a browser-produced, currently visible item; no renderer GUIDs.
  std::optional<base::UnguessableToken> IssueVisibleItem(
      Scope scope, const std::string& guid, content::RenderFrameHost* caller,
      const SnapshotId& snapshot);
  // Browser-owned complete visible snapshot only; no renderer-provided list.
  bool ReconcileVisible(const std::vector<base::UnguessableToken>& visible,
                        content::RenderFrameHost* caller, const SnapshotId& snapshot);
  // Only an authenticated user action on the currently bound document may
  // call this method. kIssued means dispatch, never confirmed completion.
  Dispatch Cancel(const base::UnguessableToken& handle,
                  content::RenderFrameHost* caller);

 private:
  struct Entry {
    Scope scope;
    content::BlancDownloadLifetime lifetime;
    std::string guid;
    std::unique_ptr<ItemLifetime<download::DownloadItem,
                                 download::DownloadItem::Observer,
                                 raw_ptr<download::DownloadItem>>> item;
    bool cancel_issued = false;
  };
  struct Resolved {
    base::WeakPtr<Profile> context;
    raw_ptr<content::DownloadManager> manager;
    content::BlancDownloadLifetime lifetime;
  };
  std::optional<Resolved> Resolve(Scope scope);
  void PruneInvalidated();
  base::WeakPtr<Profile> owner_;
  base::UnguessableToken document_epoch_;
  SnapshotGate<base::UnguessableToken, uint64_t> snapshot_gate_;
  std::unique_ptr<TrustedDocument> document_;
  std::map<base::UnguessableToken, Entry> handles_;
  SEQUENCE_CHECKER(sequence_checker_);
  base::WeakPtrFactory<DownloadController> weak_factory_{this};
};
}  // namespace blanc::downloads_projection
#endif
