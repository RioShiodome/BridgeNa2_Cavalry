#pragma once
#include <cstdint>
#include <filesystem>
#include <memory>
#include <mutex>
#include <string>
#include <vector>
#include <unordered_map>

namespace cavalry {
namespace fs=std::filesystem;
constexpr const char* magic="CAVALRY_NATIVE_4";
fs::path root();
fs::path channelRoot(int channel);
int allocateChannel(const fs::path& cacheRoot,int from=0);
std::string readText(const fs::path&,size_t limit=1024*1024);
void writeAtomic(const fs::path&,const std::string&);
std::vector<std::string> lines(const std::string&);
struct Manifest {
 std::string generation,name,request; int count=0,width=0,height=0,scale=50,prefix=0,first=0; bool dotted=false; double fps=25;
 bool valid()const{return count>0;}
 std::string key()const;
};
Manifest parseManifest(const std::string&);
struct Snapshot { Manifest next,previous; int revision=0; };
struct FrameChoice { fs::path path; int index=0; bool valid=false; };
FrameChoice chooseFrame(const Snapshot&,double normalized,const fs::path& cacheRoot);
struct Image { int width=0,height=0; std::vector<uint8_t> rgba; };
class ImageCache {
 struct Entry {std::shared_ptr<const Image> image; uint64_t used;};
 std::mutex mutex_; std::unordered_map<std::string,Entry> items_;size_t bytes_=0;uint64_t tick_=0;
 size_t budget_;
public:
 explicit ImageCache(size_t budget=256*1024*1024):budget_(budget){}
 std::shared_ptr<const Image> get(const fs::path&);
 size_t bytes();
};
class Store {
 fs::path root_; std::mutex mutex_;std::unordered_map<int,std::shared_ptr<const Snapshot>> snapshots_;
 std::string key_;int current_=0;Manifest complete_;
 std::unordered_map<std::string,int> verified_;
 bool verify(const Manifest&);
public:
 explicit Store(fs::path rootPath):root_(std::move(rootPath)){}
 int poll(); // Called only on the host UI thread. Publish immutable snapshots.
 std::shared_ptr<const Snapshot> snapshot(int revision);
};
struct Status {std::string phase="offline",error; int done=0,total=0;int64_t heartbeat=0;};
Status readStatus(int channel=0);
void control(const std::string& action,int scale,bool customRange=false,int first=0,int last=249,bool transparent=false,int channel=0);
void log(const std::string&);
int64_t milliseconds();
} // namespace cavalry
