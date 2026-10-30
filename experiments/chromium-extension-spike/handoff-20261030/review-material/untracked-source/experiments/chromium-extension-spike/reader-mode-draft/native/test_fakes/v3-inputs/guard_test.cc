// Exercises the actual draft guard with fake Chromium interfaces. The fakes do
// not establish real Chromium lifetime, scheduling, URL or cryptographic behavior.
#include <cassert>
#include <iostream>
#include "reader_extraction_guard.h"
using blanc::reader::ExtractionDone;
using blanc::reader::ExtractionGuard;
using blanc::reader::ExtractionStatus;

base::Value Article(bool invalid_image=false) {
  base::ListValue images;
  images.emplace_back(std::string(invalid_image?"file:///private":"https://example.test/image.png"));
  base::DictValue d;
  d.SetString("content","<p>safe</p>").SetString("textContent",std::string(240,'x'))
   .SetString("title","Title").SetString("byline","").SetString("publishedTime","")
   .SetString("lang","en").SetString("dir","ltr").SetList("images",std::move(images));
  return base::Value(std::move(d));
}
struct Fixture {
  Profile profile;TabStripModel model;content::WebContents source{&profile,GURL("https://example.test/article")};
  BrowserWindowInterface window{&profile,&model};bool eligible=true;
  std::unique_ptr<ExtractionGuard> guard;std::vector<ExtractionStatus> results;
  Fixture(){model.tab=&source;guard=std::make_unique<ExtractionGuard>(&window,&source,[this](auto*,auto*){return eligible;});}
  ExtractionDone Callback(){return [this](ExtractionStatus status,std::optional<base::DictValue>){results.push_back(status);};}
  bool Start(){return guard->Start("approved",Callback());}
};
int main(){
  {
    Fixture f;assert(!f.guard->Start("untrusted",f.Callback()));f.eligible=false;assert(!f.Start());f.eligible=true;
    assert(f.Start());assert(f.source.frame.last_world==ISOLATED_WORLD_ID_BLANC_READER);assert(!f.Start());f.source.frame.Reply(Article());
    assert(f.results.size()==1&&f.results[0]==ExtractionStatus::kReady);
  }
  {
    Fixture f;bool reentered=true;assert(f.guard->Start("approved",[&](ExtractionStatus s,std::optional<base::DictValue>){f.results.push_back(s);reentered=f.Start();}));
    content::NavigationHandle a(1),b(2);f.source.Start(&a);assert(!reentered);f.source.Start(&b);f.source.Finish(&a);assert(!f.Start());f.source.frame.Reply(Article());
    std::cerr << "navigation results " << f.results.size(); for(auto s:f.results) std::cerr << " " << static_cast<int>(s); std::cerr << "\n";
    assert(f.results.size()==1&&f.results[0]==ExtractionStatus::kCancelled);f.source.Finish(&b);assert(f.Start());f.guard->Cancel();
  }
  {
    Fixture f;assert(f.Start());f.model.SetPresent(false);f.model.SetPresent(true);f.source.frame.Reply(Article());
    assert(f.results.size()==1&&f.results[0]==ExtractionStatus::kCancelled);
  }
  {
    Fixture f;assert(f.Start());f.source.frame.ReplaceDocument();f.source.frame.Reply(Article());
    assert(f.results.size()==1&&f.results[0]==ExtractionStatus::kCancelled);
  }
  {
    Fixture f;assert(f.Start());Profile other;f.source.context=&other;f.source.frame.Reply(Article());
    assert(f.results.size()==1&&f.results[0]==ExtractionStatus::kCancelled);
  }
  {
    Fixture f;assert(f.Start());f.source.SetVisible(content::Visibility::HIDDEN);f.source.SetVisible(content::Visibility::VISIBLE);f.source.frame.Reply(Article());
    assert(f.results.size()==1&&f.results[0]==ExtractionStatus::kCancelled);
  }
  {
    Fixture f;assert(f.Start());base::OneShotTimer::Fire();f.source.frame.Reply(Article());
    assert(f.results.size()==1&&f.results[0]==ExtractionStatus::kTimedOut);
  }
  {
    Fixture f;assert(f.Start());f.source.frame.Reply(Article(true));
    assert(f.results.size()==1&&f.results[0]==ExtractionStatus::kInvalidArticle);
  }
  {
    Fixture f;bool reentered=true;assert(f.guard->Start("approved",[&](ExtractionStatus s,std::optional<base::DictValue>){f.results.push_back(s);reentered=f.Start();}));
    f.model.Destroy();assert(!reentered);f.source.frame.Reply(Article());assert(f.results.size()==1&&f.results[0]==ExtractionStatus::kCancelled);
  }
  {
    Fixture f;bool reentered=true;assert(f.guard->Start("approved",[&](ExtractionStatus s,std::optional<base::DictValue>){f.results.push_back(s);reentered=f.Start();}));
    f.source.Destroy();assert(!reentered);f.source.frame.Reply(Article());assert(f.results.size()==1&&f.results[0]==ExtractionStatus::kCancelled);
  }
  std::cout<<"PASS: 10 native guard scenarios with fake Chromium interfaces\n";
}
