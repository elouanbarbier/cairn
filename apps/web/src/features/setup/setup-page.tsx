import { setupInputSchema } from '@cairn/shared';
import { InfoIcon } from 'lucide-react';
import { type FormEvent, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CairnLogo } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSetup } from '@/lib/queries';

/** First run: an empty workspace asks for the first account, which becomes admin. */
export function SetupPage() {
  const { t } = useTranslation();
  const setup = useSetup();
  const id = useId();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const parsed = setupInputSchema.safeParse({ name, email });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (parsed.success) setup.mutate(parsed.data);
  };

  return (
    <main className="grid min-h-dvh place-items-center bg-subtle px-4 py-10">
      <form
        onSubmit={submit}
        aria-labelledby={`${id}-title`}
        className="flex w-full max-w-[420px] flex-col gap-5 rounded-xl border border-border bg-card p-6 shadow-float sm:p-8"
      >
        <div className="flex flex-col gap-3">
          <CairnLogo className="size-7" />
          <div className="flex flex-col gap-1">
            <h1 id={`${id}-title`} className="m-0 font-semibold text-2xl tracking-[-0.02em]">
              {t('setup.title')}
            </h1>
            <p className="m-0 text-ink-3">{t('setup.description')}</p>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-name`} className="font-medium text-ink-3 text-xs">
            {t('setup.name')}
          </label>
          <Input
            id={`${id}-name`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('setup.namePlaceholder')}
            autoComplete="name"
            autoFocus
            required
            maxLength={120}
            className="h-9 text-base"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-email`} className="font-medium text-ink-3 text-xs">
            {t('setup.email')}
          </label>
          <Input
            id={`${id}-email`}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('setup.emailPlaceholder')}
            autoComplete="email"
            required
            className="h-9 text-base"
          />
        </div>
        <p className="m-0 flex gap-2 rounded-lg bg-muted px-3 py-2.5 text-ink-3 text-xs leading-[1.5]">
          <InfoIcon className="mt-px size-3.5 shrink-0" strokeWidth={2} aria-hidden />
          {t('setup.noPassword')}
        </p>
        {setup.isError ? (
          <p role="alert" className="m-0 text-danger text-xs">
            {t('setup.failed')}
          </p>
        ) : null}
        <Button type="submit" disabled={!parsed.success || setup.isPending} className="h-9 text-base">
          {t('setup.submit')}
        </Button>
      </form>
    </main>
  );
}
