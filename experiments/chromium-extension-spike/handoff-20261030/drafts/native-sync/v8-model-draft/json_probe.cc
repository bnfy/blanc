#include "base/at_exit.h"
#include "base/check.h"
#include "base/check_op.h"
#include "base/command_line.h"
#include "base/feature_list.h"
#include "base/files/file.h"
#include "base/files/memory_mapped_file.h"
#include "base/i18n/icu_util.h"
#include "base/base_paths.h"
#include "base/path_service.h"
#include "base/task/single_thread_task_executor.h"
#include "base/task/thread_pool/thread_pool_instance.h"
#include "gin/array_buffer.h"
#include "gin/public/isolate_holder.h"
#include "gin/v8_initializer.h"
#include "v8/include/v8.h"
#include <iostream>
#include "tab_model_source.h"
int main(int argc,char**argv){
 base::AtExitManager at_exit;base::CommandLine::Init(argc,argv);CHECK_EQ(argc,2);
 base::FeatureList::InitInstance("","");
 base::SingleThreadTaskExecutor executor(base::MessagePumpType::IO);
 base::ThreadPoolInstance::CreateAndStartWithDefaultParams("NativeSyncV8Probe");
 const auto out=base::FilePath::FromUTF8Unsafe(argv[1]);CHECK(base::PathService::Override(base::DIR_ASSETS,out));
 base::File icu(out.AppendASCII("icudtl.dat"),base::File::FLAG_OPEN|base::File::FLAG_READ);
 CHECK(icu.IsValid());CHECK(base::i18n::InitializeICUWithFileDescriptor(icu.TakePlatformFile(),base::MemoryMappedFile::Region::kWholeFile));
 auto region=base::MemoryMappedFile::Region::kWholeFile;
 gin::V8Initializer::LoadV8SnapshotFromFile(base::File(out.AppendASCII("snapshot_blob.bin"),base::File::FLAG_OPEN|base::File::FLAG_READ),&region,gin::V8SnapshotFileType::kDefault);
 v8::V8::SetFlagsFromString("--jitless --optimize-for-size");
 gin::IsolateHolder::Initialize(gin::IsolateHolder::kStrictMode,gin::ArrayBufferAllocator::SharedInstance());
 {
  gin::IsolateHolder holder(base::SingleThreadTaskRunner::GetCurrentDefault(),gin::IsolateHolder::kSingleThread,gin::IsolateHolder::IsolateType::kUtility);
  auto* isolate=holder.isolate();v8::Isolate::Scope isolate_scope(isolate);v8::HandleScope handles(isolate);auto context=v8::Context::New(isolate);v8::Context::Scope context_scope(context);
  auto text=v8::String::NewFromUtf8Literal(isolate,"\"\\ud800\"");v8::Local<v8::Value> value;CHECK(v8::JSON::Parse(context,text).ToLocal(&value));v8::Local<v8::String> encoded;CHECK(v8::JSON::Stringify(context,value).ToLocal(&encoded));
  v8::String::Utf8Value utf8(isolate,encoded);CHECK_EQ(std::string(*utf8,utf8.length()),"\"\\ud800\"");
  auto byte_length=v8::Function::New(context,[](const v8::FunctionCallbackInfo<v8::Value>& info){
   CHECK_EQ(info.Length(),1);CHECK(info[0]->IsString());
   info.GetReturnValue().Set(v8::Integer::NewFromUnsigned(info.GetIsolate(),info[0].As<v8::String>()->Utf8LengthV2(info.GetIsolate())));
  }).ToLocalChecked();
  auto source=v8::String::NewFromUtf8(isolate,blanc::sync::draft::kTabModelSource).ToLocalChecked();
  v8::Local<v8::Script> script;CHECK(v8::Script::Compile(context,source).ToLocal(&script));
  v8::Local<v8::Value> factory;CHECK(script->Run(context).ToLocal(&factory));CHECK(factory->IsFunction());
  context->AllowCodeGenerationFromStrings(false);
  v8::Local<v8::Value> native_args[]={byte_length};v8::Local<v8::Value> model;
  CHECK(factory.As<v8::Function>()->Call(context,v8::Undefined(isolate),1,native_args).ToLocal(&model));
  auto member=model.As<v8::Object>()->Get(context,v8::String::NewFromUtf8Literal(isolate,"sanitizeEntry")).ToLocalChecked();CHECK(member->IsFunction());
  const std::string emoji="\xf0\x9f\x98\x80";
  const std::string input="{\"updatedAt\":1000,\"name\":\""+std::string(79,'n')+emoji+"\",\"platform\":\"darwin\",\"tabs\":[{\"url\":\"https://example.org\",\"title\":\""+std::string(199,'t')+emoji+"\"}],\"groups\":[]}";
  v8::Local<v8::Value> entry;CHECK(v8::JSON::Parse(context,v8::String::NewFromUtf8(isolate,input.data(),v8::NewStringType::kNormal,input.size()).ToLocalChecked()).ToLocal(&entry));
  v8::Local<v8::Value> args[]={entry},sanitized;CHECK(member.As<v8::Function>()->Call(context,model,1,args).ToLocal(&sanitized));
  v8::Local<v8::String> serialized;CHECK(v8::JSON::Stringify(context,sanitized).ToLocal(&serialized));v8::String::Utf8Value output(isolate,serialized);const std::string json(*output,output.length());
  const auto first=json.find("\\ud83d");CHECK(first!=std::string::npos);CHECK(json.find("\\ud83d",first+1)!=std::string::npos);
  v8::Local<v8::Value> length_args[]={value};v8::Local<v8::Value> length;CHECK(byte_length->Call(context,v8::Undefined(isolate),1,length_args).ToLocal(&length));CHECK_EQ(length.As<v8::Integer>()->Value(),3);
  std::cout<<"native cached Chromium V8 preserves JavaScript lone-surrogate JSON and exact shipping model UTF16 truncation\n"<<json<<"\n";
 }
 base::ThreadPoolInstance::Get()->FlushForTesting();base::ThreadPoolInstance::Get()->Shutdown();
}
