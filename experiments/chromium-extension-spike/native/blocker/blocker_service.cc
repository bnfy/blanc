#include "chrome/services/blanc_blocker/blocker_service.h"
#include "base/task/single_thread_task_runner.h"
#include "base/compiler_specific.h"
#include "base/strings/string_view_util.h"
#include "gin/array_buffer.h"
#include "gin/v8_initializer.h"
#include "tools/v8_context_snapshot/buildflags.h"
namespace blanc {
namespace {
v8::Local<v8::String> Str(v8::Isolate* isolate, const std::string& text) {
  return v8::String::NewFromUtf8(isolate, text.data(), v8::NewStringType::kNormal,
                               static_cast<int>(text.size())).ToLocalChecked();
}
void Encode(const v8::FunctionCallbackInfo<v8::Value>& args) {
  auto* isolate = args.GetIsolate();
  if (args.Length() != 1 || !args[0]->IsString()) return;
  v8::String::Utf8Value text(isolate, args[0]);
  auto buffer = v8::ArrayBuffer::New(isolate, text.length());
  auto data = buffer->GetBackingStore();
  // SAFETY: V8 allocated exactly ByteLength() bytes for this backing store.
  UNSAFE_BUFFERS(base::span(static_cast<uint8_t*>(data->Data()), data->ByteLength()))
      .copy_from(base::as_byte_span(UNSAFE_BUFFERS(std::string_view(*text, text.length()))));
  args.GetReturnValue().Set(v8::Uint8Array::New(buffer, 0, text.length()));
}
void Decode(const v8::FunctionCallbackInfo<v8::Value>& args) {
  if (args.Length() != 1 || !args[0]->IsUint8Array()) return;
  auto bytes = args[0].As<v8::Uint8Array>();
  auto data = bytes->Buffer()->GetBackingStore();
  // SAFETY: the backing-store length is supplied by V8; subspan validates the view.
  auto span = UNSAFE_BUFFERS(base::span(static_cast<const uint8_t*>(data->Data()), data->ByteLength()))
                  .subspan(bytes->ByteOffset(), bytes->ByteLength());
  args.GetReturnValue().Set(Str(args.GetIsolate(), std::string(base::as_string_view(span))));
}
}
BlockerService::BlockerService(mojo::PendingReceiver<mojom::Blocker> receiver)
    : receiver_(this, std::move(receiver)) {}
BlockerService::~BlockerService() = default;
void BlockerService::Initialize(const std::string& script, InitializeCallback callback) {
  if (isolate_ || script.empty() || script.size() > 16 * 1024 * 1024) {
    std::move(callback).Run(false); return;
  }
  if (!gin::IsolateHolder::Initialized()) {
#if defined(V8_USE_EXTERNAL_STARTUP_DATA)
#if BUILDFLAG(USE_V8_CONTEXT_SNAPSHOT)
    gin::V8Initializer::LoadV8Snapshot(gin::V8SnapshotFileType::kWithAdditionalContext);
#else
    gin::V8Initializer::LoadV8Snapshot();
#endif
#endif
    // Match the existing sandboxed PAC utility's no-JIT policy.
    v8::V8::SetFlagsFromString("--jitless");
    gin::IsolateHolder::Initialize(gin::IsolateHolder::kNonStrictMode,
                                   gin::ArrayBufferAllocator::SharedInstance());
  }
  isolate_ = std::make_unique<gin::IsolateHolder>(
      base::SingleThreadTaskRunner::GetCurrentDefault(), gin::IsolateHolder::kUseLocker,
      gin::IsolateHolder::IsolateType::kUtility);
  auto* isolate = isolate_->isolate();
  v8::Locker locker(isolate);
  v8::Isolate::Scope scope(isolate);
  v8::HandleScope handles(isolate);
  v8::TryCatch caught(isolate);
  auto globals = v8::ObjectTemplate::New(isolate);
  globals->Set(Str(isolate, "blancEncode"), v8::FunctionTemplate::New(isolate, Encode));
  globals->Set(Str(isolate, "blancDecode"), v8::FunctionTemplate::New(isolate, Decode));
  auto context = v8::Context::New(isolate, nullptr, globals);
  v8::Context::Scope context_scope(context);
  v8::Local<v8::Script> compiled;
  v8::Local<v8::Value> result, fn;
  bool ready = v8::Script::Compile(context, Str(isolate, script)).ToLocal(&compiled) &&
      compiled->Run(context).ToLocal(&result) &&
      context->Global()->Get(context, Str(isolate, "blancDecide")).ToLocal(&fn) && fn->IsFunction();
  if (ready) { context_.Reset(isolate, context); decide_.Reset(isolate, fn.As<v8::Function>()); }
  std::move(callback).Run(ready);
}
void BlockerService::Decide(const std::string& url, const std::string& resource_type,
                            const std::string& referrer, DecideCallback callback) {
  if (decide_.IsEmpty()) { std::move(callback).Run(-1); return; }
  auto* isolate = isolate_->isolate();
  v8::Locker locker(isolate);
  v8::Isolate::Scope scope(isolate);
  v8::HandleScope handles(isolate);
  v8::TryCatch caught(isolate);
  auto context = context_.Get(isolate);
  v8::Context::Scope context_scope(context);
  v8::Local<v8::Value> args[] = {Str(isolate, url), Str(isolate, resource_type), Str(isolate, referrer)}, result;
  int decision = -1;
  if (decide_.Get(isolate)->Call(context, context->Global(), 3, args).ToLocal(&result) && result->IsInt32())
    decision = result.As<v8::Int32>()->Value();
  std::move(callback).Run(decision);
}
}
