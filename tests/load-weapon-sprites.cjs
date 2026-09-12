const fs=require('node:fs'),path=require('node:path');
const {loadImage,createCanvas}=require('@napi-rs/canvas');
global.document??={createElement:()=>createCanvas(1,1)};
module.exports=async()=>{
 const root=path.resolve(__dirname,'../artifacts/draft-order-player-generator/public/operators/weapons'),images=new Map();
 // 측면 보존본과 실제 전장용 탑뷰 원본을 모두 읽습니다.
 for(const folder of ['', 'top/'])for(const name of fs.readdirSync(path.join(root,folder)).filter(name=>name.endsWith('.png')))images.set('weapons/'+folder+name,await loadImage(path.join(root,folder,name)));
 return file=>{if(!images.has(file))throw Error('Unregistered weapon sprite '+file);return images.get(file);};
};
