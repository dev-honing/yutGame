# Web Yutnori Arena

초대 링크로 방을 만들고 두 명이 바로 들어와 즐기는 Next.js 윷놀이입니다.
참조 프로젝트인 `WebChess`와 같은 흐름으로 방 생성, 링크 입장, 서버 검증, 폴링 동기화,
로컬 메모리 저장소와 선택적 Upstash Redis 저장소를 사용합니다.

## 로컬 실행

```bash
npm install
npm run dev
```

- 같은 PC: `http://localhost:3000`
- 같은 Wi-Fi의 다른 기기: 화면에 표시되는 `http://192.168.x.x:3000`

## 배포

Vercel에 배포할 수 있습니다. 멀티플레이 방 상태를 안정적으로 유지하려면 Upstash Redis를 연결하고
아래 환경 변수를 설정하세요.

```text
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
```

기존 Vercel KV 형식인 `KV_REST_API_URL`, `KV_REST_API_TOKEN`도 인식합니다.

## 확인 명령

```bash
npm run typecheck
npm test
npm run build
```
