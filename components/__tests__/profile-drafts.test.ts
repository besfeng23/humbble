const mockStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async (key: string) => mockStore.get(key) ?? null), setItem: jest.fn(async (key: string, value: string) => { mockStore.set(key, value); }), removeItem: jest.fn(async (key: string) => { mockStore.delete(key); }) },
}));
import { clearProfileDraft, loadProfileDraft, loadProfileDraftState, saveProfileDraft } from '@/lib/onboarding/drafts';
import type { ProfilePromptAnswers } from '@/lib/onboarding/profile';

beforeEach(() => mockStore.clear());
describe('profile drafts', () => {
  it('restores prompt answers and city after a route unmount/reload', async () => {
    const answers: ProfilePromptAnswers = { weekend: 'Bookshops', values: 'Kindness', relationship_goal: 'Long term' };
    await saveProfileDraft('user-a', answers, 'Cebu City');
    expect(await loadProfileDraftState('user-a', null, 'Manila')).toEqual({ answers, cityRegion: 'Cebu City' });
  });
  it('falls back to structured saved prompts and profile city', async () => {
    expect(await loadProfileDraftState('user-b', [{ key: 'weekend', answer: 'Walks' }, { key: 'values', answer: 'Honesty' }, { key: 'relationship_goal', answer: 'Commitment' }], 'Manila')).toEqual({ answers: { weekend: 'Walks', values: 'Honesty', relationship_goal: 'Commitment' }, cityRegion: 'Manila' });
  });
  it('clears the local draft after a successful durable save', async () => {
    await saveProfileDraft('user-c', { weekend: 'A', values: 'B', relationship_goal: 'C' }, 'Davao');
    await clearProfileDraft('user-c');
    expect(await loadProfileDraft('user-c', null)).toEqual({ weekend: '', values: '', relationship_goal: '' });
  });
});
