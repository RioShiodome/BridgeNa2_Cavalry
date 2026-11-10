#pragma once
#include "cache.hpp"
#include <algorithm>
#include <cmath>
#include <cstring>
#include <vector>
namespace cavalry {
// AE channels are straight. Interpolate in associated alpha, then unassociate.
struct AxisSample {int a=-1,b=0;float f=0;};
inline std::vector<AxisSample> axis(int count,int origin,double offset,double scale,int source){
 std::vector<AxisSample> v(count);
 for(int i=0;i<count;i++){double p=(i+origin+.5-offset)/scale-.5;if(p<-.5||p>=source-.5)continue;p=std::clamp(p,0.0,double(source-1));int a=int(p);v[i]={a,std::min(a+1,source-1),float(p-a)};}return v;
}
// T is the AE ARGB pixel struct; M is its maximum (255,32768 or 1).
template<class T,int M,class Abort> int resample(const Image* image,T* data,int width,int height,ptrdiff_t rowbytes,double canvasW,double canvasH,int ox,int oy,Abort abort){
 double scale=image?std::min(canvasW/image->width,canvasH/image->height):1;
 double left=image?(canvasW-image->width*scale)*.5:0,top=image?(canvasH-image->height*scale)*.5:0;
 bool direct=image&&std::abs(scale-1)<1e-9&&std::abs(left-std::round(left))<1e-9&&std::abs(top-std::round(top))<1e-9;
 auto xs=image&&!direct?axis(width,ox,left,scale,image->width):std::vector<AxisSample>();
 auto ys=image&&!direct?axis(height,oy,top,scale,image->height):std::vector<AxisSample>();
 auto cast=[](float v){using C=decltype(T{}.alpha);if constexpr(M==1)return C(v/255.f);else return C(std::clamp(v*(float(M)/255.f)+.5f,0.f,float(M)));};
 for(int y=0;y<height;y++){
  if(y%32==0){int e=abort();if(e)return e;}
  auto* row=reinterpret_cast<T*>(reinterpret_cast<unsigned char*>(data)+y*rowbytes);
  if(!image){std::memset(row,0,width*sizeof(T));continue;}
  if(direct){
   int sy=y+oy-int(std::round(top)),sx=ox-int(std::round(left));
   for(int x=0;x<width;x++,sx++){
    if(sy<0||sy>=image->height||sx<0||sx>=image->width){row[x]={};continue;}
    const auto* s=&image->rgba[(size_t(sy)*image->width+sx)*4];
    // Zero RGB in fully transparent pixels, matching associated-alpha filtering.
    if(!s[3]){row[x]={};continue;}
    if constexpr(M==255){row[x]={s[3],s[0],s[1],s[2]};}
    else row[x]={cast(s[3]),cast(s[0]),cast(s[1]),cast(s[2])};
   }continue;
  }
  const auto yy=ys[y];if(yy.a<0){std::memset(row,0,width*sizeof(T));continue;}
  const auto* r0=&image->rgba[size_t(yy.a)*image->width*4];const auto* r1=&image->rgba[size_t(yy.b)*image->width*4];
  for(int x=0;x<width;x++){
   const auto xx=xs[x];if(xx.a<0){row[x]={};continue;}
   const auto* a=r0+xx.a*4;const auto* b=r0+xx.b*4;const auto* c=r1+xx.a*4;const auto* d=r1+xx.b*4;
   float wa=(1-xx.f)*(1-yy.f)*a[3],wb=xx.f*(1-yy.f)*b[3],wc=(1-xx.f)*yy.f*c[3],wd=xx.f*yy.f*d[3];
   float alpha=wa+wb+wc+wd;if(alpha<=0){row[x]={};continue;}
   float inv=1/alpha;
   row[x]={cast(alpha),cast((wa*a[0]+wb*b[0]+wc*c[0]+wd*d[0])*inv),cast((wa*a[1]+wb*b[1]+wc*c[1]+wd*d[1])*inv),cast((wa*a[2]+wb*b[2]+wc*c[2]+wd*d[2])*inv)};
  }
 }
 return 0;
}
}
