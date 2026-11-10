#pragma once
#include <filesystem>
#include <string>

namespace cavalry {
// Keep the ExecuteScript prefix ASCII and escape every UTF-16 unit, including
// quotes, slashes and surrogate pairs; a profile name can never become code.
inline std::string scriptCacheRoot(const std::filesystem::path& root){
 static constexpr char hex[]="0123456789abcdef";
 std::string script="$.global.BN_NativeCacheRoot=\"";
 for(char16_t c:root.u16string()){
  script+="\\u";
  for(int shift=12;shift>=0;shift-=4)script+=hex[(c>>shift)&15];
 }
 return script+"\";\n";
}
}
