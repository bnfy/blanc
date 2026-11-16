// One ephemeral parser per window. Reuses the sandboxed V8 service, but not
// the Sync singleton, stores, platform or account. The host denies every I/O.
class TabImportRunner : public blanc::mojom::SyncHost {
 public:
  using Reply = blanc::SyncCallback;
  TabImportRunner();
  ~TabImportRunner() override;
  void Call(std::string args, Reply reply) {
    const uint64_t id = ++next_;
    pending_.emplace(id, std::move(reply));
    base::SingleThreadTaskRunner::GetCurrentDefault()->PostDelayedTask(FROM_HERE,
        base::BindOnce([](base::WeakPtr<TabImportRunner> self, uint64_t id) {
          if (self && self->pending_.contains(id)) self->Fail("import-timeout");
        }, weak_.GetWeakPtr(), id), base::Seconds(30));
    if (ready_) {Send(id, std::move(args)); return;}
    queued_.emplace_back(id, std::move(args));
    if (service_.is_bound()) return;
    auto resource = blanc::sync_resources::Find("import-bundle.js");
    if (!resource) {Fail("import-bundle-missing"); return;}
    const std::string script(reinterpret_cast<const char*>(resource->data()), resource->size());
    if (base::ToLowerASCII(base::HexEncode(crypto::hash::Sha256(script))) != blanc::kBlancImportBundleSha256) {
      Fail("import-bundle-invalid"); return;
    }
    service_ = content::ServiceProcessHost::Launch<blanc::mojom::SyncRunner>(
        content::ServiceProcessHost::Options().WithDisplayName("Blanc Import").Pass());
    service_.set_disconnect_handler(base::BindOnce(&TabImportRunner::Fail, weak_.GetWeakPtr(), "import-ended"));
    service_->Start(script, {}, R"({"platform":"darwin","version":"local-import","env":{}})", host_.BindNewPipeAndPassRemote(),
        base::BindOnce([](base::WeakPtr<TabImportRunner> self, bool ready) {
          if (!self) return;
          if (!ready) {self->Fail("import-start-failed"); return;}
          self->ready_ = true;
          auto queued = std::move(self->queued_);
          for (auto& [queued_id, queued_args] : queued) self->Send(queued_id, std::move(queued_args));
        }, weak_.GetWeakPtr()));
  }
  void Reset() {Fail("session-unavailable");}
  void Fetch(const std::string&, const std::string&, const std::string&,
             const std::optional<std::vector<uint8_t>>&, FetchCallback reply) override;
  void WriteStore(const std::string&, const std::vector<uint8_t>&) override {}
  void PersistDesktopStore(const std::string&, const std::vector<uint8_t>&, PersistDesktopStoreCallback reply) override;
  void Protect(const std::vector<uint8_t>&, ProtectCallback reply) override;
  void Unprotect(const std::vector<uint8_t>&, UnprotectCallback reply) override;
  void Emit(const std::string&, const std::string&) override {}
 private:
  void Send(uint64_t id, std::string args) {
    service_->Call("desktop.import", args, base::BindOnce([](base::WeakPtr<TabImportRunner> self, uint64_t id, bool ok, const std::string& value) {
      if (!self) return;
      auto found = self->pending_.find(id); if (found == self->pending_.end()) return;
      auto reply = std::move(found->second); self->pending_.erase(found);
      std::move(reply).Run(ok, value);
    }, weak_.GetWeakPtr(), id));
  }
  void Fail(const char* why) {
    weak_.InvalidateWeakPtrs(); service_.reset(); host_.reset(); ready_ = false; queued_.clear();
    auto pending = std::move(pending_);
    for (auto& [id, reply] : pending) std::move(reply).Run(false, why);
  }
  mojo::Remote<blanc::mojom::SyncRunner> service_;
  mojo::Receiver<blanc::mojom::SyncHost> host_{this};
  std::map<uint64_t, Reply> pending_;
  std::vector<std::pair<uint64_t, std::string>> queued_;
  bool ready_ = false;
  uint64_t next_ = 0;
  base::WeakPtrFactory<TabImportRunner> weak_{this};
};
TabImportRunner::TabImportRunner() = default;
TabImportRunner::~TabImportRunner() {Fail("import-closed");}

void TabImportRunner::Fetch(const std::string&, const std::string&, const std::string&,
    const std::optional<std::vector<uint8_t>>&, FetchCallback reply) {std::move(reply).Run("forbidden", 0, "{}", {});}
void TabImportRunner::PersistDesktopStore(const std::string&, const std::vector<uint8_t>&, PersistDesktopStoreCallback reply) {std::move(reply).Run(false);}
void TabImportRunner::Protect(const std::vector<uint8_t>&, ProtectCallback reply) {std::move(reply).Run(std::nullopt);}
void TabImportRunner::Unprotect(const std::vector<uint8_t>&, UnprotectCallback reply) {std::move(reply).Run(std::nullopt);}
