// Copyright 2026 Bananify Creative. MIT; see the Blanc repository LICENSE.
#ifndef BLANC_BROWSER_UI_BROWSER_API_BANG_ICONS_H_
#define BLANC_BROWSER_UI_BROWSER_API_BANG_ICONS_H_

#include <deque>
#include <map>
#include <memory>
#include <optional>
#include <set>
#include <string>
#include <vector>

#include "base/files/file_path.h"
#include "base/memory/raw_ptr.h"
#include "base/memory/weak_ptr.h"
#include "base/observer_list.h"
#include "base/observer_list_types.h"
#include "base/supports_user_data.h"
#include "blanc/browser/ui/browser_api/bang_icon_policy.h"
#include "blanc/buildflags.h"

class Profile;
class SkBitmap;
namespace network { class SimpleURLLoader; }

namespace blanc::browser_api::bang_icons {

// Site icons for the ⌘L panel's bang rows (shipping v1.45.1
// src/main/bang-icons.js): the store of icons fetched from Blanc's icon
// server, kept on this device beside the profile and never synced, and the
// queue that asks the server under bang_icon_policy.h's rules. Fetched images
// are decoded in Chromium's sandboxed image decoder and kept as 32 px PNG
// data URLs. One per regular profile, shared by its windows.
class Service : public base::SupportsUserData::Data {
 public:
  class Observer : public base::CheckedObserver {
   public:
    // `icon` is null when the server no longer has one or history was cleared.
    virtual void OnBangIconChanged(const std::string& host, const std::optional<std::string>& icon) = 0;
  };

  static Service* ForProfile(Profile* profile);
  explicit Service(Profile* profile);
  Service(const Service&) = delete;
  Service& operator=(const Service&) = delete;
  ~Service() override;

  void AddObserver(Observer* observer);
  void RemoveObserver(Observer* observer);

  // The kept server copy for a host, if any.
  std::optional<std::string> Held(const std::string& host) const;
  // Asks the server for each host the rules allow; the context is decided by
  // the caller at call time.
  void Request(const std::vector<std::string>& hosts, bool enabled, bool private_active,
               const std::set<std::string>& custom_hosts);
  // Drawing a row counts as use: least recently used is dropped first.
  void Touch(const std::vector<std::string>& hosts);
  // A window was given this host's icon; a clear withdraws it again.
  void NoteShown(const std::string& host);
  // History was cleared: the icons go with the recent bangs.
  void Clear();

#if BUILDFLAG(ENABLE_BLANC_TEST_HOOKS)
  // Shipping's stubBangIconServer: host -> "png" or "not-found"; any other host
  // fails. Under --blanc-test the server is never contacted.
  void SetTestServer(std::map<std::string, std::string> answers);
  const std::vector<std::string>& RequestedHosts() const { return requested_; }
  std::vector<std::string> StoredHosts() const;
#endif

 private:
  const Record* Find(const std::string& host) const;
  void Pump();
  void Fetch(const std::string& host);
  void OnFetched(const std::string& host, uint64_t generation, int status, std::optional<std::string> body);
  void OnDecoded(const std::string& host, uint64_t generation, const SkBitmap& bitmap);
  void Finish(const std::string& host, Outcome outcome);
  void Emit(const std::string& host, const std::optional<std::string>& icon);
  void SetRecords(std::vector<Record> records);
  void OnStoreLoaded(std::vector<Record> records);
  void OnCatalogLoaded(std::set<std::string> hosts);
  bool TestMode() const;

  raw_ptr<Profile> profile_;
  base::FilePath store_path_;
  std::vector<Record> records_;
  std::set<std::string> catalog_hosts_;
  RunState run_;
  std::deque<std::string> queue_;
  size_t active_ = 0;
  // Bumped by Clear(): a fetch started before it must not refill the store.
  uint64_t generation_ = 0;
  std::map<std::string, std::unique_ptr<network::SimpleURLLoader>> loaders_;
  std::set<std::string> shown_;
  base::ObserverList<Observer> observers_;
#if BUILDFLAG(ENABLE_BLANC_TEST_HOOKS)
  std::map<std::string, std::string> test_answers_;
  std::vector<std::string> requested_;
#endif
  base::WeakPtrFactory<Service> weak_factory_{this};
};

}  // namespace blanc::browser_api::bang_icons

#endif  // BLANC_BROWSER_UI_BROWSER_API_BANG_ICONS_H_
