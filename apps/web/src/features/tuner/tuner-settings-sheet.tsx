'use client';

import { getInstrument, INSTRUMENTS, midiToNoteName } from '@chordtune/audio';
import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId } from 'react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';

import { A4_MAX, A4_MIN, type TunerSettings } from './settings';

export function TunerSettingsSheet({
  settings,
  onChange,
}: {
  settings: TunerSettings;
  onChange: (patch: Partial<TunerSettings>) => void;
}) {
  const t = useTranslations('tuner');
  const instrument = getInstrument(settings.instrument);
  const debugId = useId();
  const tuningLabel = (instrumentId: string, tuningId: string) =>
    // keys are generated from the tuning catalogue, which the message files mirror
    t(`tunings.${instrumentId}.${tuningId}` as 'tunings.guitar.standard');

  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button variant="outline" className="h-9 gap-2 rounded-full px-4">
            <span className="text-muted-foreground">{t(`instruments.${instrument.id}`)}</span>
            <span>{tuningLabel(instrument.id, settings.tuningId)}</span>
            <ChevronDown className="size-4 text-muted-foreground" />
          </Button>
        }
      />
      <SheetContent side="bottom" className="mx-auto max-h-[85dvh] max-w-xl rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>{t('settings')}</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-6 overflow-y-auto px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          <section className="flex flex-col gap-2">
            <Label>{t('instrument')}</Label>
            <ToggleGroup
              variant="outline"
              spacing={0}
              value={[settings.instrument]}
              onValueChange={(value) => {
                const next = INSTRUMENTS.find((item) => item.id === value[0]);
                if (next) {
                  onChange({ instrument: next.id, tuningId: next.tunings[0]?.id ?? 'standard' });
                }
              }}
              className="w-full"
            >
              {INSTRUMENTS.map((item) => (
                <ToggleGroupItem key={item.id} value={item.id} className="flex-1">
                  {t(`instruments.${item.id}`)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </section>

          {instrument.tunings.length > 1 && (
            <section className="flex flex-col gap-2">
              <Label>{t('tuning')}</Label>
              <div className="grid gap-1.5">
                {instrument.tunings.map((tuning) => {
                  const selected = tuning.id === settings.tuningId;
                  return (
                    <button
                      key={tuning.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => onChange({ tuningId: tuning.id })}
                      className={cn(
                        'flex items-center justify-between rounded-lg border px-3 py-2.5 text-left text-sm transition-colors',
                        selected
                          ? 'border-primary bg-primary/10'
                          : 'border-border hover:bg-muted/60',
                      )}
                    >
                      <span>{tuningLabel(instrument.id, tuning.id)}</span>
                      <span className="font-mono text-muted-foreground text-xs tracking-wider">
                        {tuning.strings.map((midi) => midiToNoteName(midi).name).join(' ')}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <Label>{t('a4')}</Label>
              <span className="font-mono text-sm tabular-nums">
                {t('hz', { value: settings.a4 })}
              </span>
            </div>
            <Slider
              min={A4_MIN}
              max={A4_MAX}
              step={1}
              value={[settings.a4]}
              onValueChange={(value) => {
                const a4 = Array.isArray(value) ? value[0] : value;
                if (typeof a4 === 'number') {
                  onChange({ a4 });
                }
              }}
            />
          </section>

          <section className="flex items-center justify-between">
            <Label htmlFor={debugId}>{t('debug')}</Label>
            <Switch
              id={debugId}
              checked={settings.debug}
              onCheckedChange={(debug) => onChange({ debug })}
            />
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
