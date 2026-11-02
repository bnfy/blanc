#ifndef BLANC_QUIET_PROBE_H_
#define BLANC_QUIET_PROBE_H_
#include <algorithm>
#include <memory>
#include <vector>
#include "base/functional/bind.h"
#include "base/functional/callback.h"
#include "base/task/sequenced_task_runner.h"
#include "base/time/time.h"
#include "base/values.h"
#include "chrome/common/chrome_isolated_world_ids.h"
#include "content/public/browser/render_frame_host.h"
#include "content/public/browser/weak_document_ptr.h"
#include "content/public/browser/web_contents.h"

namespace blanc::quiet {
struct DirtyResult {
  bool complete = false;
  bool dirty = true;
  bool deep_scrolled = false;
  bool has_session_storage = false;
};
inline constexpr char16_t kDirtyProbe[] = uR"BLANC((() => {
  try {
    const d = document;
    for (const el of d.querySelectorAll('input, textarea')) {
      if (el.type === 'checkbox' || el.type === 'radio') {
        if (el.checked !== el.defaultChecked) return { dirty: true };
      } else if (el.type === 'password') {
        if (el.value) return { dirty: true };
      } else if (el.value !== el.defaultValue) {
        return { dirty: true };
      }
    }
    for (const sel of d.querySelectorAll('select')) {
      for (const opt of sel.options) {
        if (opt.selected !== opt.defaultSelected) return { dirty: true };
      }
    }
    for (const el of d.querySelectorAll('[contenteditable]')) {
      if ((el.textContent || '').trim()) return { dirty: true };
    }
    if (d.designMode === 'on' && (d.body?.textContent || '').trim()) return { dirty: true };
    if (d.pictureInPictureElement) return { dirty: true };
    return {
      dirty: false,
      deepScrolled: window.scrollY > 3 * window.innerHeight,
      hasSessionStorage: !!window.sessionStorage?.length,
    };
  } catch {
    return { dirty: true };
  }
})())BLANC";
class DirtyProbe : public std::enable_shared_from_this<DirtyProbe> {
 public:
  ~DirtyProbe();
  static void Run(content::WebContents* tab,
                  base::OnceCallback<void(DirtyResult)> callback) {
    auto probe = std::shared_ptr<DirtyProbe>(new DirtyProbe(tab, std::move(callback)));
    probe->Start();
  }
 private:
  DirtyProbe(content::WebContents* tab, base::OnceCallback<void(DirtyResult)> callback);
  void Start() {
    auto* main = tab_->GetPrimaryMainFrame();
    main->ForEachRenderFrameHost([&](content::RenderFrameHost* frame) {
      documents_.push_back(frame->GetWeakDocumentPtr());
    });
    if (documents_.empty() || documents_.size() > 256) { Finish(false); return; }
    pending_ = documents_.size();
    base::SequencedTaskRunner::GetCurrentDefault()->PostDelayedTask(FROM_HERE,
        base::BindOnce(&DirtyProbe::Finish, shared_from_this(), false), base::Milliseconds(250));
    for (const auto& document : documents_) {
      auto* frame = document.AsRenderFrameHostIfValid();
      if (!frame || !frame->IsRenderFrameLive()) { Finish(false); return; }
      frame->ExecuteJavaScriptInIsolatedWorld(kDirtyProbe,
          base::BindOnce(&DirtyProbe::Answered, shared_from_this()),
          ISOLATED_WORLD_ID_CHROME_INTERNAL);
    }
  }
  void Answered(base::Value answer) {
    if (!callback_) return;
    const auto* dict = answer.GetIfDict();
    if (!dict || !dict->FindBool("dirty").has_value()) { Finish(false); return; }
    if (*dict->FindBool("dirty")) { Finish(true); return; }
    const auto deep = dict->FindBool("deepScrolled");
    const auto storage = dict->FindBool("hasSessionStorage");
    if (!deep || !storage) { Finish(false); return; }
    result_.deep_scrolled |= *deep;
    result_.has_session_storage |= *storage;
    if (--pending_ == 0) { result_.dirty = false; Finish(true); }
  }
  void Finish(bool complete) {
    if (!callback_) return;
    if (!tab_ || !tab_->GetPrimaryMainFrame()) complete = false;
    std::vector<content::RenderFrameHost*> current_frames;
    if (tab_) tab_->GetPrimaryMainFrame()->ForEachRenderFrameHost(
        [&](content::RenderFrameHost* frame) { current_frames.push_back(frame); });
    if (current_frames.size() != documents_.size()) complete = false;
    // A document may remain alive in BFCache after leaving the current page.
    // Liveness and equal frame counts alone do not establish page identity.
    for (const auto& document : documents_) {
      auto* frame = document.AsRenderFrameHostIfValid();
      if (!frame || std::find(current_frames.begin(), current_frames.end(), frame) ==
                        current_frames.end()) complete = false;
    }
    result_.complete = complete;
    if (!complete) result_.dirty = true;
    std::move(callback_).Run(result_);
  }
  base::WeakPtr<content::WebContents> tab_;
  base::OnceCallback<void(DirtyResult)> callback_;
  std::vector<content::WeakDocumentPtr> documents_;
  size_t pending_ = 0;
  DirtyResult result_;
};
inline DirtyProbe::DirtyProbe(content::WebContents* tab,
    base::OnceCallback<void(DirtyResult)> callback)
    : tab_(tab->GetWeakPtr()), callback_(std::move(callback)) {}
inline DirtyProbe::~DirtyProbe() = default;
}  // namespace blanc::quiet
#endif
