#include "resample.hpp"
#include <cassert>
#include <chrono>
#include <iostream>
#include <random>
struct P8{uint8_t alpha,red,green,blue;};
// Previous release's algorithm, retained only as a correctness/performance oracle.
void reference(const cavalry::Image& im,P8* out,int w,int h,int ox=0,int oy=0,double cw=0,double ch=0){
 if(!cw)cw=w;if(!ch)ch=h;double scale=std::min(cw/im.width,ch/im.height),left=(cw-im.width*scale)*.5,top=(ch-im.height*scale)*.5;
 for(int y=0;y<h;y++)for(int x=0;x<w;x++){
  float p[4]={};double sx=(x+ox+.5-left)/scale-.5,sy=(y+oy+.5-top)/scale-.5;
  if(sx>=-.5&&sy>=-.5&&sx<im.width-.5&&sy<im.height-.5){
   sx=std::clamp(sx,0.,double(im.width-1));sy=std::clamp(sy,0.,double(im.height-1));int ix=int(sx),iy=int(sy);float fx=float(sx-ix),fy=float(sy-iy);
   for(int dy=0;dy<2;dy++)for(int dx=0;dx<2;dx++){int px=std::min(ix+dx,im.width-1),py=std::min(iy+dy,im.height-1);auto s=&im.rgba[(size_t(py)*im.width+px)*4];float weight=(dx?fx:1-fx)*(dy?fy:1-fy),a=s[3]/255.f;p[0]+=weight*a;for(int c=0;c<3;c++)p[c+1]+=weight*a*s[c]/255.f;}
  }
  if(p[0]>0)for(int c=1;c<4;c++)p[c]=std::clamp(p[c]/p[0],0.f,1.f);
  out[y*w+x]={uint8_t(std::lround(p[0]*255)),uint8_t(std::lround(p[1]*255)),uint8_t(std::lround(p[2]*255)),uint8_t(std::lround(p[3]*255))};
 }
}
int main(){std::mt19937 rng(123);auto abort=[](){return 0;};
 for(auto size:{std::pair<int,int>{64,32},{32,64},{1,1},{1,32}}){cavalry::Image im;im.width=size.first;im.height=size.second;im.rgba.resize(im.width*im.height*4);for(auto& v:im.rgba)v=rng()%256;
 for(int w:{32,64,91}){int h=37;std::vector<P8> a(w*h),b(w*h);reference(im,a.data(),w,h,3,5,96,54);cavalry::resample<P8,255>(&im,b.data(),w,h,w*4,96,54,3,5,abort);for(size_t i=0;i<a.size()*4;i++)assert(std::abs(int(((uint8_t*)a.data())[i])-int(((uint8_t*)b.data())[i]))<=1);}}
 for(auto size:{std::pair<int,int>{1920,1080},{960,540}}){cavalry::Image im;im.width=size.first;im.height=size.second;im.rgba.resize(im.width*im.height*4);for(auto& v:im.rgba)v=rng()%256;std::vector<P8> a(1920*1080),b(a.size());double times[2]{};for(int mode=0;mode<2;mode++){auto t=std::chrono::steady_clock::now();for(int i=0;i<12;i++){if(!mode)reference(im,a.data(),1920,1080);else cavalry::resample<P8,255>(&im,b.data(),1920,1080,1920*4,1920,1080,0,0,abort);}times[mode]=std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-t).count()/12;}
 for(size_t i=0;i<a.size()*4;i++)assert(std::abs(int(((uint8_t*)a.data())[i])-int(((uint8_t*)b.data())[i]))<=1);std::cout<<im.width<<"x"<<im.height<<" -> 1920x1080: old "<<times[0]<<" ms, new "<<times[1]<<" ms, "<<times[0]/times[1]<<"x\n";}
 std::cout<<"PASS alpha, aspect fit, cropped tiles and rounding <= 1/255\n";
}
