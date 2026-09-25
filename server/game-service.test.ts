import { afterEach, describe, expect, it, vi } from "vitest";
import { createGame, GameError, joinGame, performAction } from "./game-service";
import type { GameState, UserIdentity } from "@/lib/types";

const creator: UserIdentity = { id: "creator-id", nickname: "Creator" };
const opponent: UserIdentity = { id: "opponent-id", nickname: "Opponent" };

function readyGame() {
  vi.spyOn(Math, "random").mockReturnValueOnce(0.1);
  const created = createGame(creator);
  const joined = joinGame(created.state, opponent);
  return { state: joined.state, blue: creator, red: opponent };
}

function forceThrow(randomValue: number) {
  vi.spyOn(Math, "random").mockReturnValueOnce(randomValue);
}

function throwAndMove(
  state: GameState,
  player: UserIdentity,
  randomValue: number,
  pieceId = 0,
) {
  forceThrow(randomValue);
  const thrown = performAction(state, player, { type: "throw" });
  return performAction(thrown, player, {
    type: "move",
    move: { pieceId, throwId: thrown.pendingThrows.at(-1)!.id },
  });
}

describe("yutnori game service", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts a room when the second player joins", () => {
    const { state } = readyGame();
    expect(state.status).toBe("playing");
    expect(state.turn).toBe("blue");
    expect(state.players.blue?.nickname).toBe("Creator");
    expect(state.players.red?.nickname).toBe("Opponent");
  });

  it("throws and moves a piece from home", () => {
    const game = readyGame();
    const state = throwAndMove(game.state, game.blue, 0.1);

    expect(state.pieces.blue[0].place).toBe("board");
    expect(state.pieces.blue[0].position).toBe(0);
    expect(state.turn).toBe("red");
    expect(state.moves[0].throwLabel).toBe("도");
  });

  it.each([
    { randomValue: 0.9, label: "윷" },
    { randomValue: 0.99, label: "모" },
  ])("keeps the turn and announces another throw on $label", ({ randomValue, label }) => {
    const game = readyGame();
    forceThrow(randomValue);
    const state = performAction(game.state, game.blue, { type: "throw" });

    expect(state.phase).toBe("throw");
    expect(state.pendingThrows).toHaveLength(1);
    expect(state.pendingThrows[0].label).toBe(label);
    expect(state.turn).toBe("blue");
    expect(state.notice).toContain("한 번 더");
  });

  it("captures opponent pieces and grants another throw", () => {
    const game = readyGame();
    let state = throwAndMove(game.state, game.blue, 0.1);
    state = throwAndMove(state, game.red, 0.1);

    expect(state.captures.red).toBe(1);
    expect(state.pieces.blue[0].place).toBe("home");
    expect(state.pieces.red[0].position).toBe(0);
    expect(state.turn).toBe("red");
    expect(state.phase).toBe("throw");
  });

  it("auto-passes backdo when no piece can move", () => {
    const game = readyGame();
    forceThrow(0.01);
    const state = performAction(game.state, game.blue, { type: "throw" });

    expect(state.turn).toBe("red");
    expect(state.phase).toBe("throw");
    expect(state.pendingThrows).toHaveLength(0);
  });

  it("finishes when all four pieces reach the end", () => {
    const game = readyGame();
    const almostDone: GameState = {
      ...game.state,
      pieces: {
        ...game.state.pieces,
        blue: [
          { id: 0, place: "board", position: 19, track: "main" },
          { id: 1, place: "finished", position: null, track: "main" },
          { id: 2, place: "finished", position: null, track: "main" },
          { id: 3, place: "finished", position: null, track: "main" },
        ],
      },
    };

    const state = throwAndMove(almostDone, game.blue, 0.1);

    expect(state.status).toBe("finished");
    expect(state.result?.winner).toBe("blue");
    expect(state.match.rounds.blue).toBe(1);
  });

  it("rejects moves out of turn", () => {
    const game = readyGame();
    expect(() => performAction(game.state, game.red, { type: "throw" })).toThrow(GameError);
  });
});
