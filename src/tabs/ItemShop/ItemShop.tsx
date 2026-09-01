import { memo, useEffect, useMemo, useState } from "react";
import { useItemShop } from "@hooks/useItemShop";
import { useReveal } from "@hooks/useReveal";
import { useVbucks } from "@hooks/useVbucks";
import { nextRotation, type ShopSection, type ShopTile } from "@lib/shop";
import type { Account } from "@/types";
import vbuck from "./vbuck.png";
import "./ItemShop.css";

const COLUMNS = 4;
const COLLAPSED_ROWS = 3;
const COLLAPSE_ABOVE_ROWS = 8;
const CLUSTER_LIMIT = 4;
const GAP_UNITS = 0.05;
const TILE_HEIGHT = 1.25;
const STAGGER_STEP = 28;
const STAGGER_CAP = 220;
const CLOCK_TICK = 30000;

type Attach = (node: HTMLElement | null) => void;

const gradientOf = (tile: ShopTile): string => {
  const primary = tile.colors.primary ?? "#26262e";
  const secondary = tile.colors.secondary ?? tile.colors.primary ?? "#141419";
  const tertiary = tile.colors.tertiary ?? secondary;

  return `linear-gradient(160deg, ${primary} 0%, ${secondary} 55%, ${tertiary} 100%)`;
};

const panelOf = (section: ShopSection): string | undefined =>
  section.background
    ? `linear-gradient(rgba(10, 10, 16, 0.62), rgba(10, 10, 16, 0.82)), url(${section.background})`
    : undefined;

const ratioOf = (span: number): number =>
  (span + (span - 1) * GAP_UNITS) / TILE_HEIGHT;

const CLOCK_FORMAT: Intl.DateTimeFormatOptions = {
  hour: "numeric",
  minute: "2-digit"
};

const refreshAt = (rotatesAt: string | null, now: number): number => {
  const parsed = rotatesAt ? Date.parse(rotatesAt) : Number.NaN;

  return Number.isFinite(parsed) && parsed > now ? parsed : nextRotation(now);
};

const remainingOf = (at: number, now: number): string => {
  const minutes = Math.max(Math.floor((at - now) / 60000), 0);
  const hours = Math.floor(minutes / 60);

  if (hours >= 1) return `${hours}h ${minutes % 60}m`;
  if (minutes >= 1) return `${minutes}m`;

  return "under a minute";
};

function Price({ tile }: { tile: ShopTile }) {
  const discounted = tile.regularPrice > tile.finalPrice;

  return (
    <span className="shop__price">
      <img className="shop__vbuck" src={vbuck} alt="V-Bucks" draggable={false} />
      {discounted && (
        <s className="shop__price-old">{tile.regularPrice.toLocaleString()}</s>
      )}
      <span className="shop__price-now">{tile.finalPrice.toLocaleString()}</span>
    </span>
  );
}

function Art({ tile }: { tile: ShopTile }) {
  if (tile.promo) {
    return (
      <img
        className="shop__art shop__art--promo"
        src={tile.promo}
        alt={tile.title}
        draggable={false}
        loading="lazy"
        decoding="async"
      />
    );
  }

  if (!tile.icons.length) {
    return <div className="shop__art shop__art--empty" />;
  }

  if (tile.span === 1 || tile.framed) {
    return (
      <img
        className={`shop__art shop__art--${tile.framed ? "framed" : "solo"}`}
        src={tile.icons[0]}
        alt={tile.title}
        draggable={false}
        loading="lazy"
        decoding="async"
      />
    );
  }

  const cluster = tile.icons.slice(0, CLUSTER_LIMIT);

  return (
    <div className="shop__cluster" data-count={cluster.length}>
      {cluster.map((icon, position) => (
        <img
          className={`shop__chip${position === 0 ? " shop__chip--lead" : ""}`}
          key={icon}
          src={icon}
          alt=""
          draggable={false}
          loading="lazy"
          decoding="async"
        />
      ))}
    </div>
  );
}

const Tile = memo(function Tile({
  tile,
  attach,
  delay
}: {
  tile: ShopTile;
  attach: Attach;
  delay: number;
}) {
  return (
    <article
      className={`shop__tile${tile.span > 1 ? " shop__tile--wide" : ""}`}
      ref={attach}
      style={{
        gridColumn: `span ${tile.span}`,
        aspectRatio: ratioOf(tile.span),
        background: gradientOf(tile),
        transitionDelay: `${delay}ms`
      }}
    >
      <Art tile={tile} />

      <div className="shop__shade" />

      <footer className="shop__label">
        <h3 className="shop__name">
          {tile.title}
        </h3>
        <div className="shop__detail-row">
          <Price tile={tile} />
          {tile.kind && <span className="shop__kind">{tile.kind}</span>}
        </div>
      </footer>
    </article>
  );
});

const Section = memo(function Section({
  section,
  category,
  attach
}: {
  section: ShopSection;
  category: string | null;
  attach: Attach;
}) {
  const [expanded, setExpanded] = useState(false);

  const { collapsible, visible } = useMemo(() => {
    const units = section.tiles.reduce((total, tile) => total + tile.span, 0);
    const many = units > COLLAPSE_ABOVE_ROWS * COLUMNS;

    if (!many) return { collapsible: false, visible: section.tiles };

    const budget = COLLAPSED_ROWS * COLUMNS;
    let used = 0;

    const trimmed = section.tiles.filter((tile) => {
      if (used >= budget) return false;
      used += tile.span;
      return true;
    });

    return { collapsible: true, visible: trimmed };
  }, [section.tiles]);

  const tiles = collapsible && !expanded ? visible : section.tiles;
  const hidden = section.tiles.length - tiles.length;

  return (
    <section className="shop__section">
      {category && <p className="shop__category">{category}</p>}

      <div
        className={`shop__panel${section.background ? " shop__panel--textured" : ""}`}
        style={{ backgroundImage: panelOf(section) }}
      >
        <header className="shop__header">
          <div className="shop__heading">
            <h2 className="shop__title">{section.name}</h2>
            {section.subtitle && (
              <p className="shop__subtitle">{section.subtitle}</p>
            )}
          </div>
          {collapsible && (
            <button
              className="shop__toggle"
              onClick={() => setExpanded((open) => !open)}
            >
              {expanded ? "Show less" : `View all (${section.tiles.length})`}
            </button>
          )}
        </header>

        <div className="shop__grid">
          {tiles.map((tile, position) => (
            <Tile
              key={tile.offerId}
              tile={tile}
              attach={attach}
              delay={Math.min(position * STAGGER_STEP, STAGGER_CAP)}
            />
          ))}
        </div>

        {collapsible && !expanded && hidden > 0 && (
          <p className="shop__more">{hidden} more items in this section</p>
        )}
      </div>
    </section>
  );
});

export function ItemShop({ account }: { account: Account | null }) {
  const { view, status, error } = useItemShop();
  const { wallet, status: walletStatus } = useVbucks(account?.accountId ?? null);
  const attach = useReveal();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), CLOCK_TICK);
    return () => window.clearInterval(timer);
  }, []);

  const refresh = refreshAt(view?.rotatesAt ?? null, now);
  const clock = new Date(refresh).toLocaleTimeString(undefined, CLOCK_FORMAT);

  if (!view && status === "error") {
    return (
      <div className="shop__state">
        <p className="shop__notice">{error}</p>
      </div>
    );
  }

  if (!view || walletStatus === "loading") {
    return (
      <div className="shop__state" key={account?.accountId ?? "signed-out"}>
        <span className="shop__spinner" />
        <p className="shop__notice">
          {view ? "Loading the Item Shop for this account…" : "Loading the Item Shop…"}
        </p>
      </div>
    );
  }

  if (!view.sections.length) {
    return (
      <div className="shop__state">
        <p className="shop__notice">The item shop is empty right now.</p>
      </div>
    );
  }

  return (
    <div className="shop">
      <div className="shop__meta">
        {wallet ? (
          <span className="shop__wallet">
            <img
              className="shop__vbuck shop__vbuck--wallet"
              src={vbuck}
              alt="V-Bucks"
              draggable={false}
            />
            <span className="shop__wallet-count">
              {wallet.vbucks.toLocaleString()}
            </span>
          </span>
        ) : (
          <span />
        )}

        <span className="shop__clock">
          Shop refreshes at {clock}
          <span className="shop__clock-dim">
            {" · in "}
            {remainingOf(refresh, now)}
          </span>
        </span>
      </div>

      {view.sections.map((section, position) => (
        <Section
          key={section.id}
          section={section}
          attach={attach}
          category={
            section.category &&
            section.category !== view.sections[position - 1]?.category
              ? section.category
              : null
          }
        />
      ))}
    </div>
  );
}
