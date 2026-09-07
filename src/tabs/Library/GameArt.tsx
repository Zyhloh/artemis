import { useState } from "react";
import { artSource } from "@lib/library";
import type { LibraryGame } from "@/types";

interface GameArtProps {
  game: LibraryGame;
  filled: number;
  dimmed: boolean;
}

export function GameArt({ game, filled, dimmed }: GameArtProps) {
  const [pinned] = useState(() => artSource(game));
  const [shown, setShown] = useState(false);
  const source = pinned ?? artSource(game);

  if (!source) {
    return <span className="library__fallback">{game.title}</span>;
  }

  return (
    <span className={`library__picture${shown ? " library__picture--shown" : ""}`}>
      <img
        className={`library__image${dimmed ? " library__image--dim" : ""}`}
        src={source}
        alt=""
        draggable={false}
        ref={(node) => {
          if (node?.complete) setShown(true);
        }}
        onLoad={() => setShown(true)}
      />
      {dimmed && (
        <img
          className="library__image library__image--colour"
          src={source}
          alt=""
          draggable={false}
          aria-hidden="true"
          style={{ clipPath: `inset(0 ${100 - filled}% 0 0)` }}
        />
      )}
    </span>
  );
}
