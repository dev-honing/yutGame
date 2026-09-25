export type PlayerSide = "blue" | "red";
export type RoomStatus = "waiting" | "playing" | "finished";
export type GamePhase = "throw" | "move";
export type PiecePlace = "home" | "board" | "finished";
export type RouteTrack = "main" | "shortcut-a" | "shortcut-b";
export type RouteChoice = "main" | "shortcut";
export type ThrowZone = "inside" | "outside";
export type ThrowName = "nak" | "backdo" | "do" | "gae" | "geol" | "yut" | "mo";
export type StickFace = "front" | "back" | "marked-back";

export interface PublicPlayer {
  id: string;
  nickname: string;
  connected: boolean;
}

export interface UserIdentity {
  id: string;
  nickname: string;
}

export interface YutPiece {
  id: number;
  place: PiecePlace;
  position: number | null;
  track: RouteTrack;
}

export interface ThrowRecord {
  id: string;
  side: PlayerSide;
  zone: ThrowZone;
  name: ThrowName;
  label: string;
  steps: number;
  extraTurn: boolean;
  sticks: StickFace[];
  createdAt: number;
}

export interface PieceLocation {
  place: PiecePlace;
  position: number | null;
}

export interface MoveRequest {
  pieceId: number;
  throwId: string;
  routeChoice?: RouteChoice;
}

export interface MoveRecord {
  id: string;
  turnNumber: number;
  side: PlayerSide;
  pieceIds: number[];
  throwId: string;
  throwName: ThrowName;
  throwLabel: string;
  steps: number;
  from: PieceLocation;
  to: PieceLocation;
  routeChoice?: RouteChoice;
  capturedSide: PlayerSide | null;
  capturedPieceIds: number[];
  playedAt: number;
  note: string;
}

export interface GameResult {
  outcome: "blue_win" | "red_win";
  winner: PlayerSide;
  reason: "all_finished" | "resign";
  message: string;
}

export interface MatchScore {
  rounds: Record<PlayerSide, number>;
  captures: Record<PlayerSide, number>;
}

export interface GameState {
  roomId: string;
  status: RoomStatus;
  phase: GamePhase;
  round: number;
  turnNumber: number;
  turn: PlayerSide;
  players: Partial<Record<PlayerSide, PublicPlayer>>;
  pieces: Record<PlayerSide, YutPiece[]>;
  pendingThrows: ThrowRecord[];
  lastThrow: ThrowRecord | null;
  moves: MoveRecord[];
  captures: Record<PlayerSide, number>;
  match: MatchScore;
  result: GameResult | null;
  notice: string;
  createdAt: number;
  startedAt: number | null;
  endedAt: number | null;
  turnStartedAt: number | null;
  serverNow: number;
}

export interface JoinRoomResponse {
  state: GameState;
  playerSide: PlayerSide;
}

export interface ServerError {
  code: string;
  message: string;
}
