#include "model_runner.h"
#include "tab_model_source.h"
#include "base/check.h"
#include "base/functional/bind.h"
#include "base/location.h"
#include "base/strings/string_util.h"
#include "crypto/secure_util.h"
#include "gin/public/isolate_holder.h"
#include "v8/include/v8.h"
namespace blanc::sync::draft {
namespace {
constexpr size_t kMaxBytes=1024*1024;
// Pure projection of released sync.js retractSends' devices replacement; now
// is the native clock value at planning time. Never evaluates remote code.
constexpr char kDeparture[]=R"JS((function(input){
 if(!input || typeof input.ownId!=='string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(input.ownId) || !Number.isFinite(input.now))throw new TypeError('Invalid native metadata');
 const remote=input.remote,ownId=input.ownId;
 if(!remote?.devices?.[ownId] || remote.devices[ownId].retracted)return null;
 return {devices:{...remote.devices,[ownId]:{retracted:true,updatedAt:input.now}}};
}))JS";
// Calls the exact released merge model. Untrusted device maps are JSON strings
// inside a native-owned metadata envelope, never script or metadata fragments.
constexpr char kMergeDevices[]=R"JS((function(model){return function(input){
 if(!input || typeof input.ownId!=='string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(input.ownId) || !Number.isFinite(input.now) || typeof input.localJson!=='string' || typeof input.remoteJson!=='string')throw new TypeError('Invalid native metadata');
 const local=JSON.parse(input.localJson),remote=JSON.parse(input.remoteJson);
 for(const map of [local,remote])if(map!==null && (typeof map!=='object'||Array.isArray(map)))throw new TypeError('Invalid device map');
 return model.mergeDevices(local,remote,{now:input.now,ownId:input.ownId});
};}))JS";
// Mirrors tabsync.js: rebind the cache before reading/merging any devices.
// Preserve the same-account sidecars; rebindDevices discards them on mismatch.
constexpr char kMergeBoundDevices[]=R"JS((function(model){return function(input){
 if(!input || typeof input.accountId!=='string' || !/^[0-9a-f]{64}$/.test(input.accountId) || typeof input.ownId!=='string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(input.ownId) || !Number.isFinite(input.now) || typeof input.cacheJson!=='string' || typeof input.remoteJson!=='string')throw new TypeError('Invalid native metadata');
 const cache=JSON.parse(input.cacheJson),wire=JSON.parse(input.remoteJson);
 if(input.remoteIsBlob!==undefined && typeof input.remoteIsBlob!=='boolean')throw new TypeError('Invalid native metadata');
 if(wire!==null && (typeof wire!=='object'||Array.isArray(wire)))throw new TypeError('Invalid remote data');
 const remote=input.remoteIsBlob ? (wire?.devices ?? null) : wire;
 if(!cache || typeof cache!=='object'||Array.isArray(cache) || (remote!==null && (typeof remote!=='object'||Array.isArray(remote))))throw new TypeError('Invalid device map');
 const bound=model.rebindDevices(cache,input.accountId);
 if(bound.devices!=null && (typeof bound.devices!=='object'||Array.isArray(bound.devices)))throw new TypeError('Invalid cached device map');
 return {...bound,devices:model.mergeDevices(bound.devices,remote,{now:input.now,ownId:input.ownId})};
};}))JS";
void Wipe(std::string& text){crypto::SecureZeroBuffer(base::as_writable_byte_span(text));}
}
struct ModelRunner::Backend {
 std::unique_ptr<gin::IsolateHolder> holder;
 v8::Global<v8::Context> context;
 v8::Global<v8::Object> model;
 v8::Global<v8::Function> departure;
 v8::Global<v8::Function> merge_devices;
 v8::Global<v8::Function> merge_bound_devices;
 ~Backend(){Reset();}
 void Reset(){merge_bound_devices.Reset();merge_devices.Reset();departure.Reset();model.Reset();context.Reset();holder.reset();}
 void Init(scoped_refptr<base::SingleThreadTaskRunner> runner){
  if(!gin::IsolateHolder::Initialized())return;
  holder=std::make_unique<gin::IsolateHolder>(runner,gin::IsolateHolder::kSingleThread,
      gin::IsolateHolder::kDisallowAtomicsWait,gin::IsolateHolder::IsolateType::kUtility);
  auto* isolate=holder->isolate();isolate->SetMicrotasksPolicy(v8::MicrotasksPolicy::kExplicit);
  v8::Isolate::Scope scope(isolate);v8::HandleScope handles(isolate);v8::TryCatch failure(isolate);
  auto ctx=v8::Context::New(isolate);v8::Context::Scope entered(ctx);
  auto byte_length=v8::Function::New(ctx,[](const v8::FunctionCallbackInfo<v8::Value>& info){
   if(info.Length()!=1||!info[0]->IsString())return;
   info.GetReturnValue().Set(v8::Integer::NewFromUnsigned(info.GetIsolate(),info[0].As<v8::String>()->Utf8LengthV2(info.GetIsolate())));
  }).ToLocalChecked();
  v8::Local<v8::Script> script;v8::Local<v8::Value> factory,exports,leave,merge_factory,merge,bound_factory,bound;
  auto source=v8::String::NewFromUtf8(isolate,kTabModelSource).ToLocalChecked();
  if(!v8::Script::Compile(ctx,source).ToLocal(&script)||!script->Run(ctx).ToLocal(&factory)||!factory->IsFunction())return;
  v8::Local<v8::Value> args[]={byte_length};
  if(!factory.As<v8::Function>()->Call(ctx,v8::Undefined(isolate),1,args).ToLocal(&exports)||!exports->IsObject())return;
  if(!v8::Script::Compile(ctx,v8::String::NewFromUtf8(isolate,kDeparture).ToLocalChecked()).ToLocal(&script)||!script->Run(ctx).ToLocal(&leave)||!leave->IsFunction())return;
  if(!v8::Script::Compile(ctx,v8::String::NewFromUtf8(isolate,kMergeDevices).ToLocalChecked()).ToLocal(&script)||!script->Run(ctx).ToLocal(&merge_factory)||!merge_factory->IsFunction())return;
  v8::Local<v8::Value> merge_args[]={exports};
  if(!merge_factory.As<v8::Function>()->Call(ctx,v8::Undefined(isolate),1,merge_args).ToLocal(&merge)||!merge->IsFunction())return;
  if(!v8::Script::Compile(ctx,v8::String::NewFromUtf8Literal(isolate,kMergeBoundDevices)).ToLocal(&script)||!script->Run(ctx).ToLocal(&bound_factory)||!bound_factory->IsFunction())return;
  if(!bound_factory.As<v8::Function>()->Call(ctx,v8::Undefined(isolate),1,merge_args).ToLocal(&bound)||!bound->IsFunction())return;
  ctx->AllowCodeGenerationFromStrings(false);
  context.Reset(isolate,ctx);model.Reset(isolate,exports.As<v8::Object>());departure.Reset(isolate,leave.As<v8::Function>());merge_devices.Reset(isolate,merge.As<v8::Function>());merge_bound_devices.Reset(isolate,bound.As<v8::Function>());
 }
 Result Execute(Method method,const std::string& input){
  if(input.size()>kMaxBytes)return {{},"input-too-large"};
  if(!base::IsStringUTF8AllowingNoncharacters(input))return {{},"invalid-json"};
  if(!holder||context.IsEmpty())return {{},"runtime-unavailable"};
  auto* isolate=holder->isolate();v8::Isolate::Scope scope(isolate);v8::HandleScope handles(isolate);v8::TryCatch failure(isolate);
  auto ctx=context.Get(isolate);v8::Context::Scope entered(ctx);
  v8::Local<v8::String> text;v8::Local<v8::Value> value;
  if(!v8::String::NewFromUtf8(isolate,input.data(),v8::NewStringType::kNormal,static_cast<int>(input.size())).ToLocal(&text)||!v8::JSON::Parse(ctx,text).ToLocal(&value))return {{},"invalid-json"};
  if(method==Method::kDeparture && value->IsObject()) {
   auto object=value.As<v8::Object>();auto key=v8::String::NewFromUtf8Literal(isolate,"remoteJson");
   if(object->HasOwnProperty(ctx,key).FromMaybe(false)){
    v8::Local<v8::Value> raw,remote;
    if(!object->Get(ctx,key).ToLocal(&raw)||!raw->IsString()||!v8::JSON::Parse(ctx,raw.As<v8::String>()).ToLocal(&remote))return {{},"invalid-json"};
    if(!object->Set(ctx,v8::String::NewFromUtf8Literal(isolate,"remote"),remote).FromMaybe(false))return {{},"model-error"};
   }
  }
  if(method!=Method::kJsonRoundTrip){
   v8::Local<v8::Function> function;v8::Local<v8::Value> receiver=v8::Undefined(isolate);
   if(method==Method::kDeparture)function=departure.Get(isolate);
   else if(method==Method::kMergeDevices)function=merge_devices.Get(isolate);
   else if(method==Method::kMergeBoundDevices)function=merge_bound_devices.Get(isolate);
   else if(method==Method::kSanitizeEntry){
    receiver=model.Get(isolate);v8::Local<v8::Value> member;
    if(!receiver.As<v8::Object>()->Get(ctx,v8::String::NewFromUtf8Literal(isolate,"sanitizeEntry")).ToLocal(&member)||!member->IsFunction())return {{},"model-error"};
    function=member.As<v8::Function>();
   }else return {{},"invalid-method"};
   v8::Local<v8::Value> args[]={value};
   if(!function->Call(ctx,receiver,1,args).ToLocal(&value))return {{},"model-error"};
  }
  v8::Local<v8::String> output;if(!v8::JSON::Stringify(ctx,value).ToLocal(&output))return {{},"model-error"};
  if(output->Utf8LengthV2(isolate)>kMaxBytes)return {{},"output-too-large"};
  v8::String::Utf8Value utf8(isolate,output);return {std::string(*utf8,utf8.length()),{}};
 }
};
ModelRunner::ModelRunner(scoped_refptr<base::SingleThreadTaskRunner> model)
    :backend_(std::make_shared<Backend>()),model_(std::move(model)),reply_(base::SequencedTaskRunner::GetCurrentDefault()){
 CHECK(model_);CHECK(model_->PostTask(FROM_HERE,base::BindOnce([](auto backend,auto runner){backend->Init(runner);},backend_,model_)));
}
ModelRunner::~ModelRunner(){Shutdown();}
void ModelRunner::Run(Method method,std::string json,Completed done){
 DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);CHECK(done);
 if(stopped_->load()){
  Wipe(json);CHECK(reply_->PostTask(FROM_HERE,base::BindOnce(std::move(done),Result{{},"shutdown"})));return;
 }
 CHECK(model_->PostTask(FROM_HERE,base::BindOnce([](auto backend,auto stopped,auto reply,Method method,std::string input,Completed done){
  Result result=stopped->load()?Result{{},"shutdown"}:backend->Execute(method,input);Wipe(input);
  CHECK(reply->PostTask(FROM_HERE,base::BindOnce([](auto stopped,Completed done,Result result){
   if(stopped->load()){Wipe(result.json);result={{},"shutdown"};}std::move(done).Run(std::move(result));
  },stopped,std::move(done),std::move(result))));
 },backend_,stopped_,reply_,method,std::move(json),std::move(done))));
}
void ModelRunner::Shutdown(base::OnceClosure done){
 DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);stopped_->store(true);
 if(!backend_){
  // A repeated caller must also wait behind the already queued isolate reset.
  if(done)CHECK(model_->PostTask(FROM_HERE,base::BindOnce([](auto reply,base::OnceClosure done){CHECK(reply->PostTask(FROM_HERE,std::move(done)));},reply_,std::move(done))));return;
 }
 CHECK(model_->PostTask(FROM_HERE,base::BindOnce([](auto backend,auto reply,base::OnceClosure done){
  backend->Reset();if(done)CHECK(reply->PostTask(FROM_HERE,std::move(done)));
 },std::move(backend_),reply_,std::move(done))));
}
}  // namespace blanc::sync::draft
