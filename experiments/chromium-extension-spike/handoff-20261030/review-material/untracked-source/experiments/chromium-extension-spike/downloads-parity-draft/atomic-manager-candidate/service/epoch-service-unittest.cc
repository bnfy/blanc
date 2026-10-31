// Review-only test candidate. Not registered, compiled or run.
#include "epoch-service.h"
#include "chrome/test/base/testing_profile.h"
#include "content/public/test/browser_task_environment.h"
#include "content/public/test/mock_download_manager.h"
#include "testing/gmock/include/gmock/gmock.h"
#include "testing/gtest/include/gtest/gtest.h"
namespace blanc::downloads_projection {
namespace {
using ::testing::_;
using ::testing::Return;
using ::testing::NiceMock;
class EpochServiceTest : public testing::Test {
 protected:
  content::BrowserTaskEnvironment task_environment_;
  TestingProfile owner_;
};
TEST_F(EpochServiceTest, RegularManagerShutdownRevokesLease) {
  NiceMock<content::MockDownloadManager> manager;
  ON_CALL(manager, GetBrowserContext()).WillByDefault(Return(&owner_));
  EXPECT_CALL(manager, AddObserverIfRunning(_)).WillOnce(Return(true));
  EXPECT_CALL(manager, RemoveObserver(_)).Times(1);
  EpochService service(&owner_);
  ASSERT_TRUE(service.Adopt(Scope::kRegular, &owner_, &manager));
  auto lease = service.Capture(Scope::kRegular);
  ASSERT_TRUE(lease);
  EXPECT_TRUE(service.IsCurrent(*lease));
  service.ManagerGoingDown(&manager);
  EXPECT_FALSE(service.IsCurrent(*lease));
  EXPECT_FALSE(service.Capture(Scope::kRegular));
}
TEST_F(EpochServiceTest, AlreadyShutDownManagerNeverIssuesLease) {
  NiceMock<content::MockDownloadManager> manager;
  ON_CALL(manager, GetBrowserContext()).WillByDefault(Return(&owner_));
  EXPECT_CALL(manager, AddObserverIfRunning(_)).WillOnce(Return(false));
  EXPECT_CALL(manager, RemoveObserver(_)).Times(0);
  EpochService service(&owner_);
  EXPECT_FALSE(service.Adopt(Scope::kRegular, &owner_, &manager));
  EXPECT_FALSE(service.Capture(Scope::kRegular));
}
TEST_F(EpochServiceTest, PrivateManagerRecreationRejectsOldEpoch) {
  Profile* otr = owner_.GetPrimaryOTRProfile(/*create_if_needed=*/true);
  ASSERT_TRUE(otr);
  NiceMock<content::MockDownloadManager> manager;
  ON_CALL(manager, GetBrowserContext()).WillByDefault(Return(otr));
  EXPECT_CALL(manager, AddObserverIfRunning(_)).Times(2).WillRepeatedly(Return(true));
  EXPECT_CALL(manager, RemoveObserver(_)).Times(2);
  EpochService service(&owner_);
  ASSERT_TRUE(service.Adopt(Scope::kPrimaryPrivate, otr, &manager));
  auto old = service.Capture(Scope::kPrimaryPrivate);
  ASSERT_TRUE(old);
  service.ManagerGoingDown(&manager);
  EXPECT_FALSE(service.IsCurrent(*old));
  // Same mock address is reused solely to test epoch rotation. Real manager
  // shutdown cannot be reversed and needs a separate integration test.
  ASSERT_TRUE(service.Adopt(Scope::kPrimaryPrivate, otr, &manager));
  EXPECT_FALSE(service.IsCurrent(*old));
  EXPECT_TRUE(service.Capture(Scope::kPrimaryPrivate));
}
}  // namespace
}  // namespace blanc::downloads_projection
