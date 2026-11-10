// Copyright 2026 Bananify Creative. MIT; see LICENSE.
#ifndef BLANC_BROWSER_SYNC_DESKTOP_SYNC_SERVICE_H_
#define BLANC_BROWSER_SYNC_DESKTOP_SYNC_SERVICE_H_

#include <cstddef>
#include <cstdint>
#include <deque>
#include <memory>
#include <map>
#include <optional>
#include <set>
#include <string>

#include "base/files/file_path.h"
#include "base/memory/raw_ptr.h"
#include "base/memory/weak_ptr.h"
#include "base/observer_list.h"
#include "base/scoped_observation.h"
#include "base/task/sequenced_task_runner.h"
#include "base/timer/timer.h"
#include "base/values.h"
#include "blanc/services/sync_runner/sync_runner_proxy.h"
#include "chrome/browser/profiles/profile_observer.h"
#include "components/bookmarks/browser/base_bookmark_model_observer.h"
#include "components/prefs/pref_change_registrar.h"

class Profile;
namespace bookmarks { class BookmarkModel; }
namespace os_crypt_async { class Encryptor; }
namespace blanc {
class DesktopSyncPlatform;

// UI sequence only. There is exactly one default-profile runner per process.
// This object and its platform stay alive through shutdown: SyncPlatform's
// off-thread key operations have process lifetime. Profile teardown detaches
// observers, invalidates callbacks and refuses further calls.
class DesktopSyncService final : public ProfileObserver,
                                 public bookmarks::BaseBookmarkModelObserver {
 public:
  class Observer : public base::CheckedObserver {
   public:
    virtual void OnSyncEvent(const std::string& event, const std::string& json) = 0;
  };
  static DesktopSyncService* ForProfile(Profile* profile);
  ~DesktopSyncService() override;
  DesktopSyncService(const DesktopSyncService&) = delete;
  DesktopSyncService& operator=(const DesktopSyncService&) = delete;

  void Call(std::string method, std::string args_json, blanc::SyncCallback callback);
  void AddObserver(Observer* observer);
  void RemoveObserver(Observer* observer);
  void Reconcile();
  void SetTabs(base::ListValue tabs, base::ListValue groups);
  size_t PendingFirstUploadCount() const;
  void ConfirmFirstUpload(bool accept);

 private:
  explicit DesktopSyncService(Profile* profile);
  struct Request { std::string method, args; SyncCallback callback; };
  void Loaded(std::optional<base::DictValue> state);
  void InitializePlatform(std::string name, scoped_refptr<os_crypt_async::Encryptor> encryptor);
  void Pump();
  void Run(std::string method, std::string args, SyncCallback callback, bool guard_account = true);
  void CheckRunTimeout(std::shared_ptr<SyncCallback> reply, base::TimeTicks deadline, bool may_wait_for_budget);
  void ExpireRun(std::shared_ptr<SyncCallback> reply);
  void Status(bool ok, const std::string& json);
  void Favorites();
  void PlanFavorites(bool ok, const std::string& json);
  void ReplayOutgoing();
  void Settings();
  void PlanSettings(bool ok, const std::string& json);
  void Finish(bool retry = false);
  void Commit(base::DictValue next, base::OnceClosure done);
  void VerifyRunnerFile(std::string name, base::DictValue expected, base::OnceClosure done);
  void OnEvent(const std::string& event, const std::string& json);
  void NoteDevicesForChecklist();
  void Notify(const std::string& event, const std::string& json);
  void Fail(const std::string& error);
  base::DictValue LocalFavorites(std::set<std::string>* blocked) const;
  bool ApplyFavorite(const std::string& url, const base::Value& desired);

  void OnProfileWillBeDestroyed(Profile* profile) override;
  void BookmarkModelChanged() override;
  void BookmarkModelLoaded(bool ids_reassigned) override;
  void BookmarkModelBeingDeleted() override;

  raw_ptr<Profile> profile_;
  raw_ptr<bookmarks::BookmarkModel> bookmarks_ = nullptr;
  // Never destroyed while the process can issue SyncPlatform work.
  std::unique_ptr<DesktopSyncPlatform> platform_;
  const base::FilePath state_path_;
  scoped_refptr<base::SequencedTaskRunner> io_;
  base::DictValue state_;
  std::string last_status_json_;
  base::ObserverList<Observer> observers_;
  base::ScopedObservation<Profile, ProfileObserver> profile_observation_{this};
  base::ScopedObservation<bookmarks::BookmarkModel, bookmarks::BookmarkModelObserver> bookmark_observation_{this};
  PrefChangeRegistrar pref_changes_;
  base::OneShotTimer timer_;
  std::deque<Request> requests_;
  std::shared_ptr<SyncCallback> active_reply_;
  std::optional<bool> confirmation_;
  std::set<std::string> pending_uploads_;
  // Only pre-existing journals can be retired by a freshly loaded model.
  std::set<std::string> recovered_incoming_;
  std::set<std::string> applied_settings_;
  std::set<std::string> confirmed_urls_;
  std::map<std::string, double> local_changes_;
  base::DictValue last_local_;
  std::string tabs_sent_;
  base::TimeTicks tabs_sent_at_;
  bool tabs_pending_ = false;
  bool ready_ = false;
  bool running_ = false;
  bool again_ = false;
  bool applying_ = false;
  bool timed_out_ = false;
  bool failed_ = false;
  uint64_t account_epoch_ = 0;
  base::WeakPtrFactory<DesktopSyncService> weak_factory_{this};
};
}  // namespace blanc
#endif
