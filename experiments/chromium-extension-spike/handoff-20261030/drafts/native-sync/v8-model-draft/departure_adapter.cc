#include "departure_adapter.h"
#include <cmath>
#include "base/functional/bind.h"
#include "base/json/json_writer.h"
#include "base/uuid.h"
#include "base/values.h"
#include "crypto/secure_util.h"
namespace blanc::sync::draft {
BlobModelHooks DepartureModel(std::shared_ptr<ModelRunner> runner,std::string own,
                             std::function<double()> clock) {
 BlobModelHooks hooks;
 hooks.plan_async=[runner=std::move(runner),own=std::move(own),clock=std::move(clock)](
     std::optional<std::string> remote,BlobModelHooks::Planned done){
  const auto id=base::Uuid::ParseLowercase(own);const double now=clock?clock():NAN;
  if(!runner||!id.is_valid()||!std::isfinite(now)){
   if(remote)crypto::SecureZeroBuffer(base::as_writable_byte_span(*remote));
   std::move(done).Run({{},"server"});return;
  }
  base::DictValue metadata;metadata.Set("ownId",own);metadata.Set("now",now);
  // Serialize the remote document as a STRING, then parse it separately in
  // the runtime. Unvalidated JSON must not be able to inject native metadata.
  metadata.Set("remoteJson",remote?*remote:"null");
  auto encoded=base::WriteJson(metadata);
  if(remote)crypto::SecureZeroBuffer(base::as_writable_byte_span(*remote));
  if(!encoded){std::move(done).Run({{},"server"});return;}
  runner->Run(ModelRunner::Method::kDeparture,std::move(*encoded),base::BindOnce(
      [](BlobModelHooks::Planned done,ModelRunner::Result result){
       if(!result.error.empty()){std::move(done).Run({{},result.error=="invalid-json"?"bad-passphrase":"server"});return;}
       if(result.json=="null"){std::move(done).Run({{}, {}});return;}
       std::move(done).Run({std::move(result.json),{}});
      },std::move(done)));
 };
 return hooks;
}
}
