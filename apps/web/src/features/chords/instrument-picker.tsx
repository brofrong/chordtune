'use client';

import { getInstrument, type InstrumentId } from '@chordtune/audio';
import { useTranslations } from 'next-intl';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { CHORD_INSTRUMENTS } from './identify';

/** Guitar, bass or ukulele and its tuning — the same setting as the tuner's. */
export function InstrumentPicker({
  instrument,
  tuningId,
  onChange,
}: {
  instrument: InstrumentId;
  tuningId: string;
  onChange: (patch: { instrument: InstrumentId; tuningId: string }) => void;
}) {
  const t = useTranslations('tuner');
  const tunings = getInstrument(instrument).tunings;
  const tuningLabel = (id: string) =>
    // keys are generated from the tuning catalogue, which the message files mirror
    t(`tunings.${instrument}.${id}` as 'tunings.guitar.standard');
  const items = tunings.map((tuning) => ({ value: tuning.id, label: tuningLabel(tuning.id) }));

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ToggleGroup
        variant="outline"
        spacing={0}
        value={[instrument]}
        onValueChange={(value) => {
          const next = CHORD_INSTRUMENTS.find((id) => id === value[0]);
          if (next) {
            onChange({
              instrument: next,
              tuningId: getInstrument(next).tunings[0]?.id ?? 'standard',
            });
          }
        }}
      >
        {CHORD_INSTRUMENTS.map((id) => (
          <ToggleGroupItem key={id} value={id} className="px-3">
            {t(`instruments.${id}`)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <Select
        value={tuningId}
        items={items}
        onValueChange={(value) => value && onChange({ instrument, tuningId: String(value) })}
      >
        <SelectTrigger className="h-9 min-w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
