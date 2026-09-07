import { Icon } from "@components/Icon/Icon";
import type { LibraryGame } from "@/types";
import { GameArt } from "./GameArt";
import type { CardState, View } from "./state";

interface GameCardProps {
  game: LibraryGame;
  state: CardState;
  view: View;
  onPrimary: (game: LibraryGame) => void;
  onMenu: (game: LibraryGame, anchor: DOMRect) => void;
}

const size = (bytes: number | null) =>
  bytes ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : null;

export function GameCard({ game, state, view, onPrimary, onMenu }: GameCardProps) {
  const { busy, launching, running, playable, installable, glyph, status, primary } =
    state;

  const pinned = launching || running;
  const actionable = busy || running || playable || installable;
  const dimmed = !game.installed || state.downloading;

  const dots = (
    <button
      className="library__dots"
      onClick={(event) => onMenu(game, event.currentTarget.getBoundingClientRect())}
      aria-label={`${game.title} options`}
    >
      <Icon name="more" size={15} />
    </button>
  );

  if (view === "list") {
    return (
      <div className="library__row" data-flip={game.appName}>
        <span className="library__thumb">
          <GameArt game={game} filled={state.filled} dimmed={dimmed} />
        </span>

        <span className="library__cell library__cell--title">
          <span className="library__name">{game.title}</span>
          <span className="library__status">{status}</span>
        </span>

        <span className="library__cell library__cell--size">
          {size(game.installSize) ?? ""}
        </span>

        <span className="library__cell library__cell--actions">
          <button
            className={`library__button${
              playable ? " library__button--primary" : ""
            }`}
            onClick={() => onPrimary(game)}
            disabled={launching || !actionable}
          >
            {launching && <span className="library__spinner library__spinner--tiny" />}
            {primary}
          </button>
          {dots}
        </span>
      </div>
    );
  }

  return (
    <article
      className={`library__card${game.installed ? " library__card--installed" : ""}`}
      data-flip={game.appName}
    >
      <button
        className="library__art"
        onClick={() => onPrimary(game)}
        disabled={launching || !actionable}
        aria-label={`${game.title} actions`}
      >
        <GameArt game={game} filled={state.filled} dimmed={dimmed} />

        {running && <span className="library__badge">Running</span>}

        {actionable && (
          <span
            className={`library__overlay${pinned ? " library__overlay--pinned" : ""}`}
          >
            {launching ? (
              <span className="library__spinner library__spinner--art" />
            ) : (
              <Icon name={glyph} size={26} />
            )}
          </span>
        )}
      </button>

      <div className="library__meta">
        <div className="library__text">
          <h2 className="library__title">{game.title}</h2>
          {installable ? (
            <button
              className="library__install"
              onClick={() => onPrimary(game)}
            >
              <Icon name="download" size={12} strokeWidth={2} />
              Install
            </button>
          ) : (
            <p className="library__status">{status}</p>
          )}
        </div>

        {dots}
      </div>
    </article>
  );
}
