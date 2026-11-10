#include "cache.hpp"
#include "identity.hpp"
#include <cassert>
#include <thread>
#include <iostream>
#include <fstream>
using namespace cavalry;
std::string manifest(const char* gen,int prefix,int count=48){return std::string(magic)+"\n"+gen+"\n"+std::to_string(count)+"\n320\n180\n24\n0\n50\n0\nTest\nrTest\n"+std::to_string(prefix)+"\nEND\n";}
int main(int argc,char** argv){
 assert(argc==2);fs::path r=fs::u8path(argv[1]);fs::create_directories(r);Store s(r);
 assert(int(float(1867276493))==1867276544); // observed 4.6.0 failure
 for(auto stamp:{16777213LL,16777214LL,16777215LL,2000000000LL,1791867276492LL}){
  int id=identityAfter(stamp);for(int i=0;i<256;i++){assert(id>0&&id<=maxIdentity);assert(int(float(id))==id);id=identityAfter(id);}
 }
 writeAtomic(r/"channels"/"1867276544"/"binding.json","{\"uuid\":\"source-A\"}");
 auto ch1=allocateChannel(r,1867276544),ch2=allocateChannel(r,1867276544);
 assert(ch1!=ch2&&int(float(ch1))==ch1&&int(float(ch2))==ch2);
 assert(readText(r/"channels"/std::to_string(ch1)/"binding.json")==readText(r/"channels"/"1867276544"/"binding.json"));
 for(auto gen:{"gen-previous-1","gen-next-1"}){std::string lengths;fs::create_directories(r/gen);for(int i=0;i<48;i++){char n[32];snprintf(n,sizeof(n),"frame_%06d.png",i);fs::copy_file(r/"tiny.png",r/gen/n,fs::copy_options::overwrite_existing);lengths+=std::to_string(fs::file_size(r/gen/n))+"\n";if(i==7||i==47)writeAtomic(r/gen/("ready-"+std::to_string(i+1)+".txt"),lengths+"END\n");}}

 auto old=manifest("gen-previous-1",48);writeAtomic(r/"complete.txt",old);writeAtomic(r/"preview.txt",std::string(magic)+"\nIDLE\nrTest\nEND\n");int rev1=s.poll();assert(rev1>0);
 writeAtomic(r/"preview.txt",manifest("gen-next-1",8));int rev2=s.poll();assert(rev2!=rev1);auto p=s.snapshot(rev2);assert(p->next.prefix==8);
 assert(chooseFrame(*p,0,r).path.parent_path().filename()=="gen-next-1");assert(chooseFrame(*p,0.9,r).path.parent_path().filename()=="gen-previous-1");
 writeAtomic(r/"preview.txt","partial write");assert(s.poll()==rev2);
 writeAtomic(r/"preview.txt",std::string(magic)+"\nIDLE\nrTest\nEND\n");int rev3=s.poll();assert(rev3!=rev2);assert(!s.snapshot(rev3)->next.valid());assert(s.snapshot(rev2)->next.prefix==8);
 Store reopened(r);assert(reopened.snapshot(int(float(rev2)))->next.prefix==8);
 for(auto rev:{rev1,rev2,rev3}){assert(rev<=maxIdentity&&int(float(rev))==rev);assert(reopened.snapshot(int(float(rev))));}
 assert(!parseManifest(manifest("../bad",8)).valid());assert(!parseManifest(manifest("gen-next-1",49)).valid());
 auto t=manifest("gen-next-1",8);t.replace(t.find("\n24\n"),4,"\nnan\n");assert(!parseManifest(t).valid());
 auto dotted=manifest("gen-dotted-1",1,1);dotted.replace(dotted.find("\nEND\n"),5,"\nDOT\nEND\n");auto dm=parseManifest(dotted);assert(dm.valid()&&dm.dotted);dm.first=-2;Snapshot ds;ds.next=dm;assert(chooseFrame(ds,0,r).path.filename()=="frame.-00002.png");
 fs::create_directories(r/dm.generation);fs::copy_file(r/"tiny.png",r/dm.generation/"frame.-00002.png",fs::copy_options::overwrite_existing);
 auto n=dotted.find("\n24\n0\n");dotted.replace(n,6,"\n24\n-2\n");writeAtomic(r/"preview.txt",dotted);writeAtomic(r/dm.generation/"ready-1.txt",std::to_string(fs::file_size(r/"tiny.png"))+"\nEND\n");auto dr=s.poll();assert(s.snapshot(dr)->next.dotted);Store newer(r);assert(newer.snapshot(dr)->next.first==-2);
 ImageCache cache(100000);std::vector<std::thread> threads;
 for(int i=0;i<8;i++)threads.emplace_back([&]{for(int k=0;k<50;k++){auto image=cache.get(r/"tiny.png");assert(image&&image->width==2&&image->height==2);assert(image->rgba[3]==0&&image->rgba[7]==128);}});
 for(auto& th:threads)th.join();assert(cache.bytes()==16);
 assert(!cache.get(r/"missing.png"));writeAtomic(r/"broken.png","broken");assert(!cache.get(r/"broken.png"));
 // Identical revision and generation numbers in different channels must never
 // cause one effect to display the other effect's snapshot or image path.
 auto a=r/"channels"/"101",b=r/"channels"/"202";
 auto snapshotText=readText(r/"snapshots"/(std::to_string(rev2)+".txt"));
 writeAtomic(a/"snapshots"/"123.txt",snapshotText);
 auto different=snapshotText;auto pos=different.find("\n320\n180\n");assert(pos!=std::string::npos);different.replace(pos,9,"\n640\n360\n");
 writeAtomic(b/"snapshots"/"123.txt",different);Store one(a),two(b);
 assert(one.snapshot(123)->next.width==320);assert(two.snapshot(123)->next.width==640);
 assert(chooseFrame(*one.snapshot(123),0,a).path!=chooseFrame(*two.snapshot(123),0,b).path);
 std::cout<<"PASS immutable revisions, partial fallback, cancellation, reload, malformed metadata, PNG alpha and concurrent LRU\n";
 std::cout<<"PASS independent channel snapshots despite identical revision/generation IDs\n";
}
