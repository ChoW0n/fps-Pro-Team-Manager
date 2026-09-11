import type { Player } from './Player';

export type PlayerTrait = 'self-assured' | 'methodical' | 'supportive' | 'adaptable';
export const TRAIT_DETAILS: Record<PlayerTrait, { name: string; description: string; risk: string }> = {
  'self-assured': { name: '자기 확신', description: '직접 본 약해진 상대에게 짧게 압박하며 준비된 진입 순서에서 벗어날 수 있습니다.', risk: '동료와 거리가 벌어지면 역습에 노출됩니다. 장치 운반·복귀 임무는 유지합니다.' },
  methodical: { name: '신중한 확인', description: '주변 적 단서가 있으면 낮은 자세로 이동해 소음을 줄이고 사격을 준비합니다.', risk: '정보가 있어도 진입 속도가 느려질 수 있습니다.' },
  supportive: { name: '동료 우선', description: '거점 임무가 없을 때 위험을 먼저 확인한 동료 근처로 접근해 지원 사선을 잡습니다.', risk: '혼자 반대편 공간을 차지하는 기회는 적습니다.' },
  adaptable: { name: '현장 적응', description: '연막과 엄폐 상황에 따라 보행·질주를 전환하며 맡은 경로를 이어갑니다.', risk: '개인 돌파보다 현재 확보한 길을 우선합니다.' },
};
/** 기존 저장 선수도 이름으로 안정적인 성향을 가지며 숨은 능력치를 공개하지 않습니다. */
export function playerTrait(player: Pick<Player, 'nickname' | 'realName'> & { behaviorTrait?: PlayerTrait }): PlayerTrait {
  if (player.behaviorTrait && player.behaviorTrait in TRAIT_DETAILS) return player.behaviorTrait;
  let hash = 2166136261;
  for (const letter of player.nickname + ':' + player.realName) hash = Math.imul(hash ^ letter.charCodeAt(0), 16777619);
  return (['self-assured', 'methodical', 'supportive', 'adaptable'] as const)[(hash >>> 0) % 4];
}
