// Draft only: not registered, built, or used by the prototype.
#ifndef BLANC_READER_EXTRACTION_GUARD_H_
#define BLANC_READER_EXTRACTION_GUARD_H_

#include <cstdint>
#include <optional>
#include <set>
#include <string>
#include <string_view>
#include <utility>

#include "base/functional/bind.h"
#include "base/functional/callback.h"
#include "base/memory/weak_ptr.h"
#include "base/strings/string_number_conversions.h"
#include "base/strings/string_util.h"
#include "base/strings/utf_string_conversions.h"
#include "base/time/time.h"
#include "base/timer/timer.h"
#include "base/values.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/ui/browser_window/public/browser_window_interface.h"
#include "chrome/browser/ui/tabs/tab_strip_model.h"
#include "chrome/browser/ui/tabs/tab_strip_model_observer.h"
#include "chrome/common/chrome_isolated_world_ids.h"
#include "content/public/browser/navigation_controller.h"
#include "content/public/browser/navigation_handle.h"
#include "content/public/browser/render_frame_host.h"
#include "content/public/browser/visibility.h"
#include "content/public/browser/weak_document_ptr.h"
#include "content/public/browser/web_contents.h"
#include "content/public/browser/web_contents_observer.h"
#include "crypto/hash.h"
#include "url/gurl.h"

namespace blanc::reader {

// A dedicated value must be inserted before EXTENSIONS in the Chromium world
// enum. Sharing the cosmetics, Chrome-internal or an extension world is not
// allowed. The accompanying candidate enum patch is not applied to the build.
static_assert(ISOLATED_WORLD_ID_BLANC_READER < ISOLATED_WORLD_ID_EXTENSIONS);
static_assert(ISOLATED_WORLD_ID_BLANC_READER != ISOLATED_WORLD_ID_BLANC_COSMETICS);

enum class ExtractionStatus { kReady, kCancelled, kTimedOut, kInvalidArticle };
using ExtractionDone = base::OnceCallback<void(
    ExtractionStatus, std::optional<base::DictValue>)>;
// Pure, non-reentrant native check: includes inherited-policy/inert, sleeping,
// and the shipping visible-tab rules. It must never consult renderer claims.
using EligibilityCheck = base::RepeatingCallback<bool(
    BrowserWindowInterface*, content::WebContents*)>;

// Owned and invoked on the UI sequence. A manager must destroy this with the
// source tab/window, and must not interpret a failed Start() as a safe result.
// Never attach a reader companion or load images from this class alone.
class ExtractionGuard final : public content::WebContentsObserver,
                              public TabStripModelObserver {
 public:
  ExtractionGuard(BrowserWindowInterface* window, content::WebContents* source,
                  EligibilityCheck eligible);
  ~ExtractionGuard() override;

  // `script` is checked against the reviewed, pinned extractor before it is
  // executed. It must be loaded from a trusted packaged asset with a size cap;
  // renderer-supplied source code is never permitted.
  bool Start(std::string_view script, ExtractionDone completion) {
    if (!completion_.is_null() || completion.is_null() || script.size() > 512 * 1024)
      return false;
    const auto digest = crypto::hash::Sha256(script);
    if (base::HexEncode(digest) !=
        "BB4CD6B0E8274DD37A21B75E1DDA0BB7D9F758BCEA1701A581826A070F2DBD2C")
      return false;
    auto* source = source_.get();
    if (!CurrentWindowAndSource() || !source) return false;
    auto* frame = source->GetPrimaryMainFrame();
    if (!UsableFrame(frame)) return false;
    const GURL url = frame->GetLastCommittedURL();
    if (!AllowedWebUrl(url)) return false;
    source_url_ = url;
    document_ = frame->GetWeakDocumentPtr();
    const uint64_t generation = ++generation_;
    completion_ = std::move(completion);
    timer_.Start(FROM_HERE, base::Seconds(3),
        base::BindOnce(&ExtractionGuard::OnTimeout, weak_factory_.GetWeakPtr(), generation));
    frame->ExecuteJavaScriptInIsolatedWorld(
        base::UTF8ToUTF16(script),
        base::BindOnce(&ExtractionGuard::OnResult, weak_factory_.GetWeakPtr(), generation),
        ISOLATED_WORLD_ID_BLANC_READER);
    return true;
  }

  void Cancel() {
    if (completion_.is_null()) return;
    ++generation_;
    Finish(ExtractionStatus::kCancelled, std::nullopt);
  }

 private:
  static bool AllowedWebUrl(const GURL& url) {
    return url.is_valid() && url.SchemeIsHTTPOrHTTPS() && !url.has_username() &&
           !url.has_password() && url.spec().size() <= 8192;
  }
  bool CurrentWindowAndSource() const {
    auto* window = window_.get();
    auto* profile = profile_.get();
    auto* source = source_.get();
    if (model_destroyed_ || source_destroyed_ || !visible_ ||
        !primary_navigations_.empty() || !window || !profile || !source ||
        source->IsBeingDestroyed() ||
        window->GetProfile() != profile || source->GetBrowserContext() != profile ||
        !window->GetTabStripModel() ||
        window->GetTabStripModel()->GetIndexOfWebContents(source) < 0 ||
        source->IsLoading() || source->GetController().GetPendingEntry() ||
        source->GetVisibility() != content::Visibility::VISIBLE)
      return false;
    return !eligible_.is_null() && eligible_.Run(window, source);
  }
  static bool UsableFrame(content::RenderFrameHost* frame) {
    return frame && frame->IsRenderFrameLive() && frame->IsActive() &&
           frame->IsInPrimaryMainFrame() && !frame->IsErrorDocument();
  }
  bool StillCurrent() const {
    if (!CurrentWindowAndSource()) return false;
    auto* source = source_.get();
    auto* frame = document_.AsRenderFrameHostIfValid();
    return frame && frame == source->GetPrimaryMainFrame() && UsableFrame(frame) &&
           frame->GetLastCommittedURL() == source_url_ &&
           source->GetLastCommittedURL() == source_url_;
  }
  static bool ValidArticle(const base::DictValue& article) {
    const auto* content = article.FindString("content");
    const auto* text = article.FindString("textContent");
    const auto* images = article.FindList("images");
    if (!content || !text || !images || content->size() > 5 * 1024 * 1024 ||
        text->size() > 5 * 1024 * 1024 || images->size() > 100)
      return false;
    std::string trimmed;
    base::TrimWhitespaceASCII(*text, base::TRIM_ALL, &trimmed);
    if (base::UTF8ToUTF16(trimmed).size() < 200) return false;
    for (const auto& item : *images) {
      if (!item.is_string() || !AllowedWebUrl(GURL(item.GetString()))) return false;
    }
    for (const char* key : {"title", "byline", "publishedTime", "lang"}) {
      const auto* value = article.FindString(key);
      if (!value || value->size() > 4000) return false;
    }
    const auto* direction = article.FindString("dir");
    return direction && (*direction == "ltr" || *direction == "rtl");
  }
  void OnTimeout(uint64_t generation) {
    if (generation != generation_ || completion_.is_null()) return;
    ++generation_;
    Finish(ExtractionStatus::kTimedOut, std::nullopt);
  }
  void OnResult(uint64_t generation, base::Value value) {
    if (generation != generation_ || completion_.is_null()) return;
    if (!StillCurrent()) {
      Finish(ExtractionStatus::kCancelled, std::nullopt);
      return;
    }
    if (!value.is_dict() || !ValidArticle(value.GetDict())) {
      Finish(ExtractionStatus::kInvalidArticle, std::nullopt);
      return;
    }
    Finish(ExtractionStatus::kReady, std::move(value).TakeDict());
  }
  void Finish(ExtractionStatus status, std::optional<base::DictValue> article) {
    timer_.Stop();
    document_ = content::WeakDocumentPtr();
    auto done = std::move(completion_);
    if (!done.is_null()) std::move(done).Run(status, std::move(article));
    // The callback can destroy this guard; do not access members afterwards.
  }
  void DidStartNavigation(content::NavigationHandle* navigation) override;
  void DidFinishNavigation(content::NavigationHandle* navigation) override;
  void PrimaryPageChanged(content::Page&) override;
  void PrimaryMainFrameRenderProcessGone(base::TerminationStatus) override;
  void OnVisibilityChanged(content::Visibility visibility) override;
  void WebContentsDestroyed() override;
  void OnTabStripModelChanged(TabStripModel*, const TabStripModelChange&,
                              const TabStripSelectionChange&) override;
  void OnTabStripModelDestroyed(TabStripModel*) override;

  // Track overlapping primary navigations before notifying cancellation: a
  // callback may immediately attempt to restart while a navigation is live.
  std::set<int64_t> primary_navigations_;
  bool model_destroyed_ = false;
  bool source_destroyed_ = false;
  bool visible_ = false;
  EligibilityCheck eligible_;
  base::WeakPtr<BrowserWindowInterface> window_;
  base::WeakPtr<Profile> profile_;
  base::WeakPtr<content::WebContents> source_;
  content::WeakDocumentPtr document_;
  GURL source_url_;
  uint64_t generation_ = 0;
  ExtractionDone completion_;
  base::OneShotTimer timer_;
  base::WeakPtrFactory<ExtractionGuard> weak_factory_{this};
};

}  // namespace blanc::reader
#endif  // BLANC_READER_EXTRACTION_GUARD_H_
