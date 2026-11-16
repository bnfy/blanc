#ifndef BLANC_SYNC_DRAFT_DEPARTURE_ADAPTER_H_
#define BLANC_SYNC_DRAFT_DEPARTURE_ADAPTER_H_
#include "model_runner.h"
#include "../blob_exchange.h"
namespace blanc::sync::draft {
// Native-only metadata from the profile state, never a renderer. No key or
// provider reaches the model runner. Clock is injected for deterministic checks.
BlobModelHooks DepartureModel(std::shared_ptr<ModelRunner> runner,
    std::string own_uuid,std::function<double()> clock);
}
#endif
