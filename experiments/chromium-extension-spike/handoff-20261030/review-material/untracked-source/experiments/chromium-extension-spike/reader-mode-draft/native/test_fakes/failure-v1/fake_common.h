#ifndef READER_GUARD_TEST_FAKES_H_
#define READER_GUARD_TEST_FAKES_H_
#include <algorithm>
#include <array>
#include <cctype>
#include <functional>
#include <map>
#include <memory>
#include <optional>
#include <string>
#include <string_view>
#include <utility>
#include <vector>
#define FROM_HERE 0
namespace base {
enum class TerminationStatus { kKilled };
template<class T> class WeakPtr {
 public:
  WeakPtr()=default; explicit WeakPtr(const std::shared_ptr<T*>& p):p_(p){}
  T* get() const {auto p=p_.lock();return p?*p:nullptr;}
 private:std::weak_ptr<T*> p_;
};
template<class T> class WeakPtrFactory {
 public:explicit WeakPtrFactory(T* p):p_(std::make_shared<T*>(p)){}~WeakPtrFactory(){*p_=nullptr;}
  WeakPtr<T> GetWeakPtr(){return WeakPtr<T>(p_);}
 private:std::shared_ptr<T*> p_;
};
template<class> class OnceCallback;
template<class R,class... A> class OnceCallback<R(A...)> {
 public:OnceCallback()=default;template<class F> OnceCallback(F f):f_(std::move(f)){}
 bool is_null()const{return !f_;}void Reset(){f_={};}R Run(A... a){auto f=std::move(f_);return f(std::forward<A>(a)...);}
 private:std::function<R(A...)> f_;
};
template<class> class RepeatingCallback;
template<class R,class... A> class RepeatingCallback<R(A...)> {
 public:RepeatingCallback()=default;template<class F> RepeatingCallback(F f):f_(std::move(f)){}
 bool is_null()const{return !f_;}R Run(A... a)const{return f_(std::forward<A>(a)...);}
 private:std::function<R(A...)> f_;
};
template<class T,class... A> auto BindOnce(void(T::*method)(uint64_t,A...),WeakPtr<T> weak,uint64_t n){return [weak,method,n](A... a){if(auto* p=weak.get())(p->*method)(n,std::forward<A>(a)...);};}
inline int Seconds(int n){return n;}
class OneShotTimer {
 public:~OneShotTimer(){Stop();}template<class F> void Start(int,int,F f){callback_=std::move(f);active=this;}void Stop(){callback_={};if(active==this)active=nullptr;}static void Fire(){auto* timer=active;if(!timer)return;auto cb=std::move(timer->callback_);active=nullptr;if(cb)cb();}
 private:inline static OneShotTimer* active=nullptr;std::function<void()> callback_;
};
inline std::u16string UTF8ToUTF16(std::string_view s){return std::u16string(s.begin(),s.end());}
enum TrimPositions{TRIM_ALL};inline void TrimWhitespaceASCII(std::string_view in,TrimPositions,std::string* out){size_t a=0,b=in.size();while(a<b&&std::isspace(static_cast<unsigned char>(in[a])))a++;while(b>a&&std::isspace(static_cast<unsigned char>(in[b-1])))b--;*out=std::string(in.substr(a,b-a));}
inline std::string HexEncode(const std::string& digest){return digest=="good"?"BB4CD6B0E8274DD37A21B75E1DDA0BB7D9F758BCEA1701A581826A070F2DBD2C":"bad";}
class DictValue;class ListValue;
class Value {
 public:Value()=default;explicit Value(std::string s):s_(std::move(s)),kind_(1){}explicit Value(DictValue d);
 bool is_string()const{return kind_==1;}bool is_dict()const{return kind_==2;}const std::string& GetString()const{return s_;}const DictValue& GetDict()const{return *d_;}DictValue TakeDict()&&;
 private:std::string s_;int kind_=0;std::shared_ptr<DictValue> d_;
};
class ListValue:public std::vector<Value>{};
class DictValue {
 public:DictValue& SetString(std::string k,std::string v){strings_[std::move(k)]=std::move(v);return *this;}DictValue& SetList(std::string k,ListValue v){lists_[std::move(k)]=std::move(v);return *this;}
 const std::string* FindString(std::string_view k)const{auto i=strings_.find(std::string(k));return i==strings_.end()?nullptr:&i->second;}const ListValue* FindList(std::string_view k)const{auto i=lists_.find(std::string(k));return i==lists_.end()?nullptr:&i->second;}
 private:std::map<std::string,std::string> strings_;std::map<std::string,ListValue> lists_;
};
inline Value::Value(DictValue d):kind_(2),d_(std::make_shared<DictValue>(std::move(d))){}inline DictValue Value::TakeDict()&&{return std::move(*d_);}
}
namespace crypto::hash {inline std::string Sha256(std::string_view s){return s=="approved"?"good":"bad";}}
class GURL {
 public:GURL()=default;explicit GURL(std::string s):s_(std::move(s)){}bool is_valid()const{return !s_.empty();}bool SchemeIsHTTPOrHTTPS()const{return s_.starts_with("http://")||s_.starts_with("https://");}bool has_username()const{return s_.find('@')!=std::string::npos;}bool has_password()const{return has_username();}const std::string& spec()const{return s_;}bool operator==(const GURL& rhs)const{return s_==rhs.s_;}
 private:std::string s_;
};
constexpr int ISOLATED_WORLD_ID_BLANC_COSMETICS=11,ISOLATED_WORLD_ID_BLANC_READER=12,ISOLATED_WORLD_ID_EXTENSIONS=13;
class BrowserContext {public:virtual ~BrowserContext()=default;};
class Profile:public BrowserContext {public:base::WeakPtr<Profile> GetWeakPtr(){return factory_.GetWeakPtr();}private:base::WeakPtrFactory<Profile> factory_{this};};
namespace content {
enum class Visibility{VISIBLE,HIDDEN};class WebContents;class NavigationHandle {public:NavigationHandle(int64_t n,bool p=true):id(n),primary(p){}bool IsInPrimaryMainFrame(){return primary;}int64_t GetNavigationId(){return id;}int64_t id;bool primary;};class Page{};
class RenderFrameHost;
class WeakDocumentPtr {public:WeakDocumentPtr()=default;explicit WeakDocumentPtr(const std::shared_ptr<RenderFrameHost*>& p):p_(p){}RenderFrameHost* AsRenderFrameHostIfValid()const{auto p=p_.lock();return p?*p:nullptr;}private:std::weak_ptr<RenderFrameHost*> p_;};
class NavigationController {public:void* GetPendingEntry(){return pending?this:nullptr;}bool pending=false;};
class RenderFrameHost {
 public:explicit RenderFrameHost(GURL u):url(std::move(u)),document(std::make_shared<RenderFrameHost*>(this)){}~RenderFrameHost(){*document=nullptr;}
 bool IsRenderFrameLive(){return live;}bool IsActive(){return active;}bool IsInPrimaryMainFrame(){return primary;}bool IsErrorDocument(){return error;}const GURL& GetLastCommittedURL(){return url;}WeakDocumentPtr GetWeakDocumentPtr(){return WeakDocumentPtr(document);}void ReplaceDocument(){*document=nullptr;document=std::make_shared<RenderFrameHost*>(this);}
 template<class F>void ExecuteJavaScriptInIsolatedWorld(std::u16string,F f,int world){last_world=world;reply=std::move(f);}void Reply(base::Value value){auto cb=std::move(reply);if(cb)cb(std::move(value));}
 GURL url;bool live=true,active=true,primary=true,error=false;int last_world=0;std::function<void(base::Value)> reply;std::shared_ptr<RenderFrameHost*> document;
};
class WebContentsObserver {
 public:explicit WebContentsObserver(WebContents*);virtual ~WebContentsObserver();virtual void DidStartNavigation(NavigationHandle*){}virtual void DidFinishNavigation(NavigationHandle*){}virtual void PrimaryPageChanged(Page&){}virtual void PrimaryMainFrameRenderProcessGone(base::TerminationStatus){}virtual void OnVisibilityChanged(Visibility){}virtual void WebContentsDestroyed(){}
 protected:WebContents* observed_;
};
class WebContents {
 public:WebContents(BrowserContext* ctx,GURL u):context(ctx),frame(std::move(u)){}base::WeakPtr<WebContents> GetWeakPtr(){return factory.GetWeakPtr();}bool IsBeingDestroyed(){return destroyed;}BrowserContext* GetBrowserContext(){return context;}bool IsLoading(){return loading;}NavigationController& GetController(){return controller;}Visibility GetVisibility(){return visibility;}RenderFrameHost* GetPrimaryMainFrame(){return &frame;}const GURL& GetLastCommittedURL(){return frame.url;}
 void Start(NavigationHandle* n){if(observer)observer->DidStartNavigation(n);}void Finish(NavigationHandle* n){if(observer)observer->DidFinishNavigation(n);}void SetVisible(Visibility v){visibility=v;if(observer)observer->OnVisibilityChanged(v);}void Destroy(){destroyed=true;if(observer)observer->WebContentsDestroyed();}
 BrowserContext* context;RenderFrameHost frame;NavigationController controller;Visibility visibility=Visibility::VISIBLE;bool loading=false,destroyed=false;WebContentsObserver* observer=nullptr;base::WeakPtrFactory<WebContents> factory{this};
};
inline WebContentsObserver::WebContentsObserver(WebContents* w):observed_(w){w->observer=this;}inline WebContentsObserver::~WebContentsObserver(){if(observed_&&observed_->observer==this)observed_->observer=nullptr;}
}
class TabStripModel;class TabStripModelChange{};class TabStripSelectionChange{};
class TabStripModelObserver {
 public:virtual ~TabStripModelObserver();virtual void OnTabStripModelChanged(TabStripModel*,const TabStripModelChange&,const TabStripSelectionChange&){}virtual void OnTabStripModelDestroyed(TabStripModel*){}TabStripModel* model=nullptr;
};
class TabStripModel {
 public:void AddObserver(TabStripModelObserver* o){observer=o;o->model=this;}void RemoveObserver(TabStripModelObserver* o){if(observer==o)observer=nullptr;o->model=nullptr;}int GetIndexOfWebContents(const content::WebContents* w){return present&&tab==w?0:-1;}void SetPresent(bool value){present=value;if(observer){TabStripModelChange c;TabStripSelectionChange s;observer->OnTabStripModelChanged(this,c,s);}}void Destroy(){if(observer)observer->OnTabStripModelDestroyed(this);}
 content::WebContents* tab=nullptr;bool present=true;TabStripModelObserver* observer=nullptr;
};
inline TabStripModelObserver::~TabStripModelObserver(){if(model)model->RemoveObserver(this);}
class BrowserWindowInterface {
 public:BrowserWindowInterface(Profile* p,TabStripModel* m):profile(p),model(m){}base::WeakPtr<BrowserWindowInterface> GetWeakPtr(){return factory.GetWeakPtr();}Profile* GetProfile(){return profile;}TabStripModel* GetTabStripModel(){return model;}
 Profile* profile;TabStripModel* model;base::WeakPtrFactory<BrowserWindowInterface> factory{this};
};
#endif
