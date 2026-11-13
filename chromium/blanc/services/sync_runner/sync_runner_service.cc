// Copyright 2026 Bananify Creative. MIT; see LICENSE.

#include "blanc/services/sync_runner/sync_runner_service.h"

#include "base/check.h"
#include "base/compiler_specific.h"
#include "base/functional/bind.h"
#include "base/logging.h"
#include "base/task/single_thread_task_runner.h"
#include "base/time/time.h"
#include "crypto/random.h"
#include "gin/array_buffer.h"
#include "gin/v8_initializer.h"
#include "third_party/boringssl/src/include/openssl/aead.h"
#include "third_party/boringssl/src/include/openssl/digest.h"
#include "third_party/boringssl/src/include/openssl/evp.h"
#include "third_party/boringssl/src/include/openssl/hkdf.h"
#include "third_party/boringssl/src/include/openssl/sha2.h"
#include "tools/v8_context_snapshot/buildflags.h"
#include "url/gurl.h"

namespace blanc {

// As in blocker_service.cc: gin takes the isolate before V8 can drop a cancelled
// task, so fence the whole wrapper when the service goes away.
class SyncRunnerTaskRunner final : public base::SingleThreadTaskRunner {
 public:
  SyncRunnerTaskRunner()
      : runner_(base::SingleThreadTaskRunner::GetCurrentDefault()),
        alive_(std::make_shared<bool>(true)) {}
  void Cancel() { *alive_ = false; }
  bool PostDelayedTask(const base::Location& from_here, base::OnceClosure task,
                       base::TimeDelta delay) override {
    return runner_->PostDelayedTask(from_here, Fence(std::move(task)), delay);
  }
  bool PostNonNestableDelayedTask(const base::Location& from_here, base::OnceClosure task,
                                  base::TimeDelta delay) override {
    return runner_->PostNonNestableDelayedTask(from_here, Fence(std::move(task)), delay);
  }
  bool RunsTasksInCurrentSequence() const override {
    return runner_->RunsTasksInCurrentSequence();
  }

 private:
  ~SyncRunnerTaskRunner() override = default;
  base::OnceClosure Fence(base::OnceClosure task) {
    return base::BindOnce([](std::shared_ptr<bool> alive, base::OnceClosure task) {
      if (*alive) std::move(task).Run();
    }, alive_, std::move(task));
  }
  const scoped_refptr<base::SingleThreadTaskRunner> runner_;
  const std::shared_ptr<bool> alive_;
};

namespace {
// One utility process runs one service.
SyncRunnerService* g_service = nullptr;
using Args = v8::FunctionCallbackInfo<v8::Value>;

v8::Local<v8::String> Str(v8::Isolate* isolate, std::string_view text) {
  return v8::String::NewFromUtf8(isolate, text.data(), v8::NewStringType::kNormal,
                                 static_cast<int>(text.size())).ToLocalChecked();
}
std::string ToString(v8::Isolate* isolate, v8::Local<v8::Value> value) {
  v8::String::Utf8Value text(isolate, value);
  return *text ? std::string(*text, text.length()) : std::string();
}
std::vector<uint8_t> Bytes(v8::Local<v8::Value> value) {
  if (!value->IsArrayBufferView()) return {};
  auto view = value.As<v8::ArrayBufferView>();
  std::vector<uint8_t> out(view->ByteLength());
  if (!out.empty()) view->CopyContents(out.data(), out.size());
  return out;
}
v8::Local<v8::ArrayBuffer> Buffer(v8::Isolate* isolate, base::span<const uint8_t> data) {
  auto buffer = v8::ArrayBuffer::New(isolate, data.size());
  auto store = buffer->GetBackingStore();
  // SAFETY: V8 allocated exactly data.size() bytes for this backing store.
  UNSAFE_BUFFERS(base::span(static_cast<uint8_t*>(store->Data()), store->ByteLength()))
      .copy_from(data);
  return buffer;
}
v8::Local<v8::Value> Array(v8::Isolate* isolate, base::span<const uint8_t> data) {
  return v8::Uint8Array::New(Buffer(isolate, data), 0, data.size());
}
int64_t Int(const Args& args, int index) {
  return args[index]->IntegerValue(args.GetIsolate()->GetCurrentContext()).FromMaybe(0);
}

void HostLog(const Args& args) { LOG(WARNING) << "sync: " << ToString(args.GetIsolate(), args[0]); }
void MonotonicNow(const Args& args) {
  args.GetReturnValue().Set((base::TimeTicks::Now() - base::TimeTicks()).InMillisecondsF());
}
void SetTimer(const Args& args) { g_service->SetTimer(static_cast<int>(Int(args, 0)), Int(args, 1)); }
void ParseUrl(const Args& args) {
  auto* isolate = args.GetIsolate();
  std::string input = ToString(isolate, args[0]);
  GURL url = args[1]->IsUndefined() ? GURL(input) : GURL(ToString(isolate, args[1])).Resolve(input);
  if (!url.is_valid()) { args.GetReturnValue().SetNull(); return; }
  auto context = isolate->GetCurrentContext();
  auto out = v8::Object::New(isolate);
  auto put = [&](std::string_view key, std::string_view value) {
    out->Set(context, Str(isolate, key), Str(isolate, value)).Check();
  };
  const std::string host(url.host()), port(url.port());
  put("href", url.spec());
  put("protocol", std::string(url.scheme()) + ":");
  put("username", url.username());
  put("password", url.password());
  put("host", port.empty() ? host : host + ":" + port);
  put("hostname", host);
  put("port", port);
  put("pathname", url.path());
  put("search", url.has_query() ? "?" + std::string(url.query()) : "");
  put("hash", url.has_ref() ? "#" + std::string(url.ref()) : "");
  args.GetReturnValue().Set(out);
}
void LoadStores(const Args& args) {
  auto* isolate = args.GetIsolate();
  auto context = isolate->GetCurrentContext();
  auto out = v8::Object::New(isolate);
  for (const auto& [name, data] : g_service->initial_stores())
    out->Set(context, Str(isolate, name), Array(isolate, data)).Check();
  args.GetReturnValue().Set(out);
}
void WriteStore(const Args& args) {
  g_service->host()->WriteStore(ToString(args.GetIsolate(), args[0]), Bytes(args[1]));
}
void PersistDesktopStore(const Args& args) {
  bool saved = false;
  g_service->host()->PersistDesktopStore(ToString(args.GetIsolate(), args[0]), Bytes(args[1]), &saved);
  args.GetReturnValue().Set(saved);
}
void RandomBytes(const Args& args) {
  std::vector<uint8_t> out(static_cast<size_t>(Int(args, 0)));
  crypto::RandBytes(out);
  args.GetReturnValue().Set(Array(args.GetIsolate(), out));
}
void Digest(const Args& args) {
  if (ToString(args.GetIsolate(), args[0]) != "sha256") return;
  auto data = Bytes(args[1]);
  std::vector<uint8_t> out(SHA256_DIGEST_LENGTH);
  SHA256(data.data(), data.size(), out.data());
  args.GetReturnValue().Set(Array(args.GetIsolate(), out));
}
void Scrypt(const Args& args) {
  auto password = Bytes(args[0]), salt = Bytes(args[1]);
  std::vector<uint8_t> out(static_cast<size_t>(Int(args, 6)));
  if (!EVP_PBE_scrypt(reinterpret_cast<const char*>(password.data()), password.size(), salt.data(),
                      salt.size(), Int(args, 2), Int(args, 3), Int(args, 4), Int(args, 5),
                      out.data(), out.size())) {
    return;
  }
  args.GetReturnValue().Set(Array(args.GetIsolate(), out));
}
void Hkdf(const Args& args) {
  if (ToString(args.GetIsolate(), args[0]) != "sha256") return;
  auto ikm = Bytes(args[1]), salt = Bytes(args[2]), info = Bytes(args[3]);
  std::vector<uint8_t> out(static_cast<size_t>(Int(args, 4)));
  if (!HKDF(out.data(), out.size(), EVP_sha256(), ikm.data(), ikm.size(), salt.data(), salt.size(),
            info.data(), info.size())) {
    return;
  }
  args.GetReturnValue().Set(Buffer(args.GetIsolate(), out));
}
std::optional<std::vector<uint8_t>> Gcm(bool seal, const std::vector<uint8_t>& key,
                                        const std::vector<uint8_t>& iv,
                                        const std::vector<uint8_t>& in) {
  bssl::ScopedEVP_AEAD_CTX ctx;
  if (key.size() != 32 || iv.size() != 12 ||
      !EVP_AEAD_CTX_init(ctx.get(), EVP_aead_aes_256_gcm(), key.data(), key.size(),
                         EVP_AEAD_DEFAULT_TAG_LENGTH, nullptr)) {
    return std::nullopt;
  }
  std::vector<uint8_t> out(in.size() + EVP_AEAD_max_overhead(EVP_aead_aes_256_gcm()));
  size_t size = 0;
  auto run = seal ? EVP_AEAD_CTX_seal : EVP_AEAD_CTX_open;
  if (!run(ctx.get(), out.data(), &size, out.size(), iv.data(), iv.size(), in.data(), in.size(),
           nullptr, 0)) {
    return std::nullopt;
  }
  out.resize(size);
  return out;
}
void GcmRun(const Args& args, bool seal) {
  auto out = Gcm(seal, Bytes(args[0]), Bytes(args[1]), Bytes(args[2]));
  if (out) args.GetReturnValue().Set(Array(args.GetIsolate(), *out));
  else args.GetReturnValue().SetNull();
}
void GcmSeal(const Args& args) { GcmRun(args, true); }
void GcmOpen(const Args& args) { GcmRun(args, false); }
void Protect(const Args& args) {
  std::optional<std::vector<uint8_t>> out;
  g_service->host()->Protect(Bytes(args[0]), &out);
  if (out) args.GetReturnValue().Set(Array(args.GetIsolate(), *out));
  else args.GetReturnValue().SetNull();
}
void Unprotect(const Args& args) {
  std::optional<std::vector<uint8_t>> out;
  g_service->host()->Unprotect(Bytes(args[0]), &out);
  if (out) args.GetReturnValue().Set(Array(args.GetIsolate(), *out));
  else args.GetReturnValue().SetNull();
}
void Fetch(const Args& args) {
  auto* isolate = args.GetIsolate();
  std::optional<std::vector<uint8_t>> body;
  if (args[3]->IsArrayBufferView()) body = Bytes(args[3]);
  g_service->Fetch(ToString(isolate, args[0]), ToString(isolate, args[1]),
                   ToString(isolate, args[2]), std::move(body), args[4].As<v8::Function>());
}
void Emit(const Args& args) {
  auto* isolate = args.GetIsolate();
  g_service->host()->Emit(ToString(isolate, args[0]), ToString(isolate, args[1]));
}
void CallDone(const Args& args) {
  auto* isolate = args.GetIsolate();
  // Desktop's V8 (158) deprecates Data() for DataV2(), which Android's (156)
  // may not have; Data() is the one both lanes compile.
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
  const int id = args.Data()->Int32Value(isolate->GetCurrentContext()).FromMaybe(0);
#pragma clang diagnostic pop
  g_service->FinishCall(id, args[0]->BooleanValue(isolate), ToString(isolate, args[1]));
}
}  // namespace

SyncRunnerService::SyncRunnerService(mojo::PendingReceiver<mojom::SyncRunner> receiver)
    : receiver_(this, std::move(receiver)) {
  g_service = this;
}

SyncRunnerService::~SyncRunnerService() {
  g_service = nullptr;
  if (task_runner_) task_runner_->Cancel();
  fetches_.clear();
  context_.Reset();
  isolate_.reset();
}

template <typename F> void SyncRunnerService::Enter(F&& body) {
  auto* isolate = isolate_->isolate();
  v8::Locker locker(isolate);
  v8::Isolate::Scope scope(isolate);
  v8::HandleScope handles(isolate);
  v8::TryCatch caught(isolate);
  auto context = context_.Get(isolate);
  v8::Context::Scope context_scope(context);
  body(isolate, context);
  isolate->PerformMicrotaskCheckpoint();
  if (caught.HasCaught()) LOG(ERROR) << "sync: " << ToString(isolate, caught.Exception());
}

void SyncRunnerService::Start(const std::string& script,
                              const base::flat_map<std::string, std::vector<uint8_t>>& stores,
                              const std::string& config_json,
                              mojo::PendingRemote<mojom::SyncHost> host, StartCallback callback) {
  if (isolate_ || script.empty() || script.size() > 16 * 1024 * 1024) {
    std::move(callback).Run(false);
    return;
  }
  host_.Bind(std::move(host));
  stores_ = stores;
  if (!gin::IsolateHolder::Initialized()) {
#if defined(V8_USE_EXTERNAL_STARTUP_DATA)
#if BUILDFLAG(USE_V8_CONTEXT_SNAPSHOT)
    gin::V8Initializer::LoadV8Snapshot(gin::V8SnapshotFileType::kWithAdditionalContext);
#else
    gin::V8Initializer::LoadV8Snapshot();
#endif
#endif
    v8::V8::SetFlagsFromString("--jitless");
    gin::IsolateHolder::Initialize(gin::IsolateHolder::kNonStrictMode,
                                   gin::ArrayBufferAllocator::SharedInstance());
  }
  task_runner_ = base::MakeRefCounted<SyncRunnerTaskRunner>();
  isolate_ = std::make_unique<gin::IsolateHolder>(task_runner_, gin::IsolateHolder::kUseLocker,
                                                  gin::IsolateHolder::IsolateType::kUtility);
  auto* isolate = isolate_->isolate();
  v8::Locker locker(isolate);
  v8::Isolate::Scope scope(isolate);
  v8::HandleScope handles(isolate);
  v8::TryCatch caught(isolate);
  auto context = v8::Context::New(isolate);
  v8::Context::Scope context_scope(context);
  context_.Reset(isolate, context);

  // The config is the host's data: platform, version, deviceName, env, testEndpoint.
  v8::Local<v8::Value> parsed;
  if (!v8::JSON::Parse(context, Str(isolate, config_json)).ToLocal(&parsed) || !parsed->IsObject()) {
    std::move(callback).Run(false);
    return;
  }
  auto object = parsed.As<v8::Object>();
  auto add = [&](std::string_view name, v8::FunctionCallback fn) {
    object->Set(context, Str(isolate, name),
                v8::Function::New(context, fn).ToLocalChecked()).Check();
  };
  add("log", HostLog);
  add("monotonicNow", MonotonicNow);
  add("setTimer", blanc::SetTimer);
  add("parseUrl", ParseUrl);
  add("loadStores", LoadStores);
  add("writeStore", blanc::WriteStore);
  add("persistDesktopStore", blanc::PersistDesktopStore);
  add("randomBytes", RandomBytes);
  add("digest", Digest);
  add("scrypt", Scrypt);
  add("hkdf", Hkdf);
  add("gcmSeal", GcmSeal);
  add("gcmOpen", GcmOpen);
  add("protect", Protect);
  add("unprotect", Unprotect);
  add("fetch", blanc::Fetch);
  add("emit", Emit);
  context->Global()->Set(context, Str(isolate, "__host"), object).Check();

  v8::Local<v8::Script> compiled;
  v8::Local<v8::Value> result;
  bool ready = v8::Script::Compile(context, Str(isolate, script)).ToLocal(&compiled) &&
               compiled->Run(context).ToLocal(&result);
  isolate->PerformMicrotaskCheckpoint();
  if (!ready) LOG(ERROR) << "sync: " << ToString(isolate, caught.Exception());
  std::move(callback).Run(ready);
}

void SyncRunnerService::Call(const std::string& method, const std::string& args_json,
                             CallCallback callback) {
  if (context_.IsEmpty()) {
    std::move(callback).Run(false, "not started");
    return;
  }
  const int id = next_id_++;
  calls_[id] = std::move(callback);
  Enter([&](v8::Isolate* isolate, v8::Local<v8::Context> context) {
    v8::Local<v8::Value> fn;
    if (!context->Global()->Get(context, Str(isolate, "__call")).ToLocal(&fn) || !fn->IsFunction()) {
      FinishCall(id, false, "no __call");
      return;
    }
    auto done = v8::Function::New(context, CallDone, v8::Integer::New(isolate, id)).ToLocalChecked();
    v8::Local<v8::Value> args[] = {Str(isolate, method), Str(isolate, args_json), done};
    v8::Local<v8::Value> ignored;
    if (!fn.As<v8::Function>()->Call(context, context->Global(), 3, args).ToLocal(&ignored))
      FinishCall(id, false, "call failed");
  });
}

void SyncRunnerService::FinishCall(int id, bool ok, const std::string& result) {
  auto found = calls_.find(id);
  if (found == calls_.end()) return;
  auto callback = std::move(found->second);
  calls_.erase(found);
  std::move(callback).Run(ok, result);
}

void SyncRunnerService::SetTimer(int id, int64_t delay_ms) {
  base::SingleThreadTaskRunner::GetCurrentDefault()->PostDelayedTask(
      FROM_HERE, base::BindOnce(&SyncRunnerService::FireTimer, weak_.GetWeakPtr(), id),
      base::Milliseconds(delay_ms));
}

void SyncRunnerService::FireTimer(int id) {
  Enter([&](v8::Isolate* isolate, v8::Local<v8::Context> context) {
    v8::Local<v8::Value> fn;
    if (!context->Global()->Get(context, Str(isolate, "__fireTimer")).ToLocal(&fn) || !fn->IsFunction())
      return;
    v8::Local<v8::Value> args[] = {v8::Integer::New(isolate, id)};
    v8::Local<v8::Value> ignored;
    std::ignore = fn.As<v8::Function>()->Call(context, context->Global(), 1, args).ToLocal(&ignored);
  });
}

void SyncRunnerService::Fetch(const std::string& url, const std::string& method,
                              const std::string& headers, std::optional<std::vector<uint8_t>> body,
                              v8::Local<v8::Function> callback) {
  const int id = next_id_++;
  fetches_[id].Reset(isolate_->isolate(), callback);
  host_->Fetch(url, method, headers, std::move(body),
               base::BindOnce(&SyncRunnerService::FetchDone, weak_.GetWeakPtr(), id));
}

void SyncRunnerService::FetchDone(int id, const std::string& error, int32_t status,
                                  const std::string& headers, const std::vector<uint8_t>& body) {
  auto found = fetches_.find(id);
  if (found == fetches_.end()) return;
  Enter([&](v8::Isolate* isolate, v8::Local<v8::Context> context) {
    auto fn = found->second.Get(isolate);
    v8::Local<v8::Value> args[] = {
        error.empty() ? v8::Local<v8::Value>(v8::Null(isolate)) : Str(isolate, error),
        v8::Integer::New(isolate, status), Str(isolate, headers), Array(isolate, body)};
    v8::Local<v8::Value> ignored;
    std::ignore = fn->Call(context, context->Global(), 4, args).ToLocal(&ignored);
  });
  fetches_.erase(id);
}
}  // namespace blanc
