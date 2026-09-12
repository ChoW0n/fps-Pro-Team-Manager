// Existing Node Playwright runtime; no Python Playwright installed in this workspace.
const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const out='validation/presentation-topdown';fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
 try{
 const page=await browser.newPage({viewport:{width:1100,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:5173/draft-order-player-generator/art-review/operator-topdown-v1/');await page.waitForLoadState('networkidle');
 assert(await page.evaluate(()=>body.complete&&body.naturalWidth>0));
 await page.screenshot({path:out+'/operator-unarmed.png',fullPage:true});
 await page.locator('#gun').check();
 for(const weapon of ['p90','hk416','c14']){await page.locator('#weapon').selectOption(weapon);for(const angle of ['0','90','180','270']){await page.locator('#angle').fill(angle);await page.locator('#angle').dispatchEvent('input');}await page.screenshot({path:out+'/operator-'+weapon+'.png',fullPage:true});}
 const result=await page.evaluate(async()=>{
 const audio=await import('/draft-order-player-generator/src/components/matchAudio.ts');
 const Native=window.AudioContext,sources=[],oscillators=[];
 window.AudioContext=class extends Native{createBufferSource(){const node=super.createBufferSource(),start=node.start.bind(node);node.start=t=>{sources.push({t,length:node.buffer.length});return start(t)};return node}createOscillator(){oscillators.push(true);return super.createOscillator()}};
 audio.unlockMatchAudio();await new Promise(r=>setTimeout(r,50));
 const names=['MP5SD','AS Val 소음소총','FN P90','HK416','HK417','C14 팀버울프'];for(const name of names)audio.playMatchAudio({type:'shot',time:1,message:''},name);
 return {profiles:names.map(name=>({name,...audio.firearmAudioProfile(name)})),sources,oscillators:oscillators.length};
 });
 assert.equal(result.sources.length,6);assert.equal(result.oscillators,0);assert(result.profiles[0].suppressed);assert(!result.profiles[2].suppressed);assert.equal(result.profiles[2].caliber,'5.7×28');assert.deepEqual(errors,[]);
 fs.writeFileSync(out+'/browser-results.json',JSON.stringify(result,null,2)+'\n');console.log('PASS: 3 weapons × 4 angles; 6 audio buffer sources; no pitched oscillators; no page errors');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
