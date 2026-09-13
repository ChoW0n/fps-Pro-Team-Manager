const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const root='../artifacts/draft-order-player-generator/src/domain/';
const {ShieldLoadout}=require(root+'realtime/ShieldLoadout.ts');
const primary={name:'HK417',profile:{magazineSize:20,reserveAmmo:60,reloadSeconds:2.4,note:'game'}},secondary={name:'HK USP',profile:{magazineSize:12,reserveAmmo:36,reloadSeconds:1.8,note:'game'}};
const fresh=()=>({weaponName:'HK417',ammo:7,reserveAmmo:40,magazineSize:20,reloadRemaining:0,cooldown:0,alive:true});
const unit=fresh(),loadout=new ShieldLoadout(primary,secondary);
assert(loadout.update(unit,0,true,true,true).switched);assert.equal(unit.weaponName,'HK USP');assert.equal(unit.shieldRaised,false);assert.equal(unit.ammo,12);
loadout.update(unit,.5,true,true);assert(unit.shieldRaised);unit.ammo=3;unit.reserveAmmo=24;
loadout.update(unit,.6,true,false);assert.equal(unit.weaponName,'HK USP','발사 간격마다 주무기로 왕복 금지');
loadout.update(unit,1,false,false);assert.equal(unit.weaponName,'HK USP','짧은 시야 단절 유지');
loadout.update(unit,1.5,false,false);assert.equal(unit.weaponName,'HK417');assert.equal(unit.ammo,7);assert.equal(unit.reserveAmmo,40);
loadout.update(unit,2,true,true);assert.equal(unit.ammo,3);assert.equal(unit.reserveAmmo,24,'교체로 탄약 생성 금지');
unit.reloadRemaining=1;loadout.update(unit,3,false,true);assert.equal(unit.weaponName,'HK USP');assert(!unit.shieldRaised,'장전 중 방패 내림');
unit.ammo=12;unit.reserveAmmo=12;unit.reloadRemaining=0;loadout.update(unit,3.1,false,false);assert.equal(unit.weaponName,'HK417');
loadout.update(unit,4,true,true);assert.equal(unit.ammo,12);assert.equal(unit.reserveAmmo,12,'완료 장전은 해당 슬롯에 보존');
const missing=fresh();new ShieldLoadout(primary).update(missing,0,true,true);assert(!missing.shieldRaised,'보조무장 없는 강제 방패 금지');

const {TacticalRealtimeSimulation}=require(root+'realtime/TacticalRealtimeSimulation.ts'),{OPERATORS}=require(root+'Operator.ts'),{Player}=require(root+'Player.ts'),{weaponHandling}=require(root+'realtime/weaponHandling.ts');
const side=name=>OPERATORS.filter(o=>o.side===name).slice(0,5).map((operator,index)=>({operator,side:name,teamName:name,player:new Player('검사'+index,'선수'+index,operator.role,20,75,75,75,75,75,[operator],20,75,65,70,70,70,70)}));
const input={attackers:side('공격'),defenders:side('수비'),seed:41,maxSeconds:180,scoutPlan:{indices:[],seconds:25,entryRoute:0}};
const rows=[];
for(const legacyOption of [undefined,false]){
 const result=new TacticalRealtimeSimulation().run({...input,shieldRequiresSecondary:legacyOption});
 const states=result.snapshots.flatMap(s=>s.units.filter(u=>u.callSign==='REUSS').map(u=>({time:s.time,u})));
 const raised=states.filter(({u})=>u.shieldRaised);assert(raised.length>0,'실제 경기 방패 사용');
 for(const {time,u} of states){
  if(u.shieldRaised)assert.equal(u.weaponName,'HK USP');
  if(u.shieldRaised)assert.equal(u.reloadRemaining,0);
  if(u.weaponName==='HK USP'){assert.equal(u.magazineSize,12);assert.equal(weaponHandling(u.weaponName).family,'pistol');}
  assert(u.ammo>=0&&u.ammo<=u.magazineSize&&u.reserveAmmo>=0);
  if(time<(u.weaponReadyAt??0))assert(!result.events.some(e=>e.type==='shot'&&e.actor===u.id&&e.time===time),'교체 중 발사 금지');
 }
 const switches=result.events.filter(e=>e.goal==='weapon-switched');assert.equal(switches.length>0,true);
 rows.push({legacyOption,snapshots:states.length,raised:raised.length,switches:switches.length,shots:result.events.filter(e=>e.type==='shot'&&e.actor.includes('REUSS')).length});
}
fs.writeFileSync('validation/shield-loadout.json',JSON.stringify({scope:'actual engine seed 41 + inventory contracts; no browser',rows,checks:['slot ammo conservation','reload isolation','switch delay','contact hysteresis','legacy false cannot allow primary shield','missing secondary','actual shield uses pistol']},null,2)+'\n');console.log('PASS shield loadout inventory and two real simulation runs',rows);
