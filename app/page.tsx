"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getIdentity, saveNickname } from "@/lib/identity";
import type { GameState, UserIdentity } from "@/lib/types";
import { sideLabel } from "@/lib/yut-rules";

function statusText(game: GameState) {
  if (game.status === "waiting") return "상대 대기 중";
  if (game.status === "playing") return `${sideLabel(game.turn)} 차례`;
  return game.result?.message || "종료";
}

function playerNames(game: GameState) {
  return `${game.players.blue?.nickname || "대기"} vs ${game.players.red?.nickname || "대기"}`;
}

export default function HomePage() {
  const router = useRouter();
  const [identity, setIdentity] = useState<UserIdentity | null>(null);
  const [nickname, setNickname] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [games, setGames] = useState<GameState[]>([]);
  const [lanOrigin, setLanOrigin] = useState("");
  const [showLanHint, setShowLanHint] = useState(false);
  const [storageWarning, setStorageWarning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const current = getIdentity();
    setIdentity(current);
    setNickname(current.nickname);
    setShowLanHint(["localhost", "127.0.0.1"].includes(window.location.hostname));

    void fetch(`/api/games?userId=${encodeURIComponent(current.id)}`)
      .then((response) => response.json())
      .then(setGames)
      .catch(() => undefined);

    void fetch("/api/network")
      .then((response) => response.json())
      .then((data: { origins?: string[]; persistent?: boolean; deployment?: boolean }) => {
        setLanOrigin(data.origins?.[0] || "");
        setStorageWarning(Boolean(data.deployment && !data.persistent));
      })
      .catch(() => undefined);
  }, []);

  function updateName(value: string) {
    setNickname(value);
    setIdentity(saveNickname(value));
  }

  async function createRoom() {
    if (!identity) return;
    setBusy(true);
    setError("");
    try {
      const current = saveNickname(nickname);
      const response = await fetch("/api/rooms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ identity: current }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      router.push(`/game/${data.roomId}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "방을 만들지 못했습니다.");
      setBusy(false);
    }
  }

  function joinRoom() {
    const code = inviteCode.trim().split("/").filter(Boolean).at(-1);
    if (!code) {
      setError("초대 코드나 링크를 입력해 주세요.");
      return;
    }
    saveNickname(nickname);
    router.push(`/game/${code}`);
  }

  return (
    <main className="home-shell">
      <nav className="topbar">
        <a className="brand" href="/">
          <span className="brand-mark">윷</span>
          <span>
            WEB YUTNORI <b>ARENA</b>
          </span>
        </a>
        <span className="live-pill">
          <i /> LINK MATCH
        </span>
      </nav>

      {lanOrigin && showLanHint && (
        <div className="lan-banner">
          <span>같은 Wi-Fi 접속 주소</span>
          <a href={lanOrigin}>{lanOrigin}</a>
        </div>
      )}
      {storageWarning && (
        <div className="storage-banner">
          Vercel 멀티플레이 방 상태를 안정적으로 유지하려면 Upstash Redis를 연결해 주세요.
        </div>
      )}

      <section className="home-stage">
        <div className="start-panel">
          <div className="panel-kicker">새 판 열기</div>
          <h1>초대 링크 하나로 바로 윷놀이</h1>
          <label>
            플레이어 이름
            <input
              value={nickname}
              onChange={(event) => updateName(event.target.value)}
              maxLength={18}
              placeholder="닉네임"
            />
          </label>
          <button className="primary-button" onClick={createRoom} disabled={busy || !identity}>
            <span>방 만들기</span>
            <b>+</b>
          </button>
          <div className="or-divider">
            <span>초대받았다면</span>
          </div>
          <div className="join-row">
            <input
              value={inviteCode}
              onChange={(event) => setInviteCode(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && joinRoom()}
              placeholder="초대 코드 또는 링크"
            />
            <button onClick={joinRoom}>입장</button>
          </div>
          {error && <button className="form-error" onClick={() => setError("")}>{error}</button>}
        </div>

        <div className="preview-board" aria-hidden="true">
          <div className="preview-grid">
            {Array.from({ length: 25 }, (_, index) => (
              <span key={index} className={index % 6 === 0 ? "big" : ""} />
            ))}
          </div>
          <div className="preview-token blue">2</div>
          <div className="preview-token red">1</div>
          <div className="preview-throw">
            <span />
            <span />
            <span className="back" />
            <span className="back" />
          </div>
        </div>
      </section>

      <section className="recent-section">
        <div className="section-heading">
          <div>
            <span className="panel-kicker">최근 방</span>
            <h2>이어하기</h2>
          </div>
          <span>{games.length ? `${games.length} rooms` : "기록 없음"}</span>
        </div>
        <div className="game-list">
          {games.map((game) => (
            <button key={game.roomId} className="game-card" onClick={() => router.push(`/game/${game.roomId}`)}>
              <span className={`status-dot ${game.status}`} />
              <span className="game-players">
                <b>{playerNames(game)}</b>
                <small>{game.roomId.toUpperCase()}</small>
              </span>
              <span className="game-status">{statusText(game)}</span>
              <span className="game-arrow">→</span>
            </button>
          ))}
          {!games.length && (
            <div className="empty-games">
              <b>아직 만든 방이 없습니다.</b>
              <p>방을 만들고 링크를 보내면 여기에서 다시 들어갈 수 있습니다.</p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
