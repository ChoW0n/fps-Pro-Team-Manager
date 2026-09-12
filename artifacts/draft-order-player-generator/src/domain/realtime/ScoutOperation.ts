import type { TacticalPoint } from '../tacticalMaps';

export interface ScoutPlan { indices: number[]; seconds: 25 | 40 | 55 | 70; entryRoute: number; secondaryRoute?:number; secondaryIndices?:number[] }
export type ScoutPhase = 'scouting' | 'returning' | 'regrouping' | 'entering';
export interface ScoutState { phase: ScoutPhase; scoutIds: string[]; searchSeconds: number; phaseStartedAt: number; rally?:Array<{id:string;position:TacticalPoint}> }
export interface ScoutActor { id: string; alive: boolean; position: TacticalPoint }

/** 작전 국면은 개인의 사격·장전 상태와 분리해 복귀 임무가 교전으로 지워지지 않게 합니다. */
export class ScoutOperation {
  private state: ScoutState;
  private previousTime=-1;
  /** 실제 참가자 ID와 각자의 합류 위치를 보관합니다. 0명은 즉시 진입합니다. */
  public constructor(scoutIds: string[], seconds: number, private readonly rally: ReadonlyMap<string,TacticalPoint>) {
    if(scoutIds.length>3 || new Set(scoutIds).size!==scoutIds.length || scoutIds.some(id=>!rally.has(id))) throw new Error('선발조는 명단 안에서 중복 없이 0~3명 선택합니다.');
    if(![25,40,55,70].includes(seconds)) throw new Error('수색 시간은 25/40/55/70초 중 선택합니다.');
    this.state={phase:scoutIds.length?'scouting':'entering',scoutIds:[...scoutIds],searchSeconds:seconds,phaseStartedAt:0};
  }
  /** 스냅샷과 UI가 내부 선발조 목록을 바꾸지 못하도록 복사합니다. */
  public snapshot(): ScoutState { return {...this.state,scoutIds:[...this.state.scoutIds],rally:[...this.rally].map(([id,position])=>({id,position:{...position}}))}; }
  /** 시간 종료 후 실제 복귀, 전원 합류 확인, 함께 재진입을 순서대로 진행합니다. */
  public step(now: number, actors: readonly ScoutActor[], recall=false): boolean {
    if(!Number.isFinite(now)||now<0||now<this.previousTime) throw new Error('작전 시각은 역행할 수 없습니다.');
    if(now===this.previousTime) return false;
    this.previousTime=now;
    const before=this.state.phase;
    const living=actors.filter(actor=>actor.alive&&this.rally.has(actor.id));
    const scouts=living.filter(actor=>this.state.scoutIds.includes(actor.id));
    const arrived=(actor:ScoutActor):boolean=>Math.hypot(actor.position.x-this.rally.get(actor.id)!.x,actor.position.y-this.rally.get(actor.id)!.y)<=24;
    if(before==='scouting'&&(now>=this.state.searchSeconds||recall||scouts.length===0)) this.state.phase='returning';
    else if(before==='returning'&&scouts.every(arrived)) this.state.phase='regrouping';
    else if(before==='regrouping'&&living.every(arrived)) this.state.phase='entering';
    if(before!==this.state.phase){this.state.phaseStartedAt=now;return true;}
    return false;
  }
}
