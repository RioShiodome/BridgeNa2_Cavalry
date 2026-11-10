#pragma once
#include <cstdint>

namespace cavalry {
// AE can round integer slider values through single precision. Keep new
// persistent IDs exact; retain the old parameter bounds to load saved projects.
constexpr int maxIdentity=0xFFFFFF;
constexpr int identityAfter(int64_t previous){return int(previous%maxIdentity)+1;}
}
