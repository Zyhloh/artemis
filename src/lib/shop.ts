import { invoke } from "@tauri-apps/api/core";

const IMAGE_KEYS = ["icon", "albumArt", "wide", "render", "smallIcon"];
const FRAMED_KEYS = ["albumArt"];

export interface TileColors {
  primary: string | null;
  secondary: string | null;
  tertiary: string | null;
  text: string | null;
}

export interface ShopTile {
  offerId: string;
  title: string;
  kind: string | null;
  promo: string | null;
  icons: string[];
  framed: boolean;
  span: number;
  finalPrice: number;
  regularPrice: number;
  bundle: boolean;
  pieces: number;
  colors: TileColors;
}

export interface ShopSection {
  id: string;
  name: string;
  category: string | null;
  subtitle: string | null;
  background: string | null;
  tiles: ShopTile[];
}

export interface ShopView {
  key: string;
  sections: ShopSection[];
  fetchedAt: string | null;
  rotatesAt: string | null;
}

export interface ShopSnapshot {
  key: string;
  fetchedAt: string;
  resetsAt: string | null;
  shop: unknown;
  sections: unknown;
}

export const SHOP_EVENT = "shop:changed";

interface RawBackground {
  texture?: string | null;
}

interface RawLayout {
  name?: string | null;
  index?: number | null;
  rank?: number | null;
  category?: string | null;
  subtitle?: string | null;
  background?: RawBackground | null;
}

interface RawItem {
  name?: string;
  cosmeticType?: { displayValue?: string };
  images?: Record<string, unknown>;
}

interface RawOffer {
  offerId: string;
  devName?: string;
  sortPriority: number;
  layoutId?: string;
  layoutRank: number;
  sectionId: string;
  tileSize?: string;
  outDate?: string | null;
  bundleId?: string | null;
  mainType?: string | null;
  bundle?: { name?: string | null; description?: string | null } | null;
  price?: {
    regularPrice?: number;
    finalPrice?: number;
  };
  colors?: {
    color1?: string | null;
    color2?: string | null;
    color3?: string | null;
    textBackground?: string | null;
  } | null;
  images?: { store?: unknown } | null;
  items?: RawItem[];
  section?: { id?: string; name?: string };
  layout?: RawLayout | null;
}

interface RawShop {
  fetchedAt?: string;
  resetsAt?: string;
  data?: RawOffer[];
}

interface RawStackRank {
  context?: string;
  productTag?: string;
  rank?: number | null;
}

interface RawSection {
  id?: string;
  name?: string;
  index?: number | null;
  category?: string | null;
  subtitle?: string | null;
  background?: RawBackground | null;
  stackRanks?: RawStackRank[];
  offerGroups?: Array<{ stackRanks?: RawStackRank[] }>;
}

interface RawSections {
  data?: RawSection[];
}

interface SectionMeta {
  id: string;
  name: string;
  category: string | null;
  subtitle: string | null;
  background: string | null;
  rank: number | null;
  index: number | null;
  arrival: number;
  offers: RawOffer[];
}

const spanOf = (tileSize: string | undefined): number => {
  const match = /^Size_(\d+)_x_/.exec(tileSize ?? "");
  const width = match ? Number.parseInt(match[1], 10) : 1;

  return Math.min(Math.max(width, 1), 6);
};

const promoOf = (offer: RawOffer): string | null => {
  const store = offer.images?.store;

  return Array.isArray(store) && typeof store[0] === "string"
    ? store[0]
    : null;
};

const iconOf = (item: RawItem): { url: string; key: string } | null => {
  for (const key of IMAGE_KEYS) {
    const source = item.images?.[key];
    if (typeof source === "string" && source) return { url: source, key };
  }

  return null;
};

const artOf = (offer: RawOffer): { icons: string[]; framed: boolean } => {
  const icons: string[] = [];
  let framed = false;

  for (const item of offer.items ?? []) {
    const found = iconOf(item);
    if (!found || icons.includes(found.url)) continue;

    if (!icons.length) framed = FRAMED_KEYS.includes(found.key);
    icons.push(found.url);
  }

  return { icons, framed };
};

const isBundle = (offer: RawOffer): boolean => offer.mainType === "Bundle";

const bundleNameOf = (offer: RawOffer): string | null => {
  const name = offer.bundle?.name?.trim();
  return name ? name : null;
};

const VEHICLE_TYPES = ["Vehicle", "VehicleAndBonus"];

const namedOf = (offer: RawOffer): RawItem[] =>
  (offer.items ?? []).filter((item) => Boolean(item.name));

const piecesOf = (offer: RawOffer): number =>
  namedOf(offer).length || (offer.items?.length ?? 0);

const titleOf = (offer: RawOffer): string => {
  const bundleName = bundleNameOf(offer);
  const titled =
    isBundle(offer) ||
    (offer.mainType ? VEHICLE_TYPES.includes(offer.mainType) : false);

  if (titled && bundleName) return bundleName;

  return (
    namedOf(offer)[0]?.name ??
    bundleName ??
    offer.layout?.name ??
    offer.section?.name ??
    "Item"
  );
};

const kindOf = (offer: RawOffer): string | null => {
  if (isBundle(offer)) {
    const pieces = piecesOf(offer);
    return pieces > 1 ? `${pieces} items` : "Bundle";
  }

  const type = namedOf(offer)[0]?.cosmeticType?.displayValue;
  if (type) return type;

  if (offer.mainType && VEHICLE_TYPES.includes(offer.mainType)) return "Vehicle";

  return null;
};

const tileOf = (offer: RawOffer): ShopTile => ({
  offerId: offer.offerId,
  title: titleOf(offer),
  kind: kindOf(offer),
  promo: promoOf(offer),
  ...artOf(offer),
  span: spanOf(offer.tileSize),
  finalPrice: Math.max(offer.price?.finalPrice ?? 0, 0),
  regularPrice: Math.max(offer.price?.regularPrice ?? 0, 0),
  bundle: isBundle(offer),
  pieces: offer.items?.length ?? 0,
  colors: {
    primary: offer.colors?.color1 ?? null,
    secondary: offer.colors?.color2 ?? null,
    tertiary: offer.colors?.color3 ?? null,
    text: offer.colors?.textBackground ?? null
  }
});

export const nextRotation = (from: number): number => {
  const at = new Date(from);

  return Date.UTC(
    at.getUTCFullYear(),
    at.getUTCMonth(),
    at.getUTCDate() + 1,
    0,
    0,
    0,
    0
  );
};

const rotationOf = (offers: RawOffer[]): string | null => {
  const now = Date.now();
  let soonest = nextRotation(now);

  for (const offer of offers) {
    if (!offer.outDate) continue;

    const ends = Date.parse(offer.outDate) + 1;
    if (Number.isFinite(ends) && ends > now && ends < soonest) soonest = ends;
  }

  return new Date(soonest).toISOString();
};

const brRankOf = (section: RawSection): number | null => {
  let best: number | null = null;

  const stacks = [
    ...(section.stackRanks ?? []),
    ...(section.offerGroups ?? []).flatMap((group) => group.stackRanks ?? [])
  ];

  for (const stack of stacks) {
    const target =
      stack.context === "battleRoyale" || stack.productTag === "Product.BR";

    if (target && typeof stack.rank === "number") {
      best = best === null ? stack.rank : Math.max(best, stack.rank);
    }
  }

  return best;
};

function build(key: string, shop: RawShop, layout: RawSections): ShopView {
  const meta = new Map<string, SectionMeta>();

  for (const offer of shop.data ?? []) {
    if (offer.layoutRank <= 0) continue;
    if (!offer.layoutId?.startsWith(`${offer.sectionId}.`)) continue;

    const entry = meta.get(offer.sectionId) ?? {
      id: offer.sectionId,
      name: offer.section?.name ?? offer.sectionId,
      category: null,
      subtitle: null,
      background: null,
      rank: null,
      index: null,
      arrival: meta.size,
      offers: []
    };

    const detail = offer.layout;

    if (detail) {
      entry.name = detail.name ?? entry.name;
      entry.category = entry.category ?? detail.category ?? null;
      entry.subtitle = entry.subtitle ?? detail.subtitle ?? null;
      entry.background = entry.background ?? detail.background?.texture ?? null;
      entry.rank = entry.rank ?? detail.rank ?? null;
      entry.index = entry.index ?? detail.index ?? null;
    }

    entry.offers.push(offer);
    meta.set(offer.sectionId, entry);
  }

  for (const section of layout.data ?? []) {
    if (typeof section.id !== "string") continue;

    const entry = meta.get(section.id);
    if (!entry) continue;

    entry.name = section.name ?? entry.name;
    entry.category = entry.category ?? section.category ?? null;
    entry.subtitle = entry.subtitle ?? section.subtitle ?? null;
    entry.background = entry.background ?? section.background?.texture ?? null;
    entry.rank = entry.rank ?? brRankOf(section);
    entry.index = entry.index ?? section.index ?? null;
  }

  const ranked = [...meta.values()].some((entry) => entry.rank !== null);

  const ordered = [...meta.values()].sort((a, b) => {
    if (ranked) {
      const byRank = (b.rank ?? -Infinity) - (a.rank ?? -Infinity);
      if (byRank) return byRank;

      const byIndex = (a.index ?? Infinity) - (b.index ?? Infinity);
      if (byIndex) return byIndex;
    }

    return a.arrival - b.arrival;
  });

  const sections: ShopSection[] = ordered.map((entry) => ({
    id: entry.id,
    name: entry.name,
    category: entry.category,
    subtitle: entry.subtitle,
    background: entry.background,
    tiles: [...entry.offers]
      .sort(
        (a, b) =>
          b.layoutRank - a.layoutRank || b.sortPriority - a.sortPriority
      )
      .map(tileOf)
  }));

  return {
    key,
    sections,
    fetchedAt: shop.fetchedAt ?? null,
    rotatesAt: rotationOf(shop.data ?? [])
  };
}

export const composeShop = (snapshot: ShopSnapshot): ShopView =>
  build(snapshot.key, snapshot.shop as RawShop, snapshot.sections as RawSections);

export const shopSnapshot = () => invoke<ShopSnapshot | null>("shop_snapshot");
