import type {
  GameState,
  MoveRequest,
  PieceLocation,
  PlayerSide,
  RouteChoice,
  RouteTrack,
  ThrowRecord,
  YutPiece,
} from "@/lib/types";

export const SIDES: PlayerSide[] = ["blue", "red"];
export const PIECES_PER_SIDE = 4;

export const SIDE_LABEL: Record<PlayerSide, string> = {
  blue: "청",
  red: "홍",
};

export interface BoardPosition {
  id: number;
  x: number;
  y: number;
  label: string;
  role?: "corner" | "center";
}

const diagonalCoordinate = (start: number, end: number, step: number) =>
  start + ((end - start) * step) / 6;

export const BOARD_POSITIONS: BoardPosition[] = [
  { id: 0, x: 92, y: 74, label: "1" },
  { id: 1, x: 92, y: 58, label: "2" },
  { id: 2, x: 92, y: 42, label: "3" },
  { id: 3, x: 92, y: 26, label: "4" },
  { id: 4, x: 92, y: 10, label: "지름", role: "corner" },
  { id: 5, x: 76, y: 10, label: "6" },
  { id: 6, x: 60, y: 10, label: "7" },
  { id: 7, x: 44, y: 10, label: "8" },
  { id: 8, x: 28, y: 10, label: "9" },
  { id: 9, x: 12, y: 10, label: "지름", role: "corner" },
  { id: 10, x: 12, y: 26, label: "11" },
  { id: 11, x: 12, y: 42, label: "12" },
  { id: 12, x: 12, y: 58, label: "13" },
  { id: 13, x: 12, y: 74, label: "14" },
  { id: 14, x: 12, y: 90, label: "15", role: "corner" },
  { id: 15, x: 28, y: 90, label: "16" },
  { id: 16, x: 44, y: 90, label: "17" },
  { id: 17, x: 60, y: 90, label: "18" },
  { id: 18, x: 76, y: 90, label: "19" },
  { id: 19, x: 92, y: 90, label: "출발/도착", role: "corner" },
  {
    id: 20,
    x: diagonalCoordinate(92, 12, 5),
    y: diagonalCoordinate(10, 90, 5),
    label: "지름",
  },
  {
    id: 21,
    x: diagonalCoordinate(92, 12, 4),
    y: diagonalCoordinate(10, 90, 4),
    label: "지름",
  },
  {
    id: 22,
    x: diagonalCoordinate(92, 12, 3),
    y: diagonalCoordinate(10, 90, 3),
    label: "중앙",
    role: "center",
  },
  {
    id: 23,
    x: diagonalCoordinate(92, 12, 2),
    y: diagonalCoordinate(10, 90, 2),
    label: "지름",
  },
  {
    id: 24,
    x: diagonalCoordinate(92, 12, 1),
    y: diagonalCoordinate(10, 90, 1),
    label: "지름",
  },
  {
    id: 25,
    x: diagonalCoordinate(12, 92, 1),
    y: diagonalCoordinate(10, 90, 1),
    label: "지름",
  },
  {
    id: 26,
    x: diagonalCoordinate(12, 92, 2),
    y: diagonalCoordinate(10, 90, 2),
    label: "지름",
  },
  {
    id: 27,
    x: diagonalCoordinate(12, 92, 4),
    y: diagonalCoordinate(10, 90, 4),
    label: "지름",
  },
  {
    id: 28,
    x: diagonalCoordinate(12, 92, 5),
    y: diagonalCoordinate(10, 90, 5),
    label: "지름",
  },
];

export const MAIN_ROUTE = Array.from({ length: 20 }, (_, index) => index);
export const SHORTCUT_A = [4, 24, 23, 22, 21, 20, 14, 15, 16, 17, 18, 19];
export const SHORTCUT_B = [9, 25, 26, 22, 27, 28, 19];

export const BOARD_CONNECTIONS = [
  ...MAIN_ROUTE.slice(0, -1).map((position, index) => [position, MAIN_ROUTE[index + 1]] as const),
  ...SHORTCUT_A.slice(0, -1).map((position, index) => [position, SHORTCUT_A[index + 1]] as const),
  ...SHORTCUT_B.slice(0, -1).map((position, index) => [position, SHORTCUT_B[index + 1]] as const),
];

export interface LegalMove {
  pieceId: number;
  throwId: string;
  routeChoice?: RouteChoice;
  movingPieceIds: number[];
  from: PieceLocation;
  to: PieceLocation;
  nextTrack: RouteTrack;
  capturedPieceIds: number[];
}

export function oppositeSide(side: PlayerSide): PlayerSide {
  return side === "blue" ? "red" : "blue";
}

export function emptySideRecord<T>(value: T): Record<PlayerSide, T> {
  return { blue: structuredClone(value), red: structuredClone(value) };
}

export function createInitialPieces(): Record<PlayerSide, YutPiece[]> {
  return {
    blue: Array.from({ length: PIECES_PER_SIDE }, (_, id) => ({
      id,
      place: "home",
      position: null,
      track: "main",
    })),
    red: Array.from({ length: PIECES_PER_SIDE }, (_, id) => ({
      id,
      place: "home",
      position: null,
      track: "main",
    })),
  };
}

export function sideLabel(side: PlayerSide) {
  return SIDE_LABEL[side];
}

export function locationText(location: PieceLocation) {
  if (location.place === "home") return "대기";
  if (location.place === "finished") return "도착";
  return BOARD_POSITIONS.find((position) => position.id === location.position)?.label || "말판";
}

export function pieceLocation(piece: YutPiece): PieceLocation {
  return { place: piece.place, position: piece.position };
}

export function getStackPieceIds(pieces: YutPiece[], pieceId: number) {
  const piece = pieces.find((item) => item.id === pieceId);
  if (!piece) return [];
  if (piece.place === "home") return [piece.id];
  if (piece.place === "finished") return [];
  return pieces
    .filter((item) => item.place === "board" && item.position === piece.position)
    .map((item) => item.id)
    .sort((a, b) => a - b);
}

function routeFor(piece: YutPiece, routeChoice?: RouteChoice) {
  if (piece.place !== "board") return MAIN_ROUTE;
  if (piece.position === 4 && routeChoice === "shortcut") return SHORTCUT_A;
  if (piece.position === 9 && routeChoice === "shortcut") return SHORTCUT_B;
  if (piece.track === "shortcut-a" && SHORTCUT_A.includes(piece.position ?? -1)) return SHORTCUT_A;
  if (piece.track === "shortcut-b" && SHORTCUT_B.includes(piece.position ?? -1)) return SHORTCUT_B;
  return MAIN_ROUTE;
}

function nextTrack(piece: YutPiece, routeChoice?: RouteChoice): RouteTrack {
  if (piece.position === 4 && routeChoice === "shortcut") return "shortcut-a";
  if (piece.position === 9 && routeChoice === "shortcut") return "shortcut-b";
  return piece.track;
}

function moveOnRoute(
  piece: YutPiece,
  steps: number,
  routeChoice?: RouteChoice,
): { to: PieceLocation; nextTrack: RouteTrack } | null {
  if (piece.place === "finished") return null;

  if (steps < 0) {
    if (piece.place !== "board" || piece.position === null) return null;
    const route = routeFor(piece, routeChoice);
    const index = route.indexOf(piece.position);
    if (index < 0) return null;
    if (index === 0) {
      return { to: { place: "home", position: null }, nextTrack: "main" };
    }
    return {
      to: { place: "board", position: route[index - 1] },
      nextTrack: piece.track,
    };
  }

  if (piece.place === "home") {
    const targetIndex = steps - 1;
    if (targetIndex >= MAIN_ROUTE.length) {
      return { to: { place: "finished", position: null }, nextTrack: "main" };
    }
    return {
      to: { place: "board", position: MAIN_ROUTE[targetIndex] },
      nextTrack: "main",
    };
  }

  if (piece.position === null) return null;
  const route = routeFor(piece, routeChoice);
  const index = route.indexOf(piece.position);
  if (index < 0) return null;
  const targetIndex = index + steps;
  if (targetIndex >= route.length) {
    return { to: { place: "finished", position: null }, nextTrack: "main" };
  }
  return {
    to: { place: "board", position: route[targetIndex] },
    nextTrack: nextTrack(piece, routeChoice),
  };
}

function selectablePieces(pieces: YutPiece[]) {
  const boardPositions = new Set<number>();
  const selection: YutPiece[] = [];

  for (const piece of pieces) {
    if (piece.place === "home") {
      selection.push(piece);
    } else if (piece.place === "board" && piece.position !== null && !boardPositions.has(piece.position)) {
      boardPositions.add(piece.position);
      selection.push(piece);
    }
  }

  return selection.sort((a, b) => a.id - b.id);
}

function routeChoicesFor(piece: YutPiece, steps: number): (RouteChoice | undefined)[] {
  if (steps <= 0 || piece.place !== "board") return [undefined];
  if (piece.position === 4 || piece.position === 9) return ["shortcut", "main"];
  return [undefined];
}

function sameDestination(a: PieceLocation, b: PieceLocation) {
  return a.place === b.place && a.position === b.position;
}

export function getLegalMovesForThrow(
  state: Pick<GameState, "pieces">,
  side: PlayerSide,
  pendingThrow: ThrowRecord,
): LegalMove[] {
  const ownPieces = state.pieces[side];
  const opponentPieces = state.pieces[oppositeSide(side)];
  const moves: LegalMove[] = [];

  for (const piece of selectablePieces(ownPieces)) {
    const movingPieceIds = getStackPieceIds(ownPieces, piece.id);
    for (const routeChoice of routeChoicesFor(piece, pendingThrow.steps)) {
      const result = moveOnRoute(piece, pendingThrow.steps, routeChoice);
      if (!result) continue;
      const capturedPieceIds =
        result.to.place === "board"
          ? opponentPieces
              .filter((opponent) => opponent.place === "board" && opponent.position === result.to.position)
              .map((opponent) => opponent.id)
          : [];
      const duplicate = moves.some(
        (move) =>
          move.pieceId === piece.id &&
          move.routeChoice === routeChoice &&
          sameDestination(move.to, result.to),
      );
      if (!duplicate) {
        moves.push({
          pieceId: piece.id,
          throwId: pendingThrow.id,
          routeChoice,
          movingPieceIds,
          from: pieceLocation(piece),
          to: result.to,
          nextTrack: result.nextTrack,
          capturedPieceIds,
        });
      }
    }
  }

  return moves;
}

export function getAllLegalMoves(state: GameState, side = state.turn) {
  return state.pendingThrows.flatMap((pendingThrow) =>
    getLegalMovesForThrow(state, side, pendingThrow),
  );
}

export function matchesMoveRequest(move: LegalMove, request: MoveRequest) {
  return (
    move.pieceId === request.pieceId &&
    move.throwId === request.throwId &&
    (move.routeChoice || "main") === (request.routeChoice || "main")
  );
}

export function formatThrowSteps(steps: number) {
  if (steps < 0) return "뒤로 1칸";
  return `${steps}칸`;
}
