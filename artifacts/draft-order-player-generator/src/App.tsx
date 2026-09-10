/**
 * 사람이 한 경기를 끝까지 플레이할 수 있는 세 화면의 흐름입니다.
 * 경기 계산은 domain 모듈에 맡기고, 이 파일은 화면 상태와 표시 타이밍만 관리합니다.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { TeamGenerator } from './domain/TeamGenerator';
import {
  CHAMPIONS,
  Champion,
  getChampionStatsAtLevel,
  getChampionsByPosition,
  printLevel18UltimateDamageValidation,
} from './domain/Champion';
import { BanPickResult, DraftSession } from './domain/BanPick';
import { MatchResult, getPhaseAdjustmentSummary } from './domain/MatchResult';
import {
  MatchEvent,
  MatchPlayerSnapshot,
  MATCH_OBJECT_POSITIONS,
  generateMatchEvents,
  generateMatchPlayerSnapshots,
  validateMatchEvents,
} from './domain/matchEvents';
import { MatchSimulator } from './domain/MatchSimulator';
import { generateMatchTimeline, MatchTimeline } from './domain/matchTimeline';
import { Player, Position } from './domain/Player';
import { Team } from './domain/Team';
import { getSoloRankChampionValue, getTournamentChampionValue } from './domain/soloRank';
import {
  MatchEconomySnapshot,
  deriveCombatDamage,
  deriveMatchEconomySnapshot,
  formatEconomyPlayer,
  getItemPurchasesBetween,
  getLevelUpsBetween,
} from './domain/matchEconomy';
import {
  BroadcastScene,
  deriveBroadcastScene,
  getBroadcastTeamColor,
  getLaneLabel,
} from './domain/matchBroadcast';
import {
  draftActionDisplayNames,
  engagementDisplayNames,
  matchEventDisplayNames,
  phaseDisplayNames,
  positionDisplayNames,
  rangeDisplayNames,
  roleDisplayNames,
  timingDisplayNames,
} from './domain/displayNames';
import { formatPlayerName } from './domain/playerDisplay';
import {
  TacticalDecisionLog,
  TacticalRoundResult,
} from './domain/TacticalRoundSimulation';
import { createRealtimeUnitInputs } from './domain/realtime/tacticalRealtimeAdapter';
import { TacticalMatch } from './components/TacticalMatch';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';

const queryClient = new QueryClient();
const interactiveTeams = new TeamGenerator().generateTenTeams();
const POSITION_ORDER: Position[] = ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'];
const SPEEDS = [1, 2, 4, 8] as const;
const HOME_MAP_COLOR = '#557D91';
const AWAY_MAP_COLOR = '#8B4745';
// 이벤트 생성기와 Canvas가 같은 표시용 고정 오브젝트 좌표를 사용합니다.
const MAP_OBJECTS = MATCH_OBJECT_POSITIONS;
const STAT_ITEMS = [
  { key: 'laning', label: '초기 교전' },
  { key: 'teamfight', label: '집단 교전' },
  { key: 'macro', label: '운영' },
  { key: 'volatility', label: '기복' },
  { key: 'mastery', label: '숙련도' },
] as const;

type Screen = 'prep' | 'draft' | 'watch';
type AppTab = 'team' | 'players' | 'champions' | 'league' | 'records' | 'solo';

const APP_TABS: Array<{ id: AppTab; label: string }> = [
  { id: 'team', label: '팀' },
  { id: 'players', label: '오퍼레이터' },
  { id: 'champions', label: '장비' },
  { id: 'league', label: '시즌' },
  { id: 'records', label: '전적' },
  { id: 'solo', label: '개인 기록' },
];

const POSITION_LABELS: Record<Position, string> = {
  TOP: '수비설계',
  JUNGLE: '수색',
  MID: '화력',
  ADC: '진입',
  SUPPORT: '차단',
};

// 기본 진입에서는 무거운 시즌 검증을 실행하지 않고, 개발자가 URL로 명시했을 때만 예약합니다.
let hasConsoleValidationBeenScheduled = false;
function scheduleOptionalConsoleValidation(): void {
  if (hasConsoleValidationBeenScheduled || typeof window === 'undefined') return;
  const validationMode = new URLSearchParams(window.location.search).get('validation');
  if (validationMode !== 'season') return;
  hasConsoleValidationBeenScheduled = true;

  const runValidation = async () => {
    try {
      // 검증을 요청한 경우에만 정적 데이터와 콘솔 출력용 검증을 실행합니다.
      const [{ validateChampions }, consoleOutput, tacticalModule] = await Promise.all([
        import('./domain/championValidation'),
        import('./domain/consoleOutput'),
        import('./domain/TacticalRoundSimulation'),
      ]);
      const championIssues = validateChampions(CHAMPIONS);
      if (championIssues.length === 0) {
        console.log('챔피언 25종 검증 완료');
      } else {
        championIssues.forEach((issue) => console.error(`챔피언 검증 실패: ${issue.message}`));
      }
      printLevel18UltimateDamageValidation();
      tacticalModule.printTacticalSimulationValidation();
      const teams = new TeamGenerator().generateTenTeams();
      consoleOutput.printChampionsToConsole();
      const generatedPlayers = teams.flatMap((team) => team.players);
      consoleOutput.printPlayersToConsole(generatedPlayers);
      consoleOutput.printSoloRankValidationToConsole(generatedPlayers);
      const { SeasonSimulation } = await import('./domain/SeasonSimulation');
      // 개발자 요청 시에만 100시즌 전체 실시간 AI 검증을 실행합니다.
      const result = new SeasonSimulation().run(teams, 100);
      consoleOutput.printMatchResultToConsole(result.firstSeasonMatch);
      consoleOutput.printStandingsToConsole(result.firstSeasonStandings);
      consoleOutput.printSimulationToConsole(result);
    } catch (error) {
      console.error('선택적 시즌 검증을 실행하지 못했습니다.', error);
    }
  };

  // 화면이 먼저 그려진 뒤 유휴 시간에 실행해 개발자 검증도 초기 페인트를 막지 않습니다.
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(runValidation, { timeout: 2000 });
  } else {
    setTimeout(runValidation, 1500);
  }
}

const ICON_PARTS: Record<string, { helmet: string; weapon: string }> = {
  하론: { helmet: 'HORN', weapon: 'GREATSWORD' },
  모르: { helmet: 'HOOD', weapon: 'SCYTHE' },
  이르마: { helmet: 'CROWN', weapon: 'BOW' },
  라헨: { helmet: 'MASK', weapon: 'STAFF' },
  벨트: { helmet: 'SKULL', weapon: 'CLAW' },
  세블: { helmet: 'PRIEST', weapon: 'GLAIVE' },
  카이르: { helmet: 'HORN', weapon: 'BELL' },
  베론: { helmet: 'HOOD', weapon: 'FLAIL' },
  카르: { helmet: 'CROWN', weapon: 'GREATSWORD' },
  로웬: { helmet: 'MASK', weapon: 'SCYTHE' },
  리안: { helmet: 'SKULL', weapon: 'BOW' },
  리리아: { helmet: 'PRIEST', weapon: 'STAFF' },
  토른: { helmet: 'HORN', weapon: 'CLAW' },
  미르: { helmet: 'HOOD', weapon: 'GLAIVE' },
  세라: { helmet: 'CROWN', weapon: 'BELL' },
  베이라: { helmet: 'MASK', weapon: 'FLAIL' },
  라스크: { helmet: 'SKULL', weapon: 'GREATSWORD' },
  오린: { helmet: 'PRIEST', weapon: 'SCYTHE' },
  드란: { helmet: 'HORN', weapon: 'BOW' },
  티르: { helmet: 'HOOD', weapon: 'STAFF' },
  아마라: { helmet: 'CROWN', weapon: 'CLAW' },
  세린: { helmet: 'MASK', weapon: 'GLAIVE' },
  바니: { helmet: 'SKULL', weapon: 'BELL' },
  루엔: { helmet: 'PRIEST', weapon: 'FLAIL' },
  크로: { helmet: 'HORN', weapon: 'SCYTHE' },
};

  /** 첫 화면은 즉시 준비하고, 무거운 시즌 검증은 명시적으로 요청했을 때만 실행합니다. */
function Home() {
  const [screen,setScreen]=useState<Screen>('prep');
  const [homeTeam]=useState<Team>(interactiveTeams[0]);
  const [awayTeam]=useState<Team>(interactiveTeams[1]);
  const [activeTab,setActiveTab]=useState<AppTab>('team');
  useEffect(()=>{scheduleOptionalConsoleValidation();},[]);
  /** 새 경기 준비로 돌아갈 때만 현재 세션 화면을 해제합니다. */
  function returnToPreparation():void {setScreen('prep');}
  return <AppFrame screen={screen} activeTab={activeTab} onSelectTab={setActiveTab}>
    {activeTab!=='team' && <ArchiveTab tab={activeTab} homeTeam={homeTeam} awayTeam={awayTeam}/>}
    <div hidden={activeTab!=='team'}>{screen==='draft' ? <TacticalMatch homeTeam={homeTeam} awayTeam={awayTeam} onBack={returnToPreparation}/>
      : <PreparationScreen homeTeam={homeTeam} awayTeam={awayTeam} onStart={()=>setScreen('draft')}/>}</div>
  </AppFrame>;
}

function AppFrame({
  screen,
  activeTab,
  onSelectTab,
  children,
}: {
  screen: Screen;
  activeTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
  children: React.ReactNode;
}) {
  const steps = [
    { id: 'prep', label: '경기 준비' },
    { id: 'draft', label: '편성·작전' },
    { id: 'watch', label: '경기 관전' },
  ];
  return (
    <div className={`app-shell app-shell-${screen}`}>
      <header className="site-header">
        <div className="brand-mark">
          <span className="brand-kicker">DRAFT ORDER</span>
          <span className="brand-title">감독실 기록</span>
        </div>
        <div className="header-status">
          <span className="status-dot" />
          <span>전술 매치 · 공수 교대</span>
        </div>
      </header>
      <nav className="app-tabs" aria-label="감독실 메뉴">
        {APP_TABS.map((tab) => (
          <button
            className={`app-tab ${tab.id === activeTab ? 'is-active' : ''}`}
            key={tab.id}
            type="button"
            onClick={() => onSelectTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      <nav className="flow-nav" aria-label="경기 진행 단계">
        {steps.map((step, index) => (
          <div className={`flow-step ${step.id === screen ? 'is-active' : ''}`} key={step.id}>
            <span className="flow-number">0{index + 1}</span>
            <span>{step.label}</span>
          </div>
        ))}
      </nav>
      <main className="page-content">{children}</main>
    </div>
  );
}

function PreparationScreen({ homeTeam, awayTeam, onStart }: { homeTeam: Team; awayTeam: Team; onStart: () => void }) {
  return (
    <section className="screen-section preparation-screen">
      <div className="eyebrow">MATCH PREPARATION / 01</div>
      <div className="screen-heading">
        <div>
          <h1>첫 경기를 준비하십시오.</h1>
          <p>두 팀의 전력과 오퍼레이터 숙련도를 검토한 뒤, 직접 작전 구성을 시작합니다.</p>
        </div>
        <div className="heading-note">
          <span>HOME</span>
          <strong>감독 지휘 경기</strong>
        </div>
      </div>

      <div className="matchup-banner">
        <TeamIdentity team={homeTeam} side="HOME" />
        <div className="versus-mark"><span>VS</span><small>GAME 01</small></div>
        <TeamIdentity team={awayTeam} side="AWAY" />
      </div>

      <div className="section-label">
        <span>ROSTER REPORT</span>
        <span>능력치는 이번 경기의 선수 발휘 기반입니다</span>
      </div>
      <div className="roster-columns">
        <RosterPanel team={homeTeam} side="HOME" />
        <RosterPanel team={awayTeam} side="AWAY" />
      </div>

      <div className="action-bar">
        <div>
          <span className="action-label">준비 완료</span>
          <p>선수별 오퍼레이터와 선발조를 편성합니다. 수비팀은 습득 목록 안에서 자동 배정합니다.</p>
        </div>
        <button className="outline-button primary-action" type="button" onClick={onStart} data-testid="button-start-draft">
          편성과 작전 준비 <span aria-hidden="true">→</span>
        </button>
      </div>
    </section>
  );
}

function TeamIdentity({ team, side }: { team: Team; side: 'HOME' | 'AWAY' }) {
  return (
    <div className={`team-identity team-identity-${side.toLowerCase()}`}>
      <span className="team-side-label">{side === 'HOME' ? '나의 팀' : '상대 팀'}</span>
      <h2>{team.name}</h2>
      <span className="team-record">5인 로스터 · {side === 'HOME' ? '직접 지휘' : 'AI 지휘'}</span>
    </div>
  );
}

function RosterPanel({ team, side }: { team: Team; side: 'HOME' | 'AWAY' }) {
  return (
    <section className={`roster-panel panel-${side.toLowerCase()}`}>
      <div className="panel-heading">
        <div>
          <span className="panel-kicker">{side}</span>
          <h2>{team.name}</h2>
        </div>
        <span className="panel-count">05 PLAYERS</span>
      </div>
      <div className="player-list">
        {team.players.map((player) => <PlayerCard player={player} key={player.nickname} />)}
      </div>
    </section>
  );
}

function PlayerCard({ player }: { player: Player }) {
  return (
    <article className="player-card">
      <div className="player-card-heading">
        <div>
          <span className="player-position">{positionDisplayNames[player.position]}</span>
          <h3>{formatPlayerName(player)}</h3>
        </div>
        <span className="player-age">{player.age}세</span>
      </div>
      <div className="stat-grid">
        {STAT_ITEMS.map((item) => (
          <div className="stat-item" key={item.key}>
            <span>{item.label}</span>
            <strong>{player[item.key]}</strong>
          </div>
        ))}
      </div>
      <div className="pool-row">
        <span>오퍼레이터 숙련</span>
        <div className="pool-chips">
          {player.championPool.map((champion) => <span key={champion.name}>{champion.name}</span>)}
        </div>
      </div>
    </article>
  );
}

function DraftScreen({
  homeTeam,
  awayTeam,
  session,
  revision,
  hoveredChampion,
  error,
  onHoverChampion,
  onSelectChampion,
}: {
  homeTeam: Team;
  awayTeam: Team;
  session: DraftSession;
  revision: number;
  hoveredChampion: Champion;
  error: string;
  onHoverChampion: (champion: Champion) => void;
  onSelectChampion: (champion: Champion) => void;
}) {
  const step = session.currentStep;
  const homePicks = session.homePicks;
  const awayPicks = session.awayPicks;
  const homeWarnings = compositionWarnings(homePicks);
  const awayWarnings = compositionWarnings(awayPicks);
  const hoveredReason = step ? session.getChampionDisabledReason(hoveredChampion) : undefined;

  return (
    <section className="screen-section draft-screen" key={revision}>
      <div className="eyebrow">LIVE DRAFT / 02</div>
      <div className="screen-heading draft-heading">
        <div>
          <h1>전장을 설계하십시오.</h1>
          <p>상대의 오퍼레이터 구성을 읽고, 우리 팀의 작전 빈틈을 한 자리씩 채우십시오.</p>
        </div>
        <div className="draft-counter">
          <span>진행</span>
          <strong>{String(session.stepIndex + 1).padStart(2, '0')} <em>/ 14</em></strong>
        </div>
      </div>

      <div className="draft-turn-banner">
        <div>
          <span className="turn-kicker">{step?.teamName === homeTeam.name ? 'YOUR TURN' : 'OPPONENT AI'}</span>
          <strong>{step?.teamName}</strong>
          <span>{step ? `${draftActionDisplayNames[step.action]}${step.targetPlayer ? ` · ${positionDisplayNames[step.targetPlayer.position]} ${formatPlayerName(step.targetPlayer)}` : ''}` : '완료'}</span>
        </div>
        <div className="turn-sequence">
          {session.records.slice(-4).map((record, index) => (
            <span key={`${record.champion.name}-${index}`} className={record.action === 'BAN' ? 'is-ban' : 'is-pick'}>
              {record.action === 'BAN' ? 'B' : 'P'} {record.champion.name}
            </span>
          ))}
        </div>
      </div>

      {error && <div className="error-strip">{error}</div>}

      <div className="draft-layout">
        <CompositionPanel team={homeTeam} side="HOME" picks={homePicks} warnings={homeWarnings} />
        <div className="champion-select-area">
          <div className="select-area-heading">
            <div>
                <span className="panel-kicker">OPERATOR ARCHIVE</span>
                <h2>오퍼레이터 선택</h2>
            </div>
            <span className="archive-count">25 CHAMPIONS</span>
          </div>
          <div className="selection-inspector">
            <div className="inspector-swatch" style={{ backgroundColor: hoveredChampion.symbolColor }} />
            <div>
              <strong>{hoveredChampion.title}{hoveredChampion.titleSeparator}{hoveredChampion.name}</strong>
              <span>{hoveredReason ? `선택 불가 · ${hoveredReason}` : '현재 차례에 선택할 수 있습니다.'}</span>
            </div>
          </div>
          <div className="champion-groups">
            {(() => {
              const position = step?.targetPlayer?.position ?? 'MID';
              return (
              <div className="position-group" key={position}>
                <div className="position-heading">
                  <span>{step?.targetPlayer ? `${positionDisplayNames[position]} 적합도 순` : '전체 오퍼레이터'}</span>
                  <span>25명 · 낮은 적합도 선택 가능</span>
                </div>
                <div className="champion-grid">
                  {getChampionsByPosition(position).map((champion) => {
                    const reason = session.getChampionDisabledReason(champion);
                    const selected = session.unavailable.has(champion.name);
                    const available = !reason;
                    return (
                      <button
                        type="button"
                        className={`champion-card ${selected ? 'is-selected' : ''} ${available ? 'is-available' : 'is-disabled'}`}
                        key={champion.name}
                        disabled={!available}
                        onMouseEnter={() => onHoverChampion(champion)}
                        onFocus={() => onHoverChampion(champion)}
                        onClick={() => onSelectChampion(champion)}
                        title={reason ?? '선택 가능'}
                        style={{ borderTopColor: champion.symbolColor }}
                      >
                        <span className="champion-title">{champion.name}</span>
                        <span className="champion-tags">
                          <small>{timingDisplayNames[champion.timing]}</small>
                          <small>{engagementDisplayNames[champion.engagement]}</small>
                          <small>{rangeDisplayNames[champion.range]}</small>
                          <small>{roleDisplayNames[champion.role]}</small>
                        </span>
                        <span className="champion-difficulty">난이도 {champion.difficulty}/5</span>
                        <span className="champion-difficulty">적합도 {champion.getPositionFit(position)}</span>
                        {selected && <span className="champion-status">{session.records.find((record) => record.champion.name === champion.name)?.action === 'BAN' ? '금지됨' : '선택됨'}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
              );
            })()}
          </div>
        </div>
        <CompositionPanel team={awayTeam} side="AWAY" picks={awayPicks} warnings={awayWarnings} />
      </div>
    </section>
  );
}

function CompositionPanel({
  team,
  side,
  picks,
  warnings,
}: {
  team: Team;
  side: 'HOME' | 'AWAY';
  picks: Champion[];
  warnings: string[];
}) {
  const counts = countCompositionTags(picks);
  return (
    <aside className={`composition-panel composition-${side.toLowerCase()}`}>
      <div className="composition-heading">
        <span className="panel-kicker">{side === 'HOME' ? 'MY COMPOSITION' : 'OPPONENT'}</span>
        <h2>{team.name}</h2>
      </div>
      <div className="composition-slots">
        {team.players.map((player, index) => {
          const champion = picks[index];
          return (
            <div className={`composition-slot ${champion ? 'has-pick' : ''}`} key={player.nickname}>
              <span>{positionDisplayNames[player.position]}</span>
              <strong>{champion ? champion.name : '미정'}</strong>
              <small>{formatPlayerName(player)}</small>
            </div>
          );
        })}
      </div>
      <div className="tag-distribution">
        <span className="subsection-label">태그 분포</span>
        <div className="tag-bars">
          {counts.map(({ label, count, warning }) => (
            <div className={`tag-bar ${warning ? 'is-warning' : ''}`} key={label}>
              <span>{label}</span>
              <i><b style={{ width: `${count * 20}%` }} /></i>
              <strong>{count}</strong>
            </div>
          ))}
        </div>
      </div>
      {warnings.length > 0 && (
        <div className="composition-warnings">
          <span className="subsection-label">감독 메모</span>
          {warnings.map((warning) => <p key={warning}>{warning}</p>)}
        </div>
      )}
    </aside>
  );
}

function countCompositionTags(picks: Champion[]) {
  return [
    { label: '초반형', count: picks.filter((pick) => pick.timing === 'EARLY').length, warning: picks.length >= 4 && picks.filter((pick) => pick.timing === 'EARLY').length >= 4 },
    { label: '후반형', count: picks.filter((pick) => pick.timing === 'LATE').length, warning: picks.length >= 4 && picks.filter((pick) => pick.timing === 'LATE').length >= 4 },
    { label: '돌진', count: picks.filter((pick) => pick.engagement === 'DIVE').length, warning: false },
    { label: '광역', count: picks.filter((pick) => pick.range === 'AOE').length, warning: false },
    { label: '탱커', count: picks.filter((pick) => pick.role === 'TANK').length, warning: picks.length === 5 && picks.every((pick) => pick.role !== 'TANK') },
  ];
}

function compositionWarnings(picks: Champion[]) {
  if (picks.length === 0) return [];
  const warnings: string[] = [];
  const lateCount = picks.filter((pick) => pick.timing === 'LATE').length;
  const earlyCount = picks.filter((pick) => pick.timing === 'EARLY').length;
  if (picks.length >= 4 && lateCount >= 4) warnings.push('후반형 편중 · 초반 주도권이 약할 수 있습니다.');
  if (picks.length >= 4 && earlyCount >= 4) warnings.push('초반형 편중 · 후반 성장 여지가 줄어듭니다.');
  if (picks.length === 5 && !picks.some((pick) => pick.role === 'TANK')) warnings.push('탱커 없음 · 전 구간 감점 가능성이 있습니다.');
  return warnings;
}

function WatchScreen({
  result,
  events,
  snapshots,
  timeline,
  tacticalRound,
  currentFrameIndex,
  speed,
  isPaused,
  highlightMode,
  onSetSpeed,
  onTogglePause,
  onSetHighlightMode,
  onSeek,
  onReset,
}: {
  result: MatchResult;
  events: MatchEvent[];
  snapshots: MatchPlayerSnapshot[];
  timeline: MatchTimeline;
  tacticalRound: TacticalRoundResult | null;
  currentFrameIndex: number;
  speed: number;
  isPaused: boolean;
  highlightMode: boolean;
  onSetSpeed: (speed: number) => void;
  onTogglePause: () => void;
  onSetHighlightMode: (enabled: boolean) => void;
  onSeek: (frameIndex: number) => void;
  onReset: () => void;
}) {
  const currentTime = timeline.frames[currentFrameIndex].timestampSeconds;
  const visibleEventCount = events.filter((event) => event.timestampSeconds <= currentTime).length;
  const isComplete = currentFrameIndex >= timeline.frames.length - 1;
  const visibleDecisionLogCount = tacticalRound
    ? Math.min(
      tacticalRound.decisionLogs.length,
      Math.floor((currentFrameIndex / Math.max(1, timeline.frames.length - 1)) * tacticalRound.decisionLogs.length) + 1,
    )
    : 0;
  const currentEvent = events[visibleEventCount - 1];
  const previousEvent = events[visibleEventCount - 2];
  const economy = deriveMatchEconomySnapshot(result, events, currentTime);
  const previousEconomy = deriveMatchEconomySnapshot(
    result,
    events,
    previousEvent?.timestampSeconds ?? 0,
  );
  const purchases = getItemPurchasesBetween(previousEconomy, economy);
  const levelUps = getLevelUpsBetween(previousEconomy, economy);
  const combatSummary = currentEvent ? deriveCombatDamage(result, currentEvent) : null;
  return (
    <section className="screen-section watch-screen">
      <div className="eyebrow">MATCH REVIEW / 03</div>
      <div className="screen-heading">
        <div>
          <h1>경기의 흐름을 읽으십시오.</h1>
          <p>이미 계산된 세 구간의 결과를 시간순 이벤트로 확인합니다.</p>
        </div>
        <div className={`result-stamp ${result.winner.name === result.homeTeam.name ? 'home-winner' : 'away-winner'}`}>
          <span>FINAL RESULT</span>
          <strong>{result.winner.name}</strong>
          <small>승리</small>
        </div>
      </div>

      <MatchScoreboard result={result} economy={economy} />

      <div className="watch-arena-layout">
        <MatchMap
          result={result}
          events={events}
          snapshots={snapshots}
          visibleEventCount={visibleEventCount}
          currentTime={currentTime}
          speed={speed}
          isPaused={isPaused}
          currentEvent={currentEvent}
          levelUpKeys={levelUps.map((levelUp) => levelUp.key)}
        />
        <aside className="event-rail">
          <div className="watch-controls">
            <div className="playback-control">
              <button className="outline-button pause-button" type="button" onClick={onTogglePause}>
                {isPaused ? '재생' : '일시정지'}
              </button>
              <span>{isPaused ? '맵과 중계가 멈춰 있습니다.' : '맵과 중계가 함께 흐릅니다.'}</span>
            </div>
            <div className="speed-control">
              <span>배속</span>
              {SPEEDS.map((value) => (
                <button key={value} type="button" className={speed === value ? 'is-active' : ''} onClick={() => onSetSpeed(value)}>
                  {value}x
                </button>
              ))}
            </div>
            <label className="highlight-control">
              <input
                type="checkbox"
                checked={highlightMode}
                onChange={(event) => onSetHighlightMode(event.target.checked)}
              />
              하이라이트만 보기
            </label>
            <div className="seek-control">
              <div>
                <span>{formatTimestamp(currentTime)}</span>
                <span>{formatTimestamp(timeline.durationSeconds)}</span>
              </div>
              <input
                type="range"
                min={0}
                max={timeline.frames.length - 1}
                value={currentFrameIndex}
                aria-label="경기 시간 이동"
                onChange={(event) => onSeek(Number(event.target.value))}
              />
            </div>
          </div>
          <div className="timeline-panel">
            <div className="timeline-heading">
              <span className="panel-kicker">CHRONICLE</span>
              <h2>경기 중계 기록</h2>
            </div>
            <div className="event-list">
              {events.slice(0, visibleEventCount).map((event, index) => (
                <EventRow
                  event={event}
                  result={result}
                  allEvents={events}
                  previousEvent={events[index - 1]}
                  isCurrent={index === visibleEventCount - 1}
                  key={`${event.timestampSeconds}-${event.type}-${index}`}
                />
              ))}
              {!isComplete && events.length > visibleEventCount && (
                <div className="event-pending"><span className="pending-line" /> 다음 사건을 기다리는 중</div>
              )}
              {isComplete && <div className="event-finished">모든 경기 이벤트가 기록되었습니다.</div>}
            </div>
          </div>
          {tacticalRound && (
            <TacticalDecisionFeed
              logs={tacticalRound.decisionLogs}
              visibleCount={visibleDecisionLogCount}
              isComplete={isComplete}
            />
          )}
          {(purchases.length > 0 || levelUps.length > 0 || combatSummary) && (
            <LiveMatchFeed
              purchases={purchases}
              levelUps={levelUps}
              combatSummary={combatSummary}
            />
          )}
        </aside>
      </div>

      {isComplete && <MatchReview result={result} economy={economy} />}

      <div className="action-bar review-action">
        <div>
          <span className="action-label">기록 보관</span>
          <p>같은 두 팀으로 새로운 밴픽을 시작하면 다른 경기 결과가 계산됩니다.</p>
        </div>
        <button className="outline-button primary-action" type="button" onClick={onReset}>다시 준비하기 <span aria-hidden="true">→</span></button>
      </div>
    </section>
  );
}

/** 전술 판단 로그를 기존 관전 피드의 재생 순서에 맞춰 표시합니다. */
function TacticalDecisionFeed({
  logs,
  visibleCount,
  isComplete,
}: {
  logs: TacticalDecisionLog[];
  visibleCount: number;
  isComplete: boolean;
}) {
  return (
    <section className="live-feed tactical-decision-feed" aria-label="전술 판단 로그">
      <div className="live-feed-heading">
        <span className="panel-kicker">TACTICAL DECISION</span>
        <h2>오퍼레이터 판단 기록</h2>
      </div>
      <div className="event-list">
        {logs.slice(0, visibleCount).map((log) => (
          <p className="live-feed-row live-feed-item" key={`${log.sequence}-${log.callSign}`}>
            <span>{log.type === 'ISOLATION' ? '고립 판단' : '교전 전환'}</span>
            <strong>{log.message}</strong>
          </p>
        ))}
        {!isComplete && visibleCount < logs.length && (
          <div className="event-pending"><span className="pending-line" /> 다음 판단을 기다리는 중</div>
        )}
        {isComplete && <div className="event-finished">모든 전술 판단이 기록되었습니다.</div>}
      </div>
    </section>
  );
}

function MatchScoreboard({
  result,
  economy,
}: {
  result: MatchResult;
  economy: MatchEconomySnapshot;
}) {
  const goldDifference = Math.abs(economy.goldDifference);
  const maxGold = Math.max(economy.home.gold, economy.away.gold, 1);
  const homeGoldWidth = `${Math.max(6, economy.home.gold / maxGold * 100)}%`;
  const awayGoldWidth = `${Math.max(6, economy.away.gold / maxGold * 100)}%`;
  return (
    <section className="broadcast-scoreboard" aria-label="실시간 경기 스코어보드">
      <div className="broadcast-team broadcast-home">
        <span className="broadcast-side">HOME</span>
        <strong>{result.homeTeam.name}</strong>
        <b className="score-number">{String(economy.home.kills).padStart(2, '0')}</b>
      </div>
      <div className="broadcast-stat">
        <span>처치</span>
        <strong className="score-number">{String(economy.away.kills).padStart(2, '0')}</strong>
      </div>
      <div className="broadcast-stat broadcast-gold-stat">
        <span>총 전투 자원</span>
        <strong className="gold-number">{economy.home.gold.toLocaleString()} : {economy.away.gold.toLocaleString()}</strong>
        <div className="gold-bar" aria-label={`전투 자원 격차 ${goldDifference.toLocaleString()}`}>
          <i className="gold-bar-home" style={{ width: homeGoldWidth }} />
          <i className="gold-bar-away" style={{ width: awayGoldWidth }} />
        </div>
        <small className={economy.goldDifference >= 0 ? 'home-text' : 'away-text'}>
          {economy.goldDifference >= 0 ? 'HOME' : 'AWAY'} +{goldDifference.toLocaleString()}
        </small>
      </div>
      <div className="broadcast-stat">
        <span>평균 레벨</span>
        <strong className="score-number">{economy.home.averageLevel.toFixed(1)} : {economy.away.averageLevel.toFixed(1)}</strong>
      </div>
      <div className="broadcast-stat">
        <span>오브젝트</span>
        <strong className="score-number">{economy.home.objectives} : {economy.away.objectives}</strong>
      </div>
      <div className="broadcast-team broadcast-away">
        <b className="score-number">{String(economy.away.kills).padStart(2, '0')}</b>
        <strong>{result.awayTeam.name}</strong>
        <span className="broadcast-side">AWAY</span>
      </div>
      <time className="broadcast-clock">{formatTimestamp(economy.timestampSeconds)}</time>
      <div className="broadcast-player-strip">
        {economy.players.map((player) => (
          <div
            className={`broadcast-player-stat ${player.teamName === result.homeTeam.name ? 'broadcast-player-home' : 'broadcast-player-away'}`}
            key={player.key}
          >
            <span>{formatPlayerName(player.player)}</span>
            <b>Lv {player.level}</b>
            <strong>{player.gold.toLocaleString()}G</strong>
            <small>{player.items.map((item) => item.name).join(' · ') || '기본 장비'}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

function LiveMatchFeed({
  purchases,
  levelUps,
  combatSummary,
}: {
  purchases: ReturnType<typeof getItemPurchasesBetween>;
  levelUps: ReturnType<typeof getLevelUpsBetween>;
  combatSummary: ReturnType<typeof deriveCombatDamage>;
}) {
  return (
    <section className="live-feed" aria-label="실시간 경기 정보">
      <div className="live-feed-heading">
        <span className="panel-kicker">LIVE INFORMATION</span>
        <h2>중계 데이터</h2>
      </div>
      {purchases.map((purchase) => (
        <p className="live-feed-row live-feed-item" key={`${purchase.key}-${purchase.item.key}`}>
          <span>구매</span>
          <strong>{formatEconomyPlayer(purchase)} · {purchase.item.name}</strong>
        </p>
      ))}
      {levelUps.map((levelUp) => (
        <p className="live-feed-row live-feed-level" key={`${levelUp.key}-${levelUp.level}`}>
          <span>LEVEL UP</span>
          <strong>{formatEconomyPlayer(levelUp)} · 레벨 {levelUp.level}</strong>
          {levelUp.isLateGrowth && <small>후반 성장</small>}
        </p>
      ))}
      {combatSummary && (
        <div className="live-feed-combat">
          <div className="live-feed-combat-heading">
            <span>교전 피해량</span>
            <small>{matchEventDisplayNames[combatSummary.event.type]}</small>
          </div>
          {combatSummary.entries.map((entry, index) => (
            <p key={entry.key}>
              <i>{index + 1}</i>
              <strong>{formatPlayerName(entry.player)}</strong>
              <span>{entry.damage.toLocaleString()} DMG{entry.targetCount > 1 ? ` · ${entry.targetCount}명 분산` : ''}</span>
            </p>
          ))}
        </div>
      )}
    </section>
  );
}

function EventRow({
  event,
  result,
  allEvents,
  previousEvent,
  isCurrent,
}: {
  event: MatchEvent;
  result: MatchResult;
  allEvents: MatchEvent[];
  previousEvent?: MatchEvent;
  isCurrent: boolean;
}) {
  const lead = event.participants[0];
  const combatSummary = deriveCombatDamage(result, event);
  const before = deriveMatchEconomySnapshot(result, allEvents, previousEvent?.timestampSeconds ?? 0);
  const after = deriveMatchEconomySnapshot(result, allEvents, event.timestampSeconds);
  const purchases = getItemPurchasesBetween(before, after);
  return (
    <article className={`event-row event-${event.type.toLowerCase()} ${isCurrent ? 'is-current' : ''}`}>
      <time>{formatTimestamp(event.timestampSeconds)}</time>
      <span className="event-type">{matchEventDisplayNames[event.type]}</span>
      <div className="event-copy">
        <strong>{event.description}</strong>
        <span>{lead.teamName} · {event.participants.map((participant) => `${formatPlayerName(participant.player)} / ${participant.champion.name}`).join(' · ')}</span>
        {purchases.length > 0 && (
          <small className="event-purchase-note">
            구매 · {purchases.map((purchase) => `${formatPlayerName(purchase.player)} ${purchase.item.name}`).join(' / ')}
          </small>
        )}
        {combatSummary && (
          <small className="event-damage-note">
            피해량 · {combatSummary.entries.slice(0, 3).map((entry) => `${formatPlayerName(entry.player)} ${entry.damage.toLocaleString()}`).join(' · ')}
          </small>
        )}
      </div>
    </article>
  );
}

type MapPosition = { x: number; y: number };
type MapPlayer = {
  key: string;
  teamName: string;
  player: Player;
  champion: Champion;
  teamColor: string;
  position: MapPosition;
};
type MapEffect = {
  position: MapPosition;
  teamColor: string;
  eventType: MatchEvent['type'];
  participantCount: number;
  age: number;
};

/**
 * 경기 관전용 탑다운 맵을 캔버스 하나로 그립니다.
 * 지형은 실제 게임 맵을 복제하지 않고 세 개의 대각선 라인과 정글 면만 표현합니다.
 */
function MatchMap({
  result,
  events,
  snapshots,
  visibleEventCount,
  currentTime,
  speed,
  isPaused,
  currentEvent,
  levelUpKeys,
}: {
  result: MatchResult;
  events: MatchEvent[];
  snapshots: MatchPlayerSnapshot[];
  visibleEventCount: number;
  currentTime: number;
  speed: number;
  isPaused: boolean;
  currentEvent?: MatchEvent;
  levelUpKeys: string[];
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const broadcastScene = useMemo(
    () => deriveBroadcastScene(result, events.slice(0, visibleEventCount), snapshots, currentTime),
    [result, events, snapshots, visibleEventCount, currentTime],
  );
  const playersRef = useRef<MapPlayer[]>(createMapPlayers(result));
  const targetsRef = useRef<Record<string, MapPosition>>(
    Object.fromEntries(playersRef.current.map((player) => [player.key, player.position])),
  );
  const effectsRef = useRef<MapEffect[]>([]);
  const lastVisibleEventRef = useRef(0);
  const lastFrameTimeRef = useRef(0);
  const speedRef = useRef(speed);
  const pausedRef = useRef(isPaused);
  const cameraCenterRef = useRef< MapPosition>(broadcastScene.cameraCenter);

  useEffect(() => {
    speedRef.current = speed;
    pausedRef.current = isPaused;
  }, [speed, isPaused]);

  useEffect(() => {
    if (visibleEventCount < lastVisibleEventRef.current) {
      lastVisibleEventRef.current = 0;
      effectsRef.current = [];
      playersRef.current = createMapPlayers(result);
      targetsRef.current = Object.fromEntries(
        playersRef.current.map((player) => [player.key, player.position]),
      );
    }
    const snapshot = snapshots.reduce<MatchPlayerSnapshot | undefined>(
      (selected, candidate) =>
        candidate.timestampSeconds <= currentTime
          && (!selected || candidate.timestampSeconds > selected.timestampSeconds)
          ? candidate
          : selected,
      undefined,
    );
    snapshot?.players.forEach((snapshotPlayer) => {
      targetsRef.current[getMapPlayerKey(snapshotPlayer.teamName, snapshotPlayer.player)] = snapshotPlayer.position;
    });
    for (let eventIndex = lastVisibleEventRef.current; eventIndex < visibleEventCount; eventIndex += 1) {
      const event = events[eventIndex];
      if (!event) continue;
      const eventPosition = getEventMapPosition(event);
      event.participants.forEach((participant, participantIndex) => {
        const key = getMapPlayerKey(participant.teamName, participant.player);
        const offset = (participantIndex - (event.participants.length - 1) / 2) * 0.028;
        targetsRef.current[key] = clampMapPosition({
          x: eventPosition.x + offset,
          y: eventPosition.y + offset * 0.55,
        });
      });
      effectsRef.current.push({
        position: eventPosition,
        teamColor: event.participants[0]?.teamName === result.homeTeam.name ? HOME_MAP_COLOR : AWAY_MAP_COLOR,
        eventType: event.type,
        participantCount: event.participants.length,
        age: 0,
      });
    }
    lastVisibleEventRef.current = visibleEventCount;
  }, [events, result, visibleEventCount]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const context = canvas.getContext('2d');
    if (!context) return undefined;

    /**
     * 캔버스의 논리 좌표를 화면 픽셀에 맞춰 보정하고, 한 프레임의 맵을 그립니다.
     */
    const draw = (now: number) => {
      const frameDelta = lastFrameTimeRef.current === 0
        ? 0
        : Math.min((now - lastFrameTimeRef.current) / 1000, 0.08);
      lastFrameTimeRef.current = now;
      const rect = canvas.getBoundingClientRect();
      const pixelRatio = window.devicePixelRatio || 1;
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);
      if (canvas.width !== Math.floor(width * pixelRatio) || canvas.height !== Math.floor(height * pixelRatio)) {
        canvas.width = Math.floor(width * pixelRatio);
        canvas.height = Math.floor(height * pixelRatio);
      }
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      if (!pausedRef.current) {
        const movement = Math.min(1, frameDelta * (1.15 + speedRef.current * 0.22));
        playersRef.current.forEach((player) => {
          const target = targetsRef.current[player.key] ?? player.position;
          player.position = {
            x: player.position.x + (target.x - player.position.x) * movement,
            y: player.position.y + (target.y - player.position.y) * movement,
          };
        });
        effectsRef.current = effectsRef.current
          .map((effect) => ({ ...effect, age: effect.age + frameDelta * speedRef.current }))
          .filter((effect) => effect.age < 1.7);
        cameraCenterRef.current = {
          x: cameraCenterRef.current.x + (broadcastScene.cameraCenter.x - cameraCenterRef.current.x) * Math.min(1, frameDelta * 2.6),
          y: cameraCenterRef.current.y + (broadcastScene.cameraCenter.y - cameraCenterRef.current.y) * Math.min(1, frameDelta * 2.6),
        };
      }

      context.clearRect(0, 0, width, height);
      drawBroadcastCanvas(context, width, height, broadcastScene, result, cameraCenterRef.current, currentTime);
      drawMiniMap(context, width, height, broadcastScene, result, cameraCenterRef.current);
      frameRef.current = window.requestAnimationFrame(draw);
    };

    const frameRef = { current: window.requestAnimationFrame(draw) };
    return () => window.cancelAnimationFrame(frameRef.current);
  }, [broadcastScene, currentTime, events, result, snapshots, visibleEventCount, levelUpKeys]);

  return (
    <section className="arena-panel">
      <div className="arena-heading">
        <div>
          <span className="panel-kicker">TACTICAL VIEW</span>
          <h2>전장 관전</h2>
        </div>
        <span>{isPaused ? 'PAUSED' : `${visibleEventCount} / ${events.length} EVENTS`}</span>
      </div>
      <div className="map-canvas-wrap">
        <canvas ref={canvasRef} aria-label="라인전과 중계 카메라가 표시되는 경기 캔버스" />
        <div className="map-overlay-caption">
          <span>{getLaneLabel(broadcastScene.focusLane)} · {currentEvent ? matchEventDisplayNames[currentEvent.type] : '라인전'}</span>
          <strong>{broadcastScene.laneMessage}</strong>
        </div>
        <div className="map-legend">
          <span><i className="legend-dot home-dot" /> HOME</span>
          <span><i className="legend-dot away-dot" /> AWAY</span>
          <span><i className="legend-ring" /> 중계 카메라</span>
        </div>
      </div>
    </section>
  );
}

/**
 * 결과의 열 명을 맵에 올릴 초기 위치를 만듭니다.
 */
function createMapPlayers(result: MatchResult): MapPlayer[] {
  return [
    ...result.homeTeam.players.map((player, index) => createMapPlayer(result.homeTeam.name, player, result.homePicks[index], true)),
    ...result.awayTeam.players.map((player, index) => createMapPlayer(result.awayTeam.name, player, result.awayPicks[index], false)),
  ];
}

/**
 * 한 선수의 팀 색과 포지션별 초기 위치를 결합합니다.
 */
function createMapPlayer(teamName: string, player: Player, champion: Champion, isHome: boolean): MapPlayer {
  const basePosition = getPositionMapPosition(player.position);
  return {
    key: getMapPlayerKey(teamName, player),
    teamName,
    player,
    champion,
    teamColor: isHome ? HOME_MAP_COLOR : AWAY_MAP_COLOR,
    position: isHome ? basePosition : { x: 1 - basePosition.x, y: 1 - basePosition.y },
  };
}

/**
 * 포지션별로 본진과 라인 사이에 흩어질 초기 위치를 반환합니다.
 */
function getPositionMapPosition(position: Position): MapPosition {
  return {
    TOP: { x: 0.2, y: 0.8 },
    JUNGLE: { x: 0.34, y: 0.66 },
    MID: { x: 0.5, y: 0.5 },
    ADC: { x: 0.66, y: 0.34 },
    SUPPORT: { x: 0.78, y: 0.22 },
  }[position];
}

/**
 * 선수 객체에 안정적인 캔버스용 키를 붙입니다.
 */
function getMapPlayerKey(teamName: string, player: Player): string {
  return `${teamName}:${player.nickname}`;
}

/**
 * 좌표가 없거나 범위를 벗어난 이벤트를 화면에 맞는 위치로 보정합니다.
 */
function getEventMapPosition(event: MatchEvent): MapPosition {
  if (
    event.position
    && Number.isFinite(event.position.x)
    && Number.isFinite(event.position.y)
  ) return clampMapPosition(event.position);
  const leadPosition = event.participants[0]?.player.position;
  if (event.type === 'TEAMFIGHT') return { x: 0.5, y: 0.5 };
  if (event.type === 'OBJECTIVE') return MAP_OBJECTS[1];
  return getPositionMapPosition(leadPosition ?? 'MID');
}

/**
 * 모든 맵 좌표를 0과 1 사이로 제한합니다.
 */
function clampMapPosition(position: MapPosition): MapPosition {
  return {
    x: Math.min(0.94, Math.max(0.06, position.x)),
    y: Math.min(0.94, Math.max(0.06, position.y)),
  };
}

/**
 * 중계 카메라의 정규화된 좌표를 현재 캔버스의 화면 좌표로 변환합니다.
 * x/y를 별도로 스케일해 16:9 화면에서도 맵의 전체 좌표계를 유지합니다.
 */
function getBroadcastScreenPoint(
  point: MapPosition,
  width: number,
  height: number,
  cameraCenter: MapPosition,
  zoom: number,
) {
  return {
    x: (point.x - cameraCenter.x) * zoom * width + width / 2,
    y: (point.y - cameraCenter.y) * zoom * height + height / 2,
  };
}

/**
 * 라인전 중계 화면을 그립니다. 모든 위치와 수치는 matchBroadcast가 만든 표시 데이터만 사용합니다.
 */
function drawBroadcastCanvas(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  scene: BroadcastScene,
  result: MatchResult,
  cameraCenter: MapPosition,
  timestampSeconds: number,
) {
  const zoom = scene.cameraZoom;
  const center = clampMapPosition(cameraCenter);
  const toScreen = (point: MapPosition) => getBroadcastScreenPoint(point, width, height, center, zoom);

  context.save();
  context.fillStyle = '#0B0A08';
  context.fillRect(0, 0, width, height);
  context.beginPath();
  context.rect(0, 0, width, height);
  context.clip();

  drawBroadcastTerrain(context, width, height, toScreen);

  scene.turrets.forEach((turret) => {
    drawBroadcastTurret(context, toScreen(turret.position), turret, getBroadcastTeamColor(turret.teamName, result));
  });
  scene.wards.forEach((ward) => {
    drawBroadcastWard(context, toScreen(ward.position), ward, getBroadcastTeamColor(ward.teamName, result));
  });
  scene.minions.forEach((minion) => {
    const point = toScreen(minion.position);
    const color = getBroadcastTeamColor(minion.teamName, result);
    context.save();
    context.globalAlpha = minion.alive ? 0.82 : 0.2;
    context.fillStyle = color;
    context.beginPath();
    context.arc(point.x, point.y, 2.5, 0, Math.PI * 2);
    context.fill();
    context.restore();
  });
  scene.projectiles.forEach((projectile) => {
    const source = toScreen(projectile.source);
    const target = toScreen(projectile.target);
    const progress = Math.min(1, Math.max(0, projectile.progress));
    const point = {
      x: source.x + (target.x - source.x) * progress,
      y: source.y + (target.y - source.y) * progress,
    };
    const color = getBroadcastTeamColor(projectile.teamName, result);
    context.save();
    context.strokeStyle = `${color}88`;
    context.lineWidth = 1.4;
    context.setLineDash([4, 5]);
    context.beginPath();
    context.moveTo(source.x, source.y);
    context.lineTo(point.x, point.y);
    context.stroke();
    context.setLineDash([]);
    context.fillStyle = projectile.hit ? '#C9A227' : color;
    context.shadowColor = color;
    context.shadowBlur = 8;
    context.beginPath();
    context.arc(point.x, point.y, projectile.hit ? 4 : 3, 0, Math.PI * 2);
    context.fill();
    context.restore();
  });

  if (scene.focusEvent) {
    const focusPoint = toScreen(scene.focusEvent.position);
    context.save();
    context.strokeStyle = '#C9A227';
    context.globalAlpha = 0.8;
    context.lineWidth = 1.2;
    context.setLineDash([6, 5]);
    context.beginPath();
    context.arc(focusPoint.x, focusPoint.y, Math.max(24, Math.min(width, height) * 0.09), 0, Math.PI * 2);
    context.stroke();
    context.restore();
  }

  scene.champions.forEach((champion) => {
    drawBroadcastChampion(context, toScreen(champion.position), champion, result);
  });
  context.restore();

  context.save();
  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, 'rgba(11, 10, 8, .64)');
  gradient.addColorStop(0.16, 'rgba(11, 10, 8, 0)');
  gradient.addColorStop(0.8, 'rgba(11, 10, 8, 0)');
  gradient.addColorStop(1, 'rgba(11, 10, 8, .68)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  context.fillStyle = '#C9A227';
  context.font = '10px Georgia';
  context.letterSpacing = '1px';
  context.fillText(`LIVE · ${formatTimestamp(Math.round(timestampSeconds))}`, 16, 20);
  context.fillStyle = '#7E7565';
  context.font = '9px Georgia';
  context.fillText(`${getLaneLabel(scene.focusLane).toUpperCase()} LINE · ${zoom.toFixed(1)}×`, 16, 35);
  context.restore();
}

/**
 * 전체 맵의 지형과 세 라인을 중계용 확대 좌표계에 맞춰 그립니다.
 */
function drawBroadcastTerrain(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  toScreen: (point: MapPosition) => { x: number; y: number },
) {
  const linePaths: MapPosition[][] = [
    [{ x: 0.07, y: 0.08 }, { x: 0.07, y: 0.92 }, { x: 0.92, y: 0.92 }],
    [{ x: 0.08, y: 0.08 }, { x: 0.92, y: 0.92 }],
    [{ x: 0.08, y: 0.08 }, { x: 0.92, y: 0.08 }, { x: 0.92, y: 0.92 }],
  ];
  const drawPath = (path: MapPosition[], lineWidth: number, color: string) => {
    context.beginPath();
    path.forEach((point, index) => {
      const screenPoint = toScreen(point);
      if (index === 0) context.moveTo(screenPoint.x, screenPoint.y);
      else context.lineTo(screenPoint.x, screenPoint.y);
    });
    context.lineWidth = lineWidth;
    context.strokeStyle = color;
    context.stroke();
  };

  context.fillStyle = '#12100C';
  context.fillRect(0, 0, width, height);
  const jungle = toScreen({ x: 0.5, y: 0.5 });
  context.save();
  context.fillStyle = 'rgba(36, 31, 20, .42)';
  context.beginPath();
  context.ellipse(jungle.x, jungle.y, width * 0.23, height * 0.38, Math.PI / 4, 0, Math.PI * 2);
  context.fill();
  context.restore();

  linePaths.forEach((path) => drawPath(path, Math.max(18, Math.min(width, height) * 0.045), '#211C13'));
  linePaths.forEach((path) => drawPath(path, Math.max(1.5, Math.min(width, height) * 0.006), '#5B4A25'));
  drawPath([{ x: 0.06, y: 0.06 }, { x: 0.94, y: 0.06 }, { x: 0.94, y: 0.94 }, { x: 0.06, y: 0.94 }, { x: 0.06, y: 0.06 }], 1, '#3A311F');

  const homeBase = toScreen({ x: 0.1, y: 0.9 });
  const awayBase = toScreen({ x: 0.9, y: 0.1 });
  [
    { point: homeBase, color: HOME_MAP_COLOR, label: 'HOME' },
    { point: awayBase, color: AWAY_MAP_COLOR, label: 'AWAY' },
  ].forEach(({ point, color, label }) => {
    context.save();
    context.fillStyle = `${color}35`;
    context.strokeStyle = color;
    context.lineWidth = 1.5;
    context.beginPath();
    context.rect(point.x - 24, point.y - 24, 48, 48);
    context.fill();
    context.stroke();
    context.fillStyle = color;
    context.font = '10px Georgia';
    context.textAlign = label === 'HOME' ? 'left' : 'right';
    context.fillText(label, point.x + (label === 'HOME' ? 31 : -31), point.y + 4);
    context.restore();
  });
}

function drawBroadcastChampion(
  context: CanvasRenderingContext2D,
  point: { x: number; y: number },
  champion: BroadcastScene['champions'][number],
  result: MatchResult,
) {
  const color = getBroadcastTeamColor(champion.teamName, result);
  const barWidth = 52;
  const left = point.x - barWidth / 2;
  const top = point.y - 24;
  context.save();
  context.globalAlpha = champion.health <= 0 ? 0.35 : 1;
  context.fillStyle = '#090806';
  context.fillRect(left, top, barWidth, 4);
  context.fillStyle = champion.health > 45 ? '#6E9B62' : '#B5794A';
  context.fillRect(left, top, barWidth * Math.max(0, champion.health) / 100, 4);
  context.fillStyle = '#090806';
  context.fillRect(left, top + 5, barWidth, 2);
  context.fillStyle = color;
  context.fillRect(left, top + 5, barWidth * Math.max(0, champion.resource) / 100, 2);
  context.fillStyle = color;
  context.strokeStyle = champion.champion.symbolColor;
  context.lineWidth = 2;
  context.beginPath();
  context.arc(point.x, point.y, 9, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.fillStyle = '#C9C0A8';
  context.font = '11px Georgia';
  context.textAlign = point.x < (context.canvas.clientWidth || context.canvas.width) / 2 ? 'left' : 'right';
  const labelX = point.x + (context.textAlign === 'left' ? 14 : -14);
  context.fillText(champion.champion.name, labelX, point.y - 5);
  context.fillStyle = '#7E7565';
  context.font = '9px Georgia';
  context.fillText(`${champion.state} · CS ${champion.cs}`, labelX, point.y + 8);
  context.restore();
}

function drawBroadcastTurret(
  context: CanvasRenderingContext2D,
  point: { x: number; y: number },
  turret: BroadcastScene['turrets'][number],
  color: string,
) {
  context.save();
  context.globalAlpha = turret.destroyed ? 0.25 : 0.92;
  context.fillStyle = turret.destroyed ? '#4A4131' : color;
  context.strokeStyle = '#C9A227';
  context.lineWidth = 1;
  context.beginPath();
  context.rect(point.x - 6, point.y - 6, 12, 12);
  context.fill();
  context.stroke();
  context.restore();
}

function drawBroadcastWard(
  context: CanvasRenderingContext2D,
  point: { x: number; y: number },
  ward: BroadcastScene['wards'][number],
  color: string,
) {
  context.save();
  context.strokeStyle = color;
  context.globalAlpha = Math.min(1, 0.35 + ward.remaining / 120);
  context.lineWidth = 1;
  context.beginPath();
  context.arc(point.x, point.y, 8, 0, Math.PI * 2);
  context.stroke();
  context.fillStyle = color;
  context.font = '8px Georgia';
  context.textAlign = 'center';
  context.fillText(`${Math.ceil(ward.remaining)}s`, point.x, point.y - 11);
  context.restore();
}

/**
 * 전체 맵, 열 명의 현재 위치, 중계 카메라 사각 영역을 우측 하단에 겹쳐 그립니다.
 */
function drawMiniMap(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  scene: BroadcastScene,
  result: MatchResult,
  cameraCenter: MapPosition,
) {
  const size = Math.min(188, Math.max(132, width * 0.24), height * 0.34);
  const left = width - size - 14;
  const top = height - size - 14;
  const mapPoint = (point: MapPosition) => ({
    x: left + point.x * size,
    y: top + point.y * size,
  });

  context.save();
  context.fillStyle = 'rgba(15, 13, 9, .94)';
  context.fillRect(left - 6, top - 6, size + 12, size + 12);
  context.strokeStyle = '#C9A227';
  context.lineWidth = 1;
  context.strokeRect(left - 6, top - 6, size + 12, size + 12);
  drawMiniMapTerrain(context, left, top, size);

  scene.turrets.forEach((turret) => {
    const point = mapPoint(turret.position);
    context.fillStyle = turret.destroyed ? '#4A4131' : getBroadcastTeamColor(turret.teamName, result);
    context.globalAlpha = turret.destroyed ? 0.35 : 0.9;
    context.fillRect(point.x - 2, point.y - 2, 4, 4);
  });
  scene.allChampions.forEach((champion) => {
    const point = mapPoint(champion.position);
    context.globalAlpha = 1;
    context.fillStyle = getBroadcastTeamColor(champion.teamName, result);
    context.strokeStyle = champion.champion.symbolColor;
    context.lineWidth = 1;
    context.beginPath();
    context.arc(point.x, point.y, 3.4, 0, Math.PI * 2);
    context.fill();
    context.stroke();
  });

  const halfView = 0.5 / scene.cameraZoom;
  const miniCameraCenter = clampMapPosition(cameraCenter);
  const cameraLeft = left + (miniCameraCenter.x - halfView) * size;
  const cameraTop = top + (miniCameraCenter.y - halfView) * size;
  context.globalAlpha = 0.95;
  context.strokeStyle = '#C9A227';
  context.lineWidth = 1.4;
  context.strokeRect(cameraLeft, cameraTop, halfView * 2 * size, halfView * 2 * size);
  context.fillStyle = '#C9A227';
  context.font = '8px Georgia';
  context.textAlign = 'left';
  context.fillText('CAM', left + 7, top + 12);
  context.restore();
}

function drawMiniMapTerrain(context: CanvasRenderingContext2D, left: number, top: number, size: number) {
  const point = (x: number, y: number) => ({ x: left + x * size, y: top + y * size });
  const paths = [
    [point(0.07, 0.08), point(0.07, 0.92), point(0.92, 0.92)],
    [point(0.08, 0.08), point(0.92, 0.92)],
    [point(0.08, 0.08), point(0.92, 0.08), point(0.92, 0.92)],
  ];
  context.fillStyle = '#15130E';
  context.fillRect(left, top, size, size);
  context.fillStyle = '#11100C';
  context.fillRect(left + size * 0.11, top + size * 0.11, size * 0.78, size * 0.78);
  paths.forEach((path) => {
    context.beginPath();
    path.forEach((item, index) => index === 0 ? context.moveTo(item.x, item.y) : context.lineTo(item.x, item.y));
    context.strokeStyle = '#6A5427';
    context.lineWidth = 2.2;
    context.stroke();
  });
  context.strokeStyle = '#3A311F';
  context.lineWidth = 1;
  context.strokeRect(left, top, size, size);
}

/**
 * 대각선 세 라인과 그 사이의 정글 면을 그립니다.
 */
function drawMapTerrain(context: CanvasRenderingContext2D, offsetX: number, offsetY: number, size: number) {
  context.save();
  context.translate(offsetX, offsetY);
  context.fillStyle = '#15130E';
  context.fillRect(0, 0, size, size);
  context.fillStyle = '#11100C';
  context.beginPath();
  context.moveTo(0.06 * size, 0.94 * size);
  context.lineTo(0.94 * size, 0.06 * size);
  context.lineTo(0.94 * size, 0.94 * size);
  context.closePath();
  context.fill();
  context.beginPath();
  context.moveTo(0.06 * size, 0.94 * size);
  context.lineTo(0.94 * size, 0.06 * size);
  context.lineTo(0.06 * size, 0.06 * size);
  context.closePath();
  context.fill();
  context.strokeStyle = '#2C2618';
  context.lineWidth = Math.max(1, size * 0.002);
  [-0.045, 0, 0.045].forEach((lineOffset) => {
    context.beginPath();
    context.moveTo(0.06 * size, (0.94 + lineOffset) * size);
    context.lineTo(0.94 * size, (0.06 + lineOffset) * size);
    context.stroke();
  });
  context.strokeStyle = '#3A311F';
  context.strokeRect(0.025 * size, 0.025 * size, 0.95 * size, 0.95 * size);
  drawMapBase(context, { x: 0.1 * size, y: 0.9 * size }, HOME_MAP_COLOR, 'HOME');
  drawMapBase(context, { x: 0.9 * size, y: 0.1 * size }, AWAY_MAP_COLOR, 'AWAY');
  context.restore();
}

/**
 * 본진을 작은 색면과 방향 표기로 그립니다.
 */
function drawMapBase(context: CanvasRenderingContext2D, point: { x: number; y: number }, color: string, label: string) {
  context.save();
  context.fillStyle = `${color}35`;
  context.strokeStyle = color;
  context.lineWidth = 1.5;
  context.beginPath();
  context.rect(point.x - 18, point.y - 18, 36, 36);
  context.fill();
  context.stroke();
  context.fillStyle = color;
  context.font = '10px Georgia';
  context.textAlign = label === 'HOME' ? 'left' : 'right';
  context.fillText(label, point.x + (label === 'HOME' ? 25 : -25), point.y + 4);
  context.restore();
}

/**
 * 오브젝트 표식을 고정 위치에 그리며 꺼진 오브젝트는 어둡게 표시합니다.
 */
function drawMapObject(context: CanvasRenderingContext2D, point: { x: number; y: number }, label: string, isActive: boolean) {
  context.save();
  context.globalAlpha = isActive ? 0.95 : 0.24;
  context.strokeStyle = '#C9A227';
  context.fillStyle = '#15120D';
  context.lineWidth = 1.2;
  context.beginPath();
  context.arc(point.x, point.y, 9, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.fillStyle = '#C9A227';
  context.font = '9px Georgia';
  context.textAlign = 'center';
  context.fillText(label, point.x, point.y + 22);
  context.restore();
}

/**
 * 이벤트 참가자 수에 비례해 한 겹 또는 여러 겹의 파동을 그립니다.
 */
function drawMapEffect(context: CanvasRenderingContext2D, point: { x: number; y: number }, mapSize: number, effect: MapEffect) {
  const progress = effect.age / 1.7;
  const ringCount = effect.participantCount >= 3 || effect.eventType === 'TEAMFIGHT' ? 3 : 1;
  context.save();
  context.globalAlpha = Math.max(0, 1 - progress);
  context.strokeStyle = effect.teamColor;
  context.lineWidth = Math.max(1, mapSize * 0.004);
  for (let index = 0; index < ringCount; index += 1) {
    const ringProgress = Math.min(1, progress + index * 0.13);
    const radius = mapSize * (0.025 + ringProgress * (0.085 + effect.participantCount * 0.012));
    context.beginPath();
    context.arc(point.x, point.y, radius, 0, Math.PI * 2);
    context.stroke();
  }
  context.restore();
}

/**
 * 팀 색을 면으로, 챔피언 상징색을 테두리로 사용해 선수 점을 그립니다.
 */
function drawMapPlayer(context: CanvasRenderingContext2D, point: { x: number; y: number }, player: MapPlayer) {
  context.save();
  context.fillStyle = player.teamColor;
  context.strokeStyle = player.champion.symbolColor;
  context.lineWidth = 2;
  context.beginPath();
  context.arc(point.x, point.y, 6, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.fillStyle = '#C9C0A8';
  context.font = '11px Georgia';
  context.textAlign = point.x < 0.55 * (context.canvas.width || 1) ? 'left' : 'right';
  context.fillText(player.champion.name, point.x + (context.textAlign === 'left' ? 10 : -10), point.y + 4);
  context.restore();
}

/** 레벨업 순간 선수 아이콘 위에 잠깐 뜨는 중계 표식입니다. */
function drawMapLevelUp(context: CanvasRenderingContext2D, point: { x: number; y: number }, player: MapPlayer) {
  context.save();
  context.fillStyle = '#C9A227';
  context.font = 'bold 9px Georgia';
  context.textAlign = 'center';
  context.fillText('LEVEL UP', point.x, point.y - 13);
  context.strokeStyle = '#C9A227';
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(point.x - 16, point.y - 9);
  context.lineTo(point.x + 16, point.y - 9);
  context.stroke();
  context.restore();
}

function MatchReview({
  result,
  economy,
}: {
  result: MatchResult;
  economy: MatchEconomySnapshot;
}) {
  const damageRanking = [...economy.players].sort((left, right) => right.damage - left.damage);
  return (
    <section className="match-review">
      <div className="review-heading">
        <div>
          <span className="panel-kicker">POST-MATCH REPORT</span>
          <h2>세 구간 총평</h2>
        </div>
        <span>승부를 바꾼 것은 이벤트가 아니라 밴픽과 구간 판정입니다.</span>
      </div>
      <div className="phase-review-grid">
        {result.phases.map((phase) => (
          <article className={`phase-review ${phase.winnerName === result.homeTeam.name ? 'home-phase' : 'away-phase'}`} key={phase.phase}>
            <div className="phase-review-top">
              <span>{phaseDisplayNames[phase.phase]}</span>
              <strong>{phase.winnerName}</strong>
            </div>
            <div className="phase-power">
              <span>{phase.homePower.toFixed(1)} <small>HOME</small></span>
              <i>:</i>
              <span><small>AWAY</small> {phase.awayPower.toFixed(1)}</span>
            </div>
            <p>{getPhaseAdjustmentSummary(phase)}</p>
            <small className="phase-level">레벨 {phase.homeLevel} : {phase.awayLevel}</small>
          </article>
        ))}
      </div>
      <div className="damage-ranking">
        <div className="damage-ranking-heading">
          <span className="panel-kicker">DAMAGE REPORT</span>
          <h3>누적 딜량 순위</h3>
        </div>
        <div className="damage-ranking-list">
          {damageRanking.map((player, index) => (
            <div className="damage-ranking-row" key={player.key}>
              <b>{String(index + 1).padStart(2, '0')}</b>
              <span className={player.teamName === result.homeTeam.name ? 'home-text' : 'away-text'}>
                {player.teamName === result.homeTeam.name ? 'HOME' : 'AWAY'}
              </span>
              <strong>{formatEconomyPlayer(player)}</strong>
              <i>{player.damage.toLocaleString()} DMG</i>
              <small>{player.items.map((item) => item.name).join(' · ') || '구매 기록 없음'}</small>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ArchiveTab({ tab, homeTeam, awayTeam }: { tab: AppTab; homeTeam: Team; awayTeam: Team }) {
  if (tab === 'champions') return <ChampionCodex />;
  const allPlayers = interactiveTeams.flatMap((team) => team.players);
  const rankedPlayers = allPlayers
    .filter((player): player is Player & { soloRank: NonNullable<Player['soloRank']> } => Boolean(player.soloRank))
    .sort((left, right) => left.soloRank.ladderRank - right.soloRank.ladderRank);
  const tierCounts = rankedPlayers.reduce<Record<string, number>>((counts, player) => {
    counts[player.soloRank.tier] = (counts[player.soloRank.tier] ?? 0) + 1;
    return counts;
  }, {});
  const tabData: Record<Exclude<AppTab, 'team' | 'champions' | 'solo'>, Array<{ title: string; description: string; value?: string }>> = {
    players: [
      { title: '우리 선수', description: '현재 팀 로스터와 포지션별 발휘를 확인하는 자리입니다.', value: `${homeTeam.players.length}명` },
      { title: '영입 후보', description: '다음 이적 시장에서 비교할 선수를 모아 두는 자리입니다.', value: `${allPlayers.length}명` },
      { title: '계약', description: '선수별 계약 기간과 조건을 관리하는 자리입니다.' },
      { title: '성장 추이', description: '시즌 동안 변하는 선수 능력치를 기록하는 자리입니다.' },
    ],
    league: [
      { title: '순위표', description: '현재 시즌 팀 순위와 승패를 보여주는 자리입니다.', value: `${interactiveTeams.length}팀` },
      { title: '팀 목록', description: '리그에 참가한 팀과 로스터를 모아 보는 자리입니다.' },
      { title: '일정표', description: '앞으로 치를 경기와 지난 경기를 확인하는 자리입니다.' },
      { title: '패치 노트', description: '대회에 적용된 패치 변화와 적용 시점을 기록하는 자리입니다.' },
    ],
    records: [
      { title: '경기 기록', description: '팀이 치른 경기의 결과와 흐름을 보관하는 자리입니다.' },
      { title: '시즌 통계', description: '시즌 전체의 승률과 오브젝트 기록을 모으는 자리입니다.' },
      { title: '밴픽 통계', description: '챔피언 선택과 금지 빈도를 비교하는 자리입니다.' },
      { title: '명장면', description: '다시 보고 싶은 경기 장면을 모아 두는 자리입니다.' },
    ],
  };
  if (tab === 'solo') {
    const homeRanked = homeTeam.players
      .filter((player): player is Player & { soloRank: NonNullable<Player['soloRank']> } => Boolean(player.soloRank))
      .sort((left, right) => left.soloRank.ladderRank - right.soloRank.ladderRank);
    return (
      <section className="archive-screen screen-section">
        <ArchiveHeading eyebrow="SOLO RANK / 06" title="개인의 기록을 읽으십시오." description="대회 전력과 분리된 공개 래더 데이터입니다." />
        <div className="archive-tile-grid solo-tile-grid">
          <ArchiveTile title="래더 순위" description="전체 선수의 현재 래더 위치입니다." value={`1위 — ${rankedPlayers[0]?.nickname ?? '기록 없음'}`} />
          <ArchiveTile title="티어 분포" description="생성된 선수 집단의 티어별 인원입니다." value={`챌린저 ${tierCounts['챌린저'] ?? 0} · 그랜드마스터 ${tierCounts['그랜드마스터'] ?? 0} · 마스터 ${tierCounts['마스터'] ?? 0}`} />
          <ArchiveTile title="챔피언 통계" description="챔피언별 솔로랭크 가치입니다." value={`최고 ${Math.max(...CHAMPIONS.map(getSoloRankChampionValue))} / 최저 ${Math.min(...CHAMPIONS.map(getSoloRankChampionValue))}`} />
          <ArchiveTile title="우리 선수 위치" description="HOME 로스터의 현재 솔로랭크입니다." value={homeRanked.map((player) => `${player.nickname} ${player.soloRank.ladderRank}위`).join(' · ') || '기록 없음'} />
        </div>
        <div className="solo-roster-list">
          {homeRanked.map((player) => (
            <div className="solo-roster-row" key={player.nickname}>
              <span>{player.soloRank.ladderRank}위</span>
              <strong>{player.nickname}</strong>
              <small>{POSITION_LABELS[player.position]} · {player.soloRank.tier} · {player.soloRank.points}점</small>
            </div>
          ))}
        </div>
      </section>
    );
  }
  const slotTab = tab as Exclude<AppTab, 'team' | 'champions' | 'solo'>;
  return (
    <section className="archive-screen screen-section">
      <ArchiveHeading eyebrow={`${APP_TABS.find((item) => item.id === tab)?.label.toUpperCase()} / 00`} title="기록을 꺼내 볼 준비를 하십시오." description="이 공간은 다음 관리 화면을 위한 자리입니다." />
      <div className="archive-tile-grid">
        {tabData[slotTab].map((item) => <ArchiveTile key={item.title} {...item} />)}
      </div>
      <div className="archive-context">
        <span>현재 대진</span>
        <strong>{homeTeam.name} <em>vs</em> {awayTeam.name}</strong>
      </div>
    </section>
  );
}

function ArchiveHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div className="screen-heading archive-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
    </div>
  );
}

function ArchiveTile({ title, description, value }: { title: string; description: string; value?: string }) {
  return (
    <article className="archive-tile">
      <span className="panel-kicker">ARCHIVE SLOT</span>
      <h2>{title}</h2>
      <p>{description}</p>
      {value && <strong>{value}</strong>}
    </article>
  );
}

type ChampionFilter = 'ALL' | 'TANK' | 'DAMAGE' | 'UTILITY' | 'DIVE' | 'POKE' | 'EARLY' | 'LATE';

function ChampionCodex() {
  const [filter, setFilter] = useState<ChampionFilter>('ALL');
  const [selectedChampion, setSelectedChampion] = useState(CHAMPIONS[0]);
  const filters: Array<{ id: ChampionFilter; label: string }> = [
    { id: 'ALL', label: '전체' },
    { id: 'TANK', label: '탱커' },
    { id: 'DAMAGE', label: '딜러' },
    { id: 'UTILITY', label: '유틸' },
    { id: 'DIVE', label: '돌진' },
    { id: 'POKE', label: '견제' },
    { id: 'EARLY', label: '초반' },
    { id: 'LATE', label: '후반' },
  ];
  const filteredChampions = CHAMPIONS.filter((champion) =>
    filter === 'ALL'
      || champion.role === filter
      || champion.engagement === filter
      || champion.timing === filter);
  return (
    <section className="codex-screen screen-section">
      <ArchiveHeading eyebrow="CHAMPION CODEX / 03" title="챔피언의 기록을 펼치십시오." description="이미 등록된 태그와 수치를 읽어 밴픽과 경기 준비에 활용합니다." />
      <div className="codex-layout">
        <div className="codex-list-panel">
          <div className="codex-toolbar">
            <div className="codex-filters">
              {filters.map((item) => (
                <button
                  className={filter === item.id ? 'is-active' : ''}
                  key={item.id}
                  type="button"
                  onClick={() => setFilter(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <span className="codex-count">{filteredChampions.length}종</span>
          </div>
          <div className="codex-grid">
            {filteredChampions.map((champion) => (
              <button
                className={`codex-card ${selectedChampion === champion ? 'is-selected' : ''}`}
                key={champion.name}
                type="button"
                onClick={() => setSelectedChampion(champion)}
              >
                <ChampionIcon champion={champion} size={68} />
                <strong>{champion.name}</strong>
                <span>{roleDisplayNames[champion.role]} · 난이도 {champion.difficulty}</span>
              </button>
            ))}
          </div>
        </div>
        <ChampionDetail champion={selectedChampion} />
      </div>
    </section>
  );
}

function ChampionIcon({ champion, size = 80 }: { champion: Champion; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const scale = window.devicePixelRatio || 1;
    canvas.width = size * scale;
    canvas.height = size * scale;
    context.scale(scale, scale);
    drawChampionIcon(context, champion, size);
  }, [champion, size]);
  return <canvas className="champion-icon" ref={canvasRef} width={size} height={size} aria-label={`${champion.name} 아이콘`} />;
}

function drawChampionIcon(context: CanvasRenderingContext2D, champion: Champion, size: number) {
  const color = champion.symbolColor;
  const center = size / 2;
  const radius = size * 0.43;
  const parts = ICON_PARTS[champion.name] ?? { helmet: 'HORN', weapon: 'GREATSWORD' };
  context.clearRect(0, 0, size, size);
  context.save();
  context.translate(center, center);
  context.beginPath();
  for (let index = 0; index < 6; index += 1) {
    const angle = Math.PI / 3 * index - Math.PI / 6;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
  }
  context.closePath();
  context.fillStyle = '#0F0D09';
  context.fill();
  context.strokeStyle = color;
  context.lineWidth = 1.5;
  context.stroke();
  drawIconWeapon(context, parts.weapon, color, size);
  drawIconHelmet(context, parts.helmet, color, size);
  context.restore();
}

function drawIconWeapon(context: CanvasRenderingContext2D, weapon: string, color: string, size: number) {
  context.save();
  context.rotate(-0.55);
  context.strokeStyle = color;
  context.fillStyle = '#090806';
  context.lineWidth = Math.max(1.5, size / 34);
  context.lineCap = 'square';
  context.beginPath();
  if (weapon === 'GREATSWORD') {
    context.moveTo(-size * 0.38, size * 0.29); context.lineTo(size * 0.34, -size * 0.33);
    context.moveTo(-size * 0.15, size * 0.12); context.lineTo(-size * 0.29, size * 0.28);
    context.stroke();
  } else if (weapon === 'SCYTHE') {
    context.moveTo(-size * 0.33, size * 0.33); context.lineTo(size * 0.28, -size * 0.25);
    context.arc(size * 0.2, -size * 0.2, size * 0.22, -2.5, 0.9);
    context.stroke();
  } else if (weapon === 'BOW') {
    context.arc(0, 0, size * 0.32, -1.2, 1.2); context.moveTo(-size * 0.31, -size * 0.3); context.lineTo(size * 0.31, size * 0.3);
    context.stroke();
  } else if (weapon === 'STAFF') {
    context.moveTo(-size * 0.3, size * 0.33); context.lineTo(size * 0.27, -size * 0.3);
    context.arc(size * 0.26, -size * 0.31, size * 0.08, 0, Math.PI * 2);
    context.stroke();
  } else if (weapon === 'CLAW') {
    context.moveTo(-size * 0.3, size * 0.24); context.lineTo(size * 0.25, -size * 0.12);
    context.moveTo(-size * 0.15, size * 0.25); context.lineTo(size * 0.34, -size * 0.03);
    context.moveTo(-size * 0.02, size * 0.26); context.lineTo(size * 0.4, size * 0.06);
    context.stroke();
  } else if (weapon === 'GLAIVE') {
    context.moveTo(-size * 0.34, size * 0.3); context.lineTo(size * 0.28, -size * 0.23);
    context.moveTo(size * 0.18, -size * 0.32); context.lineTo(size * 0.38, -size * 0.12); context.lineTo(size * 0.17, -size * 0.14);
    context.stroke();
  } else if (weapon === 'BELL') {
    context.moveTo(-size * 0.3, size * 0.27); context.lineTo(size * 0.22, -size * 0.2);
    context.moveTo(size * 0.18, -size * 0.28); context.lineTo(size * 0.35, -size * 0.1); context.lineTo(size * 0.18, -size * 0.04);
    context.stroke();
  } else {
    context.moveTo(-size * 0.35, size * 0.32); context.lineTo(size * 0.25, -size * 0.25);
    context.moveTo(size * 0.2, -size * 0.25); context.rect(size * 0.15, -size * 0.37, size * 0.16, size * 0.16);
    context.stroke();
  }
  context.restore();
}

function drawIconHelmet(context: CanvasRenderingContext2D, helmet: string, color: string, size: number) {
  context.strokeStyle = color;
  context.fillStyle = '#14100B';
  context.lineWidth = Math.max(1.5, size / 32);
  context.beginPath();
  if (helmet === 'HORN') {
    context.moveTo(-size * 0.22, size * 0.2); context.lineTo(-size * 0.3, -size * 0.18); context.lineTo(-size * 0.16, -size * 0.08);
    context.lineTo(0, -size * 0.27); context.lineTo(size * 0.16, -size * 0.08); context.lineTo(size * 0.3, -size * 0.18); context.lineTo(size * 0.22, size * 0.2);
  } else if (helmet === 'HOOD') {
    context.moveTo(-size * 0.25, size * 0.22); context.quadraticCurveTo(-size * 0.32, -size * 0.3, 0, -size * 0.34);
    context.quadraticCurveTo(size * 0.32, -size * 0.3, size * 0.25, size * 0.22); context.lineTo(0, size * 0.1);
  } else if (helmet === 'CROWN') {
    context.moveTo(-size * 0.25, size * 0.2); context.lineTo(-size * 0.28, -size * 0.22); context.lineTo(-size * 0.1, -size * 0.08);
    context.lineTo(0, -size * 0.27); context.lineTo(size * 0.1, -size * 0.08); context.lineTo(size * 0.28, -size * 0.22); context.lineTo(size * 0.25, size * 0.2);
  } else if (helmet === 'MASK') {
    context.moveTo(-size * 0.25, -size * 0.2); context.lineTo(0, -size * 0.32); context.lineTo(size * 0.25, -size * 0.2);
    context.lineTo(size * 0.2, size * 0.23); context.lineTo(0, size * 0.31); context.lineTo(-size * 0.2, size * 0.23);
  } else if (helmet === 'SKULL') {
    context.arc(0, 0, size * 0.27, Math.PI, 0); context.lineTo(size * 0.22, size * 0.22); context.lineTo(-size * 0.22, size * 0.22); context.closePath();
  } else {
    context.moveTo(-size * 0.2, size * 0.22); context.lineTo(-size * 0.2, -size * 0.17); context.lineTo(0, -size * 0.31);
    context.lineTo(size * 0.2, -size * 0.17); context.lineTo(size * 0.2, size * 0.22); context.closePath();
  }
  context.fill();
  context.stroke();
  context.beginPath();
  context.moveTo(-size * 0.14, size * 0.03); context.lineTo(size * 0.14, size * 0.03);
  context.stroke();
}

function ChampionDetail({ champion }: { champion: Champion }) {
  const level18 = getChampionStatsAtLevel(champion, 18);
  const basic = champion.skillsWithScaling.basic.scaling;
  const ultimate = champion.skillsWithScaling.ultimate.scaling;
  const patchValue = (key: string) => champion.patchStats.find((stat) => stat.key === key)?.currentValue ?? 0;
  const ultimateRawDamage = ultimate.baseDamage + ultimate.damagePerLevel * (ultimate.maxLevel - 1) + level18.attack * ultimate.attackCoefficient;
  const tags = [
    positionDisplayNames[champion.position],
    timingDisplayNames[champion.timing],
    engagementDisplayNames[champion.engagement],
    rangeDisplayNames[champion.range],
    roleDisplayNames[champion.role],
  ];
  const positions = POSITION_ORDER.map((position) => ({ position, value: champion.getPositionFit(position) }));
  const highestFit = Math.max(...positions.map((item) => item.value));
  return (
    <aside className="codex-detail">
      <div className="detail-identity">
        <ChampionIcon champion={champion} size={92} />
        <div>
          <span className="panel-kicker">CHAMPION FILE</span>
          <h2>{champion.name}</h2>
          <div className="detail-tags">{tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
          <small>난이도 {champion.difficulty} · {champion.title}</small>
        </div>
      </div>
      <div className="detail-section">
        <span className="section-label"><span>SKILLS</span><span>기존 스킬 기록</span></span>
        <div className="skill-list">
          <SkillDetail label="패시브" skill={champion.skillsWithScaling.passive} value={`${(patchValue('passiveEffectValue') * 100).toFixed(1)}%`} />
          <SkillDetail label="기본기" skill={champion.skillsWithScaling.basic} value={`기본 ${basic.baseDamage} · 레벨당 ${basic.damagePerLevel} · 계수 ${basic.attackCoefficient.toFixed(2)} · 쿨타임 ${champion.combatStats.basicCooldown.toFixed(1)}초`} />
          <SkillDetail label="궁극기" skill={champion.skillsWithScaling.ultimate} value={`기본 ${ultimate.baseDamage} · 레벨당 ${ultimate.damagePerLevel} · 계수 ${ultimate.attackCoefficient.toFixed(2)} · 쿨타임 ${champion.combatStats.ultimateCooldown.toFixed(1)}초`} />
        </div>
      </div>
      <div className="detail-section">
        <span className="section-label"><span>LEVEL 18 COMBAT</span><span>전투 수치</span></span>
        <div className="combat-grid">
          <DetailStat label="체력" value={level18.health.toFixed(0)} />
          <DetailStat label="공격력" value={level18.attack.toFixed(0)} />
          <DetailStat label="방어력" value={level18.armor.toFixed(0)} />
          <DetailStat label="이동속도" value={champion.combatStats.movementSpeed.toFixed(0)} />
          <DetailStat label="평타 사거리" value={champion.combatStats.attackRange.toFixed(0)} />
          <DetailStat label="기본기 사거리" value={champion.combatStats.basicRange.toFixed(0)} />
          <DetailStat label="궁극기 사거리" value={champion.combatStats.ultimateRange.toFixed(0)} />
          <DetailStat label="궁극기 생피해" value={ultimateRawDamage.toFixed(0)} />
        </div>
      </div>
      <div className="detail-section">
        <span className="section-label"><span>POSITION FIT</span><span>포지션 적합도</span></span>
        <div className="position-fit-list">
          {positions.map(({ position, value }) => (
            <div className="position-fit-row" key={position}>
              <span>{POSITION_LABELS[position]}</span>
              <i><b className={value === highestFit ? 'is-highest' : ''} style={{ width: `${value}%` }} /></i>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
      </div>
      <div className="value-pair">
        <div><span>솔로랭크 가치</span><strong>{getSoloRankChampionValue(champion)}</strong></div>
        <div><span>대회 가치</span><strong>{getTournamentChampionValue(champion)}</strong></div>
      </div>
    </aside>
  );
}

function SkillDetail({ label, skill, value }: { label: string; skill: Champion['skillsWithScaling']['basic']; value: string }) {
  return (
    <article className="skill-detail">
      <div className="skill-heading"><span>{label}</span><strong>{skill.name}</strong></div>
      <p>{skill.description}</p>
      <small>{value}</small>
    </article>
  );
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return <div className="detail-stat"><span>{label}</span><strong>{value}</strong></div>;
}

function formatTimestamp(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
}

/**
 * 애플리케이션 제공자를 묶는 루트 컴포넌트입니다.
 */
function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <Home />
      </ErrorBoundary>
    </QueryClientProvider>
  );
}

export default App;
