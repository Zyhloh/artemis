import { Icon } from "@components/Icon/Icon";
import { Popover } from "@components/Popover/Popover";
import type { LibraryGame, LibraryKind } from "@/types";
import { EMPTY_FILTERS, KIND_LABELS, activeFilterCount, type Filters } from "./state";

interface FilterMenuProps {
  anchor: DOMRect | null;
  games: LibraryGame[];
  filters: Filters;
  onChange: (filters: Filters) => void;
  onClose: () => void;
}

interface Option<T extends string> {
  value: T;
  label: string;
  count: number;
}

const toggle = <T,>(list: T[], value: T): T[] =>
  list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value];

function Check({
  on,
  label,
  count,
  onToggle
}: {
  on: boolean;
  label: string;
  count: number;
  onToggle: () => void;
}) {
  return (
    <button
      className={`filters__option${on ? " filters__option--on" : ""}`}
      role="menuitemcheckbox"
      aria-checked={on}
      onClick={onToggle}
    >
      <span className="filters__box" aria-hidden="true">
        <Icon name="check" size={11} strokeWidth={2.6} />
      </span>
      <span className="filters__label">{label}</span>
      <span className="filters__tally">{count}</span>
    </button>
  );
}

function Group<T extends string>({
  title,
  options,
  chosen,
  onToggle
}: {
  title: string;
  options: Option<T>[];
  chosen: T[];
  onToggle: (value: T) => void;
}) {
  return (
    <div className="filters__group">
      <span className="filters__heading">{title}</span>
      {options.map((option) => (
        <Check
          key={option.value}
          on={chosen.includes(option.value)}
          label={option.label}
          count={option.count}
          onToggle={() => onToggle(option.value)}
        />
      ))}
    </div>
  );
}

export function FilterMenu({ anchor, games, filters, onChange, onClose }: FilterMenuProps) {
  const installed = games.filter((game) => game.installed).length;

  const kinds = (Object.keys(KIND_LABELS) as LibraryKind[])
    .map((kind) => ({
      value: kind,
      label: KIND_LABELS[kind],
      count: games.filter((game) => game.kind === kind).length
    }))
    .filter((option) => option.count > 0);

  const platforms = [...new Set(games.flatMap((game) => game.platforms))]
    .sort()
    .map((platform) => ({
      value: platform,
      label: platform,
      count: games.filter((game) => game.platforms.includes(platform)).length
    }));

  const active = activeFilterCount(filters);

  return (
    <Popover anchor={anchor} onClose={onClose} role="menu" className="filters">
      <div className="filters__top">
        <span className="filters__title">Filters</span>
        <button
          className="filters__clear"
          onClick={() => onChange(EMPTY_FILTERS)}
          disabled={active === 0}
        >
          Clear
        </button>
      </div>

      <div className="filters__group">
        <Check
          on={filters.installed}
          label="Installed"
          count={installed}
          onToggle={() => onChange({ ...filters, installed: !filters.installed })}
        />
      </div>

      {kinds.length > 1 && (
        <Group
          title="Type"
          options={kinds}
          chosen={filters.kinds}
          onToggle={(kind) => onChange({ ...filters, kinds: toggle(filters.kinds, kind) })}
        />
      )}

      {platforms.length > 1 && (
        <Group
          title="Platform"
          options={platforms}
          chosen={filters.platforms}
          onToggle={(platform) =>
            onChange({ ...filters, platforms: toggle(filters.platforms, platform) })
          }
        />
      )}
    </Popover>
  );
}
