import { useEffect, useState } from "react";
import "./App.css";
import { fetchEngineVersion } from "./ipc/tiles";
import { fetchSmokeTile } from "./ipc/_m0_smoke";

/** Root of the idl1 UI. M0: proves JSON and binary IPC against the engine. */
export default function App() {
  const [version, setVersion] = useState<string>("…");
  const [tile, setTile] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchEngineVersion().then(setVersion).catch((e) => setError(String(e)));
    fetchSmokeTile(8)
      .then((t) => setTile(Array.from(t)))
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <main className="idl1-root">
      <h1>idl1</h1>
      <p>Engine {version}</p>
      <p>Smoke tile: {tile.join(", ")}</p>
      {error && <p className="idl1-error">{error}</p>}
    </main>
  );
}
