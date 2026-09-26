'use client';

import { Autocomplete } from '@base-ui/react/autocomplete';

import { Input } from '@/components/ui/input';

/** A free-text input with async suggestions; picking one fills the text. */
export function SuggestField<T>({
  id,
  value,
  onValueChange,
  items,
  itemKey,
  itemText,
  renderItem,
  status,
  placeholder,
}: {
  id: string;
  value: string;
  onValueChange: (value: string) => void;
  items: T[];
  itemKey: (item: T) => string;
  itemText: (item: T) => string;
  renderItem: (item: T) => React.ReactNode;
  status: React.ReactNode;
  placeholder?: string;
}) {
  return (
    <Autocomplete.Root
      items={items}
      value={value}
      onValueChange={(next) => onValueChange(next)}
      itemToStringValue={itemText}
      filter={null}
      openOnInputClick
    >
      <Autocomplete.Input
        id={id}
        placeholder={placeholder}
        autoComplete="off"
        render={<Input className="h-10" />}
      />
      <Autocomplete.Portal hidden={!status && items.length === 0}>
        <Autocomplete.Positioner sideOffset={4} align="start" className="isolate z-50">
          <Autocomplete.Popup className="max-h-[min(var(--available-height),20rem)] w-(--anchor-width) overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10">
            {status && (
              <Autocomplete.Status className="px-2 py-1.5 text-muted-foreground text-xs">
                {status}
              </Autocomplete.Status>
            )}
            <Autocomplete.List>
              {(item: T) => (
                <Autocomplete.Item
                  key={itemKey(item)}
                  value={item}
                  className="flex cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                >
                  {renderItem(item)}
                </Autocomplete.Item>
              )}
            </Autocomplete.List>
          </Autocomplete.Popup>
        </Autocomplete.Positioner>
      </Autocomplete.Portal>
    </Autocomplete.Root>
  );
}
