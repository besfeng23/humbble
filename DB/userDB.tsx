// Explicit development-only fixtures for the legacy profile inspector and visual previews.
// Production discovery must exclusively use get_discovery_feed through lib/discovery.ts.
export type PreviewUser = { id: number; name: string; age: number; image: string; bio?: string };
const previewUsers: PreviewUser[] = __DEV__ ? [
  { id: 1, name: 'Mia', age: 27, image: 'https://images.pexels.com/photos/1391498/pexels-photo-1391498.jpeg', bio: 'A long-term relationship' },
  { id: 2, name: 'Alex', age: 29, image: 'https://images.pexels.com/photos/1408978/pexels-photo-1408978.jpeg', bio: 'A long-term relationship' },
] : [];
export const SuggestedUsers = previewUsers;
export const RECOMMENDATION_USER = previewUsers;
export const matchwithgoalData = previewUsers;
