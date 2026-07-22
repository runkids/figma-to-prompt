import { useState } from 'preact/hooks';
import type { UISerializedNode } from '../../shared/types';

interface Props {
  children: UISerializedNode[];
  excludedIds: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (exclude: boolean) => void;
}

const NODE_TYPE_ICONS: Record<string, string> = {
  FRAME: '▢',
  GROUP: '▤',
  COMPONENT: '◆',
  INSTANCE: '◇',
  TEXT: 'T',
  RECTANGLE: '■',
  ELLIPSE: '●',
  VECTOR: '✦',
  BOOLEAN_OPERATION: '⊞',
};

export function ChildrenFilter({ children, excludedIds, onToggle, onToggleAll }: Props) {
  const [open, setOpen] = useState(false);
  const includedCount = children.length - excludedIds.size;
  const allIncluded = excludedIds.size === 0;

  return (
    <div class="children-filter">
      <button
        type="button"
        class="children-filter__toggle"
        onClick={() => setOpen(!open)}
      >
        <span class="quality-label">
          Children
          <span class="children-filter__count">
            {includedCount}/{children.length}
          </span>
        </span>
        <span class={`children-filter__arrow${open ? ' open' : ''}`}>▾</span>
      </button>
      {open && (
        <div class="children-filter__list">
          <label class="children-filter__item children-filter__item--all">
            <input
              type="checkbox"
              checked={allIncluded}
              indeterminate={!allIncluded && excludedIds.size < children.length}
              onChange={() => onToggleAll(allIncluded)}
            />
            <span class="children-filter__name">
              {allIncluded ? 'Deselect All' : 'Select All'}
            </span>
          </label>
          {children.map((child) => (
            <label key={child.id} class="children-filter__item">
              <input
                type="checkbox"
                checked={!excludedIds.has(child.id)}
                onChange={() => onToggle(child.id)}
              />
              <span class="children-filter__icon">
                {NODE_TYPE_ICONS[child.type] ?? '·'}
              </span>
              <span class="children-filter__name" title={child.name}>
                {child.name}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
