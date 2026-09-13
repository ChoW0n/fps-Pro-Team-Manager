/** Riley Gombart의 CC BY 3.0 파츠를 조립합니다. THIRD_PARTY_ART.md 참조. */
type Point={x:number;y:number};
type Loader=(file:string)=>HTMLImageElement;
const bounds:Record<string,readonly [number,number,number,number]>={
 torso:[4,19,84,158],head:[3,18,89,61],backpack:[17,8,127,114],
 arm:[12,12,72,46],forearm:[1,13,59,38],leg:[13,10,69,44],foot:[13,15,71,37],
 hand_holding_gun:[7,18,46,32],hand_steadying_gun:[14,12,38,39],hand_grab_ammo:[7,13,43,41],
};
/** 외형 파츠만 소유하며 유닛 상태나 전투 수치를 쓰지 않습니다. */
export class SurvivorParts {
 constructor(private ctx:CanvasRenderingContext2D,private asset:Loader){}
 sprite(name:string,x:number,y:number,width:number,height:number,angle=0):void {
  const image=this.asset('survivor/'+name+'.png');if(!image?.width)return;
  const b=bounds[name];this.ctx.save();this.ctx.translate(x,y);this.ctx.rotate(angle);
  if(b)this.ctx.drawImage(image,...b,-width/2,-height/2,width,height);
  else this.ctx.drawImage(image,-width/2,-height/2,width,height);
  this.ctx.restore();
 }
 segment(name:string,a:Point,b:Point,width:number):void {
  const length=Math.hypot(b.x-a.x,b.y-a.y);
  this.sprite(name,(a.x+b.x)/2,(a.y+b.y)/2,length+2,width,Math.atan2(b.y-a.y,b.x-a.x));
 }
 arm(pose:{shoulder:Point;elbow:Point;hand:Point}):void {
  // 넓은 위팔의 둥근 끝이 아래팔 접합부를 덮어 원본 소매 윤곽을 유지합니다.
  this.segment('forearm',pose.elbow,pose.hand,6.5);
  this.segment('arm',pose.shoulder,pose.elbow,8.2);
 }
 hand(point:Point,angle:number,support=false,reloading=false):void {
  this.sprite(reloading?'hand_grab_ammo':support?'hand_steadying_gun':'hand_holding_gun',point.x,point.y,4,3.5,angle);
 }
 body(yaw:number,pack:number):void {
  const c=this.ctx;c.save();c.rotate(yaw);
  this.sprite('torso',-7,-1,14,14*158/84,.65);
  const packWidth=12+pack*.12;
  this.sprite('backpack',-10,-7,packWidth,packWidth*114/127,.65);

  c.restore();
 }
 head(yaw:number):void {
  this.ctx.save();this.ctx.rotate(yaw);this.sprite('head',-5,0,15,15*61/89);this.ctx.restore();
 }
 feet(facing:number,crouch:number,step:number,phase:number,moving:boolean,mode:'walk'|'run'|'strafe_left'|'strafe_right'):void {
  const c=this.ctx;c.save();c.rotate(facing);
  if(crouch<1){
   c.save();c.globalAlpha*=1-crouch;
   const key=moving?mode:'idle',sizes={idle:[132,155],walk:[172,124],run:[204,124],strafe_left:[155,174],strafe_right:[154,176]} as const;
   const [w,h]=sizes[key],im=this.asset('survivor/feet-'+key+'.png'),frame=moving?Math.floor(phase*20)%20:0;
   if(im?.width)c.drawImage(im,frame*w,0,w,h,-9-w*.065,-h*.065,w*.13,h*.13);
   c.restore();
  }
  if(crouch>0){
   c.save();c.globalAlpha*=crouch;
   for(const side of [-1,1]){
    const hip={x:-10,y:side*3},knee={x:side<0?-2:0,y:side*8};
    this.segment('leg',hip,knee,5.4);
    this.sprite('foot',-9+side*step*.3,side*8.5,7,3.8,side*.15);
   }
   c.restore();
  }
  c.restore();
 }
}
