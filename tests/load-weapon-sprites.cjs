const fs=require('node:fs'),path=require('node:path');
const {loadImage,createCanvas}=require('@napi-rs/canvas');
global.document??={createElement:()=>createCanvas(1,1)};
module.exports=async()=>{
 const root=path.resolve(__dirname,'../artifacts/draft-order-player-generator/public/operators/weapons'),images=new Map();
 // 측면 보존본과 실제 전장용 탑뷰 원본을 모두 읽습니다.
 for(const folder of ['', 'top/'])for(const name of fs.readdirSync(path.join(root,folder)).filter(name=>name.endsWith('.png')))images.set('weapons/'+folder+name,await loadImage(path.join(root,folder,name)));
 for(const name of ['handheld-shield-v3.png','handheld-shield-v2.png','deployed-shield-v2.png'])images.set('effects/'+name,await loadImage(path.join(root,'../effects',name)));
 for(const name of fs.readdirSync(path.join(root,'../survivor')).filter(n=>n.endsWith('.png')))images.set('survivor/'+name,await loadImage(path.join(root,'../survivor',name)));
 return file=>{if(!images.has(file))throw Error('Unregistered weapon sprite '+file);return images.get(file);};
};
