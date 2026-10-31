from pathlib import Path
import difflib,hashlib,json
src=Path('<local-home>/Projects/BlancChromium158/src');h=Path(__file__).resolve().parent
name='content/browser/download/download_manager_impl_unittest.cc';old=(src/name).read_text();new=old
needle='#include "content/public/browser/browser_context.h"'
assert new.count(needle)==1;new=new.replace(needle,needle+'\n#include "content/public/browser/blanc_download_lifecycle.h"',1)
needle='class DownloadManagerShutdownTest : public DownloadManagerTest {'
insert='''// Synthetic TestBrowserContext owns a temporary directory; no real profile is
// required. These tests exercise the lifecycle helper, not actual private
// Profile parentage, renderer delivery, downloads or warning presentation.
TEST_F(DownloadManagerTest, BlancLifecycleDoesNotCreateAndTracksShutdown) {
  TestBrowserContext context;
  EXPECT_FALSE(GetBlancDownloadLifetime(&context));
  auto* manager = context.GetDownloadManager();
  ASSERT_TRUE(manager);
  auto first = GetBlancDownloadLifetime(&context);
  ASSERT_TRUE(first);
  EXPECT_TRUE(IsBlancDownloadLifetimeCurrent(&context, *first));
  manager->Shutdown();
  EXPECT_FALSE(GetBlancDownloadLifetime(&context));
  EXPECT_FALSE(IsBlancDownloadLifetimeCurrent(&context, *first));
  // The setter shuts down the old manager again before dropping it. This must
  // remain safe and no old pointer is used after replacement.
  context.SetDownloadManagerForTesting(nullptr);
  auto* replacement = context.GetDownloadManager();
  ASSERT_TRUE(replacement);
  auto second = GetBlancDownloadLifetime(&context);
  ASSERT_TRUE(second);
  EXPECT_NE(first->manager_generation, second->manager_generation);
  EXPECT_FALSE(IsBlancDownloadLifetimeCurrent(&context, *first));
}
TEST_F(DownloadManagerTest, BlancLifecycleSeparatesSyntheticPrivateContexts) {
  TestBrowserContext regular;
  TestBrowserContext private_context;
  private_context.set_is_off_the_record(true);
  ASSERT_TRUE(regular.GetDownloadManager());
  ASSERT_TRUE(private_context.GetDownloadManager());
  auto regular_lease = GetBlancDownloadLifetime(&regular);
  auto private_lease = GetBlancDownloadLifetime(&private_context);
  ASSERT_TRUE(regular_lease && private_lease);
  EXPECT_NE(regular_lease->context, private_lease->context);
  EXPECT_FALSE(IsBlancDownloadLifetimeCurrent(&regular, *private_lease));
  private_context.NotifyWillBeDestroyed();
  EXPECT_FALSE(IsBlancDownloadLifetimeCurrent(&private_context, *private_lease));
  EXPECT_TRUE(IsBlancDownloadLifetimeCurrent(&regular, *regular_lease));
}
class BlancReentrantTestContext : public TestBrowserContext {
 public:
  DownloadManagerDelegate* GetDownloadManagerDelegate() override {
    saw_lifetime = GetBlancDownloadLifetime(this).has_value();
    reentrant_manager = GetDownloadManager();
    return nullptr;
  }
  bool saw_lifetime = false;
  raw_ptr<DownloadManager> reentrant_manager = nullptr;
};
TEST_F(DownloadManagerTest, BlancLifetimeExistsBeforeReentrantDelegate) {
  BlancReentrantTestContext context;
  auto* manager = context.GetDownloadManager();
  EXPECT_TRUE(context.saw_lifetime);
  EXPECT_EQ(context.reentrant_manager, manager);
  auto lease = GetBlancDownloadLifetime(&context);
  ASSERT_TRUE(lease);
  EXPECT_TRUE(IsBlancDownloadLifetimeCurrent(&context, *lease));
}

class DownloadManagerShutdownTest : public DownloadManagerTest {'''
assert new.count(needle)==1;new=new.replace(needle,insert,1)
out=h/'files'/name
if out.exists():raise SystemExit('refusing overwrite')
out.parent.mkdir(parents=True,exist_ok=True);out.write_text(new)
man=json.loads((h/'manifest.json').read_text());man['base'][name]=hashlib.sha256(old.encode()).hexdigest();man['candidate'][name]=hashlib.sha256(new.encode()).hexdigest();(h/'manifest.json').write_text(json.dumps(man,indent=2)+'\n')
patch=(h/'candidate.patch').read_text()+''.join(difflib.unified_diff(old.splitlines(True),new.splitlines(True),fromfile='a/'+name,tofile='b/'+name));(h/'candidate.patch').write_text(patch)
print('review-only tests prepared; no compile or staging')
