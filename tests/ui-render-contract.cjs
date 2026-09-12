// 실제 React 구성과 정적 자산 경로를 검사합니다. 브라우저 플레이 검사가 아닙니다.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require(process.cwd()+'/node_modules/typescript');const app=process.cwd()+'/artifacts/draft-order-player-generator';
const compile=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8').replaceAll('import.meta.env.BASE_URL',JSON.stringify('/draft-order-player-generator/')),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,resolveJsonModule:true,jsx:ts.JsxEmit.ReactJSX}}).outputText,f);require.extensions['.ts']=compile;require.extensions['.tsx']=compile;require.extensions['.css']=()=>{};
const React=require(app+'/node_modules/react'),{renderToStaticMarkup}=require(app+'/node_modules/react-dom/server');const {TeamGenerator}=require(app+'/src/domain/TeamGenerator.ts'),{GameLobby}=require(app+'/src/components/GameLobby.tsx'),{OperatorPreparation}=require(app+'/src/components/OperatorPreparation.tsx');const teams=new TeamGenerator().generateTenTeams();
for(const side of ['공격','수비']){const html=renderToStaticMarkup(React.createElement(OperatorPreparation,{homeTeam:teams[0],awayTeam:teams[1],homeSide:side,onStart:()=>{},onBack:()=>{}}));assert(html.includes('기대하는 장면'));assert(!html.includes('고유 초상 준비 중'));assert(!html.includes('undefined'));for(const match of html.matchAll(/(?:src|href)="\/draft-order-player-generator\/([^"]+)"/g)){assert(fs.existsSync(app+'/public/'+match[1]),match[1]);}console.log('PASS '+side+' preparation server rendering/assets');}
const lobby=renderToStaticMarkup(React.createElement(GameLobby,{team:teams[0],onStart:()=>{}}));assert(lobby.includes('빠른 매치'));assert(lobby.includes('정규 매치'));console.log('PASS lobby server rendering');
// 합성 UI fixture입니다. 실제 경기에서 다운·이동이 발생했다는 증거가 아닙니다.
const {TacticalBattlefield}=require(app+'/src/components/TacticalBattlefield.tsx'),{NAMSAN_MAP}=require(app+'/src/domain/tacticalMaps.ts');
const {OPERATORS}=require(app+'/src/domain/Operator.ts'),{operatorVisual,OPERATOR_SCALE}=require(app+'/src/domain/operatorVisuals.ts');
const crawl=require(app+'/src/operators/collier-downed-crawl-v1.json'),downed=require(app+'/src/operators/collier-downed-v3.json');
const collier=OPERATORS.find(operator=>operator.callSign==='COLLIER');
const fixture={id:'synthetic-collier',callSign:'COLLIER',side:'공격',position:{x:1000,y:1000},velocity:{x:1,y:0},facing:0,alive:true,downed:{mode:'crawl',remaining:20,progress:0},reloadRemaining:0,weaponName:'MP5SD',goal:'합성 UI 자세 검사'};
/** 합성 상태로 실제 SVG 컴포넌트를 렌더합니다. */
function poseMarkup(time,overrides={}){
  return renderToStaticMarkup(React.createElement(TacticalBattlefield,{map:NAMSAN_MAP,units:[{...fixture,...overrides}],operators:new Map([[fixture.id,collier]]),events:[],time,selectedId:null,onSelect:()=>{}}));
}
const attributes=tag=>Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(match=>[match[1],match[2]]));
/** 표시 파일과 프레임 영역·원점·배율을 메타데이터에 대조합니다. */
function assertPose(markup,visual){
  const images=markup.match(/<image\b[^>]*>/g)??[];assert.equal(images.length,1);
  const image=attributes(images[0]),scale=visual.scale??OPERATOR_SCALE;
  assert.equal(image.href,'/draft-order-player-generator/operators/'+visual.sprite);
  assert(fs.existsSync(app+'/public/operators/'+visual.sprite));
  const close=(attribute,expected)=>assert(Math.abs(Number(attribute)-expected)<1e-8,`${attribute} != ${expected}`);
  close(image.width,(visual.sheetWidth??visual.width)*scale);close(image.height,(visual.sheetHeight??visual.height)*scale);
  close(image.x,-((visual.region?.[0]??0)+visual.pivot[0])*scale);close(image.y,-((visual.region?.[1]??0)+visual.pivot[1])*scale);
  const clip=markup.match(/<clipPath\b[^>]*><rect\b([^>]*)(?:\/>|><\/rect>)<\/clipPath>/);
  if(visual.region){
    assert(clip,'프레임 영역을 제한하는 clipPath가 필요합니다.');
    assert.deepEqual([visual.width,visual.height],visual.region.slice(2));
    const rect=attributes(clip[1]);close(rect.x,-visual.pivot[0]*scale);close(rect.y,-visual.pivot[1]*scale);
    close(rect.width,visual.region[2]*scale);close(rect.height,visual.region[3]*scale);
  }else assert.equal(clip,null);
}
assert.equal(crawl.frames.length,4);
for(let index=0;index<crawl.frames.length;index++)assertPose(poseMarkup(index/4),crawl.frames[index]);
assertPose(poseMarkup(1),crawl.frames[0]);
assert.equal(poseMarkup(.25),poseMarkup(.25),'같은 경기 시각은 같은 SVG 프레임입니다.');
console.log('PASS synthetic SVG crawl fixture: four frame regions, sheet dimensions, loop and fixed time');
assertPose(poseMarkup(.25,{velocity:{x:0,y:0}}),downed.visual);
assertPose(poseMarkup(.25,{downed:{...fixture.downed,mode:'stabilize'}}),downed.visual);
assertPose(poseMarkup(.25,{alive:false}),downed.visual);
assertPose(poseMarkup(.25,{downed:undefined}),operatorVisual('COLLIER'));
console.log('PASS synthetic SVG pose guards: stopped/stabilizing/dead do not crawl; healthy uses own base art');
fs.writeFileSync('validation/ui-render-contract-results.json',JSON.stringify({passed:5,total:5,kind:'React server rendering/assets and synthetic SVG pose fixtures; not engine match evidence or browser interaction'},null,2)+'\n');
