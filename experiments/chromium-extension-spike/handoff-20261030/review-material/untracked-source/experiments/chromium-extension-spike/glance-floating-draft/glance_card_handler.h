#ifndef BLANC_GLANCE_FLOATING_DRAFT_CARD_HANDLER_H_
#define BLANC_GLANCE_FLOATING_DRAFT_CARD_HANDLER_H_

#include <cstdint>
#include <optional>
#include <string>

#include "base/functional/callback.h"
#include "base/memory/weak_ptr.h"
#include "base/supports_user_data.h"
#include "base/values.h"
#include "content/public/browser/web_ui_message_handler.h"

namespace content { class WebContents; }

namespace blanc::glance::draft {
struct CardRequest {
  std::string id;
  std::string action;
  uint64_t generation;
  base::DictValue arguments;
};
struct CardReply {
  bool success;
  base::Value value;
};

// Validates protocol shape, not authority. The window owner must independently
// validate sender, profile, live card/target identity and generation.
std::optional<CardRequest> ParseCardRequest(const base::ListValue& message);

class GlanceCardHandler : public content::WebUIMessageHandler {
 public:
  using Authorize = base::RepeatingCallback<bool(content::WebContents*, uint64_t)>;
  using Dispatch = base::RepeatingCallback<CardReply(const CardRequest&)>;
  class Capability : public base::SupportsUserData::Data {
   public:
    Capability(Authorize authorize, Dispatch dispatch);
    ~Capability() override;
   private:
    friend class GlanceCardHandler;
    Authorize authorize_;
    Dispatch dispatch_;
    base::WeakPtrFactory<Capability> weak_factory_{this};
  };
  // The native window owner installs a capability on its exact card contents
  // before use. No existing capability is replaced. Only the matching lease
  // can revoke it; destroying the WebContents also destroys the capability.
  static base::WeakPtr<Capability> InstallCapability(content::WebContents* card,
                                                     Authorize authorize,
                                                     Dispatch dispatch);
  static void RevokeCapability(content::WebContents* card,
                               base::WeakPtr<Capability> lease);
  GlanceCardHandler();
  ~GlanceCardHandler() override;
  void RegisterMessages() override;
  void OnJavascriptDisallowed() override;

 private:
  bool IsCardDocument();
  void Handle(const base::ListValue& message);
  base::WeakPtrFactory<GlanceCardHandler> weak_factory_{this};
};
}  // namespace blanc::glance::draft
#endif
