"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getIdentity } from "@/lib/identity";
import type {
  GameState,
  JoinRoomResponse,
  MoveRequest,
  PlayerSide,
  ServerError,
  ThrowRecord,
  ThrowZone,
  UserIdentity,
  YutPiece,
} from "@/lib/types";
import { THROW_ODDS } from "@/lib/throw-rules";
import { ThrowThreeScene } from "./throw-three-scene";
import {
  BOARD_CONNECTIONS,
  BOARD_POSITIONS,
  formatThrowSteps,
  getAllLegalMoves,
  locationText,
  sideLabel,
} from "@/lib/yut-rules";

type ActionName = "throw" | "move" | "pass" | "resign" | "rematch";

interface ThrowMotion {
  key: string;
  zone: ThrowZone;
  record: ThrowRecord | null;
  side: PlayerSide;
}

function oddsLabel(value: number) {
  return `${value * 100}%`;
}

function resultTitle(state: GameState, side: PlayerSide | null) {
  if (!state.result) return "";
  if (!side) return `${sideLabel(state.result.winner)} 승리`;
  return state.result.winner === side ? "승리" : "패배";
}

function throwTone(record: ThrowRecord) {
  if (record.name === "yut" || record.name === "mo") return "bonus";
  if (record.name === "backdo") return "backdo";
  return "";
}

export default function GamePage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = use(params);
  const identityRef = useRef<UserIdentity | null>(null);
  const historyRef = useRef<HTMLDivElement | null>(null);
  const seenThrowIdRef = useRef<string | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [side, setSide] = useState<PlayerSide | null>(null);
  const [selectedPieceId, setSelectedPieceId] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState(false);
  const [lanOrigin, setLanOrigin] = useState("");
  const [throwZone, setThrowZone] = useState<ThrowZone>("inside");
  const [isThrowing, setIsThrowing] = useState(false);
  const [throwMotion, setThrowMotion] = useState<ThrowMotion | null>(null);
  const [bonusEffect, setBonusEffect] = useState<{
    record: ThrowRecord;
    side: PlayerSide;
  } | null>(null);

  useEffect(() => {
    let disposed = false;
    let pollTimer: ReturnType<typeof setInterval> | undefined;

    async function joinRoom() {
      try {
        const identity = getIdentity();
        identityRef.current = identity;
        const response = await fetch(`/api/rooms/${roomId}/join`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ identity }),
        });
        const data = (await response.json()) as JoinRoomResponse | ServerError;
        if (!response.ok) throw new Error((data as ServerError).message);
        if (disposed) return;
        const joined = data as JoinRoomResponse;
        seenThrowIdRef.current = joined.state.lastThrow?.id || null;
        setSide(joined.playerSide);
        setState(joined.state);
        setNotice("");
        pollTimer = setInterval(() => {
          void fetch(`/api/rooms/${roomId}`, { cache: "no-store" })
            .then(async (pollResponse) => {
              const next = (await pollResponse.json()) as GameState | ServerError;
              if (!pollResponse.ok) throw new Error((next as ServerError).message);
              if (!disposed) setState(next as GameState);
            })
            .catch(() => undefined);
        }, 700);
      } catch (error) {
        if (!disposed) setNotice(error instanceof Error ? error.message : "방에 입장하지 못했습니다.");
      }
    }

    void joinRoom();
    return () => {
      disposed = true;
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [roomId]);

  useEffect(() => {
    void fetch("/api/network")
      .then((response) => response.json())
      .then((data: { origins?: string[] }) => setLanOrigin(data.origins?.[0] || ""))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const list = historyRef.current;
    if (list) list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
  }, [state?.moves.length]);

  useEffect(() => {
    const record = state?.lastThrow;
    if (!record) {
      seenThrowIdRef.current = null;
      return;
    }
    if (seenThrowIdRef.current === record.id) return;

    seenThrowIdRef.current = record.id;
    const throwingSide = record.side || state?.turn || "blue";
    setThrowMotion((current) => ({
      key: current && !current.record && current.side === throwingSide ? current.key : record.id,
      zone: record.zone || "inside",
      record,
      side: throwingSide,
    }));

    const motionTimer = setTimeout(() => {
      setThrowMotion((current) => current?.record?.id === record.id ? null : current);
    }, 4400);
    const bonusTimer = record.extraTurn
      ? setTimeout(() => setBonusEffect({ record, side: throwingSide }), 4100)
      : undefined;

    return () => {
      clearTimeout(motionTimer);
      if (bonusTimer) clearTimeout(bonusTimer);
    };
  }, [state?.lastThrow?.id]);

  useEffect(() => {
    if (!bonusEffect) return;
    const timer = setTimeout(() => setBonusEffect(null), 2300);
    return () => clearTimeout(timer);
  }, [bonusEffect]);

  const pendingKey = state?.pendingThrows.map((record) => record.id).join("|") || "";
  useEffect(() => {
    if (!state?.pendingThrows.length) {
      setSelectedPieceId(null);
    }
  }, [pendingKey, state]);

  const legalMoves = useMemo(() => {
    if (!state) return [];
    return getAllLegalMoves(state, state.turn);
  }, [state]);

  const selectedOptions = useMemo(
    () => legalMoves.filter((move) => move.pieceId === selectedPieceId),
    [legalMoves, selectedPieceId],
  );

  const isMyTurn = Boolean(state && side && state.turn === side && state.status === "playing");
  const canMove = Boolean(isMyTurn && state?.phase === "move");
  const canThrow = Boolean(isMyTurn && state?.phase === "throw");
  const passThrow = state?.pendingThrows[0] || null;
  const canPass = Boolean(canMove && passThrow && legalMoves.length === 0);
  const hasBonusThrow = Boolean(canThrow && state?.lastThrow?.extraTurn);
  const throwLocked = isThrowing || Boolean(throwMotion);

  const requestAction = useCallback(
    async (action: ActionName, payload: Record<string, unknown> = {}) => {
      if (!identityRef.current) return;
      try {
        const response = await fetch(`/api/rooms/${roomId}/action`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ identity: identityRef.current, action, ...payload }),
        });
        const data = (await response.json()) as GameState | ServerError;
        if (!response.ok) throw new Error((data as ServerError).message);
        const nextState = data as GameState;
        setState(nextState);
        setNotice("");
        return nextState;
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "요청을 처리하지 못했습니다.");
        return null;
      }
    },
    [roomId],
  );

  async function handleThrow() {
    if (!canThrow || !side || throwLocked) return;

    setIsThrowing(true);
    setThrowMotion({
      key: `pending-${Date.now()}`,
      zone: throwZone,
      record: null,
      side,
    });
    const nextState = await requestAction("throw", { throwZone });
    if (!nextState) setThrowMotion(null);
    setIsThrowing(false);
  }

  function selectPiece(pieceId: number) {
    if (!canMove) return;
    setSelectedPieceId(pieceId);
  }

  function sendMove(move: { pieceId: number; throwId: string; routeChoice?: MoveRequest["routeChoice"] }) {
    void requestAction("move", {
      move: {
        pieceId: move.pieceId,
        throwId: move.throwId,
        routeChoice: move.routeChoice,
      },
    });
    setSelectedPieceId(null);
  }

  function handleBoardPoint(positionId: number) {
    const destination = selectedOptions.find(
      (option) => option.to.place === "board" && option.to.position === positionId,
    );
    if (destination) {
      sendMove(destination);
      return;
    }

    if (!state || !side || !canMove) return;
    const ownPiece = state.pieces[side].find(
      (piece) => piece.place === "board" && piece.position === positionId,
    );
    if (ownPiece) selectPiece(ownPiece.id);
  }

  async function copyInvite() {
    const localHost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
    const origin = localHost && lanOrigin ? lanOrigin : window.location.origin;
    await navigator.clipboard.writeText(`${origin}/game/${roomId}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  if (!state) {
    return (
      <main className="loading-screen">
        <span className="brand-mark">윷</span>
        <p>{notice || "방에 연결하는 중..."}</p>
        {notice && <a href="/">메인으로 돌아가기</a>}
      </main>
    );
  }

  const offBoardOptions = selectedOptions.filter((option) => option.to.place !== "board");
  const pendingThrowById = new Map(state.pendingThrows.map((record) => [record.id, record]));
  const turnLabel = state.status === "playing" ? `${sideLabel(state.turn)} 차례` : "판 종료";

  return (
    <main className="game-shell">
      <nav className="game-nav">
        <a className="brand" href="/">
          <span className="brand-mark">윷</span>
          <span>
            WEB YUTNORI <b>ARENA</b>
          </span>
        </a>
        <div className="room-code">
          <span>ROOM</span>
          <b>{roomId.toUpperCase()}</b>
        </div>
        <button className="copy-button" onClick={copyInvite}>
          {copied ? "복사 완료" : "초대 링크"}
        </button>
      </nav>

      {bonusEffect && (
        <BonusThrowEffect
          key={bonusEffect.record.id}
          record={bonusEffect.record}
          side={bonusEffect.side}
        />
      )}

      {throwMotion && <ThrowMotionEffect key={throwMotion.key} motion={throwMotion} />}

      <div className="game-layout">
        <section className="board-column">
          <div className="players-row">
            <PlayerStatus state={state} side="blue" me={side === "blue"} />
            <PlayerStatus state={state} side="red" me={side === "red"} />
          </div>

          <div className="play-surface">
            <Yard
              gameSide="blue"
              state={state}
              selectedPieceId={selectedPieceId}
              canSelect={canMove && side === "blue"}
              onSelect={selectPiece}
            />
            <div className="yut-board" aria-label="윷판">
              <svg className="board-lines" viewBox="0 0 100 100" aria-hidden="true">
                {BOARD_CONNECTIONS.map(([from, to]) => {
                  const start = BOARD_POSITIONS.find((position) => position.id === from)!;
                  const end = BOARD_POSITIONS.find((position) => position.id === to)!;
                  return (
                    <line
                      key={`${from}-${to}`}
                      x1={start.x}
                      y1={start.y}
                      x2={end.x}
                      y2={end.y}
                    />
                  );
                })}
              </svg>
              {BOARD_POSITIONS.map((position) => {
                const pointLabel = position.id === 19 ? position.label : "";
                const bluePieces = state.pieces.blue.filter(
                  (piece) => piece.place === "board" && piece.position === position.id,
                );
                const redPieces = state.pieces.red.filter(
                  (piece) => piece.place === "board" && piece.position === position.id,
                );
                const legalOptions = selectedOptions.filter(
                  (option) => option.to.place === "board" && option.to.position === position.id,
                );
                const moveLabels = Array.from(
                  new Set(
                    legalOptions
                      .map((option) => pendingThrowById.get(option.throwId)?.label)
                      .filter((label): label is string => Boolean(label)),
                  ),
                );
                const selectedHere = side
                  ? state.pieces[side].some(
                      (piece) =>
                        piece.id === selectedPieceId &&
                        piece.place === "board" &&
                        piece.position === position.id,
                    )
                  : false;
                return (
                  <button
                    key={position.id}
                    className={[
                      "board-point",
                      position.role || "",
                      legalOptions.length ? "legal" : "",
                      selectedHere ? "selected" : "",
                    ].join(" ")}
                    style={{ left: `${position.x}%`, top: `${position.y}%` }}
                    onClick={() => handleBoardPoint(position.id)}
                    title={position.label}
                  >
                    {pointLabel && <span className="point-label">{pointLabel}</span>}
                    {moveLabels.length > 0 && (
                      <span className="move-choice-label">{moveLabels.join(" / ")}</span>
                    )}
                    {bluePieces.length > 0 && <PieceStack side="blue" pieces={bluePieces} />}
                    {redPieces.length > 0 && <PieceStack side="red" pieces={redPieces} />}
                  </button>
                );
              })}

              {state.status === "waiting" && (
                <div className="board-overlay">
                  <span className="overlay-mark">윷</span>
                  <h2>상대를 기다리는 중</h2>
                  <p>초대 링크를 보내면 바로 같은 방에 들어올 수 있습니다.</p>
                  <button onClick={copyInvite}>{copied ? "복사 완료" : "초대 링크 복사"}</button>
                </div>
              )}

              {state.result && (
                <div className="board-overlay result-overlay">
                  <span className="result-kicker">{sideLabel(state.result.winner)} 승리</span>
                  <h2>{resultTitle(state, side)}</h2>
                  <p>{state.result.message}</p>
                  <div className="result-actions">
                    <button onClick={() => void requestAction("rematch")}>다시 한 판</button>
                    <a href="/">새 방 만들기</a>
                  </div>
                </div>
              )}
            </div>
            <Yard
              gameSide="red"
              state={state}
              selectedPieceId={selectedPieceId}
              canSelect={canMove && side === "red"}
              onSelect={selectPiece}
            />
          </div>
        </section>

        <aside className="control-panel">
          <div className="panel-status">
            <span className={`status-dot ${state.status}`} />
            <div>
              <small>{state.status === "waiting" ? "WAITING ROOM" : state.status === "finished" ? "COMPLETE" : "LIVE"}</small>
              <b>{state.status === "playing" ? turnLabel : state.result?.message || "상대 대기 중"}</b>
            </div>
          </div>

          <div className="score-strip">
            <div className={side === "blue" ? "mine" : ""}>
              <small>청</small>
              <b>{state.match.rounds.blue}승</b>
              <span>{state.captures.blue}잡음</span>
            </div>
            <div className={side === "red" ? "mine" : ""}>
              <small>홍</small>
              <b>{state.match.rounds.red}승</b>
              <span>{state.captures.red}잡음</span>
            </div>
          </div>

          <div className="throw-zone-picker" role="radiogroup" aria-label="윷 던질 위치">
            <button
              type="button"
              className={throwZone === "inside" ? "selected" : ""}
              role="radio"
              aria-checked={throwZone === "inside"}
              disabled={!canThrow || throwLocked}
              onClick={() => setThrowZone("inside")}
            >
              <b>판 안</b>
              <small>낙 없음 · 윷·모 각 {oddsLabel(THROW_ODDS.inside.yut)}</small>
            </button>
            <button
              type="button"
              className={`outside ${throwZone === "outside" ? "selected" : ""}`}
              role="radio"
              aria-checked={throwZone === "outside"}
              disabled={!canThrow || throwLocked}
              onClick={() => setThrowZone("outside")}
            >
              <b>판 밖</b>
              <small>윷·모 각 {oddsLabel(THROW_ODDS.outside.yut)} · 낙 {oddsLabel(THROW_ODDS.outside.nak)}</small>
            </button>
          </div>

          <button
            className="throw-button"
            onClick={() => void handleThrow()}
            disabled={!canThrow || throwLocked}
            aria-busy={throwLocked}
          >
            <span>
              {throwLocked
                ? isThrowing ? "윷이 날아가는 중" : "결과 확인 중"
                : hasBonusThrow
                  ? `한 번 더 · ${throwZone === "outside" ? "판 밖" : "판 안"}`
                  : `${throwZone === "outside" ? "판 밖으로" : "판 안으로"} 던지기`}
            </span>
            <b>{throwLocked ? "THROW" : hasBonusThrow ? "BONUS" : canThrow ? "READY" : state.phase === "move" ? "MOVE" : "WAIT"}</b>
          </button>

          <div className="throw-list">
            {state.pendingThrows.map((record) => (
              <div
                key={record.id}
                className={`throw-chip ${throwTone(record)}`}
              >
                <ThrowSticks record={record} />
                <span>
                  <b>{record.label}</b>
                  <small>
                    {formatThrowSteps(record.steps)}{record.extraTurn ? " · 한 번 더" : ""}
                  </small>
                </span>
              </div>
            ))}
            {!state.pendingThrows.length && (
              <div className="empty-throws">
                {state.lastThrow ? `${state.lastThrow.label} 처리 완료` : "던진 윷이 없습니다."}
              </div>
            )}
          </div>

          <div className="move-helper">
            <small>이동</small>
            {canMove ? (
              selectedPieceId === null ? (
                <b>움직일 말을 선택하세요.</b>
              ) : selectedOptions.length ? (
                <b>결과가 표시된 칸을 눌러 이동하세요.</b>
              ) : (
                <b>이 윷으로 움직일 수 없습니다.</b>
              )
            ) : (
              <b>{canThrow ? "윷을 던질 차례입니다." : "상대 차례를 기다리는 중입니다."}</b>
            )}
            {offBoardOptions.length > 0 && (
              <div className="offboard-actions">
                {offBoardOptions.map((option) => {
                  const throwLabel = pendingThrowById.get(option.throwId)?.label;
                  return (
                    <button
                      key={`${option.pieceId}-${option.throwId}-${option.routeChoice || "main"}-${option.to.place}`}
                      onClick={() => sendMove(option)}
                    >
                      {throwLabel ? `${throwLabel} · ` : ""}
                      {option.to.place === "finished" ? "말 내기" : "대기로 물리기"}
                    </button>
                  );
                })}
              </div>
            )}
            {canPass && passThrow && (
              <button className="pass-button" onClick={() => void requestAction("pass", { throwId: passThrow.id })}>
                움직일 말 없음
              </button>
            )}
          </div>

          {notice && (
            <button className="notice" onClick={() => setNotice("")}>
              {notice}
              <span>×</span>
            </button>
          )}
          {state.notice && <p className="server-notice">{state.notice}</p>}

          <div className="history-heading">
            <span>기록</span>
            <small>{state.moves.length} moves</small>
          </div>
          <div className="move-history" ref={historyRef}>
            {state.moves.map((move) => (
              <div className="history-row" key={move.id}>
                <span>{move.turnNumber}</span>
                <b>{sideLabel(move.side)} {move.throwLabel}</b>
                <small>{locationText(move.from)} → {locationText(move.to)}</small>
              </div>
            ))}
            {!state.moves.length && <p className="no-moves">첫 윷을 기다리고 있습니다.</p>}
          </div>

          <div className="game-actions">
            {state.status === "finished" ? (
              <button onClick={() => void requestAction("rematch")}>다시 한 판</button>
            ) : (
              <button
                className="danger-action"
                disabled={state.status !== "playing" || !side}
                onClick={() => window.confirm("정말 기권하시겠습니까?") && void requestAction("resign")}
              >
                기권
              </button>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}

function BonusThrowEffect({ record, side }: { record: ThrowRecord; side: PlayerSide }) {
  return (
    <div className={`bonus-effect ${side}`} role="status" aria-live="assertive">
      <span className="bonus-particles" aria-hidden="true">
        {Array.from({ length: 10 }, (_, index) => <i key={index} />)}
      </span>
      <span className="bonus-message">
        <small>{sideLabel(side)} 결과</small>
        <strong>{record.label}!</strong>
        <b>한 번 더</b>
      </span>
    </div>
  );
}

function ThrowMotionEffect({ motion }: { motion: ThrowMotion }) {
  const record = motion.record;
  const resultDetail = record
    ? record.name === "nak"
      ? "이번 던지기 무효"
      : record.extraTurn
        ? "한 번 더"
        : formatThrowSteps(record.steps)
    : "";

  return (
    <div
      className={`throw-motion-effect ${motion.zone} ${record ? "settled" : "in-flight"} ${record?.name === "nak" ? "nak" : ""}`}
      role="status"
      aria-live="assertive"
    >
      <ThrowThreeScene motionId={motion.key} zone={motion.zone} record={record} />
      <div className="throw-motion-stage">
        <span className="throw-motion-zone">
          {sideLabel(motion.side)} · {motion.zone === "outside" ? "판 밖 승부" : "판 안 투척"}
        </span>
        {record && (
          <span className="throw-motion-result">
            <strong>{record.label}!</strong>
            <b>{resultDetail}</b>
          </span>
        )}
      </div>
    </div>
  );
}

function PlayerStatus({
  state,
  side,
  me,
}: {
  state: GameState;
  side: PlayerSide;
  me: boolean;
}) {
  const player = state.players[side];
  const active = state.status === "playing" && state.turn === side;
  return (
    <div className={`player-status ${side} ${active ? "active" : ""} ${me ? "me" : ""}`}>
      <span className="player-token">{sideLabel(side)}</span>
      <div>
        <b>{player?.nickname || "대기 중"}</b>
        <small>{me ? "나" : player?.connected ? "접속" : "빈 자리"}</small>
      </div>
      {active && <i>TURN</i>}
    </div>
  );
}

function Yard({
  gameSide,
  state,
  selectedPieceId,
  canSelect,
  onSelect,
}: {
  gameSide: PlayerSide;
  state: GameState;
  selectedPieceId: number | null;
  canSelect: boolean;
  onSelect: (pieceId: number) => void;
}) {
  const pieces = state.pieces[gameSide];
  const homePieces = pieces.filter((piece) => piece.place === "home");
  const finished = pieces.filter((piece) => piece.place === "finished").length;

  return (
    <div className={`yard ${gameSide}`}>
      <div>
        <small>{sideLabel(gameSide)} 대기</small>
        <b>{homePieces.length}</b>
      </div>
      <div className="yard-pieces">
        {homePieces.map((piece) => (
          <button
            key={piece.id}
            className={`yard-piece ${selectedPieceId === piece.id && canSelect ? "selected" : ""}`}
            onClick={() => onSelect(piece.id)}
            disabled={!canSelect}
          >
            {piece.id + 1}
          </button>
        ))}
        {!homePieces.length && <span className="yard-empty">비었음</span>}
      </div>
      <div>
        <small>도착</small>
        <b>{finished}</b>
      </div>
    </div>
  );
}

function PieceStack({ side, pieces }: { side: PlayerSide; pieces: YutPiece[] }) {
  return (
    <span className={`piece-stack ${side}`}>
      <b>{pieces.length}</b>
    </span>
  );
}

function ThrowSticks({ record }: { record: ThrowRecord }) {
  return (
    <span className="throw-sticks" aria-hidden="true">
      {record.sticks.map((face, index) => (
        <i key={`${record.id}-${index}`} className={face} />
      ))}
    </span>
  );
}
