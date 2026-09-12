const fs=require('node:fs'),assert=require('node:assert/strict');
const prep=fs.readFileSync('artifacts/draft-order-player-generator/src/components/OperatorPreparation.tsx','utf8');
const live=fs.readFileSync('artifacts/draft-order-player-generator/src/components/TacticalRoundLive.tsx','utf8');
for(const text of ['방향','교전 태도','정보 우선순위','전술 라인업','선수에게 오퍼레이터를 고정하지 않고','이 작전으로 출전'])assert(prep.includes(text),text);
for(const removed of ['선발조 배정','분산 진입','거점 마지막 진입','조준 {','숙련 {','공격성 {','command-lineup','command-picks'])assert(!prep.includes(removed),removed);
for(const removed of ['director-controls','진입</button>','후퇴</button>','경로 변경','TacticalDirectorCommand'])assert(!live.includes(removed),removed);
fs.writeFileSync('validation/preparation-ui-contract.json',JSON.stringify({axes:4,manualLineup:'team lineup with role-fit assignment',liveDirectorCommands:false,removed:['선수별 수치','선수별 오퍼레이터 강제','별동조','사이트 마지막 진입','경기 중 전술 지시']},null,2)+'\n');console.log('PASS 준비 네 축과 관전 전용 중계 계약');
