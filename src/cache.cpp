#include "cache.hpp"
#include "identity.hpp"
#include <algorithm>
#include <chrono>
#include <cmath>
#include <fstream>
#include <regex>
#include <sstream>
#include <stdexcept>
#include <cstring>
#ifdef _WIN32
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>
#include <shlobj.h>
#else
#include <unistd.h>
#include <pwd.h>
#endif
#define STB_IMAGE_IMPLEMENTATION
#define STBI_ONLY_PNG
#define STBI_NO_STDIO
#define STBI_MAX_DIMENSIONS 32768
#include "stb_image.h"
namespace cavalry {
int64_t milliseconds(){return std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::system_clock::now().time_since_epoch()).count();}
fs::path root(){
#ifdef _WIN32
 PWSTR home=nullptr;if(SUCCEEDED(SHGetKnownFolderPath(FOLDERID_Profile,0,nullptr,&home))){fs::path p(home);CoTaskMemFree(home);return p/L"Cavalry AE Native"/L"default";}
 throw std::runtime_error("Cannot locate the Windows profile folder.");
#else
 const char* h=getenv("HOME");if(h)return fs::path(h)/"Cavalry AE Native"/"default";
 auto pw=getpwuid(getuid());if(pw)return fs::path(pw->pw_dir)/"Cavalry AE Native"/"default";
 throw std::runtime_error("Cannot locate the user home folder.");
#endif
}
std::string readText(const fs::path& p,size_t limit){std::ifstream f(p,std::ios::binary);if(!f)return {};f.seekg(0,std::ios::end);auto n=f.tellg();if(n<0||uint64_t(n)>limit)return {};f.seekg(0);std::string s(size_t(n),'\0');if(n&&!f.read(&s[0],n))return {};return s;}
void writeAtomic(const fs::path& p,const std::string& s){
 fs::create_directories(p.parent_path());auto tmp=p;tmp+=".tmp";
 {std::ofstream f(tmp,std::ios::binary|std::ios::trunc);if(!f||!f.write(s.data(),s.size())||!f.flush())throw std::runtime_error("Cannot write cache metadata.");}
#ifdef _WIN32
 if(!MoveFileExW(tmp.c_str(),p.c_str(),MOVEFILE_REPLACE_EXISTING|MOVEFILE_WRITE_THROUGH))throw std::runtime_error("Cannot commit cache metadata.");
#else
 fs::rename(tmp,p);
#endif
}
std::vector<std::string> lines(const std::string& src){std::string s=src;if(s.compare(0,3,"\xef\xbb\xbf")==0)s.erase(0,3);s.erase(std::remove(s.begin(),s.end(),'\r'),s.end());std::vector<std::string> a;size_t p=0,q;while((q=s.find('\n',p))!=std::string::npos){a.push_back(s.substr(p,q-p));p=q+1;}a.push_back(s.substr(p));return a;}
static int integer(const std::string& s,int low,int high){if(s.empty()||s.size()>10||s.find_first_not_of("0123456789")!=std::string::npos)throw std::runtime_error("integer");auto n=std::stoll(s);if(n<low||n>high)throw std::runtime_error("bounds");return int(n);}
Manifest parseManifest(const std::string& text){
 Manifest m;auto a=lines(text);if((a.size()!=14&&a.size()!=15)||a[0]!=magic||a[a.size()-2]!="END"||!a.back().empty())return m;
 try{
  if(!std::regex_match(a[1],std::regex("gen-[a-zA-Z0-9]+-[0-9]+")))return m;
  m.generation=a[1];m.count=integer(a[2],1,100000);m.width=integer(a[3],1,32768);m.height=integer(a[4],1,32768);
  size_t end=0;m.fps=std::stod(a[5],&end);if(end!=a[5].size()||!std::isfinite(m.fps)||m.fps<1||m.fps>99)return {};
  m.dotted=a.size()==15&&a[12]=="DOT";if(a.size()==15&&!m.dotted)return {};
  {size_t used=0;long n=std::stol(a[6],&used);if(used!=a[6].size()||n< -1000000||n>1000000)return {};m.first=int(n);}
  m.scale=integer(a[7],25,100);if(m.scale!=25&&m.scale!=50&&m.scale!=100)return {};
  m.name=a[9];m.request=a[10];m.prefix=integer(a[11],0,m.count);
 }catch(...){return {};}
 return m;
}
std::string Manifest::key()const{return valid()?generation+":"+std::to_string(prefix)+":"+std::to_string(count)+":"+std::to_string(width)+":"+std::to_string(height)+":"+std::to_string(fps)+":"+std::to_string(first)+(dotted?":DOT":""):"-";}
FrameChoice chooseFrame(const Snapshot& s,double t,const fs::path& r){
 FrameChoice c;if(!std::isfinite(t))return c;t=std::clamp(t,0.0,1.0);
 const Manifest* m=&s.next;int i=m->valid()?int(std::llround(t*(m->count-1))):0;
 if(!m->valid()||i>=m->prefix){m=&s.previous;if(!m->valid())return c;i=int(std::llround(t*(m->count-1)));}
 if(i<0||i>=m->prefix)return c;char file[32];snprintf(file,sizeof(file),m->dotted?"frame.%06d.png":"frame_%06d.png",i+(m->dotted?m->first:0));
 c.path=r/m->generation/file;c.index=i;c.valid=true;return c;
}
std::shared_ptr<const Image> ImageCache::get(const fs::path& p){
 const auto key=p.u8string();
 {std::lock_guard<std::mutex> lock(mutex_);auto it=items_.find(key);if(it!=items_.end()){it->second.used=++tick_;return it->second.image;}}
 auto bytes=readText(p,256*1024*1024);static const unsigned char tail[]={0,0,0,0,'I','E','N','D',0xae,0x42,0x60,0x82};
 if(bytes.size()<45||memcmp(bytes.data(),"\x89PNG\r\n\x1a\n",8)||memcmp(bytes.data()+bytes.size()-12,tail,12))return {};
 int w=0,h=0,n=0;if(!stbi_info_from_memory(reinterpret_cast<const stbi_uc*>(bytes.data()),int(bytes.size()),&w,&h,&n)||w<1||h<1||uint64_t(w)*h>64*1024*1024)return {};
 auto data=stbi_load_from_memory(reinterpret_cast<const stbi_uc*>(bytes.data()),int(bytes.size()),&w,&h,&n,4);if(!data)return {};
 auto image=std::make_shared<Image>();image->width=w;image->height=h;
 try{image->rgba.assign(data,data+size_t(w)*h*4);}catch(...){stbi_image_free(data);throw;}stbi_image_free(data);
 std::lock_guard<std::mutex> lock(mutex_);auto found=items_.find(key);if(found!=items_.end())return found->second.image;
 const auto size=image->rgba.size();if(size>budget_)return image;
 while(bytes_+size>budget_&&!items_.empty()){
  auto oldest=std::min_element(items_.begin(),items_.end(),[](auto& a,auto& b){return a.second.used<b.second.used;});bytes_-=oldest->second.image->rgba.size();items_.erase(oldest);
 }
 items_[key]={image,++tick_};bytes_+=size;return image;
}
size_t ImageCache::bytes(){std::lock_guard<std::mutex> lock(mutex_);return bytes_;}
static std::string encode(const Manifest& m){if(!m.valid())return "NONE\n";return std::string(magic)+"\n"+m.generation+"\n"+std::to_string(m.count)+"\n"+std::to_string(m.width)+"\n"+std::to_string(m.height)+"\n"+std::to_string(m.fps)+"\n"+std::to_string(m.first)+"\n"+std::to_string(m.scale)+"\n0\n"+m.name+"\n"+m.request+"\n"+std::to_string(m.prefix)+(m.dotted?"\nDOT":"")+"\nEND\n";}
bool Store::verify(const Manifest& m){
 if(!m.valid())return false;
 int start=verified_[m.generation];if(start>=m.prefix)return true;
 auto sizes=lines(readText(root_/m.generation/("ready-"+std::to_string(m.prefix)+".txt"),4*1024*1024));
 if(sizes.size()!=size_t(m.prefix+2)||sizes[m.prefix]!="END"||!sizes.back().empty())return false;
 try{for(int i=start;i<m.prefix;i++){
  int length=integer(sizes[i],45,256*1024*1024);char name[32];snprintf(name,sizeof(name),m.dotted?"frame.%06d.png":"frame_%06d.png",i+(m.dotted?m.first:0));
  std::error_code ec;auto actual=fs::file_size(root_/m.generation/name,ec);if(ec||actual!=uint64_t(length))return false;
 }}catch(...){return false;}
 if(verified_.size()>64)verified_.clear();verified_[m.generation]=m.prefix;return true;
}
int Store::poll(){
 auto completed=parseManifest(readText(root_/"complete.txt"));if(completed.valid()&&completed.prefix!=completed.count)completed={};
 // Completion metadata may be observed during the JS writer's write call.
 // Keep the last valid completed version through that brief interval.
 if(completed.valid()&&verify(completed))complete_=completed;else completed=complete_;
 auto text=readText(root_/"preview.txt");auto next=parseManifest(text);
 auto idle=lines(text);bool cancelled=idle.size()==5&&idle[0]==magic&&idle[1]=="IDLE"&&idle[3]=="END"&&idle[4].empty();
 if(!next.valid()&&!cancelled)return current_; // torn writes retain the last coherent state
 if(next.valid()&&!verify(next))return current_;
 if(next.generation==completed.generation)next={};
 std::string key=next.key()+"|"+completed.key();if(key==key_)return current_;
 auto snap=std::make_shared<Snapshot>();snap->next=next;snap->previous=completed;
 fs::create_directories(root_/"snapshots");int rev=identityAfter(milliseconds()),initial=rev;
 while(fs::exists(root_/"snapshots"/(std::to_string(rev)+".txt"))){rev=identityAfter(rev);if(rev==initial)throw std::runtime_error("Cache snapshot IDs exhausted. Choose a new composition channel.");}
 snap->revision=rev;writeAtomic(root_/"snapshots"/(std::to_string(rev)+".txt"),"CNSNAPSHOT4\n"+encode(next)+"===\n"+encode(completed)+"DONE\n");
 {std::lock_guard<std::mutex> lock(mutex_);snapshots_[rev]=snap;}
 key_=key;current_=rev;return rev;
}
std::shared_ptr<const Snapshot> Store::snapshot(int rev){
 if(rev<=0)return {};
 {std::lock_guard<std::mutex> lock(mutex_);auto it=snapshots_.find(rev);if(it!=snapshots_.end())return it->second;}
 auto text=readText(root_/"snapshots"/(std::to_string(rev)+".txt"));auto split=text.find("===\n");
 if(text.compare(0,12,"CNSNAPSHOT4\n")!=0||split==std::string::npos||text.size()<5||text.substr(text.size()-5)!="DONE\n")return {};
 auto snap=std::make_shared<Snapshot>();snap->revision=rev;snap->next=parseManifest(text.substr(12,split-12));snap->previous=parseManifest(text.substr(split+4,text.size()-5-split-4));
 if(!snap->next.valid()&&!snap->previous.valid())return {};
 std::lock_guard<std::mutex> lock(mutex_);snapshots_[rev]=snap;return snap;
}
int allocateChannel(const fs::path& cacheRoot,int from){
 auto base=cacheRoot/"channels";fs::create_directories(base);
 int id=identityAfter(milliseconds()),initial=id;
 while(!fs::create_directory(base/std::to_string(id))){id=identityAfter(id);if(id==initial)throw std::runtime_error("Bridge channel IDs exhausted.");}
 if(from>0){auto binding=readText(base/std::to_string(from)/"binding.json");if(!binding.empty())writeAtomic(base/std::to_string(id)/"binding.json",binding);}
 return id;
}
fs::path channelRoot(int channel){if(channel<0||channel>2000000001)throw std::runtime_error("Invalid bridge channel");return channel?root()/"channels"/std::to_string(channel):root();}
Status readStatus(int channel){Status s;auto a=lines(readText(channelRoot(channel)/"state.txt"));if(a.size()!=12||a[0]!=magic||a[10]!="END")return s;try{s.heartbeat=std::stoll(a[3]);s.phase=a[4];s.done=integer(a[5],0,100000);s.total=integer(a[6],0,100000);s.error=a[7];if(milliseconds()-s.heartbeat>7000)s.phase="offline";}catch(...){return {}; }return s;}
void control(const std::string& action,int scale,bool customRange,int first,int last,bool transparent,int channel){static unsigned serial=0;auto t=std::to_string(milliseconds());writeAtomic(channelRoot(channel)/"control.txt",std::string(magic)+"\nr"+t+"x"+std::to_string(++serial)+"\n"+action+"\n"+std::to_string(scale)+"\n"+t+"\nAE\n"+(customRange?"1":"0")+"\n"+std::to_string(first)+"\n"+std::to_string(last)+"\n"+(transparent?"1":"0")+"\nEND\n");}
void log(const std::string& s){try{fs::create_directories(root());std::ofstream f(root()/"native.log",std::ios::app);f<<milliseconds()<<" "<<s<<"\n";}catch(...){} }
}
