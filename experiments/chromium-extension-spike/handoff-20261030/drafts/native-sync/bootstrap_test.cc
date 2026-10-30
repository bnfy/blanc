#include "profile_state_store.h"
#include "base/at_exit.h"
#include "base/check.h"
#include "base/files/file_util.h"
#include "base/json/json_writer.h"
#include <iostream>
using namespace blanc::sync;
using Status = RequestLedger::Status;
using Mode = ProfileStateStore::BootstrapMode;
int main(int argc, char** argv) {
  base::AtExitManager at_exit; CHECK_EQ(argc, 2);
  const auto fixture = base::FilePath::FromUTF8Unsafe(argv[1]); CHECK(fixture.IsAbsolute());
  const std::string profile(64, 'a');
  const auto root = [&](const char* name) {
    const auto path = fixture.AppendASCII(name); CHECK(base::CreateDirectory(path)); return path;
  };
  const auto marker = [](const base::FilePath& path) { return path.AppendASCII("Blanc Sync.bootstrap"); };
  const auto state = [](const base::FilePath& path) { return path.AppendASCII("Blanc Sync/state.json"); };
  const auto prepare = [&](const base::FilePath& path) {
    base::DictValue json; json.Set("version", 1); json.Set("profile", profile);
    json.Set("phase", "preparing"); CHECK(base::WriteFile(marker(path), *base::WriteJson(json)));
  };
  const auto existing = root("existing-missing");
  CHECK(ProfileStateStore(existing, profile, true, false).Bootstrap() == Status::kMissing);
  CHECK(!base::PathExists(marker(existing)) && !base::PathExists(state(existing)));
  const auto fresh = root("fresh");
  auto store = std::make_shared<ProfileStateStore>(fresh, profile, true, false);
  CHECK(store->Bootstrap(Mode::kKnownFirstNativeSetup) == Status::kLoaded);
  CHECK(store->MakeLedger());
  const auto device = store->Read().state->device_id;
  CHECK(ProfileStateStore(fresh, profile, true, false).Bootstrap() == Status::kLoaded);
  CHECK_EQ(store->Read().state->device_id, device);
  CHECK(base::DeleteFile(state(fresh)));
  auto missing = std::make_shared<ProfileStateStore>(fresh, profile, true, false);
  CHECK(missing->Bootstrap(Mode::kKnownFirstNativeSetup) == Status::kMissing);
  CHECK(!missing->MakeLedger() && !base::PathExists(state(fresh)));
  // Actual first-write failure after the preparing marker has committed.
  const auto interrupted = root("interrupted");
  const auto interrupted_folder = interrupted.AppendASCII("Blanc Sync");
  CHECK(base::CreateDirectory(interrupted_folder));
  CHECK(base::SetPosixFilePermissions(interrupted_folder, 0500));
  const auto interrupted_result = ProfileStateStore(interrupted, profile, true, false)
      .Bootstrap(Mode::kKnownFirstNativeSetup);
  CHECK(base::SetPosixFilePermissions(interrupted_folder, 0700));
  CHECK(interrupted_result == Status::kWriteError);
  CHECK(base::PathExists(marker(interrupted)));
  CHECK(ProfileStateStore(interrupted, profile, true, false).Bootstrap() == Status::kLoaded);
  // State commits but the final ready-marker write fails. Until it succeeds,
  // neither the ledger nor metadata mutation can become active.
  const auto final_write = root("ready-write-failure");
  CHECK(base::CreateDirectory(final_write.AppendASCII("Blanc Sync"))); prepare(final_write);
  CHECK(base::SetPosixFilePermissions(final_write, 0500));
  auto not_ready = std::make_shared<ProfileStateStore>(final_write, profile, true, false);
  const auto failed = not_ready->Bootstrap();
  CHECK(base::SetPosixFilePermissions(final_write, 0700));
  CHECK(failed == Status::kWriteError);
  const auto preserved = not_ready->Read().state->device_id;
  CHECK(!not_ready->MakeLedger());
  CHECK(not_ready->SetConsents(0, true, false) == Status::kNotAllowed);
  auto recovered = std::make_shared<ProfileStateStore>(final_write, profile, true, false);
  CHECK(recovered->Bootstrap() == Status::kLoaded);
  CHECK_EQ(recovered->Read().state->device_id, preserved);
  // A preparing marker over a bundle that already has activity is inconsistent,
  // not permission to overwrite it or mark it ready.
  const auto active = root("unexpected-used-bundle");
  auto used = std::make_shared<ProfileStateStore>(active, profile, true, false);
  CHECK(used->Bootstrap(Mode::kKnownFirstNativeSetup) == Status::kLoaded);
  CHECK(used->SetConsents(0, true, false) == Status::kLoaded);
  std::string before; CHECK(base::ReadFileToString(state(active), &before)); prepare(active);
  CHECK(used->Bootstrap() == Status::kCorrupt); CHECK(!used->MakeLedger());
  std::string after; CHECK(base::ReadFileToString(state(active), &after)); CHECK_EQ(before, after);
  CHECK(ProfileStateStore(active, std::string(64, 'b'), true, false).Bootstrap() == Status::kWrongProfile);
  const auto private_root = fixture.AppendASCII("private-never-create");
  CHECK(ProfileStateStore(private_root, profile, true, true).Bootstrap(Mode::kKnownFirstNativeSetup)
      == Status::kNotAllowed);
  CHECK(!base::PathExists(private_root));
  std::cout << "bootstrap authority, interrupted setup, ready-marker write failure, missing established state and inconsistent-state refusal passed\n";
}
