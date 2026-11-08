import { describe, expect, it } from 'vitest';
import { firstName, initials, splitMatch } from './utils';

describe('splitMatch', () => {
  it('splits around an accent-insensitive match, keeping the original text', () => {
    expect(splitMatch('Étapes du formulaire', 'etapes')).toEqual(['', 'Étapes', ' du formulaire']);
    expect(splitMatch('Validation du formulaire', 'FORM')).toEqual(['Validation du ', 'form', 'ulaire']);
  });
  it('returns null without a match or a query', () => {
    expect(splitMatch('Recette', 'xyz')).toBeNull();
    expect(splitMatch('Recette', '  ')).toBeNull();
  });
});

describe('names', () => {
  it('derives initials and first names', () => {
    expect(initials('Elouan Barbier')).toBe('EB');
    expect(initials('Camille')).toBe('CA');
    expect(firstName('Camille Durand')).toBe('Camille');
  });
});
