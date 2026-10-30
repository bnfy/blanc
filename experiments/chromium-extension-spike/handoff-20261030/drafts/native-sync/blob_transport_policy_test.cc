#include "blob_transport.h"
#include "base/at_exit.h"
#include "base/check.h"
#include <iostream>
using T = blanc::sync::BlobTransport;
int main() {
  base::AtExitManager at_exit;
  const std::string account(64, 'a'), space = "space-" + std::string(32, 'b');
  for (const auto* store : {"bookmarks","settings","session","icons","sends","spaces","closed","shared"}) {
    CHECK(T::PathFor({T::Method::kGet,account,store,{}}) == "/v1/blob/"+account+"/"+store);
    CHECK(T::PathFor({T::Method::kPut,account,store,"{}"}));
    CHECK(!T::PathFor({T::Method::kDeleteSpace,account,store,{}}));
  }
  CHECK(T::PathFor({T::Method::kGet,account,space,{}}));
  CHECK(T::PathFor({T::Method::kDeleteSpace,account,space,{}}));
  CHECK(T::PathFor({T::Method::kDeleteAccount,account,{},{}}) == "/v1/blob/"+account);
  for (const auto& bad : std::initializer_list<std::string>{"", "../settings", "settings?x=y", "session#x", "space-abc", "space-"+std::string(32,'A'), "https://example.org"}) {
    CHECK(!T::PathFor({T::Method::kGet,account,bad,{}}));
  }
  CHECK(!T::PathFor({T::Method::kGet,std::string(64,'A'),"session",{}}));
  CHECK(!T::PathFor({T::Method::kGet,account,"session","body"}));
  CHECK(!T::PathFor({T::Method::kPut,account,"session",{}}));
  CHECK(!T::PathFor({T::Method::kDeleteAccount,account,"session",{}}));
  CHECK(!T::PathFor({static_cast<T::Method>(99),account,"session",{}}));
  CHECK(T::PathFor({T::Method::kPut,account,"session",std::string(524288,'x')}));
  CHECK(!T::PathFor({T::Method::kPut,account,"session",std::string(524289,'x')}));
  std::cout << "blob transport path/method/body boundary policy passed; no network\n";
}
