// Read-only cache probe. Shares the production PNG decoder, snapshot parser and
// pixel conversion. Never calls Store::poll or changes bridge control files.
#include "cache.hpp"
#include "resample.hpp"
#include <algorithm>
#include <fstream>
#include <iostream>
#include <set>
#include <sstream>
#ifdef _WIN32
#include <windows.h>
#endif
using namespace cavalry;
struct Pixel8 {uint8_t alpha,red,green,blue;};
struct Pixel16 {uint16_t alpha,red,green,blue;};
struct Pixel32 {float alpha,red,green,blue;};
static std::string pathText(const fs::path& p){return p.u8string();}
static void appendFile(std::ostream& out,const fs::path& file,size_t limit=4096){
 auto data=readText(file,limit);if(data.empty())return;
 out<<"\n["<<pathText(file.filename())<<"]\n"<<data<<"\n";
}
static void bmp(const fs::path& path,const std::vector<Pixel8>& p,int w,int h){
 int stride=(w*3+3)&~3;std::string bytes(54+stride*h,'\0');
 auto put=[&](int at,uint32_t v,int n){for(int i=0;i<n;i++)bytes[at+i]=char(v>>(8*i));};
 bytes[0]='B';bytes[1]='M';put(2,bytes.size(),4);put(10,54,4);put(14,40,4);put(18,w,4);put(22,h,4);put(26,1,2);put(28,24,2);put(34,stride*h,4);
 for(int y=0;y<h;y++)for(int x=0;x<w;x++){
  auto s=p[size_t(y)*w+x];int bg=((x/12+y/12)&1)?176:224;auto at=54+(h-1-y)*stride+3*x;
  bytes[at]=char((s.blue*s.alpha+bg*(255-s.alpha)+127)/255);
  bytes[at+1]=char((s.green*s.alpha+bg*(255-s.alpha)+127)/255);
  bytes[at+2]=char((s.red*s.alpha+bg*(255-s.alpha)+127)/255);
 }
 writeAtomic(path,bytes);
}
template<class P> static size_t colored(const std::vector<P>& pixels){size_t count=0;for(auto p:pixels)if(p.alpha>0&&(p.red>0||p.green>0||p.blue>0))count++;return count;}
static void frame(std::ostream& out,ImageCache& cache,const FrameChoice& f,const fs::path& output,const std::string& tag){
 if(!f.valid){out<<"FRAME_UNAVAILABLE "<<tag<<" (not published at this animation time)\n";return;}
 std::error_code ec;auto bytes=fs::file_size(f.path,ec);
 out<<"FRAME "<<tag<<" path="<<pathText(f.path)<<" bytes="<<(ec?0:bytes)<<"\n";
 auto image=cache.get(f.path);
 if(!image){out<<"PNG_DECODE_FAILED (same decoder as the AEX)\n";return;}
 size_t visible=0,nonBlack=0;unsigned maxAlpha=0,maxRGB=0;
 for(size_t i=0;i<image->rgba.size();i+=4){auto a=image->rgba[i+3];maxAlpha=std::max(maxAlpha,unsigned(a));if(a){visible++;auto c=std::max({image->rgba[i],image->rgba[i+1],image->rgba[i+2]});maxRGB=std::max(maxRGB,unsigned(c));if(c)nonBlack++;}}
 out<<"PNG_OK "<<image->width<<"x"<<image->height<<" visiblePixels="<<visible<<" nonBlackVisiblePixels="<<nonBlack<<" maxAlpha="<<maxAlpha<<" maxVisibleRGB="<<maxRGB<<"\n";
 out<<(visible==0?"PNG_FULLY_TRANSPARENT":nonBlack==0?"PNG_VISIBLE_PIXELS_BLACK":"PNG_HAS_VISIBLE_CONTENT")<<"\n";
 int w=256,h=std::max(1,int(std::round(double(image->height)*w/image->width)));if(h>256){h=256;w=std::max(1,int(std::round(double(image->width)*h/image->height)));}
 std::vector<Pixel8> p8(w*h);std::vector<Pixel16> p16(w*h);std::vector<Pixel32> p32(w*h);auto abort=[](){return 0;};
 resample<Pixel8,255>(image.get(),p8.data(),w,h,w*sizeof(Pixel8),w,h,0,0,abort);
 resample<Pixel16,32768>(image.get(),p16.data(),w,h,w*sizeof(Pixel16),w,h,0,0,abort);
 resample<Pixel32,1>(image.get(),p32.data(),w,h,w*sizeof(Pixel32),w,h,0,0,abort);
 out<<"CONVERT visible-color thumbnail pixels: 8bpc="<<colored(p8)<<" 16bpc="<<colored(p16)<<" 32bpc="<<colored(p32)<<"\n";
 auto preview=output/(tag+".bmp");bmp(preview,p8,w,h);out<<"PREVIEW "<<pathText(preview.filename())<<" (checkerboard means transparency)\n";
}
static int probe(const fs::path& cacheRoot,const fs::path& output){
 fs::create_directories(output);std::ofstream out(output/"Preview-Report.txt",std::ios::binary);
 if(!out)throw std::runtime_error("Cannot write Preview-Report.txt");
 out<<"\xef\xbb\xbf" "BridgeNa2 preview diagnostic 1 (plugin 4.6.4 cache format)\n";
 out<<"Cache="<<pathText(cacheRoot)<<"\nStamp="<<milliseconds()<<"\n";
 out<<"This tool reads caches only. It does not test AE SDK callbacks, render or launch Cavalry.\n";
 appendFile(out,cacheRoot/"renderer-health.json");appendFile(out,cacheRoot/"renderer-result.json",32768);
 std::vector<fs::path> channels;std::error_code ec;
 if(fs::is_directory(cacheRoot/"channels",ec))for(auto& entry:fs::directory_iterator(cacheRoot/"channels")){
  auto name=entry.path().filename().string();if(entry.is_directory()&&!name.empty()&&name.size()<=10&&name.find_first_not_of("0123456789")==std::string::npos)channels.push_back(entry.path());
 }
 auto latest=[](const fs::path& p){std::error_code e;auto t=fs::last_write_time(p/"state.txt",e);return e?fs::file_time_type::min():t;};
 std::sort(channels.begin(),channels.end(),[&](const auto& a,const auto& b){return latest(a)>latest(b);});
 if(channels.size()>24)channels.resize(24);
 if(channels.empty()||fs::exists(cacheRoot/"complete.txt"))channels.push_back(cacheRoot);
 ImageCache cache(16*1024*1024);
 for(const auto& dir:channels){
  const auto id=dir==cacheRoot?"default":dir.filename().string();
  out<<"\n========== CHANNEL "<<id<<" ==========\n";
  appendFile(out,dir/"binding.json");appendFile(out,dir/"state.txt");appendFile(out,dir/"last-error.txt");
  auto next=parseManifest(readText(dir/"preview.txt")),complete=parseManifest(readText(dir/"complete.txt"));
  if(complete.valid()&&complete.prefix!=complete.count)complete={};
  out<<"MANIFEST preview="<<next.key()<<" complete="<<complete.key()<<"\n";
  Snapshot selected;selected.next=next;selected.previous=complete;
  if(next.valid()&&complete.valid()&&next.generation==complete.generation)selected.next={};
  std::vector<fs::path> snapshots;
  if(fs::is_directory(dir/"snapshots",ec))for(auto& entry:fs::directory_iterator(dir/"snapshots"))if(entry.is_regular_file()&&entry.path().extension()==".txt")snapshots.push_back(entry.path());
  std::sort(snapshots.begin(),snapshots.end(),[](const auto& a,const auto& b){std::error_code ea,eb;return fs::last_write_time(a,ea)>fs::last_write_time(b,eb);});
  if(!snapshots.empty()){
   try{int rev=std::stoi(snapshots[0].stem().string());Store store(dir);auto s=store.snapshot(rev);out<<"LATEST_SNAPSHOT revision="<<rev<<" readable="<<bool(s)<<" (compare with AE report; newest is not necessarily selected)\n";
    if(s){out<<"SNAPSHOT preview="<<s->next.key()<<" previous="<<s->previous.key()<<"\n";frame(out,cache,chooseFrame(*s,0.5,dir),output,id+"_snapshot-middle");}
   }catch(const std::exception& e){out<<"SNAPSHOT_ERROR "<<e.what()<<"\n";}
  }else out<<"NO_SNAPSHOT\n";
  for(int i=0;i<3;i++)frame(out,cache,chooseFrame(selected,i*0.5,dir),output,id+(i==0?"_first":i==1?"_middle":"_last"));
 }
 out<<"\nInspect the BMPs and send this report with AE-Preview-Report.json if available. The report includes local profile/scene paths and composition names.\n";
 if(!out.flush())throw std::runtime_error("Cannot finish preview report");return 0;
}
static int run(const std::vector<fs::path>& args){
 try{
  fs::path r=cavalry::root(),out;for(size_t i=1;i<args.size();i++){
   auto option=args[i].string();if(i+1==args.size())throw std::runtime_error("Missing argument");
   if(option=="--root")r=args[++i];else if(option=="--out")out=args[++i];else throw std::runtime_error("Unknown argument");
  }
  if(out.empty())throw std::runtime_error("Use Check-Preview-Windows.cmd or specify --out");
  return probe(r,out);
 }catch(const std::exception& e){std::cerr<<"Preview check failed: "<<e.what()<<"\n";return 1;}
}
#ifdef _WIN32
int wmain(int argc,wchar_t** argv){std::vector<fs::path> args;for(int i=0;i<argc;i++)args.emplace_back(argv[i]);return run(args);}
#else
int main(int argc,char** argv){std::vector<fs::path> args;for(int i=0;i<argc;i++)args.push_back(fs::u8path(argv[i]));return run(args);}
#endif
