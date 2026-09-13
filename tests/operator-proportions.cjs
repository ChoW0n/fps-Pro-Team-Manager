// 브라우저 없이 실제 Canvas 합성의 군장 폭과 어깨 접점을 검사합니다.
const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const {createCanvas}=require('@napi-rs/canvas'),root='../artifacts/draft-order-player-generator/src/';
const weapons=require(root+'components/weaponParts.ts'),paint=weapons.paintWeaponPart;
let bare=false;weapons.paintWeaponPart=(...args)=>bare?true:paint(...args);
const {paintMinimalOperator}=require(root+'components/minimalOperator.ts'),{OPERATORS}=require(root+'domain/Operator.ts');
(async()=>{
 const asset=await require('./load-weapon-sprites.cjs')(),rows=[];
 const sheet=createCanvas(1200,720),ctx=sheet.getContext('2d');ctx.fillStyle='#263237';ctx.fillRect(0,0,1200,720);
 OPERATORS.forEach((op,i)=>{
  const unit={id:'proportion',callSign:op.callSign,side:op.side,weaponName:op.firearms[0],position:{x:80,y:80},velocity:{x:0,y:0},facing:0,alive:true,action:'aim'};
  const tile=createCanvas(180,160),tc=tile.getContext('2d');bare=true;paintMinimalOperator(tc,unit,0,undefined,asset,true);bare=false;
  const data=tc.getImageData(0,0,180,160).data;let minY=160,maxY=0;
  for(let y=0;y<160;y++)for(let x=0;x<180;x++)if(data[(y*180+x)*4+3]>=200){minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
  const width=maxY-minY+1,offset=weapons.weaponMuzzleOffset(unit.weaponName),stock={x:offset.x-weapons.weaponPart(unit.weaponName).length,y:offset.y};
  assert(width<=27,op.callSign+' 군장 포함 폭 '+width+' > 27');
  assert(stock.x>=-4&&stock.x<=4&&stock.y>=5&&stock.y<=9,op.callSign+' 개머리판은 오른어깨 안쪽');
  rows.push({operator:op.callSign,width,metres:width/40,doorwayRatio:width/96,stock});
  const x=(i%4)*300,y=Math.floor(i/4)*240;ctx.save();ctx.translate(x+70,y+125);ctx.scale(2.2,2.2);
  ctx.strokeStyle='#82918B';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(24,-53);ctx.lineTo(24,-48);ctx.moveTo(24,48);ctx.lineTo(24,53);ctx.stroke();
  paintMinimalOperator(ctx,{...unit,position:{x:0,y:0}},0,undefined,asset,true);ctx.restore();
  ctx.fillStyle='#D5DEDB';ctx.font='15px sans-serif';ctx.fillText(op.callSign+' / '+op.firearms[0],x+15,y+24);ctx.fillText('body '+width+' / opening 96',x+15,y+222);
 });
 fs.writeFileSync('validation/operator-proportions.png',sheet.toBuffer('image/png'));
 fs.writeFileSync('validation/operator-proportions.json',JSON.stringify({unitsPerMetre:40,doorWidth:96,rows,limits:'Design proportions inspired by Siege imagery, not measured Siege dimensions; static Canvas only.'},null,2)+'\n');
 console.log('PASS 12 operators: body width, shoulder contact, map scale');
})().catch(e=>{console.error(e);process.exitCode=1;});
