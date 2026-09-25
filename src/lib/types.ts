export interface Team {
  id: number;
  name: string;
  logo: string;
}

export interface League {
  id: number;
  name: string;
  country: string;
  logo: string;
  flag: string;
  slug: string;
}

export interface MatchScore {
  home: number | null;
  away: number | null;
}

export type MatchStatusShort =
  | "NS"
  | "1H"
  | "HT"
  | "2H"
  | "ET"
  | "BT"
  | "P"
  | "FT"
  | "AET"
  | "PEN"
  | "SUSP"
  | "INT"
  | "PST"
  | "CANC"
  | "ABD"
  | "AWD"
  | "WO"
  | "LIVE"
  | "TBD";

export interface Match {
  id: number;
  league: League;
  homeTeam: Team;
  awayTeam: Team;
  date: string;
  timestamp: number;
  status: {
    short: MatchStatusShort;
    long: string;
    elapsed: number | null;
  };
  score: MatchScore;
  channels: Channel[];
  broadcastChannels?: string[];
  _streamId?: string;
  _eventSlug?: string;
  _eventSources?: { id: string; name: string; embedIframe: string }[];
}

export interface Channel {
  id: string;
  name: string;
  url: string;
  kind?: "hls" | "iframe";
  headers?: Record<string, string>;
}

export interface Standing {
  rank: number;
  team: Team;
  points: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalsDiff: number;
  trend: number[];
  destinationColor?: string;
}

export interface StandingsTable {
  name: string;
  standings: Standing[];
}

export interface StandingsTab {
  name: string;
  tables: StandingsTable[];
}

export interface BracketMatch {
  homeTeam: string;
  awayTeam: string;
  homeScore: string;
  awayScore: string;
  round: string;
  status: string;
}

export interface BracketRound {
  name: string;
  matches: BracketMatch[];
}

export interface LeagueStandingsData {
  tabs: StandingsTab[];
  brackets: BracketRound[];
}

export interface LeagueConfig {
  id: number;
  name: string;
  country: string;
  countryFlag: string;
  slug: string;
  season: number;
}
