import { SearchOutlined } from '@ant-design/icons';
import { Input, Modal, Typography } from 'antd';
import type { InputRef } from 'antd';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import type { CommandCategory } from '@/app/layout/navigationConfig';

const CATEGORY_ORDER: CommandCategory[] = ['Navigation', 'Quick Actions', 'System', 'Settings'];

export interface CommandPaletteItem {
  id: string;
  label: string;
  description?: string;
  category: CommandCategory;
  keywords?: string[];
  icon?: ReactNode;
  disabled?: boolean;
  onSelect: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  items: CommandPaletteItem[];
}

const includesQuery = (item: CommandPaletteItem, query: string): boolean => {
  if (!query) {
    return true;
  }

  const haystack = [item.label, item.description ?? '', item.category, ...(item.keywords ?? [])]
    .join(' ')
    .toLowerCase();

  return haystack.includes(query);
};

export const CommandPalette = ({ open, onClose, items }: CommandPaletteProps) => {
  const [query, setQuery] = useState('');
  const [activeItemId, setActiveItemId] = useState<string | undefined>();
  const inputRef = useRef<InputRef>(null);

  const normalizedQuery = query.trim().toLowerCase();

  const filteredItems = useMemo(
    () => items.filter((item) => includesQuery(item, normalizedQuery)),
    [items, normalizedQuery],
  );

  const activeItem = useMemo(
    () => filteredItems.find((item) => item.id === activeItemId),
    [activeItemId, filteredItems],
  );

  const groupedItems = useMemo(
    () =>
      CATEGORY_ORDER.map((category) => ({
        category,
        items: filteredItems.filter((item) => item.category === category),
      })).filter((group) => group.items.length > 0),
    [filteredItems],
  );

  const moveActive = useCallback(
    (direction: 1 | -1) => {
      if (filteredItems.length === 0) {
        return;
      }

      const currentIndex = filteredItems.findIndex((item) => item.id === activeItemId);
      let nextIndex = currentIndex;

      for (let attempt = 0; attempt < filteredItems.length; attempt += 1) {
        nextIndex = (nextIndex + direction + filteredItems.length) % filteredItems.length;
        const candidate = filteredItems[nextIndex];

        if (!candidate.disabled) {
          setActiveItemId(candidate.id);
          return;
        }
      }
    },
    [activeItemId, filteredItems],
  );

  const handleSelect = useCallback(
    (item: CommandPaletteItem) => {
      if (item.disabled) {
        return;
      }

      item.onSelect();
      onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    setQuery('');
    setActiveItemId(undefined);
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus({ cursor: 'end' });
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    if (activeItem && !activeItem.disabled) {
      return;
    }

    const firstEnabled = filteredItems.find((item) => !item.disabled);
    setActiveItemId(firstEnabled?.id);
  }, [activeItem, filteredItems, open]);

  return (
    <Modal
      open={open}
      centered
      width={640}
      title={null}
      footer={null}
      onCancel={onClose}
      destroyOnClose
      className="command-palette-modal"
      styles={{
        mask: {
          backgroundColor: 'rgba(15, 23, 42, 0.42)',
          backdropFilter: 'blur(2px)',
        },
      }}
    >
      <div className="command-palette-input-wrap">
        <Input
          ref={inputRef}
          value={query}
          className="command-palette-input"
          prefix={<SearchOutlined />}
          placeholder="Search pages, settings..."
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              moveActive(1);
              return;
            }

            if (event.key === 'ArrowUp') {
              event.preventDefault();
              moveActive(-1);
              return;
            }

            if (event.key === 'Enter') {
              event.preventDefault();
              if (activeItem && !activeItem.disabled) {
                handleSelect(activeItem);
              }
              return;
            }

            if (event.key === 'Escape') {
              event.preventDefault();
              onClose();
            }
          }}
          aria-label="Command palette search"
        />
      </div>

      {groupedItems.length > 0 ? (
        <div className="command-palette-results" role="listbox" aria-label="Admin commands">
          {groupedItems.map((group) => (
            <section
              key={group.category}
              className="command-palette-group"
              aria-label={group.category}
            >
              <Typography.Text className="command-palette-group-title">
                {group.category}
              </Typography.Text>
              {group.items.map((item) => {
                const isActive = item.id === activeItemId;

                return (
                  <button
                    key={item.id}
                    type="button"
                    role="option"
                    disabled={item.disabled}
                    aria-selected={isActive}
                    className={'command-palette-item ' + (isActive ? 'is-active' : '')}
                    onMouseEnter={() => !item.disabled && setActiveItemId(item.id)}
                    onClick={() => handleSelect(item)}
                  >
                    {item.icon ? (
                      <span className="command-palette-item-icon">{item.icon}</span>
                    ) : null}
                    <span className="command-palette-item-main">
                      <span className="command-palette-item-label">{item.label}</span>
                      {item.description ? (
                        <span className="command-palette-item-description">{item.description}</span>
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </section>
          ))}
        </div>
      ) : (
        <div className="command-palette-empty">No matching command found</div>
      )}

      <div className="command-palette-footer">
        Use Up/Down to move, Enter to select, Esc to close
      </div>
    </Modal>
  );
};
