import { PASSWORD_MIN_LENGTH, type SetupStatus, setupInputSchema } from '@cairn/shared';
import { useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { ApiRequestError, api } from '@/lib/api';
import { restart } from '@/lib/queries';
import { AccessCard, AccessError, AccessField } from './access-layout';

/**
 * First run. `create`: an empty workspace asks for its first account, which becomes admin. `claim`: a workspace from
 * before sign-in existed asks its administrator to choose a password. Either way, the person is then signed in.
 */
export function SetupPage({ mode }: { mode: NonNullable<SetupStatus['mode']> }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const claim = mode === 'claim';
  const parsed = setupInputSchema.safeParse({ name: claim ? undefined : name, email, password });
  const ready = parsed.success && (claim || name.trim().length > 0);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!parsed.success || !ready) return;
    setPending(true);
    setError(null);
    try {
      await api.setup(parsed.data);
      restart(client);
    } catch (err) {
      setError(err instanceof ApiRequestError && err.status === 400 && claim ? t('setup.notAdmin') : t('setup.failed'));
    } finally {
      setPending(false);
    }
  };

  return (
    <AccessCard
      title={t(claim ? 'setup.claimTitle' : 'setup.title')}
      description={t(claim ? 'setup.claimDescription' : 'setup.description')}
      onSubmit={submit}
    >
      {claim ? null : (
        <AccessField
          label={t('setup.name')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('setup.namePlaceholder')}
          autoComplete="name"
          autoFocus
          required
          maxLength={120}
        />
      )}
      <AccessField
        label={t('setup.email')}
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder={t('setup.emailPlaceholder')}
        autoComplete={claim ? 'username' : 'email'}
        autoFocus={claim}
        required
      />
      <AccessField
        label={t('auth.newPassword')}
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="new-password"
        hint={t('auth.passwordHint', { count: PASSWORD_MIN_LENGTH })}
        required
        minLength={PASSWORD_MIN_LENGTH}
      />
      {error ? <AccessError>{error}</AccessError> : null}
      <Button type="submit" disabled={!ready || pending} className="h-9 text-base">
        {t(claim ? 'setup.claimSubmit' : 'setup.submit')}
      </Button>
    </AccessCard>
  );
}
