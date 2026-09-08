import { Icon } from "@components/Icon/Icon";
import type { InstallOption } from "@/types";
import "./ComponentList.css";

interface ComponentListProps {
  options: InstallOption[];
  selected: string[];
  notes?: Record<string, string>;
  onToggle: (id: string) => void;
}

export function ComponentList({
  options,
  selected,
  notes,
  onToggle
}: ComponentListProps) {
  return (
    <div className="components">
      {options.map((option) => (
        <label
          className={`components__option${
            option.required ? " components__option--locked" : ""
          }`}
          key={option.id}
        >
          <input
            className="components__checkbox"
            type="checkbox"
            checked={selected.includes(option.id) || option.required}
            disabled={option.required}
            onChange={() => onToggle(option.id)}
          />
          <span className="components__box" aria-hidden="true">
            <Icon name="check" size={11} strokeWidth={2.6} />
          </span>
          <span className="components__copy">
            <span className="components__name">
              <span className="components__label">{option.name}</span>
              {notes?.[option.id] && (
                <span className="components__note">{notes[option.id]}</span>
              )}
            </span>
            {option.description && (
              <span className="components__description">{option.description}</span>
            )}
          </span>
        </label>
      ))}
    </div>
  );
}
