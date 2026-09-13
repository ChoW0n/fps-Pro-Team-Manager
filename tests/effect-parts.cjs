const fs=require('fs'),assert=require('node:assert/strict'),ts=require('typescript');
const {createCanvas,loadImage}=require('@napi-rs/canvas');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,resolveJsonModule:true}}).outputText,f);
const {drawEffect,EFFECT_PARTS}=require('../artifacts/draft-order-player-generator/src/components/effectParts.ts');
const anchors=require('../artifacts/draft-order-player-generator/src/components/effectAnchors.json');
(async()=>{
 const images=new Map();for(const name of Object.keys(anchors))images.set(`effects/${name}-v1.png`,await loadImage(`artifacts/draft-order-player-generator/public/operators/effects/${name}-v1.png`));
 const sheet=createCanvas(1000,480),ctx=sheet.getContext('2d');ctx.fillStyle='#364b53';ctx.fillRect(0,0,1000,480);const used=new Set();
 let row=0;for(const [kind,part] of Object.entries(EFFECT_PARTS)){
   const canvas=createCanvas(200,200),c=canvas.getContext('2d');let calls=[];const draw=c.drawImage.bind(c);c.drawImage=(im,...args)=>{calls.push({im,args,transform:c.getTransform()});return draw(im,...args)};
   const load=file=>{used.add(file);return images.get(file)};
   for(let key=0;key<100;key++)assert(drawEffect(c,load,kind,String(key),100,100,Math.PI/2,part.seconds/2));
   const before=calls.length;assert(!drawEffect(c,load,kind,'x',100,100,0,-.1));assert(!drawEffect(c,load,kind,'x',100,100,0,part.seconds));assert.equal(calls.length,before);
   assert(!drawEffect(c,()=>({complete:false}),kind,'x',100,100,0,0));
   const last=calls.at(-1);assert(Math.abs(last.transform.e-100)<1e-8&&Math.abs(last.transform.f-100)<1e-8,'world anchor');assert(Math.abs(last.transform.a)<1e-8,'rotation');
   for(let i=0;i<4;i++){ctx.fillStyle='#e3eded';ctx.font='12px sans-serif';ctx.fillText(kind+' '+i,i*250+12,row*80+16);drawEffect(ctx,file=>images.get(file),kind,String(i),i*250+60,row*80+50,0,part.seconds*.25,true);}
   row++;
 }
 assert.equal(used.size,18,'all variants reachable');fs.writeFileSync('validation/effect-parts.png',sheet.toBuffer('image/png'));
 fs.writeFileSync('validation/effect-parts.json',JSON.stringify({variants:used.size,checks:['decoded PNG','all variants reachable','anchor and rotation','expiry and future','missing image'],browser:false},null,2)+'\n');console.log('PASS 18 effects, anchors, lifetime, missing image');
})().catch(e=>{console.error(e);process.exitCode=1});
