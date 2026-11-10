#include "script_path.hpp"
#include <iostream>
int main(int argc,char** argv){
 if(argc!=2)return 2;
 std::cout<<cavalry::scriptCacheRoot(std::filesystem::u8path(argv[1]));
}
