#include "trusted-document.h"
#include "chrome/browser/profiles/profile.h"
#include "content/public/browser/browser_thread.h"
#include "content/public/browser/child_process_security_policy.h"
#include "content/public/browser/navigation_controller.h"
#include "content/public/browser/render_frame_host.h"
#include "content/public/browser/render_process_host.h"
#include "content/public/browser/web_contents.h"
#include "url/gurl.h"

namespace blanc::downloads_projection {
namespace {
constexpr char kHost[] = "chrome://blanc-prototype/host.html";
}
TrustedDocument::TrustedDocument(content::WebContents* host,
    content::RenderFrameHost* frame, Profile* context)
    : host_(host->GetWeakPtr()), document_(frame->GetWeakDocumentPtr()),
      context_(context->GetWeakPtr()) {}
TrustedDocument::~TrustedDocument() = default;

std::unique_ptr<TrustedDocument> TrustedDocument::Bind(
    content::WebContents* host, content::RenderFrameHost* frame,
    Profile* expected_context) {
  if (!content::BrowserThread::CurrentlyOn(content::BrowserThread::UI) ||
      !host || !frame || !expected_context || expected_context->ShutdownStarted())
    return nullptr;
  auto bound = std::unique_ptr<TrustedDocument>(
      new TrustedDocument(host, frame, expected_context));
  return bound->Validate(frame, false) ? std::move(bound) : nullptr;
}

bool TrustedDocument::Validate(content::RenderFrameHost* caller,
                               bool consume_activation) const {
  if (!content::BrowserThread::CurrentlyOn(content::BrowserThread::UI)) return false;
  auto* host = host_.get();
  auto* context = context_.get();
  auto* frame = document_.AsRenderFrameHostIfValid();
  if (!host || !context || context->ShutdownStarted() || !frame ||
      caller != frame || host->GetBrowserContext() != context ||
      host->GetPrimaryMainFrame() != frame || !frame->IsInPrimaryMainFrame() ||
      !frame->IsActive() || !frame->IsRenderFrameLive() || frame->IsErrorDocument() ||
      frame->GetLastCommittedURL() != GURL(kHost) ||
      host->GetLastCommittedURL() != GURL(kHost) || host->GetVisibleURL() != GURL(kHost) ||
      host->GetController().GetPendingEntry() || !frame->GetProcess() ||
      !content::ChildProcessSecurityPolicy::GetInstance()->HasWebUIBindings(
          frame->GetProcess()->GetID())) return false;
  // Consume last, after all browser-owned checks, and never infer a gesture
  // from a renderer-provided boolean or an old event.
  return !consume_activation || frame->ConsumeTransientUserActivation();
}
}  // namespace blanc::downloads_projection
