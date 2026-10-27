// Europe/London display formats for match pages (UK English).
import { TIME_ZONE, type Match } from './model';

const dateFormat = new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const longDateFormat = new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const timeFormat = new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** A calendar date (YYYY-MM-DD) shown as written, without shifting it through UTC. */
const fromDate = (date: string) => new Date(`${date}T12:00:00Z`);

export const matchDate = (m: Match) => dateFormat.format(fromDate(m.date));
export const matchDateLong = (m: Match) => longDateFormat.format(fromDate(m.date));
export const kickOff = (m: Match) => (m.kickoff ? timeFormat.format(new Date(m.kickoff)) : 'Time TBC');

/** "Sat 31 Oct 2026, 15:00" for "last updated" lines. */
export const stamp = (iso: string) => `${dateFormat.format(new Date(iso))}, ${timeFormat.format(new Date(iso))}`;

export const venueLabel = (m: Match) => (m.venueType === 'home' ? 'Home' : m.venueType === 'away' ? 'Away' : 'Neutral venue');

export const STATUS_LABELS: Record<Match['status'], string> = {
  scheduled: 'Scheduled',
  live: 'In progress',
  finished: 'Full time',
  postponed: 'Postponed',
  cancelled: 'Cancelled',
  abandoned: 'Abandoned',
  awarded: 'Result awarded',
  void: 'Void',
};

/** "2-1" from Bridlington Town's side, with penalties if any. */
export const scoreLine = (m: Match) =>
  m.score ? `${m.score.for}-${m.score.against}${m.penalties ? ` (${m.penalties.for}-${m.penalties.against} pens)` : ''}` : '';

/** Home side first, as football fixtures are written. */
export const fixtureTitle = (m: Match) => (m.venueType === 'away' ? `${m.opponent} v Bridlington Town` : `Bridlington Town v ${m.opponent}`);
export const homeAwayScore = (m: Match) => (m.score ? (m.venueType === 'away' ? `${m.score.against}-${m.score.for}` : `${m.score.for}-${m.score.against}`) : '');
