import { describe, expect, it } from "vitest";
import type { GameState, ThrowRecord, YutPiece } from "@/lib/types";
import {
  BOARD_POSITIONS,
  SHORTCUT_A,
  createInitialPieces,
  getLegalMovesForThrow,
} from "@/lib/yut-rules";

function throwRecord(steps: number): ThrowRecord {
  const outcome =
    steps === -1
      ? { name: "backdo" as const, label: "빽도" }
      : steps === 2
        ? { name: "gae" as const, label: "개" }
        : { name: "do" as const, label: "도" };

  return {
    id: `throw-${steps}`,
    ...outcome,
    steps,
    extraTurn: false,
    sticks: ["back", "front", "front", "front"],
    createdAt: 1,
  };
}

function stateWithBluePiece(piece: YutPiece): Pick<GameState, "pieces"> {
  const pieces = createInitialPieces();
  pieces.blue[piece.id] = piece;
  return { pieces };
}

describe("yut board routes", () => {
  it("moves gae two spaces upward from the bottom-right start", () => {
    const state = { pieces: createInitialPieces() };
    const move = getLegalMovesForThrow(state, "blue", throwRecord(2)).find(
      (option) => option.pieceId === 0,
    );

    expect(move?.to).toEqual({ place: "board", position: 1 });
    expect(BOARD_POSITIONS[1]).toMatchObject({ x: 92, y: 58, label: "2" });
  });

  it("continues counterclockwise around the outer route", () => {
    expect(BOARD_POSITIONS.slice(0, 5).map(({ x, y }) => [x, y])).toEqual([
      [92, 74],
      [92, 58],
      [92, 42],
      [92, 26],
      [92, 10],
    ]);
  });

  it("branches from the top-right corner toward the center", () => {
    const state = stateWithBluePiece({
      id: 0,
      place: "board",
      position: 4,
      track: "main",
    });
    const moves = getLegalMovesForThrow(state, "blue", throwRecord(1)).filter(
      (option) => option.pieceId === 0,
    );

    expect(SHORTCUT_A.slice(0, 4)).toEqual([4, 24, 23, 22]);
    expect(moves.find((move) => move.routeChoice === "shortcut")?.to.position).toBe(24);
    expect(moves.find((move) => move.routeChoice === "main")?.to.position).toBe(5);
  });

  it("moves backdo to the previous outer position", () => {
    const state = stateWithBluePiece({
      id: 0,
      place: "board",
      position: 1,
      track: "main",
    });
    const move = getLegalMovesForThrow(state, "blue", throwRecord(-1)).find(
      (option) => option.pieceId === 0,
    );

    expect(move?.to).toEqual({ place: "board", position: 0 });
  });
});
