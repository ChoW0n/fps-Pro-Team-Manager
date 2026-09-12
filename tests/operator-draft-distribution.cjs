// 시즌 생성 난수를 고정하고 실제 기본 편성 400개 팀의 등장 분포를 검사합니다.
const assert=require('node:assert/strict'),fs=require('node:fs');
require('./qa-preparation-batch.cjs');
const {TeamGenerator}=require('../artifacts/draft-order-player-generator/src/domain/TeamGenerator.ts');
const {completeOperatorDraft}=require('../artifacts/draft-order-player-generator/src/domain/operatorDraft.ts');
const original=Math.random;let state=7129;const counts={};
/** 재현 가능한 테스트 난수이며 제품의 선수 능력치를 덮어쓰지 않습니다. */
function random(){state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;}
try{Math.random=random;for(let season=0;season<40;season++)for(const team of new TeamGenerator().generateTenTeams())for(const side of ['공격','수비']){
 const selection=completeOperatorDraft(team,side,[null,null,null,null,null]);assert.equal(new Set(selection).size,5);
 assert.deepEqual(completeOperatorDraft(team,side,selection),selection,'기존 확정/수동 편성 보존');
 for(const name of selection)counts[name]=(counts[name]??0)+1;
}}finally{Math.random=original;}
fs.writeFileSync('validation/operator-draft-distribution.json',JSON.stringify({teams:400,counts},null,2)+'\n');console.log(counts);
for(const name of ['MEDVED','SAVELLI'])assert((counts[name]??0)>=100,`${name}이 기본 편성의 25% 이상에서 선택 가능해야 합니다`);
