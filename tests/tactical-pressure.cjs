// 전술 인지·압박·차폐·분산 진입의 실제 엔진 계약을 검사합니다.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,resolveJsonModule:true}}).outputText,file);
const root='../artifacts/draft-order-player-generator/src/domain/';
const {TacticalRealtimeSimulation}=require(root+'realtime/TacticalRealtimeSimulation.ts');
const {recognitionSeconds}=require(root+'realtime/perception.ts');
const {weaponHandling,shotCone,estimatedShotQuality}=require(root+'realtime/weaponHandling.ts');
const {battlefieldMap}=require(root+'realtime/fortifications.ts');
const {breachWalls}=require(root+'realtime/breachGeometry.ts');
const {combatSkillsFor}=require(root+'combatSkills.ts');
const {OPERATORS}=require(root+'Operator.ts'),{Player}=require(root+'Player.ts'),{BREACHLINE_MAP:map}=require(root+'tacticalMaps.ts');
const results=[];
function check(name,fn){try{fn();results.push({name,pass:true});console.log('PASS',name);}catch(error){results.push({name,pass:false,error:error.message});console.error('FAIL',name,error.message);}}
function team(side,count=5){return OPERATORS.filter(operator=>operator.side===side).slice(0,count).map((operator,index)=>({operator,side,teamName:side,player:new Player('선수'+index,'선수'+index,operator.role,20,60,70,70,70,70,OPERATORS,20,55,40,65,70,70,70)}));}
const engine=new TacticalRealtimeSimulation(),original=JSON.stringify(map);
check('거리·부분 노출이 인지 시간을 늘리고 숙련된 관측이 줄임',()=>{
  assert(recognitionSeconds(30,1,60)>recognitionSeconds(10,1,60));
  assert(recognitionSeconds(30,.5,60)>recognitionSeconds(30,1,60));
  assert(recognitionSeconds(30,1,90)<recognitionSeconds(30,1,30));
});
check('예상 사격 효율은 거리·총기·제어에 연속적으로 반응하며 15m 절벽 없음',()=>{
  const smg=weaponHandling('MP5SD'),dmr=weaponHandling('HK417');
  const quality=(profile,metres,control)=>estimatedShotQuality(metres*40,shotCone(profile,control,0,1),1);
  assert(quality(smg,30,.9)<quality(dmr,30,.9));
  assert(quality(smg,30,.9)>0);
  assert(Math.abs(quality(smg,15,.7)-quality(smg,15.01,.7))<.01);
});
check('이전 선수 데이터 호환·개별 제어값과 숨은 평정심 분리',()=>{
  const player=team('공격',1)[0].player,legacy=combatSkillsFor(player);
  assert.equal(legacy.firstShotAccuracy,player.aim);assert(!('composure' in legacy));
  player.combatSkills={recoilControl:95,distancePreference:20};
  assert.equal(combatSkillsFor(player).recoilControl,95);assert.equal(combatSkillsFor(player).firstShotAccuracy,player.aim);
});
check('다섯 스폰의 5인 배치·엄폐 후 실제 입구까지 통행',()=>{
  for(let entryRoute=0;entryRoute<5;entryRoute++){
    const input={attackers:team('공격'),defenders:team('수비',1),seed:41,maxSeconds:2,scoutPlan:{indices:[],seconds:25,entryRoute}};
    const snapshot=engine.createSession(input).step().snapshot,nodes=engine.buildNavigationNodes(map);
    for(const unit of snapshot.units.filter(unit=>unit.side==='공격')){
      assert(engine.canStand(unit.position,map),'스폰 충돌 '+entryRoute);
      assert(engine.findPath(unit.position,map.attackerRoutes[entryRoute].points[2],map,nodes).length,'입구 통행 '+entryRoute);
    }
  }
});
check('분산 3+2는 실제 서로 다른 경로에서 출발하고 중복 경로는 거절',()=>{
  const input={attackers:team('공격'),defenders:team('수비',1),seed:41,maxSeconds:2,scoutPlan:{indices:[],seconds:25,entryRoute:0,secondaryRoute:2,secondaryIndices:[3,4]}};
  const snapshot=engine.createSession(input).step().snapshot;
  assert.deepEqual(snapshot.units.slice(0,5).map(unit=>unit.routeIndex),[0,0,0,2,2]);
  assert(snapshot.units[0].position.y<300&&snapshot.units[4].position.y>2100);
  assert.throws(()=>engine.run({...input,scoutPlan:{...input.scoutPlan,secondaryRoute:0}}),/분산/);
});
check('분산 선발조도 각 진입로로 복귀·합류한 뒤 함께 재진입',()=>{
  // 닫힌 외곽 검사실의 수비는 수색 복귀 전에 교전으로 라운드를 끝내지 않습니다.
  const box=[[3400,2140,3580,2140],[3580,2140,3580,2360],[3580,2360,3400,2360],[3400,2360,3400,2140]].map(([x,y,tx,ty],i)=>({id:'quiet-'+i,kind:'wall',from:{x,y},to:{x:tx,y:ty}}));
  const quietMap={...map,walls:[...map.walls,...box],defenderSetups:[{id:'far',label:'먼 수비',position:{x:3500,y:2280},fallback:{x:3500,y:2200}}]};
  const result=engine.run({attackers:team('공격'),defenders:team('수비',1),map:quietMap,seed:41,maxSeconds:100,
    scoutPlan:{indices:[0,3],seconds:25,entryRoute:0,secondaryRoute:2,secondaryIndices:[3,4]}});
  const phases=[...new Set(result.snapshots.map(snapshot=>snapshot.operation.phase))];
  assert.deepEqual(phases,['scouting','returning','regrouping','entering']);
  const joined=result.snapshots.find(snapshot=>snapshot.operation.phase==='entering');
  for(const unit of joined.units.filter(unit=>unit.side==='공격'&&unit.alive)){
    const point=joined.operation.rally.find(point=>point.id===unit.id).position;
    assert(Math.hypot(unit.position.x-point.x,unit.position.y-point.y)<=35,'실제 합류 위치 '+unit.id);
  }
});
const runs={};
for(const preparation of ['reinforce','shield']){
  check(preparation+' 실제 이동·2초 설치·지형 변경·run/session 일치',()=>{
    class SetupArena extends TacticalRealtimeSimulation {
      startPosition(unit,index,count,terrain){return unit.side==='수비'?(preparation==='reinforce'?{x:3100,y:1210}:{x:2700,y:1280}):super.startPosition(unit,index,count,terrain);}
      startFacing(unit){return unit.side==='수비'?Math.PI:0;}
    }
    const input={attackers:team('공격',1),defenders:team('수비',1),seed:18,maxSeconds:12,defensePreparation:preparation,scoutPlan:{indices:[0],seconds:25,entryRoute:0}};
    const arena=new SetupArena(),result=arena.run(input),goal=preparation==='reinforce'?'wall-reinforced':'shield-deployed';runs[preparation]=result;
    const done=result.events.find(event=>event.goal===goal),start=result.events.find(event=>event.goal==='fortification-started');
    assert(done,goal);assert(start&&done.time-start.time>=1.99);
    const snapshot=result.snapshots.find(snapshot=>snapshot.time===done.time),terrain=battlefieldMap(map,snapshot.breaches,snapshot.fortifications);
    if(preparation==='reinforce'){
      const wall=terrain.walls.find(wall=>wall.reinforced);assert(wall);
      assert.deepEqual(breachWalls(terrain.walls,wall.id,wall.from,100),terrain.walls);
    }else{
      const cover=terrain.covers.find(cover=>cover.kind==='shield');assert(cover);
      assert(!arena.canStand({x:cover.rect.x+cover.rect.width/2,y:cover.rect.y+cover.rect.height/2},terrain));
    }
    const session=arena.createSession(input);while(!session.isComplete)session.step();assert.deepEqual(session.getResult(),result);
  });
}
check('보강은 일반 파쇄를 막고 MEDVED의 4초 관통 장약에는 실제 통로를 내줌',()=>{
  class HardBreachArena extends TacticalRealtimeSimulation {
    startPosition(unit,index,count,terrain){return unit.side==='공격'?{x:2750,y:260}:super.startPosition(unit,index,count,terrain);}
  }
  const terrain={...map,walls:map.walls.map(wall=>wall.id==='outer-soft-north'?{...wall,reinforced:true}:wall)};
  const attackers=team('공격',1);attackers[0].operator=OPERATORS.find(operator=>operator.callSign==='MEDVED');
  const result=new HardBreachArena().run({attackers,defenders:team('수비',1),map:terrain,seed:18,maxSeconds:12});
  const start=result.events.find(event=>event.goal==='breach-started'),done=result.events.find(event=>event.goal==='wall-breached');
  assert(start&&done&&done.time-start.time>=3.99);
  const snapshot=result.snapshots.find(snapshot=>snapshot.breaches.length),hole=snapshot.breaches[0];assert(hole.hard);
  assert(!engine.canStand(hole.position,terrain));assert(engine.canStand(hole.position,battlefieldMap(terrain,snapshot.breaches)));
});
check('실제 탄착 압박·시야 노출 전 발사 금지·원본 지도 보존',()=>{
  class ContactArena extends TacticalRealtimeSimulation {
    startPosition(unit){return unit.side==='공격'?{x:1000,y:1000}:{x:1950,y:1000};}
    startFacing(unit){return unit.side==='공격'?0:Math.PI;}
  }
  const terrain={...map,walls:[],covers:[],portals:[]};
  const result=new ContactArena().run({attackers:team('공격',1),defenders:team('수비',1),map:terrain,seed:9,maxSeconds:12});
  assert(result.snapshots.some(snapshot=>snapshot.units.some(unit=>(unit.suppression??0)>0)));
  for(const shot of result.events.filter(event=>event.type==='shot')){
    const snapshot=result.snapshots.find(snapshot=>snapshot.time===shot.time);
    assert(snapshot.observedBy[shot.actor].includes(shot.target),'인지하지 못한 적 발사 금지');
  }
  assert.equal(JSON.stringify(map),original);
});
fs.writeFileSync(path.resolve(__dirname,'../validation/fortification-scenes.json'),JSON.stringify(Object.fromEntries(Object.entries(runs).map(([name,result])=>[name,result.snapshots.find(snapshot=>snapshot.fortifications?.length)])),null,2)+'\n');
fs.writeFileSync(path.resolve(__dirname,'../validation/tactical-pressure.json'),JSON.stringify({tests:results,passed:results.filter(row=>row.pass).length,total:results.length},null,2)+'\n');
process.exitCode=results.every(row=>row.pass)?0:1;
