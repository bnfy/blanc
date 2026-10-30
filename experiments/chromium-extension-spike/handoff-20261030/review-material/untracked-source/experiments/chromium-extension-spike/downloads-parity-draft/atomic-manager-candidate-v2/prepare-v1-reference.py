from pathlib import Path
import hashlib,json,difflib
src=Path('<local-home>/Projects/BlancChromium158/src')
here=Path(__file__).resolve().parent
files=['content/public/browser/download_manager.h','content/browser/download/download_manager_impl.h','content/browser/download/download_manager_impl.cc','content/public/test/mock_download_manager.h','content/browser/download/download_manager_impl_unittest.cc']
def sha(data):return hashlib.sha256(data).hexdigest()
def replace_once(text, old, new):
 if text.count(old)!=1:raise RuntimeError(f'expected one occurrence: {old[:100]} got {text.count(old)}')
 return text.replace(old,new,1)
originals={f:(src/f).read_bytes() for f in files}
output={f:b.decode() for f,b in originals.items()}
f=files[0];o='  // Remove a download observer from ourself.\n  virtual void RemoveObserver(Observer* observer) = 0;'
n='''  // Registers an observer only if shutdown has not begun. Called on the UI
  // sequence. Implementations must not invoke observer callbacks, spin a nested
  // loop or otherwise reenter during this operation. If true, the caller must
  // remove the observer or handle ManagerGoingDown; false means no registration.
  // Default implementation fails closed for unsupported manager implementations.
  virtual bool AddObserverIfRunning(Observer*) { return false; }

  // Remove a download observer from ourself.
  virtual void RemoveObserver(Observer* observer) = 0;'''
output[f]=replace_once(output[f],o,n)
f=files[1];output[f]=replace_once(output[f],'  void AddObserver(Observer* observer) override;\n  void RemoveObserver(Observer* observer) override;','  void AddObserver(Observer* observer) override;\n  bool AddObserverIfRunning(Observer* observer) override;\n  void RemoveObserver(Observer* observer) override;')
f=files[2];output[f]=replace_once(output[f],'void DownloadManagerImpl::Shutdown() {\n  DVLOG', 'void DownloadManagerImpl::Shutdown() {\n  CHECK_CURRENTLY_ON(BrowserThread::UI);\n  DVLOG');output[f]=replace_once(output[f],'''void DownloadManagerImpl::RemoveObserver(Observer* observer) {
  observers_.RemoveObserver(observer);
}''','''bool DownloadManagerImpl::AddObserverIfRunning(Observer* observer) {
  CHECK_CURRENTLY_ON(BrowserThread::UI);
  if (!observer || !shutdown_needed_ || observers_.HasObserver(observer))
    return false;
  // ObserverList::AddObserver does not notify observers or run nested tasks.
  observers_.AddObserver(observer);
  return true;
}

void DownloadManagerImpl::RemoveObserver(Observer* observer) {
  observers_.RemoveObserver(observer);
}''')
f=files[3];output[f]=replace_once(output[f],'  MOCK_METHOD1(AddObserver, void(Observer* observer));','  MOCK_METHOD1(AddObserver, void(Observer* observer));\n  MOCK_METHOD1(AddObserverIfRunning, bool(Observer* observer));')
f=files[4];o='TEST_F(DownloadManagerShutdownTest,\n       OnDownloadCanceledAtShutdownCalledForInProgressDownload) {'
n='''TEST_F(DownloadManagerShutdownTest, ObserveIfRunningTracksShutdownAtomically) {
  MockDownloadManagerObserver accepted;
  MockDownloadManagerObserver late;
  EXPECT_FALSE(download_manager_->AddObserverIfRunning(nullptr));
  EXPECT_TRUE(download_manager_->AddObserverIfRunning(&accepted));
  EXPECT_FALSE(download_manager_->AddObserverIfRunning(&accepted));
  EXPECT_CALL(GetMockObserver(), ManagerGoingDown(download_manager_.get()));
  EXPECT_CALL(accepted, ManagerGoingDown(download_manager_.get()))
      .WillOnce([&](DownloadManager*) {
        EXPECT_FALSE(download_manager_->AddObserverIfRunning(&late));
      });
  EXPECT_CALL(late, ManagerGoingDown(_)).Times(0);
  download_manager_->Shutdown();
  EXPECT_FALSE(download_manager_->AddObserverIfRunning(&late));
}

TEST_F(DownloadManagerShutdownTest,
       OnDownloadCanceledAtShutdownCalledForInProgressDownload) {'''
output[f]=replace_once(output[f],o,n)
patch=[]
for f in files:
 dest=here/'files'/f;dest.parent.mkdir(parents=True,exist_ok=True)
 if dest.exists():raise SystemExit('refusing overwrite '+str(dest))
 dest.write_text(output[f]);patch.extend(difflib.unified_diff(originals[f].decode().splitlines(True),output[f].splitlines(True),fromfile='a/'+f,tofile='b/'+f))
(here/'candidate.patch').write_text(''.join(patch))
(here/'manifest.json').write_text(json.dumps({'files':{f:{'base':sha(originals[f]),'candidate':sha(output[f].encode())}for f in files}},indent=2)+'\n')
print('candidate source snapshots prepared:',len(files))
