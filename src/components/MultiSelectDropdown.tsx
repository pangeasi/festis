import { useEffect, useRef, useState, type FocusEvent } from 'react';
import { ChevronDown } from 'lucide-react';
import type { SelectOption } from '../types';

type MultiSelectDropdownProps = {
  title: string;
  options: SelectOption[];
  selected: string[];
  onToggle: (value: string) => void;
  onClear: () => void;
  placeholder: string;
};

export function MultiSelectDropdown({
  title,
  options,
  selected,
  onToggle,
  onClear,
  placeholder,
}: MultiSelectDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!dropdownRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [isOpen]);

  const selectedLabels = options
    .filter((option) => selected.includes(option.value))
    .map((option) => option.label);

  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsOpen(false);
    }
  };

  return (
    <div
      className={`multi-select${isOpen ? ' is-open' : ''}`}
      onBlur={handleBlur}
      ref={dropdownRef}
    >
      <button
        aria-expanded={isOpen}
        className="multi-select-trigger"
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <span>
          <strong>{title}</strong>
          <small>{selectedLabels.length ? selectedLabels.join(', ') : placeholder}</small>
        </span>
        <ChevronDown size={18} />
      </button>
      {isOpen && (
        <div className="select-menu" onPointerDown={(event) => event.preventDefault()}>
          <div className="select-menu-head">
            <span>{selected.length} seleccionados</span>
            <button disabled={!selected.length} onClick={onClear} type="button">
              Limpiar
            </button>
          </div>
          <div className="select-options">
            {options.map((option) => (
              <label className="select-option" key={option.value}>
                <input
                  checked={selected.includes(option.value)}
                  onChange={() => onToggle(option.value)}
                  type="checkbox"
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
