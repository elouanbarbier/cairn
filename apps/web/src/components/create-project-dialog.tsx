import { PROJECT_COLORS, projectKeySchema, suggestProjectKey } from '@cairn/shared';
import { useNavigate } from '@tanstack/react-router';
import { CheckIcon } from 'lucide-react';
import { type FormEvent, type ReactNode, useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isValidDate } from '@/components/editors';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import { ApiRequestError } from '@/lib/api';
import { useArchivedProjects, useCreateProject, useCreateSubproject, useProject, useProjects } from '@/lib/queries';
import { useUi } from '@/lib/ui-state';
import { cn, isMac } from '@/lib/utils';

/** Translation key of each palette color, in `PROJECT_COLORS` order. */
const COLOR_NAMES = ['indigo', 'teal', 'purple', 'raspberry', 'amber', 'sky', 'green', 'pink', 'slate'] as const;

/** Row of color swatches, as radio buttons. */
export function ColorPicker({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (color: string) => void;
  label: string;
}) {
  const { t } = useTranslation();
  const name = useId();
  return (
    <fieldset className="m-0 flex flex-wrap gap-1.5 border-0 p-0">
      <legend className="sr-only">{label}</legend>
      {PROJECT_COLORS.map((color, index) => {
        const selected = color.toUpperCase() === value.toUpperCase();
        return (
          <label key={color} className="relative grid size-7 cursor-pointer place-items-center">
            <input
              type="radio"
              name={name}
              value={color}
              checked={selected}
              onChange={() => onChange(color)}
              className="peer sr-only"
              aria-label={t(`colors.${COLOR_NAMES[index] ?? 'slate'}`)}
            />
            <span
              aria-hidden
              className="grid size-6 place-items-center rounded-md text-white ring-offset-2 ring-offset-popover peer-focus-visible:ring-2 peer-focus-visible:ring-ring"
              style={{ background: color }}
            >
              {selected ? <CheckIcon className="size-3.5" strokeWidth={3} /> : null}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

function Field({
  id,
  label,
  hint,
  error,
  children,
  className,
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="font-medium text-ink-3 text-xs">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="m-0 text-danger text-xs">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="m-0 text-ink-4 text-xs">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function SubmitRow({ onCancel, disabled, children }: { onCancel: () => void; disabled: boolean; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="flex justify-end gap-2">
      <Button variant="outline" onClick={onCancel}>
        {t('topic.cancel')}
      </Button>
      <Button type="submit" disabled={disabled} className="pr-2">
        {children}
        <Kbd variant="inverse">{isMac ? '⌘↵' : 'Ctrl ↵'}</Kbd>
      </Button>
    </div>
  );
}

/** New project (Shift+P, palette, sidebar "+"). The key follows the name until it is edited by hand. */
export function CreateProjectDialog() {
  const { t } = useTranslation();
  const ui = useUi();
  const navigate = useNavigate();
  const projects = useProjects();
  const archived = useArchivedProjects(ui.projectDialogOpen);
  const create = useCreateProject();
  const id = useId();

  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [keyEdited, setKeyEdited] = useState(false);
  const [color, setColor] = useState<string>(PROJECT_COLORS[0]);
  const [target, setTarget] = useState('');
  const [keyError, setKeyError] = useState<string | null>(null);

  const takenKeys = [...(projects.data ?? []), ...(archived.data ?? [])].map((p) => p.key);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only when the dialog opens
  useEffect(() => {
    if (!ui.projectDialogOpen) return;
    const used = new Set((projects.data ?? []).map((p) => p.color.toUpperCase()));
    setName('');
    setKey('');
    setKeyEdited(false);
    setColor(PROJECT_COLORS.find((c) => !used.has(c)) ?? PROJECT_COLORS[0]);
    setTarget('');
    setKeyError(null);
  }, [ui.projectDialogOpen]);

  const parsedKey = projectKeySchema.safeParse(key);
  const keyTaken = parsedKey.success && takenKeys.includes(parsedKey.data);
  const shownKeyError = keyError ?? (key && !parsedKey.success ? t('createProject.keyInvalid') : null);

  const onNameChange = (value: string) => {
    setName(value);
    if (!keyEdited) {
      setKey(suggestProjectKey(value, takenKeys));
      setKeyError(null);
    }
  };

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (!name.trim() || !parsedKey.success) return;
    if (keyTaken) {
      setKeyError(t('createProject.keyTaken'));
      return;
    }
    create.mutate(
      {
        name: name.trim(),
        key: parsedKey.data,
        color,
        targetDate: isValidDate(target) ? target : null,
      },
      {
        onSuccess: (project) => {
          ui.setProjectDialogOpen(false);
          void navigate({ to: '/p/$key', params: { key: project.key } });
        },
        onError: (error) => {
          if (error instanceof ApiRequestError && error.status === 409) setKeyError(t('createProject.keyTaken'));
        },
      },
    );
  };

  const example = `${parsedKey.success ? parsedKey.data : 'PRJ'}-12`;

  return (
    <Dialog open={ui.projectDialogOpen} onOpenChange={ui.setProjectDialogOpen}>
      <DialogContent className="max-w-[520px]">
        <form
          onSubmit={submit}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
          }}
          className="flex flex-col gap-4 p-5"
        >
          <div className="flex flex-col gap-1">
            <DialogTitle>{t('createProject.title')}</DialogTitle>
            <DialogDescription>{t('createProject.description')}</DialogDescription>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_120px]">
            <Field id={`${id}-name`} label={t('createProject.name')}>
              <Input
                id={`${id}-name`}
                value={name}
                onChange={(e) => onNameChange(e.target.value)}
                placeholder={t('createProject.namePlaceholder')}
                autoFocus
                required
                maxLength={120}
                className="h-9 text-base"
              />
            </Field>
            <Field id={`${id}-key`} label={t('createProject.key')} error={shownKeyError}>
              <Input
                id={`${id}-key`}
                value={key}
                onChange={(e) => {
                  setKey(
                    e.target.value
                      .toUpperCase()
                      .replace(/[^A-Z]/g, '')
                      .slice(0, 5),
                  );
                  setKeyEdited(true);
                  setKeyError(null);
                }}
                aria-invalid={Boolean(shownKeyError)}
                aria-describedby={shownKeyError ? `${id}-key-error` : `${id}-key-desc`}
                required
                className="h-9 font-mono text-base uppercase"
              />
            </Field>
          </div>
          <p id={`${id}-key-desc`} className="-mt-1.5 m-0 text-ink-4 text-xs">
            {t('createProject.keyHint', { example })}
          </p>
          <div className="flex flex-col gap-1.5">
            <span className="font-medium text-ink-3 text-xs">{t('createProject.color')}</span>
            <ColorPicker value={color} onChange={setColor} label={t('createProject.color')} />
          </div>
          <Field
            id={`${id}-target`}
            label={
              <>
                {t('createProject.target')}{' '}
                <span className="font-normal text-ink-4">· {t('createProject.optional')}</span>
              </>
            }
            className="sm:max-w-[200px]"
          >
            <Input
              id={`${id}-target`}
              type="date"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="[color-scheme:light] dark:[color-scheme:dark]"
            />
          </Field>
          <SubmitRow
            onCancel={() => ui.setProjectDialogOpen(false)}
            disabled={!name.trim() || !parsedKey.success || create.isPending}
          >
            {t('createProject.submit')}
          </SubmitRow>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** New subproject in a given project (Subprojects tab, sidebar, palette). */
export function CreateSubprojectDialog() {
  const { t } = useTranslation();
  const ui = useUi();
  const navigate = useNavigate();
  const projectKey = ui.subprojectDialogFor;
  const { project } = useProject(projectKey ?? '');
  const create = useCreateSubproject();
  const id = useId();
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');

  useEffect(() => {
    if (!projectKey) return;
    setName('');
    setTarget('');
  }, [projectKey]);

  const close = () => ui.setSubprojectDialogFor(null);

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (!name.trim() || !projectKey) return;
    create.mutate(
      { key: projectKey, input: { name: name.trim(), targetDate: isValidDate(target) ? target : null } },
      {
        onSuccess: (sub) => {
          close();
          void navigate({ to: '/p/$key/s/$subprojectId', params: { key: projectKey, subprojectId: sub.id } });
        },
      },
    );
  };

  return (
    <Dialog open={projectKey !== null} onOpenChange={(open) => (open ? undefined : close())}>
      <DialogContent className="max-w-[460px]">
        <form
          onSubmit={submit}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
          }}
          className="flex flex-col gap-4 p-5"
        >
          <div className="flex flex-col gap-1">
            <DialogTitle>{t('createSubproject.title')}</DialogTitle>
            <DialogDescription>{t('createSubproject.description', { project: project?.name ?? '' })}</DialogDescription>
          </div>
          <Field id={`${id}-name`} label={t('createSubproject.name')}>
            <Input
              id={`${id}-name`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('createSubproject.namePlaceholder')}
              autoFocus
              required
              maxLength={120}
              className="h-9 text-base"
            />
          </Field>
          <Field
            id={`${id}-target`}
            label={
              <>
                {t('createProject.target')}{' '}
                <span className="font-normal text-ink-4">· {t('createProject.optional')}</span>
              </>
            }
            className="sm:max-w-[200px]"
          >
            <Input
              id={`${id}-target`}
              type="date"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="[color-scheme:light] dark:[color-scheme:dark]"
            />
          </Field>
          <SubmitRow onCancel={close} disabled={!name.trim() || create.isPending}>
            {t('createSubproject.submit')}
          </SubmitRow>
        </form>
      </DialogContent>
    </Dialog>
  );
}
