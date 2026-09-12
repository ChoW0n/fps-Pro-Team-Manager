import type { Player } from './Player';

export interface CombatSkills {
  distancePreference: number;
  riskAwareness: number;
  firstShotAccuracy: number;
  recoilControl: number;
  reactionTime: number;
  utilityPrecision: number;
}

/** 기존 선수는 공개 능력치에서 기본값을 읽어 저장 데이터를 그대로 유지합니다. */
export function combatSkillsFor(player: Player): CombatSkills {
  const defaults: CombatSkills = {
    distancePreference: 100 - player.aggression,
    riskAwareness: (player.informationGathering + player.defensiveSetup) / 2,
    firstShotAccuracy: player.aim,
    recoilControl: player.mastery,
    reactionTime: (player.entry + player.informationGathering) / 2,
    utilityPrecision: (player.informationGathering + player.mastery) / 2,
  };
  return Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => {
    const value = player.combatSkills?.[key as keyof CombatSkills] ?? fallback;
    return [key, Math.max(0, Math.min(100, Number.isFinite(value) ? value : 50))];
  })) as unknown as CombatSkills;
}
