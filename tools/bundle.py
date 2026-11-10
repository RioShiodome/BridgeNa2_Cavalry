from pathlib import Path

def bundle(root):
    source='// BridgeNa2_Cavalry 4.6.4 — one installed runtime.\n'
    source+=(root/'cavalry/source.js').read_text()+'\n'
    source+=(root/'renderer/host.js').read_text()+'\n'
    source+='\n'.join((root/'cavalry'/name).read_text() for name in ['fingerprint.js','background.js','scheduler.js','bake.js','bake-proxy.js','channel.js','worker.js'])
    (root/'cavalry/Cavalry AE Native.js').write_text(source)
    shared=(root/'ae/json-safe.js').read_text()+'\n'+(root/'ae/cache-root.js').read_text()+'\n'
    picker=shared+(root/'ae/composition-panel.jsx').read_text()
    (root/'ae/创建动画图层.jsx').write_text('#target aftereffects\n'+picker+'\n'+(root/'ae/create-layer.jsx').read_text())
    assert ')CNPICK"' not in picker
    (root/'include/composition_ui.hpp').write_text('#pragma once\nstatic const char* compositionUI=R"CNPICK('+picker+')CNPICK";\n')
    script=shared+(root/'ae/bake-panel.jsx').read_text()
    assert ')CNBAKE"' not in script
    (root/'include/bake_ui.hpp').write_text('#pragma once\nstatic const char* bakeUI=R"CNBAKE('+script+')CNBAKE";\n')
if __name__=='__main__':bundle(Path(__file__).resolve().parents[1])
