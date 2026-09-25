import { randomBytes } from "node:crypto";
import type {
  GameResult,
  GameState,
  JoinRoomResponse,
  MoveRecord,
  MoveRequest,
  PlayerSide,
  PublicPlayer,
  StickFace,
  ThrowName,
  ThrowRecord,
  UserIdentity,
} from "@/lib/types";
import {
  createInitialPieces,
  formatThrowSteps,
  getAllLegalMoves,
  getLegalMovesForThrow,
  locationText,
  matchesMoveRequest,
  oppositeSide,
  sideLabel,
} from "@/lib/yut-rules";

const EMPTY_SCORE = { blue: 0, red: 0 };

export type GameAction =
  | { type: "throw" }
  | { type: "move"; move: MoveRequest }
  | { type: "pass"; throwId: string }
  | { type: "resign" }
  | { type: "rematch" };

export class GameError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

function cloneState(state: GameState): GameState {
  return structuredClone(state);
}

function makeId(bytes = 5) {
  return randomBytes(bytes).toString("hex");
}

function cleanIdentity(identity: UserIdentity): UserIdentity {
  const id = String(identity?.id || "").slice(0, 80);
  if (!id) throw new GameError("INVALID_IDENTITY", "플레이어 정보를 확인할 수 없습니다.");
  return {
    id,
    nickname: String(identity?.nickname || "손님").trim().slice(0, 18) || "손님",
  };
}

function findPlayerSide(state: GameState, userId: string): PlayerSide | null {
  if (state.players.blue?.id === userId) return "blue";
  if (state.players.red?.id === userId) return "red";
  return null;
}

function requirePlayer(state: GameState, identity: UserIdentity) {
  const side = findPlayerSide(state, identity.id);
  if (!side) throw new GameError("NOT_A_PLAYER", "이 방의 플레이어가 아닙니다.");
  return side;
}

function requirePlaying(state: GameState) {
  if (state.status !== "playing") {
    throw new GameError("GAME_NOT_PLAYING", "현재 진행 중인 게임이 아닙니다.");
  }
}

function requireTurn(state: GameState, side: PlayerSide) {
  if (state.turn !== side) {
    throw new GameError("NOT_YOUR_TURN", "상대 차례입니다.");
  }
}

function startingSide(round: number): PlayerSide {
  return round % 2 === 1 ? "blue" : "red";
}

function publicPlayer(identity: UserIdentity): PublicPlayer {
  return { ...identity, connected: true };
}

function throwSpec(name: ThrowName): Omit<ThrowRecord, "id" | "createdAt"> {
  const specs: Record<ThrowName, Omit<ThrowRecord, "id" | "createdAt">> = {
    backdo: {
      name: "backdo",
      label: "빽도",
      steps: -1,
      extraTurn: false,
      sticks: ["marked-back", "front", "front", "front"],
    },
    do: {
      name: "do",
      label: "도",
      steps: 1,
      extraTurn: false,
      sticks: ["back", "front", "front", "front"],
    },
    gae: {
      name: "gae",
      label: "개",
      steps: 2,
      extraTurn: false,
      sticks: ["back", "back", "front", "front"],
    },
    geol: {
      name: "geol",
      label: "걸",
      steps: 3,
      extraTurn: false,
      sticks: ["back", "back", "back", "front"],
    },
    yut: {
      name: "yut",
      label: "윷",
      steps: 4,
      extraTurn: true,
      sticks: ["back", "back", "back", "back"],
    },
    mo: {
      name: "mo",
      label: "모",
      steps: 5,
      extraTurn: true,
      sticks: ["front", "front", "front", "front"],
    },
  };
  return specs[name];
}

function randomThrowName(): ThrowName {
  const roll = Math.floor(Math.random() * 16);
  if (roll === 0) return "backdo";
  if (roll <= 3) return "do";
  if (roll <= 9) return "gae";
  if (roll <= 13) return "geol";
  if (roll === 14) return "yut";
  return "mo";
}

function createThrow(now = Date.now()): ThrowRecord {
  return {
    id: makeId(4),
    createdAt: now,
    ...throwSpec(randomThrowName()),
  };
}

function throwWithParticle(record: ThrowRecord) {
  return `${record.label}${record.name === "geol" || record.name === "yut" ? "을" : "를"}`;
}

function allFinished(state: GameState, side: PlayerSide) {
  return state.pieces[side].every((piece) => piece.place === "finished");
}

function finish(state: GameState, winner: PlayerSide, reason: GameResult["reason"], message: string) {
  state.status = "finished";
  state.phase = "move";
  state.pendingThrows = [];
  state.result = {
    outcome: `${winner}_win`,
    winner,
    reason,
    message,
  };
  state.match.rounds[winner] += 1;
  state.match.captures.blue += state.captures.blue;
  state.match.captures.red += state.captures.red;
  state.notice = message;
  state.endedAt = Date.now();
  state.turnStartedAt = null;
}

function endTurn(state: GameState, message?: string) {
  state.turn = oppositeSide(state.turn);
  state.turnNumber += 1;
  state.phase = "throw";
  state.pendingThrows = [];
  state.turnStartedAt = Date.now();
  if (message) state.notice = message;
}

function autoPassIfNoMoves(state: GameState) {
  if (state.status !== "playing" || state.phase !== "move") return;
  if (!state.pendingThrows.length) {
    endTurn(state);
    return;
  }
  if (getAllLegalMoves(state, state.turn).length > 0) return;
  const labels = state.pendingThrows.map((pendingThrow) => pendingThrow.label).join(", ");
  endTurn(
    state,
    `${sideLabel(oppositeSide(state.turn))}이(가) ${labels}을(를) 냈지만 움직일 말이 없어 차례가 넘어갔습니다.`,
  );
}

function applyMove(state: GameState, side: PlayerSide, move: MoveRequest) {
  const pendingThrow = state.pendingThrows.find((item) => item.id === move.throwId);
  if (!pendingThrow) throw new GameError("THROW_NOT_FOUND", "사용할 윷 결과를 찾을 수 없습니다.");

  const legalMove = getLegalMovesForThrow(state, side, pendingThrow).find((candidate) =>
    matchesMoveRequest(candidate, move),
  );
  if (!legalMove) throw new GameError("ILLEGAL_MOVE", "움직일 수 없는 말입니다.");

  const ownPieces = state.pieces[side];
  const opponentSide = oppositeSide(side);
  const opponentPieces = state.pieces[opponentSide];
  const captured = legalMove.capturedPieceIds;

  for (const pieceId of captured) {
    const capturedPiece = opponentPieces.find((piece) => piece.id === pieceId);
    if (capturedPiece) {
      capturedPiece.place = "home";
      capturedPiece.position = null;
      capturedPiece.track = "main";
    }
  }

  for (const pieceId of legalMove.movingPieceIds) {
    const piece = ownPieces.find((item) => item.id === pieceId);
    if (!piece) continue;
    piece.place = legalMove.to.place;
    piece.position = legalMove.to.position;
    piece.track = legalMove.nextTrack;
    if (piece.place !== "board") {
      piece.position = null;
      piece.track = "main";
    }
  }

  if (captured.length > 0) state.captures[side] += captured.length;

  state.pendingThrows = state.pendingThrows.filter((item) => item.id !== pendingThrow.id);

  const record: MoveRecord = {
    id: makeId(4),
    turnNumber: state.turnNumber,
    side,
    pieceIds: legalMove.movingPieceIds,
    throwId: pendingThrow.id,
    throwName: pendingThrow.name,
    throwLabel: pendingThrow.label,
    steps: pendingThrow.steps,
    from: legalMove.from,
    to: legalMove.to,
    routeChoice: legalMove.routeChoice,
    capturedSide: captured.length ? opponentSide : null,
    capturedPieceIds: captured,
    playedAt: Date.now(),
    note: `${sideLabel(side)} ${legalMove.movingPieceIds.join("+")}번 말: ${pendingThrow.label} ${formatThrowSteps(
      pendingThrow.steps,
    )}, ${locationText(legalMove.from)} → ${locationText(legalMove.to)}${
      captured.length ? `, ${sideLabel(opponentSide)} ${captured.length}개 잡음` : ""
    }`,
  };
  state.moves.push(record);
  state.notice = record.note;

  if (allFinished(state, side)) {
    finish(state, side, "all_finished", `${sideLabel(side)}이(가) 모든 말을 먼저 냈습니다.`);
    return;
  }

  if (captured.length > 0) {
    state.phase = "throw";
    state.notice = `${record.note}. 말을 잡아 한 번 더 던집니다.`;
    return;
  }

  if (state.pendingThrows.length > 0) {
    state.phase = "move";
    autoPassIfNoMoves(state);
  } else {
    endTurn(state);
  }
}

function resetRound(state: GameState) {
  if (!state.players.blue || !state.players.red) {
    throw new GameError("WAITING_FOR_PLAYER", "두 명의 플레이어가 필요합니다.");
  }
  if (state.status !== "finished") {
    throw new GameError("GAME_NOT_FINISHED", "종료된 판만 다시 시작할 수 있습니다.");
  }

  const now = Date.now();
  state.round += 1;
  state.turnNumber = 1;
  state.turn = startingSide(state.round);
  state.status = "playing";
  state.phase = "throw";
  state.pieces = createInitialPieces();
  state.pendingThrows = [];
  state.lastThrow = null;
  state.moves = [];
  state.captures = structuredClone(EMPTY_SCORE);
  state.result = null;
  state.notice = `${state.round}판을 시작합니다. ${sideLabel(state.turn)} 차례입니다.`;
  state.startedAt = now;
  state.endedAt = null;
  state.turnStartedAt = now;
  state.serverNow = now;
}

export function createGame(rawIdentity: UserIdentity): JoinRoomResponse & { roomId: string } {
  const identity = cleanIdentity(rawIdentity);
  const creatorSide: PlayerSide = Math.random() < 0.5 ? "blue" : "red";
  const now = Date.now();
  const state: GameState = {
    roomId: makeId(),
    status: "waiting",
    phase: "throw",
    round: 1,
    turnNumber: 1,
    turn: "blue",
    players: {
      [creatorSide]: publicPlayer(identity),
    },
    pieces: createInitialPieces(),
    pendingThrows: [],
    lastThrow: null,
    moves: [],
    captures: structuredClone(EMPTY_SCORE),
    match: {
      rounds: structuredClone(EMPTY_SCORE),
      captures: structuredClone(EMPTY_SCORE),
    },
    result: null,
    notice: "초대 링크를 보내 상대를 기다리는 중입니다.",
    createdAt: now,
    startedAt: null,
    endedAt: null,
    turnStartedAt: null,
    serverNow: now,
  };
  return { roomId: state.roomId, playerSide: creatorSide, state };
}

export function joinGame(stored: GameState, rawIdentity: UserIdentity): JoinRoomResponse {
  const state = cloneState(stored);
  const identity = cleanIdentity(rawIdentity);
  let side = findPlayerSide(state, identity.id);

  if (!side) {
    if (state.status === "finished") {
      throw new GameError("GAME_FINISHED", "이미 종료된 방입니다.");
    }
    side = state.players.blue ? "red" : "blue";
    if (state.players[side]) {
      throw new GameError("ROOM_FULL", "이미 두 명이 참여 중인 방입니다.");
    }
    state.players[side] = publicPlayer(identity);
  } else {
    state.players[side] = { ...state.players[side]!, nickname: identity.nickname, connected: true };
  }

  if (state.players.blue && state.players.red && state.status === "waiting") {
    const now = Date.now();
    state.status = "playing";
    state.startedAt = now;
    state.turnStartedAt = now;
    state.notice = `${sideLabel(state.turn)}이(가) 먼저 윷을 던집니다.`;
  }

  state.serverNow = Date.now();
  return { playerSide: side, state };
}

export function readGame(stored: GameState) {
  const responseState = cloneState(stored);
  responseState.serverNow = Date.now();
  return { storedState: stored, responseState, changed: false };
}

export function performAction(stored: GameState, rawIdentity: UserIdentity, action: GameAction) {
  const state = cloneState(stored);
  const identity = cleanIdentity(rawIdentity);
  const side = requirePlayer(state, identity);

  if (action.type === "rematch") {
    resetRound(state);
    return state;
  }

  requirePlaying(state);
  requireTurn(state, side);

  if (action.type === "throw") {
    if (state.phase !== "throw") {
      throw new GameError("MOVE_REQUIRED", "먼저 남은 윷 결과로 말을 움직여야 합니다.");
    }
    const pendingThrow = createThrow();
    state.pendingThrows.push(pendingThrow);
    state.lastThrow = pendingThrow;
    state.notice = pendingThrow.extraTurn
      ? `${sideLabel(side)}이 ${throwWithParticle(pendingThrow)} 냈습니다. 한 번 더 던집니다.`
      : `${sideLabel(side)}이 ${throwWithParticle(pendingThrow)} 냈습니다.`;
    state.phase = pendingThrow.extraTurn ? "throw" : "move";
    autoPassIfNoMoves(state);
  } else if (action.type === "move") {
    if (state.phase !== "move") {
      throw new GameError("THROW_REQUIRED", "먼저 윷을 던져야 합니다.");
    }
    applyMove(state, side, action.move);
  } else if (action.type === "pass") {
    if (state.phase !== "move") {
      throw new GameError("PASS_NOT_ALLOWED", "넘길 수 있는 상황이 아닙니다.");
    }
    const pendingThrow = state.pendingThrows.find((item) => item.id === action.throwId);
    if (!pendingThrow) throw new GameError("THROW_NOT_FOUND", "넘길 윷 결과를 찾을 수 없습니다.");
    if (getLegalMovesForThrow(state, side, pendingThrow).length > 0) {
      throw new GameError("PASS_NOT_ALLOWED", "움직일 수 있는 말이 있습니다.");
    }
    state.pendingThrows = state.pendingThrows.filter((item) => item.id !== action.throwId);
    if (state.pendingThrows.length > 0) {
      state.notice = `${pendingThrow.label}은(는) 움직일 말이 없어 넘겼습니다.`;
      autoPassIfNoMoves(state);
    } else {
      endTurn(state, `${pendingThrow.label}은(는) 움직일 말이 없어 차례를 넘겼습니다.`);
    }
  } else if (action.type === "resign") {
    finish(state, oppositeSide(side), "resign", `${sideLabel(side)}이(가) 기권했습니다.`);
  }

  state.serverNow = Date.now();
  return state;
}
