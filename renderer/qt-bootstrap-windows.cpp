// Loaded normally by Qt's QT_LOAD_TESTABILITY entry point in the new renderer.
// No Qt SDK/library is shipped; only the installed Qt public API is resolved.
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
extern "C" __declspec(dllexport) void qt_testability_init(){
 wchar_t role[32768]{};
 if(!GetEnvironmentVariableW(L"BRIDGENA2_RENDERER_ROLE",role,32768)||GetFileAttributesW(role)==INVALID_FILE_ATTRIBUTES)ExitProcess(72);
 HMODULE qt=GetModuleHandleW(L"Qt6Core.dll");if(!qt)qt=GetModuleHandleW(L"Qt5Core.dll");
 if(!qt)ExitProcess(73);
 using Enable=void(*)(bool);using Enabled=bool(*)();
 auto enable=reinterpret_cast<Enable>(GetProcAddress(qt,"?setTestModeEnabled@QStandardPaths@@SAX_N@Z"));
 auto enabled=reinterpret_cast<Enabled>(GetProcAddress(qt,"?isTestModeEnabled@QStandardPaths@@SA_NXZ"));
 if(!enable||!enabled)ExitProcess(74);
 enable(true);if(!enabled())ExitProcess(75);
}
