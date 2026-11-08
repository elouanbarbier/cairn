import { TOPIC_PRIORITIES, TOPIC_STATUSES, type TopicPriority, type TopicStatus } from '@cairn/shared';
import { useNavigate } from '@tanstack/react-router';
import { type FormEvent, useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input, NativeSelect } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import { useCreateTopic, useProjects } from '@/lib/queries';
import { useUi } from '@/lib/ui-state';
import { isMac } from '@/lib/utils';

/** New topic in the current context (C anywhere, or a "+" button). */
export function CreateTopicDialog() {
  const { t } = useTranslation();
  const ui = useUi();
  const navigate = useNavigate();
  const projects = useProjects();
  const create = useCreateTopic();
  const id = useId();

  const [title, setTitle] = useState('');
  const [projectId, setProjectId] = useState('');
  const [subprojectId, setSubprojectId] = useState('');
  const [status, setStatus] = useState<TopicStatus>('todo');
  const [priority, setPriority] = useState<TopicPriority>('none');

  // Reset the form from the context each time the dialog opens.
  useEffect(() => {
    if (!ui.createOpen) return;
    const context = ui.createContext;
    const first = projects.data?.[0];
    setTitle('');
    setProjectId(context.projectId ?? first?.id ?? '');
    setSubprojectId(context.subprojectId ?? '');
    setStatus(context.status ?? 'todo');
    setPriority('none');
  }, [ui.createOpen, ui.createContext, projects.data]);

  const project = projects.data?.find((p) => p.id === projectId);

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (!title.trim() || !projectId) return;
    create.mutate(
      { projectId, subprojectId: subprojectId || null, title: title.trim(), status, priority },
      {
        onSuccess: (topic) => {
          ui.closeCreate();
          void navigate({ to: '/p/$key/sujets/$ref', params: { key: topic.projectKey, ref: topic.ref } });
        },
      },
    );
  };

  return (
    <Dialog open={ui.createOpen} onOpenChange={(open) => (open ? undefined : ui.closeCreate())}>
      <DialogContent className="max-w-[560px]">
        <form
          onSubmit={submit}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
          }}
          className="flex flex-col gap-4 p-5"
        >
          <div className="flex flex-col gap-1">
            <DialogTitle>{t('createTopic.title')}</DialogTitle>
            <DialogDescription>{t('createTopic.description')}</DialogDescription>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-title`} className="font-medium text-ink-3 text-xs">
              {t('createTopic.titleLabel')}
            </label>
            <Input
              id={`${id}-title`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('createTopic.titlePlaceholder')}
              autoFocus
              required
              className="h-9 text-base"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field id={`${id}-project`} label={t('createTopic.project')}>
              <NativeSelect
                id={`${id}-project`}
                value={projectId}
                onChange={(e) => {
                  setProjectId(e.target.value);
                  setSubprojectId('');
                }}
              >
                {projects.data?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field id={`${id}-sub`} label={t('createTopic.subproject')}>
              <NativeSelect id={`${id}-sub`} value={subprojectId} onChange={(e) => setSubprojectId(e.target.value)}>
                <option value="">{t('topic.noSubproject')}</option>
                {project?.subprojects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field id={`${id}-status`} label={t('createTopic.status')}>
              <NativeSelect
                id={`${id}-status`}
                value={status}
                onChange={(e) => setStatus(e.target.value as TopicStatus)}
              >
                {TOPIC_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`status.${s}`)}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field id={`${id}-priority`} label={t('createTopic.priority')}>
              <NativeSelect
                id={`${id}-priority`}
                value={priority}
                onChange={(e) => setPriority(e.target.value as TopicPriority)}
              >
                {[...TOPIC_PRIORITIES].reverse().map((p) => (
                  <option key={p} value={p}>
                    {t(`priority.${p}`)}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => ui.closeCreate()}>
              {t('topic.cancel')}
            </Button>
            <Button type="submit" disabled={!title.trim() || create.isPending} className="pr-2">
              {t('createTopic.submit')}
              <Kbd variant="inverse">{isMac ? '⌘↵' : 'Ctrl ↵'}</Kbd>
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-medium text-ink-3 text-xs">
        {label}
      </label>
      {children}
    </div>
  );
}
