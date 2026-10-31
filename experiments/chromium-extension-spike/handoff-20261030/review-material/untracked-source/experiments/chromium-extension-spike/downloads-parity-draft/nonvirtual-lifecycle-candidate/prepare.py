from pathlib import Path
import difflib,hashlib,json
src=Path('<local-home>/Projects/BlancChromium158/src');h=Path(__file__).resolve().parent
name='content/browser/browser_context_impl.cc';old=(src/name).read_text();new=old
assert new.count('#include "base/memory/ref_counted.h"')==1
new=new.replace('#include "base/memory/ref_counted.h"','#include "base/memory/ref_counted.h"\n#include "base/scoped_observation.h"',1)
new=new.replace('#include "content/public/browser/browser_context.h"','#include "content/public/browser/browser_context.h"\n#include "content/public/browser/blanc_download_lifecycle.h"',1)
needle='''namespace {

void NotifyContextWillBeDestroyed'''
insert='''namespace {

// UI-sequence-owned tracker for the exact manager constructed below. Its
// absence is meaningful: never attach it to an already-published manager.
const char kBlancDownloadLifetimeKey[] = "blanc.download.lifetime";
class BlancDownloadLifetimeData final : public base::SupportsUserData::Data,
                                        public DownloadManager::Observer {
 public:
  explicit BlancDownloadLifetimeData(DownloadManagerImpl* manager);
  ~BlancDownloadLifetimeData() override;
  void ManagerGoingDown(DownloadManager* manager) override;
  const base::UnguessableToken& generation() const { return generation_; }
 private:
  base::UnguessableToken generation_ = base::UnguessableToken::Create();
  base::ScopedObservation<DownloadManager, DownloadManager::Observer>
      observation_{this};
};
BlancDownloadLifetimeData::BlancDownloadLifetimeData(DownloadManagerImpl* manager) {
  observation_.Observe(manager);
}
BlancDownloadLifetimeData::~BlancDownloadLifetimeData() = default;
void BlancDownloadLifetimeData::ManagerGoingDown(DownloadManager* manager) {
  generation_ = base::UnguessableToken();
  observation_.Reset();
}

void NotifyContextWillBeDestroyed'''
assert new.count(needle)==1;new=new.replace(needle,insert,1)
needle='''}  // namespace

// static
BrowserContextImpl* BrowserContextImpl::From'''
insert='''}  // namespace

std::optional<BlancDownloadLifetime> GetBlancDownloadLifetime(
    BrowserContext* context) {
  if (!BrowserThread::CurrentlyOn(BrowserThread::UI) || !context ||
      context->ShutdownStarted()) return std::nullopt;
  auto* data = static_cast<BlancDownloadLifetimeData*>(
      context->GetUserData(kBlancDownloadLifetimeKey));
  if (!data || data->generation().is_empty()) return std::nullopt;
  return BlancDownloadLifetime{context->UniqueToken(), data->generation()};
}
bool IsBlancDownloadLifetimeCurrent(
    BrowserContext* context, const BlancDownloadLifetime& expected) {
  auto current = GetBlancDownloadLifetime(context);
  return current && *current == expected;
}

// static
BrowserContextImpl* BrowserContextImpl::From'''
assert new.count(needle)==1;new=new.replace(needle,insert,1)
needle='''    download_manager_ = std::make_unique<DownloadManagerImpl>(self_);

    // Note that GetDownloadManagerDelegate'''
insert='''    download_manager_ = std::make_unique<DownloadManagerImpl>(self_);
    if (!self_->ShutdownStarted()) {
      self_->SetUserData(kBlancDownloadLifetimeKey,
                         std::make_unique<BlancDownloadLifetimeData>(
                             static_cast<DownloadManagerImpl*>(download_manager_.get())));
    }

    // Note that GetDownloadManagerDelegate'''
assert new.count(needle)==1;new=new.replace(needle,insert,1)
out=h/'files'/name
if out.exists():raise SystemExit('refusing overwrite existing candidate')
out.parent.mkdir(parents=True,exist_ok=True);out.write_text(new)
(h/'candidate.patch').write_text(''.join(difflib.unified_diff(old.splitlines(True),new.splitlines(True),fromfile='a/'+name,tofile='b/'+name)))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
header=h/'files/content/public/browser/blanc_download_lifecycle.h'
(h/'manifest.json').write_text(json.dumps({'base':{name:sha(src/name)},'candidate':{name:sha(out),'content/public/browser/blanc_download_lifecycle.h':sha(header)}},indent=2)+'\n')
print('isolated candidate written; no native files modified')
