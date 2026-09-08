/**
 * 팀 진영에 따른 챔피언 상징색 보정 모듈입니다.
 * 게임 밸런스와 무관한 렌더링용 색 계산만 제공합니다.
 */

// 상징색의 개성을 보존하면서 진영 방향만 보이게 하는 선형 혼합 비율입니다.
const TEAM_GRADE_RATIO = 0.28;

// 진영 코드 타입입니다.
export type TeamSide = 'ALLY' | 'ENEMY';

/** 입력한 상징색을 진영의 차가운 청색 또는 붉은색 방향으로 보정합니다. */
export function applyTeamColorGrade(symbolColor: string, side: TeamSide): string {
  const matched = /^#([0-9a-fA-F]{6})$/.exec(symbolColor);
  if (!matched) return symbolColor;

  const source = matched[1];
  const red = Number.parseInt(source.slice(0, 2), 16);
  const green = Number.parseInt(source.slice(2, 4), 16);
  const blue = Number.parseInt(source.slice(4, 6), 16);
  const target = side === 'ALLY' ? [20, 190, 255] : [255, 55, 70];
  const mixed = [red, green, blue].map((value, index) =>
    Math.round(value * (1 - TEAM_GRADE_RATIO) + target[index] * TEAM_GRADE_RATIO),
  );

  return `#${mixed.map((value) => value.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}