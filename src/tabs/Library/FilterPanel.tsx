import { useState } from "react";
import { Icon } from "@components/Icon/Icon";
import type { LibraryGame, LibraryKind } from "@/types";
import { EMPTY_FILTERS, KIND_LABELS, activeFilterCount, type Filters } from "./state";

interface FilterPanelProps {
  games: LibraryGame[];
  filters: Filters;
  onChange: (filters: Filters) => void;
}

interface Option<T extends string> {
  value: T;
  label: string;
  count: number;
}

const toggle = <T,>(list: T[], value: T): T[] =>
  list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value];

function Section<T extends string>({
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
  const [open, setOpen] = useState(true);

  return (
    <section className="filters__section">
      <button
        className="filters__head"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span>{title}</span>
        {chosen.length > 0 && <span className="filters__count">{chosen.length}</span>}
        <span className={`filters__chevron${open ? " filters__chevron--open" : ""}`}>
          <Icon name="chevronDown" size={14} />
        </span>
      </button>

      {open && (
        <div className="filters__options">
          {options.map((option) => {
            const on = chosen.includes(option.value);

            return (
              <button
                className={`filters__option${on ? " filters__option--on" : ""}`}
                key={option.value}
                onClick={() => onToggle(option.value)}
                role="checkbox"
                aria-checked={on}
              >
                <span className="filters__box" aria-hidden="true">
                  <Icon name="check" size={11} strokeWidth={2.6} />
                </span>
                <span className="filters__label">{option.label}</span>
                <span className="filters__tally">{option.count}</span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function FilterPanel({ games, filters, onChange }: FilterPanelProps) {
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
    <aside className="filters">
      <div className="filters__top">
        <h2 className="filters__title">Filters</h2>
        {active > 0 && (
          <button className="filters__clear" onClick={() => onChange(EMPTY_FILTERS)}>
            Clear
          </button>
        )}
      </div>

      <button
        className={`filters__option filters__option--solo${
          filters.installed ? " filters__option--on" : ""
        }`}
        onClick={() => onChange({ ...filters, installed: !filters.installed })}
        role="checkbox"
        aria-checked={filters.installed}
      >
        <span className="filters__box" aria-hidden="true">
          <Icon name="check" size={11} strokeWidth={2.6} />
        </span>
        <span className="filters__label">Installed</span>
        <span className="filters__tally">{installed}</span>
      </button>

      {kinds.length > 1 && (
        <Section
          title="Type"
          options={kinds}
          chosen={filters.kinds}
          onToggle={(kind) => onChange({ ...filters, kinds: toggle(filters.kinds, kind) })}
        />
      )}

      {platforms.length > 0 && (
        <Section
          title="Platform"
          options={platforms}
          chosen={filters.platforms}
          onToggle={(platform) =>
            onChange({ ...filters, platforms: toggle(filters.platforms, platform) })
          }
        />
      )}
    </aside>
  );
}
