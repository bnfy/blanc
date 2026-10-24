import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {writeResearchPolicy} from './research-build.mjs';

test('production preparation defaults off; research requires explicit opt-in', () => {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-policy-'));
 try {
  fs.mkdirSync(path.join(root,'content/public/common'),{recursive:true});
  writeResearchPolicy(root);
  assert.match(fs.readFileSync(path.join(root,'content/public/common/blanc_research_build.h'),'utf8'),/#define BLANC_RESEARCH_HOOKS 0/);
  writeResearchPolicy(root,true);
  assert.match(fs.readFileSync(path.join(root,'content/public/common/blanc_research_build.h'),'utf8'),/#define BLANC_RESEARCH_HOOKS 1/);
 } finally {fs.rmSync(root,{recursive:true,force:true});}
});

test('actual research logger refuses private data before identity, serialization or I/O', () => {
 const text=fs.readFileSync(new URL('./native/blocker/update_identity.inc',import.meta.url),'utf8');
 const body=text.slice(text.indexOf('void BlancUpdateIdentity('),text.indexOf('\nclass BlancUpdateProxy'));
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-private-logger-'));
 const prelude=`#include <string>
#include <optional>
#include <memory>
#include <functional>
#include <cassert>
int tokens=0, serializations=0, writes=0, lookups=0;
std::string output;
#define FROM_HERE 0
struct GURL {std::string spec() const {return "private-sentinel";}};
namespace blink {struct StorageKey {std::string Serialize() const {return "private-storage-sentinel";}};}
namespace network {struct ResourceRequest {std::optional<std::string> devtools_request_id;GURL url;};}
namespace base {
struct CommandLine {static CommandLine* ForCurrentProcess(){static CommandLine c;return &c;}std::string GetSwitchValuePath(const char*){++lookups;return output;}};
struct UnguessableToken {static UnguessableToken Create(){++tokens;return {};}std::string ToString(){return "token";}};
struct DictValue {template<class T>void Set(const char*,T){}};
std::string NumberToString(long long v){return std::to_string(v);}
std::optional<std::string> WriteJson(DictValue){++serializations;return "row";}
struct MayBlock{};enum class TaskShutdownBehavior {BLOCK_SHUTDOWN};
struct Traits {Traits(MayBlock,TaskShutdownBehavior){}};
struct SequencedTaskRunner {template<class F>void PostTask(int,F f){f();}};
struct ThreadPool {static auto CreateSequencedTaskRunner(Traits){return std::make_shared<SequencedTaskRunner>();}};
template<class T>struct NoDestructor {T value;NoDestructor(T v):value(v){}T* operator->(){return &value;}T& operator*(){return value;}};
using FilePath=std::string;
void AppendToFile(FilePath,std::string){++writes;}
template<class F,class...Args>auto BindOnce(F f,Args...args){return std::bind(f,args...);}
}
template<class T>using scoped_refptr=std::shared_ptr<T>;
`;
 const main=`
int main(){
 network::ResourceRequest request;
 output="enabled";
 BlancUpdateIdentity(request,1,2,{}, {},true,true);
 assert(!request.devtools_request_id && tokens==0 && serializations==0 && writes==0 && lookups==0);
 output="";
 BlancUpdateIdentity(request,1,2,{}, {},false,true);
 assert(!request.devtools_request_id && tokens==0 && serializations==0 && writes==0);
 output="enabled";
 BlancUpdateIdentity(request,1,2,{}, {},false,true);
 assert(request.devtools_request_id && tokens==1 && serializations==1 && writes==1);
}
`;
 try {
  fs.writeFileSync(path.join(root,'test.cc'),prelude+body+main);
  const build=spawnSync('xcrun',['clang++','-std=c++20',path.join(root,'test.cc'),'-o',path.join(root,'test')],{encoding:'utf8'});
  assert.equal(build.status,0,build.stderr);
  const run=spawnSync(path.join(root,'test'),[],{encoding:'utf8'});assert.equal(run.status,0,run.stderr);
 } finally {fs.rmSync(root,{recursive:true,force:true});}
});
