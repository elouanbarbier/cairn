import { type FormEvent, useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { LoadError } from '@/components/bits';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import { type Language, setLanguage } from '@/i18n';
import { useMe, useSettings, useUpdateSettings } from '@/lib/queries';
import { type ThemeSetting, useTheme } from '@/lib/theme';
import { useUi } from '@/lib/ui-state';
import { cn } from '@/lib/utils';
import { AccountSection } from './account-section';
import { DataSection } from './data-section';
import { Choice, Section } from './parts';
import { TokensSection } from './tokens-section';
import { UsersSection } from './users-section';

const DORMANCY_PRESETS = [7, 14, 21, 30];

/** Account, API tokens, users (admins), workspace settings, and this browser's preferences (theme, language). */
export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const ui = useUi();
  const me = useMe();
  const settings = useSettings();
  const update = useUpdateSettings();
  const isAdmin = me.data?.user.role === 'admin';
  const { setting, setSetting } = useTheme();
  const id = useId();
  const current = settings.data?.dormancyDays;
  const [draft, setDraft] = useState('');

  useEffect(() => ui.setScreenContext({}), [ui.setScreenContext]);
  useEffect(() => {
    if (current !== undefined) setDraft(String(current));
  }, [current]);

  const value = Number(draft);
  const valid = draft !== '' && Number.isInteger(value) && value >= 1 && value <= 365;
  const save = (days: number) =>
    update.mutate({ dormancyDays: days }, { onSuccess: () => toast.success(t('settings.saved', { count: days })) });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (valid && value !== current) save(value);
  };

  return (
    <>
      <PageHeader>
        <h1 className="m-0 font-medium text-sm">{t('settings.title')}</h1>
      </PageHeader>
      <div className="mx-auto box-border flex w-full max-w-[720px] flex-col gap-8 px-4 py-8 sm:px-8">
        {me.data ? <AccountSection user={me.data.user} /> : null}
        <TokensSection />
        {isAdmin && me.data ? <UsersSection meId={me.data.user.id} /> : null}
        {isAdmin ? <DataSection /> : null}
        <Section title={t('settings.workspace')}>
          {settings.isError ? <LoadError onRetry={() => void settings.refetch()} /> : null}
          {isAdmin ? null : <p className="m-0 text-ink-4 text-xs">{t('settings.adminOnly')}</p>}
          <fieldset disabled={!isAdmin} className="m-0 border-0 p-0">
            <form onSubmit={submit} className="flex flex-col gap-2">
              <label htmlFor={`${id}-dormancy`} className="font-medium text-ink-2">
                {t('settings.dormancy')}
              </label>
              <p id={`${id}-dormancy-hint`} className="m-0 text-ink-3">
                {t('settings.dormancyHint')}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2">
                  <Input
                    id={`${id}-dormancy`}
                    type="number"
                    min={1}
                    max={365}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    aria-describedby={`${id}-dormancy-hint`}
                    aria-invalid={draft !== '' && !valid}
                    className="w-20 tabular-nums"
                  />
                  <span className="text-ink-3">{t('settings.days')}</span>
                </span>
                <Button type="submit" disabled={!valid || value === current || update.isPending}>
                  {t('settings.save')}
                </Button>
                <span className="ml-2 flex flex-wrap gap-1.5">
                  {DORMANCY_PRESETS.map((days) => (
                    <Button
                      key={days}
                      variant="outline"
                      size="sm"
                      aria-pressed={current === days}
                      onClick={() => {
                        setDraft(String(days));
                        if (days !== current) save(days);
                      }}
                      className={cn('tabular-nums', current === days && 'border-brand text-brand')}
                    >
                      {t('settings.presetDays', { count: days })}
                    </Button>
                  ))}
                </span>
              </div>
            </form>
          </fieldset>
        </Section>

        <Section title={t('settings.appearance')}>
          <Choice<ThemeSetting>
            legend={t('settings.theme')}
            value={setting}
            onChange={setSetting}
            options={(['system', 'light', 'dark'] as const).map((v) => ({
              value: v,
              label: t(`settings.themes.${v}`),
            }))}
          />
          <Choice<Language>
            legend={t('settings.language')}
            value={i18n.language as Language}
            onChange={setLanguage}
            options={(['fr', 'en'] as const).map((v) => ({ value: v, label: t(`settings.languages.${v}`) }))}
          />
        </Section>

        <Section title={t('settings.keyboard')}>
          <Button variant="outline" onClick={() => ui.setShortcutsOpen(true)} className="self-start pr-2">
            {t('settings.shortcuts')}
            <Kbd variant="outline">?</Kbd>
          </Button>
        </Section>
      </div>
    </>
  );
}
