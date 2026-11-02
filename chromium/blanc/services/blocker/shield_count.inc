// Included inside blanc's anonymous namespace. Match shipping tab totals:
// retain across navigation/reload, reset on discard or renderer loss. Memory-only.
class ShieldTabCount final
    : public content::WebContentsUserData<ShieldTabCount>,
      public content::WebContentsObserver {
 public:
  ~ShieldTabCount() override = default;
  void PrimaryMainFrameRenderProcessGone(base::TerminationStatus) override;
  void AboutToBeDiscarded(content::WebContents*) override;
  void WasDiscarded() override;
  int value = 0;
 private:
  explicit ShieldTabCount(content::WebContents* contents);
  friend content::WebContentsUserData<ShieldTabCount>;
  WEB_CONTENTS_USER_DATA_KEY_DECL();
};
ShieldTabCount::ShieldTabCount(content::WebContents* contents)
    : WebContentsUserData(*contents), WebContentsObserver(contents) {}
void ShieldTabCount::PrimaryMainFrameRenderProcessGone(base::TerminationStatus) {
  value = 0;
}
void ShieldTabCount::AboutToBeDiscarded(content::WebContents*) { value = 0; }
void ShieldTabCount::WasDiscarded() { value = 0; }
WEB_CONTENTS_USER_DATA_KEY_IMPL(ShieldTabCount);

// Capture both documents before asynchronous policy evaluation. A surviving
// child frame must not charge a newly committed top-level document.
class ShieldCountTicket {
 public:
  explicit ShieldCountTicket(content::RenderFrameHost* frame) {
    if (!frame) return;
    source_ = frame->GetWeakDocumentPtr();
    top_ = frame->GetMainFrame()->GetWeakDocumentPtr();
  }
  void RecordRuleBlock(int result) {
    if (recorded_ || result != 1) return;
    auto* source = source_.AsRenderFrameHostIfValid();
    auto* top = top_.AsRenderFrameHostIfValid();
    if (!source || !top || !source->IsRenderFrameLive() ||
        !top->IsRenderFrameLive() || source->GetMainFrame() != top) return;
    auto* contents = content::WebContents::FromRenderFrameHost(top);
    if (!contents || contents->GetPrimaryMainFrame() != top) return;
    auto* count = ShieldTabCount::GetOrCreateForWebContents(contents);
    if (count->value < std::numeric_limits<int>::max()) ++count->value;
    recorded_ = true;
  }
 private:
  content::WeakDocumentPtr source_;
  content::WeakDocumentPtr top_;
  bool recorded_ = false;
};
