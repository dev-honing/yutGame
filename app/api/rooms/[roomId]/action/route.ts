import { apiError, noStoreJson, parseIdentity } from "@/server/api-utils";
import { GameError, performAction, type GameAction } from "@/server/game-service";
import { getRoom, saveRoom } from "@/server/room-store";
import type { MoveRequest } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ActionBody = {
  identity?: unknown;
  action?: GameAction["type"];
  move?: MoveRequest;
  throwId?: string;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ roomId: string }> },
) {
  try {
    const { roomId } = await context.params;
    const body = (await request.json()) as ActionBody;
    const identity = parseIdentity(body.identity);
    const room = await getRoom(roomId);
    if (!room) throw new GameError("ROOM_NOT_FOUND", "게임 방을 찾을 수 없습니다.");
    if (!body.action) throw new GameError("INVALID_ACTION", "게임 동작이 지정되지 않았습니다.");

    const action: GameAction =
      body.action === "move"
        ? { type: "move", move: requireMove(body.move) }
        : body.action === "pass"
          ? { type: "pass", throwId: requireThrowId(body.throwId) }
          : { type: body.action };

    const state = performAction(room, identity, action);
    await saveRoom(state);
    return noStoreJson(state);
  } catch (error) {
    return apiError(error);
  }
}

function requireMove(move: MoveRequest | undefined) {
  if (!move) throw new GameError("INVALID_MOVE", "말 이동 정보가 없습니다.");
  return move;
}

function requireThrowId(throwId: string | undefined) {
  if (!throwId) throw new GameError("INVALID_THROW", "윷 결과 정보가 없습니다.");
  return throwId;
}
