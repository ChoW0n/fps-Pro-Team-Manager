/**
 * 사람이 한 경기를 끝까지 플레이할 수 있는 세 화면의 흐름입니다.
 * 경기 계산은 domain 모듈에 맡기고, 이 파일은 화면 상태와 표시 타이밍만 관리합니다.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  printPlayersToConsole,
  printSoloRankValidationToConsole,
  printChampionsToConsole,
  printMatchResultToConsole,
  printMatchTimelineValidationToConsole,
  printSimulationToConsole,
  printStandingsToConsole,
} from './domain/consoleOutput';
import { SeasonSimulation } from './domain/SeasonSimulation';
import { TeamGenerator } from './domain/TeamGenerator';
import { CHAMPIONS, Champion, getChampionsByPosition } from './domain/Champion';
import { validateChampions } from './domain/championValidation';
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
import { generateMatchTimeline } from './domain/matchTimeline';
import { Player, Position } from './domain/Player';
import { Team } from './domain/Team';
import {
  MATCH_DISPLAY_DURATION_SECONDS,
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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';

const queryClient = new QueryClient();
// StrictMode의 효과 재실행에도 콘솔 시뮬레이션을 한 번만 수행하는 플래그
let hasSimulationRun = false;
const interactiveTeams = new TeamGenerator().generateTenTeams();
const POSITION_ORDER: Position[] = ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'];
const SPEEDS = [1, 2, 4, 8] as const;
const HOME_MAP_COLOR = '#557D91';
const AWAY_MAP_COLOR = '#8B4745';
// 이벤트 생성기와 Canvas가 같은 표시용 고정 오브젝트 좌표를 사용합니다.
const MAP_OBJECTS = MATCH_OBJECT_POSITIONS;
const STAT_ITEMS = [
  { key: 'laning', label: '라인전' },
  { key: 'teamfight', label: '한타' },
  { key: 'macro', label: '운영' },
  { key: 'volatility', label: '기복' },
  { key: 'mastery', label: '숙련도' },
] as const;

type Screen = 'prep' | 'draft' | 'watch';

/**
 * 기존 시즌 검증 로그를 그대로 유지하면서, 첫 번째 두 팀을 사람이 플레이할 경기로 사용합니다.
 */
function Home() {
  const [screen, setScreen] = useState<Screen>('prep');
  const [homeTeam] = useState<Team>(interactiveTeams[0]);
  const [awayTeam] = useState<Team>(interactiveTeams[1]);
  const [draftSession, setDraftSession] = useState<DraftSession | null>(null);
  const [draftRevision, setDraftRevision] = useState(0);
  const [draftError, setDraftError] = useState('');
  const [hoveredChampion, setHoveredChampion] = useState<Champion>(CHAMPIONS[0]);
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [snapshots, setSnapshots] = useState<MatchPlayerSnapshot[]>([]);
  const [visibleEventCount, setVisibleEventCount] = useState(0);
  const [speed, setSpeed] = useState<number>(1);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (hasSimulationRun) return;
    hasSimulationRun = true;
    // 시뮬레이션 전에 정적 챔피언 데이터 문제를 콘솔에서 명확히 알립니다.
    const championIssues = validateChampions(CHAMPIONS);
    if (championIssues.length === 0) {
      console.log('챔피언 25종 검증 완료');
    } else {
      championIssues.forEach((issue) => console.error(`챔피언 검증 실패: ${issue.message}`));
    }
    // 기존 선수 생성기를 재사용하여 같은 로스터의 팀 10개를 생성
    const teams = new TeamGenerator().generateTenTeams();

     // 챔피언 목록과 팀에 배정된 기존 선수 50명을 순서대로 콘솔에 출력
     printChampionsToConsole();
    const generatedPlayers = teams.flatMap((team) => team.players);
    printPlayersToConsole(generatedPlayers);
    printSoloRankValidationToConsole(generatedPlayers);

    // 같은 로스터로 100시즌을 진행하여 첫 시즌 순위와 우승 분포를 검증
    const result = new SeasonSimulation().run(teams, 100);

     // 첫 시즌 상세 경기, 순위표와 100시즌 반복 검증 결과를 콘솔에 출력
     printMatchResultToConsole(result.firstSeasonMatch);
    printStandingsToConsole(result.firstSeasonStandings);
    printSimulationToConsole(result);
  }, []);

  const currentStep = draftSession?.currentStep;

  const finishDraft = (session: DraftSession) => {
    const draft: BanPickResult = session.getResult();
    const result = new MatchSimulator().playWithDraft(homeTeam, awayTeam, draft);
    const generatedEvents = generateMatchEvents(result);
    const generatedSnapshots = generateMatchPlayerSnapshots(result, generatedEvents);
    const generatedTimeline = generateMatchTimeline(result, generatedEvents);
    printMatchTimelineValidationToConsole(generatedTimeline);
    const eventIssues = validateMatchEvents(result, generatedEvents, generatedSnapshots);
    if (eventIssues.length > 0) {
      eventIssues.forEach((issue) => console.error(`경기 이벤트 검증 실패: ${issue}`));
    }
    setMatchResult(result);
    setEvents(generatedEvents);
    setSnapshots(generatedSnapshots);
    setVisibleEventCount(0);
    setSpeed(1);
    setIsPaused(false);
    setScreen('watch');
  };

  const startDraft = () => {
    setDraftSession(new DraftSession(homeTeam, awayTeam));
    setDraftRevision(0);
    setDraftError('');
    setHoveredChampion(CHAMPIONS[0]);
    setScreen('draft');
  };

  const handleManualSelection = (champion: Champion) => {
    if (!draftSession || !currentStep || currentStep.teamName !== homeTeam.name) return;
    try {
      draftSession.advanceManual(champion);
      setDraftError('');
      setDraftRevision((revision) => revision + 1);
      if (draftSession.isComplete) finishDraft(draftSession);
    } catch (error) {
      setDraftError(error instanceof Error ? error.message : '선택을 처리하지 못했습니다.');
    }
  };

  // AWAY 차례는 기존 AI 로직을 호출해 한 번에 한 단계씩 자동 진행합니다.
  useEffect(() => {
    if (
      screen !== 'draft'
      || !draftSession
      || draftSession.isComplete
      || !currentStep
      || currentStep.teamName === homeTeam.name
    ) return;

    const timer = window.setTimeout(() => {
      try {
        draftSession.advanceAi();
        setDraftError('');
        setDraftRevision((revision) => revision + 1);
        if (draftSession.isComplete) finishDraft(draftSession);
      } catch (error) {
        setDraftError(error instanceof Error ? error.message : '상대 AI의 선택을 처리하지 못했습니다.');
      }
    }, 520);
    return () => window.clearTimeout(timer);
  }, [screen, draftSession, draftRevision, currentStep, homeTeam.name]);

  // 이벤트 배열은 그대로 두고, 표시되는 행의 수만 배속에 따라 바꿉니다.
  useEffect(() => {
    if (screen !== 'watch' || isPaused || visibleEventCount >= events.length) return;
    const timer = window.setTimeout(() => {
      setVisibleEventCount((count) => Math.min(count + 1, events.length));
    }, Math.max(180, 1500 / speed));
    return () => window.clearTimeout(timer);
  }, [screen, isPaused, visibleEventCount, events.length, speed]);

  const draftCounts = useMemo(
    () => ({
      home: draftSession?.homePicks ?? [],
      away: draftSession?.awayPicks ?? [],
      bans: draftSession?.records.filter((record) => record.action === 'BAN') ?? [],
    }),
    [draftSession, draftRevision],
  );

  const resetToPreparation = () => {
    setScreen('prep');
    setDraftSession(null);
    setMatchResult(null);
    setEvents([]);
    setSnapshots([]);
    setVisibleEventCount(0);
    setDraftError('');
  };

  if (screen === 'draft' && draftSession) {
    return (
      <AppFrame screen={screen}>
        <DraftScreen
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          session={draftSession}
          revision={draftRevision}
          hoveredChampion={hoveredChampion}
          error={draftError}
          onHoverChampion={setHoveredChampion}
          onSelectChampion={handleManualSelection}
        />
      </AppFrame>
    );
  }

  if (screen === 'watch' && matchResult) {
    return (
      <AppFrame screen={screen}>
        <WatchScreen
          result={matchResult}
          events={events}
          snapshots={snapshots}
          visibleEventCount={visibleEventCount}
          speed={speed}
          isPaused={isPaused}
          onSetSpeed={setSpeed}
          onTogglePause={() => setIsPaused((paused) => !paused)}
          onReset={resetToPreparation}
        />
      </AppFrame>
    );
  }

  return (
    <AppFrame screen={screen}>
      <PreparationScreen homeTeam={homeTeam} awayTeam={awayTeam} onStart={startDraft} />
    </AppFrame>
  );
}

function AppFrame({ screen, children }: { screen: Screen; children: React.ReactNode }) {
  const steps = [
    { id: 'prep', label: '경기 준비' },
    { id: 'draft', label: '밴픽' },
    { id: 'watch', label: '경기 관전' },
  ];
  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="brand-mark">
          <span className="brand-kicker">DRAFT ORDER</span>
          <span className="brand-title">감독실 기록</span>
        </div>
        <div className="header-status">
          <span className="status-dot" />
          <span>정규시즌 · 단판</span>
        </div>
      </header>
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
          <p>두 팀의 전력과 챔피언 폭을 검토한 뒤, 직접 밴픽을 시작합니다.</p>
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
          <p>홈 팀 차례부터 14번의 밴픽을 진행합니다. 상대 팀은 AI가 선택합니다.</p>
        </div>
        <button className="outline-button primary-action" type="button" onClick={onStart} data-testid="button-start-draft">
          밴픽 시작 <span aria-hidden="true">→</span>
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
        <span>챔피언 폭</span>
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
          <p>상대의 챔피언 폭을 읽고, 우리 팀의 빈틈을 한 자리씩 채우십시오.</p>
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
              <span className="panel-kicker">CHAMPION ARCHIVE</span>
              <h2>챔피언 선택</h2>
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
                  <span>{step?.targetPlayer ? `${positionDisplayNames[position]} 적합도 순` : '전체 챔피언'}</span>
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
  visibleEventCount,
  speed,
  isPaused,
  onSetSpeed,
  onTogglePause,
  onReset,
}: {
  result: MatchResult;
  events: MatchEvent[];
  snapshots: MatchPlayerSnapshot[];
  visibleEventCount: number;
  speed: number;
  isPaused: boolean;
  onSetSpeed: (speed: number) => void;
  onTogglePause: () => void;
  onReset: () => void;
}) {
  const isComplete = visibleEventCount >= events.length;
  const currentEvent = events[visibleEventCount - 1];
  const previousEvent = events[visibleEventCount - 2];
  const currentTime = isComplete
    ? MATCH_DISPLAY_DURATION_SECONDS
    : currentEvent?.timestampSeconds ?? 0;
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
        <span>총 골드</span>
        <strong className="gold-number">{economy.home.gold.toLocaleString()} : {economy.away.gold.toLocaleString()}</strong>
        <div className="gold-bar" aria-label={`골드 격차 ${goldDifference.toLocaleString()}`}>
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
