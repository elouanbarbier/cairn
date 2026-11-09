import { PASSWORD_MIN_LENGTH, type User } from '@cairn/shared';
import { type FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ApiRequestError } from '@/lib/api';
import { useChangePassword, useLogout, useLogoutOthers, useUpdateMe } from '@/lib/queries';
import { Field, Section } from './parts';

/** Name and email, password, and the sessions of the signed-in person. */
export function AccountSection({ user }: { user: User }) {
  const { t } = useTranslation();
  const updateMe = useUpdateMe();
  const changePassword = useChangePassword();
  const logoutOthers = useLogoutOthers();
  const logout = useLogout();
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  useEffect(() => {
    setName(user.name);
    setEmail(user.email);
  }, [user.name, user.email]);

  const changed = name.trim() !== user.name || email.trim().toLowerCase() !== user.email;
  const saveAccount = (event: FormEvent) => {
    event.preventDefault();
    if (!changed || !name.trim() || !email.trim()) return;
    updateMe.mutate(
      { name: name.trim(), email: email.trim() },
      {
        onSuccess: () => toast.success(t('settings.accountSaved')),
        onError: (error) =>
          toast.error(
            error instanceof ApiRequestError && error.status === 409 ? t('settings.emailTaken') : t('errors.rollback'),
          ),
      },
    );
  };

  const savePassword = (event: FormEvent) => {
    event.preventDefault();
    if (!current || next.length < PASSWORD_MIN_LENGTH) return;
    changePassword.mutate(
      { currentPassword: current, newPassword: next },
      {
        onSuccess: () => {
          setCurrent('');
          setNext('');
          toast.success(t('settings.passwordChanged'));
        },
        onError: (error) =>
          toast.error(
            error instanceof ApiRequestError && error.status === 400
              ? t('settings.wrongPassword')
              : t('errors.rollback'),
          ),
      },
    );
  };

  return (
    <Section title={t('settings.account')}>
      <form onSubmit={saveAccount} className="flex flex-wrap items-end gap-3">
        <Field
          label={t('settings.name')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          maxLength={120}
          className="min-w-48 flex-1"
        />
        <Field
          label={t('settings.email')}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          className="min-w-56 flex-1"
        />
        <Button type="submit" variant="outline" disabled={!changed || updateMe.isPending}>
          {t('settings.saveAccount')}
        </Button>
      </form>

      <form onSubmit={savePassword} className="flex flex-col gap-3">
        <h3 className="m-0 font-medium text-ink-2">{t('settings.changePassword')}</h3>
        <input type="email" value={user.email} autoComplete="username" readOnly hidden />
        <div className="flex flex-wrap items-start gap-3">
          <Field
            label={t('settings.currentPassword')}
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
            className="min-w-48 flex-1"
          />
          <Field
            label={t('settings.newPassword')}
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
            minLength={PASSWORD_MIN_LENGTH}
            hint={t('auth.passwordHint', { count: PASSWORD_MIN_LENGTH })}
            className="min-w-48 flex-1"
          />
        </div>
        <Button
          type="submit"
          variant="outline"
          disabled={!current || next.length < PASSWORD_MIN_LENGTH || changePassword.isPending}
          className="self-start"
        >
          {t('settings.changePassword')}
        </Button>
      </form>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() =>
            logoutOthers.mutate(undefined, { onSuccess: () => toast.success(t('settings.signedOutOthers')) })
          }
        >
          {t('settings.signOutOthers')}
        </Button>
        <Button variant="outline" onClick={() => logout.mutate()} className="text-danger">
          {t('auth.signOut')}
        </Button>
      </div>
    </Section>
  );
}
