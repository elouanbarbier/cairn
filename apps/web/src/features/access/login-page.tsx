import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '@cairn/shared';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { ApiRequestError } from '@/lib/api';
import { useLogin } from '@/lib/queries';
import { AccessCard, AccessError, AccessField } from './access-layout';

/** Sign-in. With the demo data loaded, it names the demo accounts. */
export function LoginPage({ demo }: { demo: boolean }) {
  const { t } = useTranslation();
  const login = useLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (email.trim() && password) login.mutate({ email, password });
  };

  const error = login.error
    ? login.error instanceof ApiRequestError && login.error.status === 401
      ? t('auth.wrongCredentials')
      : login.error instanceof ApiRequestError && login.error.status === 429
        ? t('auth.tooManyAttempts')
        : t('auth.failed')
    : null;

  return (
    <AccessCard title={t('auth.title')} description={t('auth.description')} onSubmit={submit}>
      <AccessField
        label={t('auth.email')}
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="username"
        autoFocus
        required
      />
      <AccessField
        label={t('auth.password')}
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="current-password"
        required
      />
      {error ? <AccessError>{error}</AccessError> : null}
      <Button type="submit" disabled={!email.trim() || !password || login.isPending} className="h-9 text-base">
        {t('auth.signIn')}
      </Button>
      <p className="m-0 text-ink-4 text-xs">{t('auth.forgotten')}</p>
      {demo ? (
        <p className="m-0 rounded-lg bg-muted px-3 py-2.5 text-ink-3 text-xs leading-[1.5]">
          {t('auth.demo', { emails: DEMO_ACCOUNTS.join(', '), password: DEMO_PASSWORD })}
        </p>
      ) : null}
    </AccessCard>
  );
}
