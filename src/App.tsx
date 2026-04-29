import { useEffect, useMemo } from "react";
import { useProjectStore } from "./store/projectStore";
import { AudioEngine } from "./audio/AudioEngine";
import { TransportBar } from "./components/TransportBar";
import { Sidebar } from "./components/Sidebar";
import { Timeline } from "./components/Timeline";
import { Inspector } from "./components/Inspector";
import { Mixer } from "./components/Mixer";
import { MasterPanel } from "./components/MasterPanel";
import { ExportModal } from "./components/ExportModal";
import { ShortcutsModal } from "./components/ShortcutsModal";
import { AssistantPanel } from "./components/AssistantPanel";
import { loadAutosave, useAutosave } from "./store/autosave";

export default function App() {
  const engine = useMemo(
    () =>
      new AudioEngine({
        getState: () => useProjectStore.getState(),
        setPosition: (pos) => useProjectStore.getState().setPosition(pos),
        setPlaying: (p) => useProjectStore.getState().setPlaying(p),
      }),
    [],
  );

  const showExport = useProjectStore((s) => s.ui.showExportModal);
  const showShortcuts = useProjectStore((s) => s.ui.showShortcuts);
  const showAssistant = useProjectStore((s) => s.ui.showAssistant);
  const setShowExport = useProjectStore((s) => s.setShowExportModal);
  const setShowShortcuts = useProjectStore((s) => s.setShowShortcuts);
  const setShowAssistant = useProjectStore((s) => s.setShowAssistant);
  const hydrate = useProjectStore((s) => s.hydrateProject);

  // Restore autosaved project on first mount.
  useEffect(() => {
    const saved = loadAutosave();
    if (saved) hydrate(saved);
    // Run only once at boot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Continuously persist project changes.
  useAutosave();

  return (
    <div className="h-screen w-screen flex flex-col bg-neutral-950 text-neutral-100 no-select">
      <TransportBar engine={engine} />
      <div className="flex-1 min-h-0 flex">
        <Sidebar engine={engine} />
        <Timeline engine={engine} />
        <div className="flex flex-col w-80 shrink-0 border-l border-edge bg-panel overflow-hidden">
          <div className="flex-1 min-h-0 overflow-y-auto">
            <Inspector engine={engine} />
          </div>
          <MasterPanel engine={engine} />
        </div>
      </div>
      <Mixer engine={engine} />
      <ExportModal open={showExport} onClose={() => setShowExport(false)} />
      <ShortcutsModal
        open={showShortcuts}
        onClose={() => setShowShortcuts(false)}
      />
      <AssistantPanel
        open={showAssistant}
        onClose={() => setShowAssistant(false)}
        engine={engine}
      />
    </div>
  );
}
