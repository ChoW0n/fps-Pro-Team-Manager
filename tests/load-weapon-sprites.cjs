const fs=require('node:fs'),path=require('node:path');
const {loadImage,createCanvas}=require('@napi-rs/canvas');
global.document??={createElement:()=>createCanvas(1,1)};
module.exports=async()=>{
 const root=path.resolve(__dirname,'../artifacts/draft-order-player-generator/public/operators/weapons'),images=new Map();
 for(const name of fs.readdirSync(root).filter(name=>name.endsWith('.png')))images.set('weapons/'+name,await loadImage(path.join(root,name)));
 return file=>{if(!images.has(file))throw Error('Unregistered weapon sprite '+file);return images.get(file);};
};
