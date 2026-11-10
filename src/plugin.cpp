#include "AEConfig.h"
#include "AE_Effect.h"
#include "AE_EffectCB.h"
#include "AE_EffectSuites.h"
#include "AE_EffectCBSuites.h"
#include "AE_GeneralPlug.h"
#include "AE_Macros.h"
#include "Param_Utils.h"
#include "entry.h"
#include "cache.hpp"
#include "identity.hpp"
#include "resample.hpp"
#include "bake_ui.hpp"
#include "composition_ui.hpp"
#include "script_path.hpp"
#include <set>
#include "renderer_launch.hpp"
#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <stdexcept>
#include <memory>

namespace {
constexpr const char* match="Cavalry Native Preview";
enum {INPUT,CONNECT,LIVE,SECONDS,QUALITY,PROGRESS,REVISION,OFFSET,BAKE,BAKE_TOKEN,CUSTOM_RANGE,START_FRAME,END_FRAME,TRANSPARENT_BG,CHANNEL,SELECT_COMP,PICK_TOKEN,NUM_PARAMS};
constexpr PF_OutFlags flags=PF_OutFlag_DEEP_COLOR_AWARE|PF_OutFlag_PIX_INDEPENDENT|PF_OutFlag_NON_PARAM_VARY|PF_OutFlag_SEND_UPDATE_PARAMS_UI;
constexpr PF_OutFlags2 flags2=PF_OutFlag2_SUPPORTS_SMART_RENDER|PF_OutFlag2_FLOAT_COLOR_AWARE|PF_OutFlag2_SUPPORTS_THREADED_RENDERING;
SPBasicSuite* basic=nullptr;AEGP_PluginID pluginID=0;bool registered=false;A_long pendingBakeLayer=0,pendingBakeToken=0,pendingPickLayer=0,pendingPickToken=0;
cavalry::ImageCache imageCache;
cavalry::Store& store(int channel){
 static std::mutex mutex;static std::unordered_map<int,std::unique_ptr<cavalry::Store>> stores;
 std::lock_guard<std::mutex> lock(mutex);auto& s=stores[channel];if(!s)s=std::make_unique<cavalry::Store>(cavalry::channelRoot(channel));return *s;
}
int nextToken(){
 static int previous=cavalry::identityAfter(cavalry::milliseconds());
 return previous=cavalry::identityAfter(previous);
}
void check(A_Err e){if(e)throw e;}
template<class T> class Suite {
 SPBasicSuite* b_;const char* name_;int version_;const T* p_=nullptr;
public:
 Suite(SPBasicSuite* b,const char* n,int v):b_(b),name_(n),version_(v){check(b_->AcquireSuite(n,v,reinterpret_cast<const void**>(&p_)));if(!p_)throw A_Err_GENERIC;}
 ~Suite(){b_->ReleaseSuite(name_,version_);}const T* operator->()const{return p_;}
};
struct Stream {
 const AEGP_StreamSuite5* s;AEGP_StreamRefH h=nullptr;
 Stream(const AEGP_StreamSuite5* suite,AEGP_EffectRefH e,int index):s(suite){check(s->AEGP_GetNewEffectStreamByIndex(pluginID,e,index,&h));}
 ~Stream(){if(h)s->AEGP_DisposeStream(h);}
 double get(){AEGP_StreamValue2 value{};A_Time t{0,1};check(s->AEGP_GetNewStreamValue(pluginID,h,AEGP_LTimeMode_LayerTime,&t,true,&value));double n=value.val.one_d;s->AEGP_DisposeStreamValue(&value);return n;}
 void set(double n){if(std::abs(get()-n)<0.000001)return;AEGP_StreamValue2 value{};value.streamH=h;value.val.one_d=n;check(s->AEGP_SetStreamValue(pluginID,h,&value));}
};
double seconds(const A_Time& t){return t.scale?double(t.value)/t.scale:0;}
A_Time timeValue(double t){return {A_long(std::llround(t*10000)),10000};}
A_Err idle(AEGP_GlobalRefcon,AEGP_IdleRefcon,A_long* sleep){
 *sleep=20;static int64_t last=0;auto now=cavalry::milliseconds();if(now-last<100)return A_Err_NONE;last=now;
 try{
  Suite<AEGP_RenderQueueSuite1> rq(basic,kAEGPRenderQueueSuite,kAEGPRenderQueueSuiteVersion1);AEGP_RenderQueueState state;check(rq->AEGP_GetRenderQueueState(&state));if(state!=AEGP_RenderQueueState_STOPPED)return A_Err_NONE;
  if(pendingBakeLayer){
   auto layer=pendingBakeLayer,token=pendingBakeToken;pendingBakeLayer=0;
   Suite<AEGP_UtilitySuite6> utility(basic,kAEGPUtilitySuite,kAEGPUtilitySuiteVersion6);
   std::string script=cavalry::scriptCacheRoot(cavalry::root())+bakeUI+"\n$.global.CN41_Open("+std::to_string(layer)+","+std::to_string(token)+");";
   check(utility->AEGP_ExecuteScript(pluginID,script.c_str(),false,nullptr,nullptr));
  }
  if(pendingPickLayer){
   auto layer=pendingPickLayer,token=pendingPickToken;pendingPickLayer=0;
   Suite<AEGP_UtilitySuite6> utility(basic,kAEGPUtilitySuite,kAEGPUtilitySuiteVersion6);
   std::string script=cavalry::scriptCacheRoot(cavalry::root())+compositionUI+"\n$.global.BN46_Select("+std::to_string(layer)+","+std::to_string(token)+");";
   check(utility->AEGP_ExecuteScript(pluginID,script.c_str(),false,nullptr,nullptr));
  }
  cavalry::ensureRenderer(cavalry::root(),now);
  static int64_t scannedAt=0;if(now-scannedAt<250)return A_Err_NONE;scannedAt=now;
  std::set<int> usedChannels;bool isPlaying=false;
  static std::unordered_map<int,std::string> controls;
  auto owner=cavalry::readText(cavalry::root()/"owner.txt");
  Suite<AEGP_ProjSuite6> proj(basic,kAEGPProjSuite,kAEGPProjSuiteVersion6);
  Suite<AEGP_ItemSuite9> items(basic,kAEGPItemSuite,kAEGPItemSuiteVersion9);
  Suite<AEGP_ItemViewSuite1> views(basic,kAEGPItemViewSuite,kAEGPItemViewSuiteVersion1);
  Suite<AEGP_CompSuite11> comps(basic,kAEGPCompSuite,kAEGPCompSuiteVersion11);
  Suite<AEGP_LayerSuite8> layers(basic,kAEGPLayerSuite,kAEGPLayerSuiteVersion8);
  Suite<AEGP_EffectSuite4> effects(basic,kAEGPEffectSuite,kAEGPEffectSuiteVersion4);
  Suite<AEGP_StreamSuite5> streams(basic,kAEGPStreamSuite,kAEGPStreamSuiteVersion5);
  AEGP_ProjectH project=nullptr;check(proj->AEGP_GetProjectByIndex(0,&project));if(!project)return A_Err_NONE;
  AEGP_ItemH item=nullptr;check(items->AEGP_GetFirstProjItem(project,&item));
  // A nested composition can invalidate the viewer that is playing its parent.
  // Freeze updates project-wide while any composition viewer is previewing.
  for(AEGP_ItemH probe=item;probe;){
   AEGP_ItemType type;check(items->AEGP_GetItemType(probe,&type));
   if(type==AEGP_ItemType_COMP){AEGP_ItemViewP view=nullptr;A_Boolean playing=false;A_Time t{};
    if(items->AEGP_GetItemMRUView(probe,&view)==A_Err_NONE&&view)views->AEGP_GetItemViewPlaybackTime(view,&playing,&t);
    if(playing)isPlaying=true;
   }
   AEGP_ItemH next=nullptr;check(items->AEGP_GetNextProjItem(project,probe,&next));probe=next;
  }
  for(int guard=0;item&&guard<100000;guard++){
   AEGP_ItemType type;check(items->AEGP_GetItemType(item,&type));
   if(type==AEGP_ItemType_COMP){
    AEGP_CompH comp=nullptr;check(comps->AEGP_GetCompFromItem(item,&comp));A_long count=0;check(layers->AEGP_GetCompNumLayers(comp,&count));
    for(A_long i=0;i<count;i++){
     AEGP_LayerH layer=nullptr;check(layers->AEGP_GetCompLayerByIndex(comp,i,&layer));A_long ne=0;check(effects->AEGP_GetLayerNumEffects(layer,&ne));
     for(A_long j=0;j<ne;j++){
      AEGP_EffectRefH effect=nullptr;check(effects->AEGP_GetLayerEffectByIndex(pluginID,layer,j,&effect));
      try{
       AEGP_InstalledEffectKey key=0;char name[AEGP_MAX_EFFECT_MATCH_NAME_SIZE+1]{};
       check(effects->AEGP_GetInstalledKeyFromLayerEffect(effect,&key));check(effects->AEGP_GetEffectMatchName(key,name));
       AEGP_EffectFlags effectFlags=0;check(effects->AEGP_GetEffectFlags(effect,&effectFlags));
       if(!std::strcmp(name,match)&&(effectFlags&AEGP_EffectFlags_ACTIVE)){
        const auto s=streams.operator->();
        bool live=Stream(s,effect,LIVE).get()>0.5;
        int channel=int(Stream(s,effect,CHANNEL).get());
        AEGP_LayerFlags lf=0;check(layers->AEGP_GetLayerFlags(layer,&lf));
        // Duplicating an AE effect copies parameter values. Give the copy its
        // own stream so changing its quality/range never changes the original.
        if(channel>0&&usedChannels.count(channel)&&!isPlaying&&!(lf&AEGP_LayerFlag_LOCKED)){
         channel=cavalry::allocateChannel(cavalry::root(),channel);Stream(s,effect,CHANNEL).set(channel);Stream(s,effect,REVISION).set(0);Stream(s,effect,PROGRESS).set(0);
        }
        if(channel>0||Stream(s,effect,REVISION).get()>0)usedChannels.insert(channel);
        int q=int(Stream(s,effect,QUALITY).get()),scale=q==1?25:q==3?100:50;
        bool ranged=Stream(s,effect,CUSTOM_RANGE).get()>0.5,alpha=Stream(s,effect,TRANSPARENT_BG).get()>0.5;
        int first=int(Stream(s,effect,START_FRAME).get()),lastFrame=int(Stream(s,effect,END_FRAME).get());
        std::string desired=owner+":"+std::to_string(live)+":"+std::to_string(scale)+":"+std::to_string(ranged)+":"+std::to_string(first)+":"+std::to_string(lastFrame)+":"+std::to_string(alpha);
        if(channel>0&&controls[channel]!=desired&&(!ranged||first<=lastFrame)){
         cavalry::control(live?"connect":"pause",scale,ranged,first,lastFrame,alpha,channel);controls[channel]=desired;
        }
        int revision=store(channel).poll(),progress=0;auto snap=store(channel).snapshot(revision);
        if(snap){auto m=snap->next.valid()?snap->next:snap->previous;progress=m.valid()?100*m.prefix/m.count:0;}

        if(!isPlaying&&!(lf&AEGP_LayerFlag_LOCKED)){
         double duration=std::clamp(Stream(s,effect,SECONDS).get(),0.04,10800.0);
         A_Time in{},len{},local{},compLength{};
         check(layers->AEGP_GetLayerInPoint(layer,AEGP_LTimeMode_CompTime,&in));check(layers->AEGP_GetLayerDuration(layer,AEGP_LTimeMode_CompTime,&len));
         if(std::abs(seconds(len)-duration)>0.0001){
          A_Time d=timeValue(duration);check(layers->AEGP_SetLayerInPointAndDuration(layer,AEGP_LTimeMode_CompTime,&in,&d));
          check(items->AEGP_GetItemDuration(item,&compLength));double end=seconds(in)+duration;
          if(end>seconds(compLength)&&end<=10800){auto ct=timeValue(end);check(comps->AEGP_SetCompDuration(comp,&ct));}
         }
         check(layers->AEGP_GetLayerInPoint(layer,AEGP_LTimeMode_LayerTime,&local));Stream(s,effect,OFFSET).set(seconds(local));
         if(live&&revision>0&&(channel>0||Stream(s,effect,REVISION).get()>0)){Stream(s,effect,REVISION).set(revision);Stream(s,effect,PROGRESS).set(progress);}
        }
       }
      }catch(...){effects->AEGP_DisposeEffect(effect);throw;}
      effects->AEGP_DisposeEffect(effect);
     }
    }
   }
   AEGP_ItemH next=nullptr;check(items->AEGP_GetNextProjItem(project,item,&next));item=next;
  }
  std::string lease="CNCHANNELS1\n"+std::to_string(now)+"\n";
  for(int channel:usedChannels)lease+=std::to_string(channel)+"\n";
  cavalry::writeAtomic(cavalry::root()/"active-channels.txt",lease+"END\n");

 }catch(A_Err e){static A_Err previous=0;if(previous!=e){cavalry::log("Idle SDK error "+std::to_string(e));previous=e;}}
 catch(const std::exception& e){cavalry::log(e.what());}catch(...){cavalry::log("Unknown idle error");}
 return A_Err_NONE;
}
PF_Err paramsSetup(PF_InData* in_data,PF_OutData* out_data){
 PF_ParamDef def{};const auto constant=PF_ParamFlag_CANNOT_TIME_VARY|PF_ParamFlag_CANNOT_INTERP;
 PF_ADD_BUTTON("Connection","Connect / Resync",0,PF_ParamFlag_SUPERVISE|constant,CONNECT);
 PF_ADD_CHECKBOXX("Live sync",true,constant|PF_ParamFlag_SUPERVISE,LIVE);
 PF_ADD_FLOAT_SLIDERX("Duration (seconds)",0.04,10800,0.04,30,5,PF_Precision_HUNDREDTHS,0,constant,SECONDS);
 AEFX_CLR_STRUCT(def);def.flags=constant|PF_ParamFlag_SUPERVISE;PF_ADD_POPUP("Cache resolution",3,2,"25% - fastest|50% - standard|100% - full",QUALITY);
 AEFX_CLR_STRUCT(def);def.flags=constant;def.ui_flags=PF_PUI_DISABLED;PF_ADD_SLIDER("Cached (%)",0,100,0,100,0,PROGRESS);
 AEFX_CLR_STRUCT(def);def.flags=constant;def.ui_flags=PF_PUI_INVISIBLE;PF_ADD_SLIDER("Cache revision",0,2000000001,0,2000000001,0,REVISION);
 AEFX_CLR_STRUCT(def);def.flags=constant;def.ui_flags=PF_PUI_INVISIBLE;
 PF_ADD_FLOAT_SLIDER("Layer offset",-10800,10800,-10800,10800,0,0,PF_Precision_HUNDREDTHS,0,0,OFFSET);
 AEFX_CLR_STRUCT(def);PF_ADD_BUTTON("Bake animation","Bake to current layer...",0,PF_ParamFlag_SUPERVISE|constant,BAKE);
 AEFX_CLR_STRUCT(def);def.flags=constant;def.ui_flags=PF_PUI_INVISIBLE;PF_ADD_SLIDER("Bake target",0,2000000001,0,2000000001,0,BAKE_TOKEN);
 AEFX_CLR_STRUCT(def);PF_ADD_CHECKBOXX("Custom frame range",false,constant|PF_ParamFlag_SUPERVISE,CUSTOM_RANGE);
 AEFX_CLR_STRUCT(def);def.flags=constant|PF_ParamFlag_SUPERVISE;PF_ADD_SLIDER("Start frame",-1000000,1000000,0,1000,0,START_FRAME);
 AEFX_CLR_STRUCT(def);def.flags=constant|PF_ParamFlag_SUPERVISE;PF_ADD_SLIDER("End frame (inclusive)",-1000000,1000000,0,1000,249,END_FRAME);
 AEFX_CLR_STRUCT(def);PF_ADD_CHECKBOXX("Transparent background",false,constant|PF_ParamFlag_SUPERVISE,TRANSPARENT_BG);
 AEFX_CLR_STRUCT(def);def.flags=constant;def.ui_flags=PF_PUI_INVISIBLE;PF_ADD_SLIDER("Composition channel",0,2000000001,0,2000000001,0,CHANNEL);
 AEFX_CLR_STRUCT(def);PF_ADD_BUTTON("Cavalry composition","Choose composition...",0,PF_ParamFlag_SUPERVISE|constant,SELECT_COMP);
 AEFX_CLR_STRUCT(def);def.flags=constant;def.ui_flags=PF_PUI_INVISIBLE;PF_ADD_SLIDER("Composition picker target",0,2000000001,0,2000000001,0,PICK_TOKEN);
 out_data->num_params=NUM_PARAMS;return PF_Err_NONE;
}
struct ParamCheckout {
 PF_InData* in;PF_ParamDef param{};
 ParamCheckout(PF_InData* i,int index):in(i){check(PF_CHECKOUT_PARAM(in,index,in->current_time,in->time_step,in->time_scale,&param));}
 ~ParamCheckout(){PF_CHECKIN_PARAM(in,&param);}
};
struct RenderConfig{int revision;double duration,offset;int channel=0;};
RenderConfig config(PF_InData* in){ParamCheckout r(in,REVISION),d(in,SECONDS),o(in,OFFSET),c(in,CHANNEL);return {r.param.u.sd.value,d.param.u.fs_d.value,o.param.u.fs_d.value,c.param.u.sd.value};}
PF_Err render(PF_InData* in,PF_EffectWorld* out,const RenderConfig& cfg,int originX=0,int originY=0){
 if(!out||!out->data)return PF_Err_NONE;
 Suite<PF_WorldSuite2> world(in->pica_basicP,kPFWorldSuite,kPFWorldSuiteVersion2);PF_PixelFormat format;check(world->PF_GetPixelFormat(out,&format));
 auto snap=store(cfg.channel).snapshot(cfg.revision);std::shared_ptr<const cavalry::Image> image;
 double t=in->time_scale?double(in->current_time)/in->time_scale-cfg.offset:0;
 double step=in->time_scale?std::abs(double(in->time_step)/in->time_scale):1.0/25;
 if(snap&&t>=-0.00001&&t<cfg.duration){
  double normalized=t/std::max(step,cfg.duration-step);auto frame=cavalry::chooseFrame(*snap,normalized,cavalry::channelRoot(cfg.channel));if(frame.valid)image=imageCache.get(frame.path);
  if(!image&&snap->previous.valid()){cavalry::Snapshot fallback;fallback.previous=snap->previous;frame=cavalry::chooseFrame(fallback,normalized,cavalry::channelRoot(cfg.channel));if(frame.valid)image=imageCache.get(frame.path);}
 }
 double canvasW=double(in->width)*in->downsample_x.num/in->downsample_x.den;
 double canvasH=double(in->height)*in->downsample_y.num/in->downsample_y.den;
 auto abort=[&](){return int(PF_ABORT(in));};
 if(format==PF_PixelFormat_ARGB32)return cavalry::resample<PF_Pixel8,255>(image.get(),static_cast<PF_Pixel8*>(out->data),out->width,out->height,out->rowbytes,canvasW,canvasH,originX,originY,abort);
 if(format==PF_PixelFormat_ARGB64)return cavalry::resample<PF_Pixel16,32768>(image.get(),reinterpret_cast<PF_Pixel16*>(out->data),out->width,out->height,out->rowbytes,canvasW,canvasH,originX,originY,abort);
 if(format==PF_PixelFormat_ARGB128)return cavalry::resample<PF_PixelFloat,1>(image.get(),reinterpret_cast<PF_PixelFloat*>(out->data),out->width,out->height,out->rowbytes,canvasW,canvasH,originX,originY,abort);
 return PF_Err_BAD_CALLBACK_PARAM;
 return PF_Err_NONE;
}
struct PreData{RenderConfig cfg;int x,y;};
void deletePre(void* p){delete static_cast<PreData*>(p);}
}
extern "C" DllExport PF_Err PluginDataEntryFunction(PF_PluginDataPtr ptr,PF_PluginDataCB cb,SPBasicSuite*,const char*,const char*){
 PF_Err result=PF_Err_NONE;PF_REGISTER_EFFECT(ptr,cb,"BridgeNa2_Cavalry",match,"Cavalry",AE_RESERVED_INFO);return result;
}
extern "C" DllExport PF_Err EffectMain(PF_Cmd cmd,PF_InData* in_data,PF_OutData* out_data,PF_ParamDef* params[],PF_LayerDef* output,void* extra){
 try{
  switch(cmd){
   case PF_Cmd_ABOUT:snprintf(out_data->return_msg,sizeof(out_data->return_msg),"BridgeNa2_Cavalry 4.6.4\rProgressive animation cache. Connect in this effect; one JS in Cavalry.\rIndependent preview composition and Render Manager baking.");break;
   case PF_Cmd_GLOBAL_SETUP:{
    out_data->my_version=PF_VERSION(4,6,4,PF_Stage_DEVELOP,1);out_data->out_flags=flags;out_data->out_flags2=flags2;
    basic=in_data->pica_basicP;
    if(!registered){Suite<AEGP_UtilitySuite6> utility(basic,kAEGPUtilitySuite,kAEGPUtilitySuiteVersion6);check(utility->AEGP_RegisterWithAEGP(nullptr,"BridgeNa2_Cavalry",&pluginID));Suite<AEGP_RegisterSuite5> reg(basic,kAEGPRegisterSuite,kAEGPRegisterSuiteVersion5);check(reg->AEGP_RegisterIdleHook(pluginID,idle,nullptr));registered=true;cavalry::log("Native plugin loaded; idle hook registered");}
    break;
   }
   case PF_Cmd_PARAMS_SETUP:return paramsSetup(in_data,out_data);
   case PF_Cmd_USER_CHANGED_PARAM:{
    auto changed=static_cast<PF_UserChangedParamExtra*>(extra)->param_index;
    const int channel=params[CHANNEL]->u.sd.value;
    if(changed==SELECT_COMP||(changed==CONNECT&&(channel==0||cavalry::readText(cavalry::channelRoot(channel)/"binding.json").empty()||cavalry::readStatus(channel).phase=="missingSource"))){
     Suite<AEGP_PFInterfaceSuite1> interface(in_data->pica_basicP,kAEGPPFInterfaceSuite,kAEGPPFInterfaceSuiteVersion1);
     Suite<AEGP_LayerSuite8> layers(in_data->pica_basicP,kAEGPLayerSuite,kAEGPLayerSuiteVersion8);
     AEGP_LayerH layer=nullptr;check(interface->AEGP_GetEffectLayer(in_data->effect_ref,&layer));check(layers->AEGP_GetLayerID(layer,&pendingPickLayer));
     pendingPickToken=nextToken();params[PICK_TOKEN]->u.sd.value=pendingPickToken;params[PICK_TOKEN]->uu.change_flags=PF_ChangeFlag_CHANGED_VALUE;
     break;
    }
    if(changed==BAKE){
     if(params[CHANNEL]->u.sd.value==0){snprintf(out_data->return_msg,sizeof(out_data->return_msg),"Choose a Cavalry composition before baking.");out_data->out_flags|=PF_OutFlag_DISPLAY_ERROR_MESSAGE;break;}
     Suite<AEGP_PFInterfaceSuite1> interface(in_data->pica_basicP,kAEGPPFInterfaceSuite,kAEGPPFInterfaceSuiteVersion1);
     Suite<AEGP_LayerSuite8> layers(in_data->pica_basicP,kAEGPLayerSuite,kAEGPLayerSuiteVersion8);
     AEGP_LayerH layer=nullptr;check(interface->AEGP_GetEffectLayer(in_data->effect_ref,&layer));check(layers->AEGP_GetLayerID(layer,&pendingBakeLayer));
     pendingBakeToken=nextToken();params[BAKE_TOKEN]->u.sd.value=pendingBakeToken;params[BAKE_TOKEN]->uu.change_flags=PF_ChangeFlag_CHANGED_VALUE;
    }
    if(changed==CONNECT||changed==LIVE||changed==QUALITY||changed==CUSTOM_RANGE||changed==START_FRAME||changed==END_FRAME||changed==TRANSPARENT_BG){
     if(changed==CONNECT){params[LIVE]->u.bd.value=true;params[LIVE]->uu.change_flags=PF_ChangeFlag_CHANGED_VALUE;}
     const int quality=params[QUALITY]->u.pd.value;int scale=quality==1?25:quality==3?100:50;
     const bool ranged=params[CUSTOM_RANGE]->u.bd.value;
     const int first=params[START_FRAME]->u.sd.value,last=params[END_FRAME]->u.sd.value;
     if(ranged&&first>last){snprintf(out_data->return_msg,sizeof(out_data->return_msg),"Start frame must be <= end frame.");out_data->out_flags|=PF_OutFlag_DISPLAY_ERROR_MESSAGE;return PF_Err_NONE;}
     if(params[CHANNEL]->u.sd.value>0)cavalry::control(params[LIVE]->u.bd.value?"connect":"pause",scale,ranged,first,last,params[TRANSPARENT_BG]->u.bd.value,params[CHANNEL]->u.sd.value);
     out_data->out_flags|=PF_OutFlag_FORCE_RERENDER|PF_OutFlag_REFRESH_UI;
    }break;
   }
   case PF_Cmd_UPDATE_PARAMS_UI:{
    auto state=cavalry::readStatus(params[CHANNEL]->u.sd.value);PF_ParamDef def=*params[PROGRESS];
    if(state.phase=="offline")snprintf(def.name,sizeof(def.name),"Bridge offline - see README");
    else if(state.phase=="missingSource")snprintf(def.name,sizeof(def.name),"Source missing - choose comp");
    else if(state.phase=="error")snprintf(def.name,sizeof(def.name),"Bridge error - see native cache");
    else if(state.phase=="queued")snprintf(def.name,sizeof(def.name),"Queued - other composition");
    else if(state.phase=="starting")snprintf(def.name,sizeof(def.name),"Starting background renderer");
    else if(state.phase=="loading")snprintf(def.name,sizeof(def.name),"Loading background animation");
    else if(state.phase=="baking")snprintf(def.name,sizeof(def.name),"Background baking");
    else if(state.phase=="waiting")snprintf(def.name,sizeof(def.name),"Waiting for editing to stop");
    else if(state.phase=="rendering")snprintf(def.name,sizeof(def.name),"Cached %d / %d frames",state.done,state.total);
    else if(state.phase=="ready")snprintf(def.name,sizeof(def.name),"Animation ready (%%)");
    else snprintf(def.name,sizeof(def.name),"Bridge: %.22s",state.phase.c_str());
    Suite<PF_ParamUtilsSuite3> ui(in_data->pica_basicP,kPFParamUtilsSuite,kPFParamUtilsSuiteVersion3);check(ui->PF_UpdateParamUI(in_data->effect_ref,PROGRESS,&def));break;
   }
   case PF_Cmd_RENDER:return render(in_data,output,{params[REVISION]->u.sd.value,params[SECONDS]->u.fs_d.value,params[OFFSET]->u.fs_d.value,params[CHANNEL]->u.sd.value});
   case PF_Cmd_SMART_PRE_RENDER:{
    auto e=static_cast<PF_PreRenderExtra*>(extra);auto req=e->input->output_request.rect;
    int w=int(std::ceil(double(in_data->width)*in_data->downsample_x.num/in_data->downsample_x.den)),h=int(std::ceil(double(in_data->height)*in_data->downsample_y.num/in_data->downsample_y.den));
    PF_LRect full{0,0,w,h};e->output->max_result_rect=full;
    req.left=std::max<A_long>(0,req.left);req.top=std::max<A_long>(0,req.top);req.right=std::min<A_long>(w,req.right);req.bottom=std::min<A_long>(h,req.bottom);if(req.right<req.left)req.right=req.left;if(req.bottom<req.top)req.bottom=req.top;
    e->output->result_rect=req;auto data=new PreData{config(in_data),int(req.left),int(req.top)};e->output->pre_render_data=data;e->output->delete_pre_render_data_func=deletePre;break;
   }
   case PF_Cmd_SMART_RENDER:{auto e=static_cast<PF_SmartRenderExtra*>(extra);PF_EffectWorld* out=nullptr;check(e->cb->checkout_output(in_data->effect_ref,&out));auto d=static_cast<const PreData*>(e->input->pre_render_data);return render(in_data,out,d->cfg,d->x,d->y);}
   default:break;
  }
 }catch(A_Err e){return PF_Err(e);}catch(const std::exception& e){cavalry::log(e.what());snprintf(out_data->return_msg,sizeof(out_data->return_msg),"BridgeNa2_Cavalry: %.220s",e.what());out_data->out_flags|=PF_OutFlag_DISPLAY_ERROR_MESSAGE;return PF_Err_INTERNAL_STRUCT_DAMAGED;}catch(...){return PF_Err_INTERNAL_STRUCT_DAMAGED;}
 return PF_Err_NONE;
}
