/**
 * 챔피언 정적 데이터의 형식을 검증하는 모듈입니다.
 * 실행 중 데이터를 바꾸지 않고 문제 목록만 반환합니다.
 */

import type { Champion, EffectPrimitive, SkillKind } from './Champion';

// 허용된 프리미티브를 데이터 검증에 사용하는 목록입니다.
const EFFECT_PRIMITIVES: EffectPrimitive[] = ['FLASH', 'TREMOR', 'PILLAR', 'RIFT', 'WAVE', 'SHARD', 'BURST', 'SLASH', 'TRAIL', 'SPIRAL', 'RUNE', 'FLOAT'];
// 스킬 종류별 레이어 개수 경계값입니다.
const LAYER_LIMITS: Record<SkillKind, [number, number]> = { PASSIVE: [0, 2], BASIC: [3, 4], ULTIMATE: [7, 10] };

/** 검증에서 발견한 챔피언 데이터 한 건의 문제입니다. */
export interface ChampionValidationIssue {
  message: string;
}

/** 챔피언 목록의 요청된 스킬, 레이어, 상징색 규칙을 검사합니다. */
export function validateChampions(champions: Champion[]): ChampionValidationIssue[] {
  const issues: ChampionValidationIssue[] = [];
  if (champions.length !== 25) issues.push({ message: `챔피언 목록: 25종이어야 하나 ${champions.length}종입니다.` });

  const colorsByPosition = new Map<string, Set<string>>();
  champions.forEach((champion, championIndex) => {
    const label = `${championIndex + 1}번 ${champion.title}${champion.titleSeparator}${champion.name}`;
    if (!/^#[0-9a-fA-F]{6}$/.test(champion.symbolColor)) issues.push({ message: `${label} symbolColor: 유효한 #RRGGBB 형식이 아닙니다.` });
    const colors = colorsByPosition.get(champion.position) ?? new Set<string>();
    const normalizedColor = champion.symbolColor.toLowerCase();
    if (colors.has(normalizedColor)) issues.push({ message: `${label} symbolColor: ${champion.position} 포지션 안에서 상징색이 중복됩니다.` });
    colors.add(normalizedColor);
    colorsByPosition.set(champion.position, colors);

    const skillKeys = Object.keys(champion.skills ?? {}).sort();
    const expectedSkillKeys = ['basic', 'passive', 'ultimate'];
    if (
      skillKeys.length !== expectedSkillKeys.length
      || skillKeys.some((key, index) => key !== expectedSkillKeys[index])
    ) {
      issues.push({ message: `${label} skills: passive, basic, ultimate 세 종류만 있어야 합니다.` });
    }

    (['passive', 'basic', 'ultimate'] as const).forEach((skillKey) => {
      const expectedKind: SkillKind = skillKey.toUpperCase() as SkillKind;
      const skill = champion.skills?.[skillKey];
      if (!skill) {
        issues.push({ message: `${label} ${expectedKind} 스킬: 스킬이 없습니다.` });
        return;
      }
      const [minimum, maximum] = LAYER_LIMITS[expectedKind];
      if (skill.kind !== expectedKind) issues.push({ message: `${label} ${skillKey} kind: ${expectedKind}여야 합니다.` });
      if (skill.effectLayers.length < minimum || skill.effectLayers.length > maximum) issues.push({ message: `${label} ${skillKey} effectLayers: ${minimum}~${maximum}개여야 합니다.` });
      if (expectedKind === 'PASSIVE' && (skill.description.match(/[.]/g) ?? []).length !== 1 || expectedKind === 'PASSIVE' && !skill.description.endsWith('.')) {
        issues.push({ message: `${label} passive description: 마침표 하나로 끝나는 정확히 한 문장이어야 합니다.` });
      }
      skill.effectLayers.forEach((layer, layerIndex) => {
        const keys = Object.keys(layer).sort();
        const expectedKeys = ['durationMs', 'intensity', 'primitive', 'startMs'];
        if (keys.length !== expectedKeys.length || keys.some((key, index) => key !== expectedKeys[index])) issues.push({ message: `${label} ${skillKey} 레이어 ${layerIndex + 1}: primitive, startMs, durationMs, intensity 외 필드는 허용되지 않습니다.` });
        if (!EFFECT_PRIMITIVES.includes(layer.primitive)) issues.push({ message: `${label} ${skillKey} 레이어 ${layerIndex + 1} primitive: 허용되지 않은 값입니다.` });
        if (!Number.isInteger(layer.startMs) || layer.startMs < 0) issues.push({ message: `${label} ${skillKey} 레이어 ${layerIndex + 1} startMs: 0 이상 정수여야 합니다.` });
        if (!Number.isInteger(layer.durationMs) || layer.durationMs <= 0) issues.push({ message: `${label} ${skillKey} 레이어 ${layerIndex + 1} durationMs: 양의 정수여야 합니다.` });
        if (typeof layer.intensity !== 'number' || !Number.isFinite(layer.intensity) || layer.intensity <= 0) issues.push({ message: `${label} ${skillKey} 레이어 ${layerIndex + 1} intensity: 양의 숫자여야 합니다.` });
      });
    });
  });
  return issues;
}