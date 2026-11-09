import { PASSWORD_MIN_LENGTH } from '@cairn/shared';
import { useNavigate } from '@tanstack/react-router';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useLinkInfo, useRedeemLink } from '@/lib/queries';
import { linkRoute } from '@/router';
import { AccessCard, AccessError, AccessField } from './access-layout';

/** An invitation or reset link: the person chooses a password, then lands in the workspace, signed in. */
export function LinkPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { token } = linkRoute.useParams();
  const info = useLinkInfo(token);
  const redeem = useRedeemLink(token);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const mismatch = confirm.length > 0 && confirm !== password;
  const ready = password.length >= PASSWORD_MIN_LENGTH && password === confirm;

  if (info.isPending) return null;
  if (!info.data) {
    return (
      <AccessCard title={t('auth.title')} description={t('auth.linkInvalid')}>
        <Button type="button" onClick={() => void navigate({ to: '/' })} className="h-9 text-base">
          {t('auth.toSignIn')}
        </Button>
      </AccessCard>
    );
  }

  const { kind, name, email } = info.data;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (ready) redeem.mutate(password, { onSuccess: () => void navigate({ to: '/', replace: true }) });
  };

  return (
    <AccessCard
      title={kind === 'invite' ? t('auth.inviteTitle', { name }) : t('auth.resetTitle')}
      description={kind === 'invite' ? t('auth.inviteDescription', { email }) : t('auth.resetDescription', { email })}
      onSubmit={submit}
    >
      {/* Lets password managers file the new password under the right account. */}
      <input type="email" value={email} autoComplete="username" readOnly hidden />
      <AccessField
        label={t('auth.newPassword')}
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="new-password"
        hint={t('auth.passwordHint', { count: PASSWORD_MIN_LENGTH })}
        autoFocus
        required
        minLength={PASSWORD_MIN_LENGTH}
      />
      <AccessField
        label={t('auth.confirmPassword')}
        type="password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        autoComplete="new-password"
        aria-invalid={mismatch}
        required
      />
      {mismatch ? <AccessError>{t('auth.mismatch')}</AccessError> : null}
      {redeem.isError ? <AccessError>{t('auth.linkInvalid')}</AccessError> : null}
      <Button type="submit" disabled={!ready || redeem.isPending} className="h-9 text-base">
        {kind === 'invite' ? t('auth.join') : t('auth.savePassword')}
      </Button>
    </AccessCard>
  );
}
