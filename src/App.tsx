import { useMemo } from "react";
import { useProjectStore } from "./store/projectStore";
import { AudioEngine } from "./audio/AudioEngine";
import { TransportBar } from "./components/TransportBar";
import { Sidebar } from "./components/Sidebar";
import { Timeline } from "./components/Timeline";
import { Inspector } from "./components/Inspector";
import { Mixer } from "./components/Mixer";

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

  return (
    <div className="h-screen w-screen flex flex-col bg-neutral-950 text-neutral-100 no-select">
      <TransportBar engine={engine} />
      <div className="flex-1 min-h-0 flex">
        <Sidebar engine={engine} />
        <Timeline engine={engine} />
        <Inspector engine={engine} />
      </div>
      <Mixer engine={engine} />
    </div>
  );
}
