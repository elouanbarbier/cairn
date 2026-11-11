import type { LabelUsage } from '@cairn/shared';
import { type FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { LoadError } from '@/components/bits';
import { ColorPicker } from '@/components/create-project-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ApiRequestError } from '@/lib/api';
import { useCreateLabel, useDeleteLabel, useLabels, useUpdateLabel } from '@/lib/queries';
import { Field, Section } from './parts';

const takenOr = (error: unknown, fallback: string, taken: string) =>
  error instanceof ApiRequestError && error.status === 409 ? taken : fallback;

/** One label: color, name edited in place, usage, and (administrators) a two-step delete. */
function LabelRow({ label, canDelete }: { label: LabelUsage; canDelete: boolean }) {
  const { t } = useTranslation();
  const update = useUpdateLabel();
  const remove = useDeleteLabel();
  const [name, setName] = useState(label.name);
  const [confirming, setConfirming] = useState(false);
  useEffect(() => setName(label.name), [label.name]);

  const rename = () => {
    const next = name.trim();
    if (!next || next === label.name) {
      setName(label.name);
      return;
    }
    update.mutate(
      { id: label.id, input: { name: next } },
      {
        onError: (error) => {
          setName(label.name);
          toast.error(takenOr(error, t('errors.rollback'), t('settings.labelTaken')));
        },
      },
    );
  };

  return (
    <li className="flex flex-wrap items-center gap-3 border-line border-t py-2">
      <Popover>
        <PopoverTrigger
          aria-label={t('settings.labelColor', { name: label.name })}
          className="grid size-6 shrink-0 place-items-center rounded-md border-0 p-0 hover:brightness-95"
          style={{ background: `color-mix(in srgb, ${label.color} 18%, transparent)` }}
        >
          <span aria-hidden className="size-2.5 rounded-full" style={{ background: label.color }} />
        </PopoverTrigger>
        <PopoverContent>
          <ColorPicker
            value={label.color}
            onChange={(color) => update.mutate({ id: label.id, input: { color } })}
            label={t('settings.labelColor', { name: label.name })}
          />
        </PopoverContent>
      </Popover>
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={rename}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') setName(label.name);
        }}
        aria-label={t('settings.renameLabel', { name: label.name })}
        maxLength={40}
        className="w-auto min-w-40 flex-1 border-transparent bg-transparent hover:border-input focus-visible:border-ring"
      />
      <span className="text-ink-4 text-xs tabular-nums">{t('settings.labelUsage', { count: label.topicCount })}</span>
      {canDelete ? (
        confirming ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              remove.mutate(label.id, {
                onSuccess: () => toast.success(t('settings.labelDeleted', { name: label.name })),
              })
            }
            onBlur={() => setConfirming(false)}
            className="border-danger text-danger"
          >
            {t('settings.confirmDelete')}
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirming(true)}
            aria-label={t('settings.deleteLabelOf', { name: label.name })}
            className="text-danger"
          >
            {t('settings.deleteLabel')}
          </Button>
        )
      ) : null}
    </li>
  );
}

/** Labels shared by every project: create, rename, recolor; administrators also delete. */
export function LabelsSection({ isAdmin }: { isAdmin: boolean }) {
  const { t } = useTranslation();
  const labels = useLabels();
  const create = useCreateLabel();
  const [name, setName] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    create.mutate(
      { name: name.trim() },
      {
        onSuccess: () => setName(''),
        onError: (error) => toast.error(takenOr(error, t('errors.rollback'), t('settings.labelTaken'))),
      },
    );
  };

  return (
    <Section title={t('settings.labels')}>
      <p className="m-0 text-ink-3">{t('settings.labelsHint')}</p>
      {labels.isError ? <LoadError onRetry={() => void labels.refetch()} /> : null}
      {labels.data?.length === 0 ? <p className="m-0 text-ink-4">{t('settings.noLabels')}</p> : null}
      {labels.data && labels.data.length > 0 ? (
        <ul className="m-0 flex list-none flex-col p-0">
          {labels.data.map((label) => (
            <LabelRow key={label.id} label={label} canDelete={isAdmin} />
          ))}
        </ul>
      ) : null}
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
        <Field
          label={t('settings.labelName')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('settings.labelNamePlaceholder')}
          maxLength={40}
          className="min-w-56 flex-1"
        />
        <Button type="submit" disabled={!name.trim() || create.isPending}>
          {t('settings.addLabel')}
        </Button>
      </form>
    </Section>
  );
}
