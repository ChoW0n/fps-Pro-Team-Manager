import type { RealtimeUnitState } from './TacticalRealtimeSimulation';

export interface AmmoProfile { magazineSize:number;reserveAmmo:number;reloadSeconds:number;note:string; }
type Slot={name:string;profile:AmmoProfile;ammo:number;reserveAmmo:number};

/** 방패 운용 중 무기 선택과 슬롯별 탄약만 소유합니다. 렌더 좌표는 읽지 않습니다. */
export class ShieldLoadout {
  private slots:Slot[];
  private active=0;
  private lastThreat=-Infinity;
  constructor(primary:{name:string;profile:AmmoProfile},secondary?:{name:string;profile:AmmoProfile}) {
    this.slots=[primary,...secondary?[secondary]:[]].map(item=>({...item,ammo:item.profile.magazineSize,reserveAmmo:item.profile.reserveAmmo}));
  }
  update(unit:RealtimeUnitState,now:number,threat:boolean,wantsShield:boolean):{profile:AmmoProfile;switched:boolean} {
    if(threat)this.lastThreat=now;
    // 발사 쿨다운마다 주/부무기를 왕복하지 않고 접촉이 끊긴 뒤 복귀합니다.
    const desired=this.slots.length>1&&(wantsShield||threat||now-this.lastThreat<.8)?1:0;
    let switched=false;
    if(desired!==this.active&&unit.reloadRemaining<=0&&now>=(unit.weaponReadyAt??0)){
      this.slots[this.active].ammo=unit.ammo;this.slots[this.active].reserveAmmo=unit.reserveAmmo;
      this.active=desired;const slot=this.slots[this.active];
      unit.weaponName=slot.name;unit.weaponProfileNote=slot.profile.note;
      unit.magazineSize=slot.profile.magazineSize;unit.ammo=slot.ammo;unit.reserveAmmo=slot.reserveAmmo;
      unit.recoil=0;unit.burst=0;unit.spread=0;
      unit.weaponReadyAt=now+.45;unit.cooldown=Math.max(unit.cooldown,.45);switched=true;
    }
    unit.weaponSlot=this.active===1?'secondary':'primary';
    // 교체·장전 중에는 방패를 내립니다. 보조무장이 없으면 방패를 들지 않습니다.
    unit.shieldRaised=wantsShield&&unit.alive&&!unit.downed&&unit.reloadRemaining<=0
      &&now>=(unit.weaponReadyAt??0)&&this.active===1;
    return {profile:this.slots[this.active].profile,switched};
  }
}
