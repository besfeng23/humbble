import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Json } from '@/lib/database.contracts';
import { readProfilePromptAnswers, type ProfilePromptAnswers } from './profile';

const STORAGE_PREFIX = 'humbble:onboarding-profile-draft:v1:';
export type ProfileDraftState = { answers: ProfilePromptAnswers; cityRegion: string };

function parsedAnswers(value: unknown, serverPrompts?: Json | null): ProfilePromptAnswers {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const outer = value as Record<string, unknown>;
    const candidate = outer.answers && typeof outer.answers === 'object' ? outer.answers as Record<string, unknown> : outer;
    const hasAnswerKeys = ['weekend', 'values', 'relationship_goal'].some((key) => typeof candidate[key] === 'string');
    if (hasAnswerKeys) return {
      weekend: typeof candidate.weekend === 'string' ? candidate.weekend : '',
      values: typeof candidate.values === 'string' ? candidate.values : '',
      relationship_goal: typeof candidate.relationship_goal === 'string' ? candidate.relationship_goal : '',
    };
  }
  return readProfilePromptAnswers(serverPrompts);
}

export async function loadProfileDraftState(userId: string, serverPrompts?: Json | null, serverCityRegion?: string | null): Promise<ProfileDraftState> {
  try {
    const raw = await AsyncStorage.getItem(`${STORAGE_PREFIX}${userId}`);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const record = parsed as Record<string, unknown>;
        return {
          answers: parsedAnswers(parsed, serverPrompts),
          cityRegion: typeof record.cityRegion === 'string' ? record.cityRegion : (serverCityRegion ?? ''),
        };
      }
    }
  } catch { /* fall through to the durable profile draft */ }
  return { answers: readProfilePromptAnswers(serverPrompts), cityRegion: serverCityRegion ?? '' };
}

/** Compatibility convenience for callers interested only in prompt answers. */
export async function loadProfileDraft(userId: string, serverPrompts?: Json | null): Promise<ProfilePromptAnswers> {
  return (await loadProfileDraftState(userId, serverPrompts)).answers;
}

export async function saveProfileDraft(userId: string, answers: ProfilePromptAnswers, cityRegion = ''): Promise<void> {
  await AsyncStorage.setItem(`${STORAGE_PREFIX}${userId}`, JSON.stringify({ answers, cityRegion }));
}

export async function clearProfileDraft(userId: string): Promise<void> {
  await AsyncStorage.removeItem(`${STORAGE_PREFIX}${userId}`);
}
