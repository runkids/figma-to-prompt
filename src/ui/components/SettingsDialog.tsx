import { useEffect, useRef } from 'preact/hooks';
import type { UISerializedNode } from '../../shared/types';
import type { PromptSections } from '../prompt';

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

interface Props {
  open: boolean;
  onClose: () => void;
  children: UISerializedNode[] | undefined;
  excludedIds: Set<string>;
  onToggleChild: (id: string) => void;
  onToggleAllChildren: (exclude: boolean) => void;
  promptSections: PromptSections;
  onToggleSection: (key: keyof PromptSections) => void;
}

export function SettingsDialog({
  open,
  onClose,
  children,
  excludedIds,
  onToggleChild,
  onToggleAllChildren,
  promptSections,
  onToggleSection,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    else if (!open && el.open) el.close();
  }, [open]);

  const hasChildren = children && children.length > 0;
  const includedCount = hasChildren ? children.length - excludedIds.size : 0;
  const allIncluded = excludedIds.size === 0;

  return (
    <dialog
      ref={dialogRef}
      class="settings-dialog"
      onClose={onClose}
      onClick={(e) => { if (e.target === dialogRef.current) onClose(); }}
    >
      <div class="settings-dialog__content">
        <div class="settings-dialog__header">
          <span class="settings-dialog__title">Settings</span>
          <button type="button" class="settings-dialog__close" onClick={onClose}>✕</button>
        </div>

        <div class="settings-dialog__section">
          <span class="settings-dialog__section-title">Prompt Sections</span>
          <label class="settings-dialog__toggle-item">
            <input
              type="checkbox"
              checked={promptSections.interactionContract !== false}
              onChange={() => onToggleSection('interactionContract')}
            />
            <div>
              <span class="settings-dialog__label">Interaction Contract</span>
              <span class="settings-dialog__desc">Prototype scroll, overlay, trigger/action settings</span>
            </div>
          </label>
          <label class="settings-dialog__toggle-item">
            <input
              type="checkbox"
              checked={promptSections.componentApi !== false}
              onChange={() => onToggleSection('componentApi')}
            />
            <div>
              <span class="settings-dialog__label">Component API</span>
              <span class="settings-dialog__desc">Property definitions, variants, variable bindings</span>
            </div>
          </label>
        </div>

        {hasChildren && (
          <div class="settings-dialog__section">
            <span class="settings-dialog__section-title">
              Children
              <span class="settings-dialog__count">{includedCount}/{children.length}</span>
            </span>
            <div class="settings-dialog__children-list">
              <label class="settings-dialog__child-item settings-dialog__child-item--all">
                <input
                  type="checkbox"
                  checked={allIncluded}
                  indeterminate={!allIncluded && excludedIds.size < children.length}
                  onChange={() => onToggleAllChildren(allIncluded)}
                />
                <span class="settings-dialog__label">
                  {allIncluded ? 'Deselect All' : 'Select All'}
                </span>
              </label>
              {children.map((child) => (
                <label key={child.id} class="settings-dialog__child-item">
                  <input
                    type="checkbox"
                    checked={!excludedIds.has(child.id)}
                    onChange={() => onToggleChild(child.id)}
                  />
                  <span class="settings-dialog__icon">
                    {NODE_TYPE_ICONS[child.type] ?? '·'}
                  </span>
                  <span class="settings-dialog__label" title={child.name}>
                    {child.name}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
    </dialog>
  );
}
