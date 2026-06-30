# ShortsAI 편집실 개선 계획

## 목표
렌더링 전에 최종 결과물과 동일한 미리보기를 제공하고, 타임라인을 통해 자막·SFX·텍스트 오버레이를 직관적으로 편집할 수 있게 한다.

---

## Phase 1 — 백엔드: 자막 항목 API + TextOverlay 위치 지원

### 1-1. 자막 항목 API 추가
- **파일**: `aws/backend/app/routers/shorts.py` (또는 render.py)
- **엔드포인트**: `GET /api/subtitle-entries/{stem}`
- **동작**: `analysis/{stem}.json`의 `raw_segments`와 `transcript`를 교차해 `[(start, end, text), ...]` 반환
- **목적**: 프론트 캔버스가 현재 재생 시간에 맞는 실제 자막을 표시하는 데 사용

### 1-2. TextOverlay x/y 위치 필드 추가
- **파일**: `aws/backend/app/models/schemas.py`
  - `TextOverlayEntry`에 `x_pct: float = 0.5`, `y_pct: float = 0.5` 추가
- **파일**: `aws/backend/app/services/editor_base.py`
  - `_build_text_overlay_filters`: `x_pct * CANVAS_W`, `y_pct * CANVAS_H` 위치에 텍스트 렌더링
  - 현재 고정값 `y_pos = VIDEO_Y + VIDEO_H * 0.12` 대신 x_pct/y_pct 사용

---

## Phase 2 — 프론트엔드: 캔버스 미리보기 = 최종 렌더 수준

### 2-1. 실제 자막 캔버스 표시
- **파일**: `aws/frontend/src/components/ShortsPanel.tsx`
- `subEntries` 상태 추가 (API에서 받은 자막 배열)
- raw 선택 시 `GET /api/subtitle-entries/{stem}` 호출
- canvas draw loop: `vid.currentTime` 기준 활성 자막 찾아 현재 자막 스타일(색상·폰트·크기)로 표시
- 효과: "자막 샘플" → 실제 자막 텍스트

### 2-2. 텍스트 오버레이 캔버스 표시
- `TextOverlay` 인터페이스에 `x_pct: number`, `y_pct: number` 추가
- canvas draw loop: 현재 시간에 활성화된 text_overlays를 `x_pct * CV_W`, `y_pct * CV_H` 위치에 표시

### 2-3. 텍스트 오버레이 드래그 앤 드롭 (캔버스)
- canvas에 `onMouseDown`, `onMouseMove`, `onMouseUp` 핸들러 추가
- 클릭 시 해당 위치의 텍스트 오버레이 찾기 (히트 테스트)
- 드래그로 `x_pct`, `y_pct` 업데이트
- 드래그 중 cursor: 'grab' / 'grabbing' 표시

### 2-4. 훅 표시 개선
- 훅 재생 중 캔버스 왼쪽 하단에 "HOOK" 배지 오버레이 표시
- 훅이 끝나고 본편으로 전환될 때 flash 효과 (0.3초)

---

## Phase 3 — 프론트엔드: 타임라인 개선

### 3-1. 타임라인 위치: 캔버스 하단으로 이동
- 현재: 오른쪽 컨트롤 영역 하단
- 변경: 캔버스 패널(왼쪽) 하단에 고정
- 캔버스 + 타임라인이 하나의 세로 컬럼을 구성

### 3-2. 타임라인 트랙 추가
기존 SFX + 텍스트 트랙에 추가:
- **훅 트랙**: `use_hook=true`이면 타임라인 맨 앞에 훅 구간 블록 표시 (회색/보라색)
- **자막 트랙**: 자막 항목을 시간 블록으로 표시 (녹색). 클릭 시 해당 구간으로 시크

### 3-3. 현재 시간의 자막 표시
- 타임라인 헤더에 현재 시간의 자막 텍스트 실시간 표시
- 예: `▶ 0.0s | "오늘 주식시장은 상승세를"`

### 3-4. SFX 마커 캔버스 표시
- SFX가 재생될 시간에 캔버스 우측 상단에 ♪ 아이콘 0.5초간 표시

---

## Phase 4 — CLAUDE.md 업데이트

- 새로 추가된 `/api/subtitle-entries/{stem}` 엔드포인트 문서화
- `TextOverlayEntry.x_pct / y_pct` 필드 설명 추가

---

## 우선순위 및 구현 순서

| 순서 | 작업 | 중요도 |
|------|------|--------|
| 1 | 백엔드: subtitle-entries API | 필수 |
| 2 | 백엔드: TextOverlay x/y | 필수 |
| 3 | 프론트: 캔버스 실제 자막 | 필수 |
| 4 | 프론트: 타임라인 → 캔버스 하단 이동 | 필수 |
| 5 | 프론트: 타임라인 자막 트랙 + 현재 자막 표시 | 필수 |
| 6 | 프론트: 훅 타임라인 블록 표시 | 필수 |
| 7 | 프론트: 캔버스 텍스트 오버레이 표시 + 드래그 | 중요 |
| 8 | 프론트: 훅 HOOK 배지 표시 | 선택 |
| 9 | CLAUDE.md 업데이트 | 선택 |
