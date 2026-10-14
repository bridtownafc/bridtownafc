import type { TeamId } from './types';

export const TEAM_IDS: TeamId[] = ['mens', 'womens'];
export const DEFAULT_TEAM: TeamId = 'mens';
/** localStorage key for the last team a visitor chose. It only guides `/` and shared pages. */
export const TEAM_STORAGE_KEY = 'bta:team';
