import { useState } from "react";

import FirstSetup from "./howtos/FirstSetup";
import GpsLapGate from "./howtos/GpsLapGate";
import MathChannels from "./howtos/MathChannels";
import WifiDownload from "./howtos/WifiDownload";

/** One how-to article's list entry. */
interface HowToArticle {
  /** Stable id, used as the React key and the selection state. */
  id: string;
  /** Title shown in the article list. */
  title: string;
  /** One-line description shown under the title. */
  subtitle: string;
  /** The article's content component. */
  Content: () => React.JSX.Element;
}

/** The four how-to articles, carried from idl0's `assets/howtos/*.md` and
 *  rewritten for idl1 as bundled TSX components (CLAUDE.md §3: no CDN,
 *  ever — four short documents do not justify a markdown renderer
 *  dependency). idl0's "Full reference" button, which pointed at an
 *  `example.com` placeholder, is not carried across. */
const ARTICLES: readonly HowToArticle[] = [
  {
    id: "first-setup",
    title: "First Setup",
    subtitle: "Pair your device. Record your first session.",
    Content: FirstSetup,
  },
  {
    id: "wifi-download",
    title: "WiFi Download",
    subtitle: "Connect to the device access point. Pull sessions over WiFi.",
    Content: WifiDownload,
  },
  {
    id: "gps-lap-gate",
    title: "GPS Lap Gate",
    subtitle: "Set a GPS gate. Auto-detect lap times.",
    Content: GpsLapGate,
  },
  {
    id: "math-channels",
    title: "Math Channels",
    subtitle: "Derive new channels via math cells in the notebook.",
    Content: MathChannels,
  },
];

/** The How-tos section: a list of short guides, each opening inline below
 *  the list when selected (idl0 pushed a separate route per article; idl1
 *  keeps everything inside this one section since the tab already has its
 *  own detail pane). */
export default function HowTosSection() {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="idl1-settings__section">
      <ul className="idl1-settings__howto-list">
        {ARTICLES.map((article) => (
          <li key={article.id}>
            <button
              type="button"
              className="idl1-settings__howto-toggle"
              onClick={() => setOpenId(openId === article.id ? null : article.id)}
              aria-expanded={openId === article.id}
            >
              <strong>{article.title}</strong>
              <span className="idl1-settings__description">{article.subtitle}</span>
            </button>
            {openId === article.id ? <article.Content /> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
