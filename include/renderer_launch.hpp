#pragma once
#include <filesystem>
#include <fstream>
#include <chrono>
#include <string>
#ifdef _WIN32
#include <windows.h>
#include <vector>
#else
#include <dlfcn.h>
#include <spawn.h>
#include <unistd.h>
#include <sys/wait.h>
extern char **environ;
#endif
namespace cavalry {
inline void ensureRenderer(const std::filesystem::path& root,int64_t now){
 static int64_t launchedAt=0;
#ifndef _WIN32
 static pid_t supervisor=0;
 if(supervisor){int status=0;auto result=waitpid(supervisor,&status,WNOHANG);if(result==0)return;supervisor=0;}
#else
 static HANDLE supervisor=nullptr;
 if(supervisor){if(WaitForSingleObject(supervisor,0)==WAIT_TIMEOUT)return;CloseHandle(supervisor);supervisor=nullptr;}
#endif
 // A final editor heartbeat can still be fresh just after the app quits.
 // Do not launch again until an open editor has published a new state.
 {std::ifstream f(root/"state.txt");std::string magic,owner,request,stamp,phase;
  if(std::getline(f,magic)&&std::getline(f,owner)&&std::getline(f,request)&&std::getline(f,stamp)&&std::getline(f,phase)&&magic=="CAVALRY_NATIVE_4"){
   try{if(phase=="offline"||now-std::stoll(stamp)>15000)return;}catch(...){}
  }
 }
 int64_t demand=0;std::ifstream(root/"renderer-demand.txt")>>demand;
 if(now-demand>3000||demand>now+3000||now-launchedAt<15000)return;
 std::error_code ec;auto modified=std::filesystem::last_write_time(root/"renderer-health.json",ec);
 if(!ec&&std::filesystem::file_time_type::clock::now()-modified<std::chrono::seconds(3))return;
 launchedAt=now;
#ifndef _WIN32
 Dl_info info{};if(!dladdr(reinterpret_cast<void*>(&ensureRenderer),&info)||!info.dli_fname)return;
 auto script=std::filesystem::path(info.dli_fname).parent_path().parent_path()/"Resources/launch-mac.js";
 if(!std::filesystem::exists(script))return;
 std::string exe="/usr/bin/osascript",language="JavaScript",path=script.string(),cache=root.string(),parent=std::to_string(getpid());
 char* argv[]={exe.data(),const_cast<char*>("-l"),language.data(),path.data(),cache.data(),parent.data(),nullptr};
 pid_t child=0;if(posix_spawn(&child,exe.c_str(),nullptr,nullptr,argv,environ)==0)supervisor=child;
#else
 HMODULE module=nullptr;std::vector<wchar_t> location(32768);
 if(!GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS|GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,reinterpret_cast<LPCWSTR>(&ensureRenderer),&module))return;
 if(!GetModuleFileNameW(module,location.data(),DWORD(location.size())))return;
 auto helper=std::filesystem::path(location.data()).parent_path()/L"renderer"/L"launch-windows.ps1";
 std::vector<wchar_t> system(32768);if(!GetSystemDirectoryW(system.data(),DWORD(system.size())))return;
 auto powershell=std::filesystem::path(system.data())/L"WindowsPowerShell"/L"v1.0"/L"powershell.exe";
 std::wstring command=L"\""+powershell.wstring()+L"\" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File \""+helper.wstring()+L"\" -CacheRoot \""+root.wstring()+L"\" -OwnerProcessId "+std::to_wstring(GetCurrentProcessId());
 STARTUPINFOW startup{};startup.cb=sizeof(startup);PROCESS_INFORMATION child{};
 if(CreateProcessW(powershell.c_str(),command.data(),nullptr,nullptr,FALSE,CREATE_NO_WINDOW,nullptr,helper.parent_path().c_str(),&startup,&child)){supervisor=child.hProcess;CloseHandle(child.hThread);}
 else std::ofstream(root/"renderer-health.json")<<"{\"phase\":\"error\",\"stamp\":"<<now<<",\"error\":\"Cannot launch the Windows renderer supervisor. Reinstall the complete package. Windows error "<<GetLastError()<<"\"}";
#endif
}
}
