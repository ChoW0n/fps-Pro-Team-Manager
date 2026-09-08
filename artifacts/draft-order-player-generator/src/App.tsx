/**
 * 사람이 한 경기를 끝까지 플레이할 수 있는 세 화면의 흐름입니다.
 * 경기 계산은 domain 모듈에 맡기고, 이 파일은 화면 상태와 표시 타이밍만 관리합니다.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  printPlayersToConsole,
  printChampionsToConsole,
  printMatchResultToConsole,
  printSimulationToConsole,
  printStandingsToConsole,
} from './domain/consoleOutput';
import { SeasonSimulation } from './domain/SeasonSimulation';
import { TeamGenerator } from './domain/TeamGenerator';
import { CHAMPIONS, Champion, getChampionsByPosition } from './domain/Champion';
import { validateChampions } from './domain/championValidation';
import { BanPickResult, DraftSession } from './domain/BanPick';
import { MatchResult, getPhaseAdjustmentSummary } from './domain/MatchResult';
import { MatchEvent, generateMatchEvents, validateMatchEvents } from './domain/matchEvents';
import { MatchSimulator } from './domain/MatchSimulator';
import { Player, Position } from './domain/Player';
import { Team } from './domain/Team';
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
    printPlayersToConsole(teams.flatMap((team) => team.players));

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
    const eventIssues = validateMatchEvents(result, generatedEvents);
    if (eventIssues.length > 0) {
      eventIssues.forEach((issue) => console.error(`경기 이벤트 검증 실패: ${issue}`));
    }
    setMatchResult(result);
    setEvents(generatedEvents);
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
            {POSITION_ORDER.map((position) => (
              <div className="position-group" key={position}>
                <div className="position-heading">
                  <span>{positionDisplayNames[position]}</span>
                  <span>{getChampionsByPosition(position).length}명</span>
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
                        <span className="champion-title">{champion.title}{champion.titleSeparator}{champion.name}</span>
                        <span className="champion-tags">
                          <small>{timingDisplayNames[champion.timing]}</small>
                          <small>{engagementDisplayNames[champion.engagement]}</small>
                          <small>{rangeDisplayNames[champion.range]}</small>
                          <small>{roleDisplayNames[champion.role]}</small>
                        </span>
                        <span className="champion-difficulty">난이도 {champion.difficulty}/5</span>
                        {selected && <span className="champion-status">{session.records.find((record) => record.champion.name === champion.name)?.action === 'BAN' ? '금지됨' : '선택됨'}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
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
  visibleEventCount,
  speed,
  isPaused,
  onSetSpeed,
  onTogglePause,
  onReset,
}: {
  result: MatchResult;
  events: MatchEvent[];
  visibleEventCount: number;
  speed: number;
  isPaused: boolean;
  onSetSpeed: (speed: number) => void;
  onTogglePause: () => void;
  onReset: () => void;
}) {
  const homeWins = result.phases.filter((phase) => phase.winnerName === result.homeTeam.name).length;
  const awayWins = result.phases.length - homeWins;
  const isComplete = visibleEventCount >= events.length;
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

      <div className="scoreboard">
        <div className="score-team score-home"><span>HOME</span><strong>{result.homeTeam.name}</strong><b>{homeWins}</b></div>
        <div className="score-middle"><span>PHASE SCORE</span><i>—</i><small>{isComplete ? 'REVIEW COMPLETE' : `${visibleEventCount} / ${events.length} EVENTS`}</small></div>
        <div className="score-team score-away"><b>{awayWins}</b><strong>{result.awayTeam.name}</strong><span>AWAY</span></div>
      </div>

      <div className="watch-controls">
        <div className="playback-control">
          <button className="outline-button pause-button" type="button" onClick={onTogglePause}>
            {isPaused ? '재생' : '일시정지'}
          </button>
          <span>{isPaused ? '중계가 멈춰 있습니다.' : '이벤트를 순서대로 재생 중입니다.'}</span>
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
            <EventRow event={event} key={`${event.timestampSeconds}-${event.type}-${index}`} />
          ))}
          {!isComplete && events.length > visibleEventCount && (
            <div className="event-pending"><span className="pending-line" /> 다음 사건을 기다리는 중</div>
          )}
          {isComplete && <div className="event-finished">모든 경기 이벤트가 기록되었습니다.</div>}
        </div>
      </div>

      {isComplete && <MatchReview result={result} />}

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

function EventRow({ event }: { event: MatchEvent }) {
  const lead = event.participants[0];
  return (
    <article className={`event-row event-${event.type.toLowerCase()}`}>
      <time>{formatTimestamp(event.timestampSeconds)}</time>
      <span className="event-type">{matchEventDisplayNames[event.type]}</span>
      <div className="event-copy">
        <strong>{event.description}</strong>
        <span>{lead.teamName} · {event.participants.map((participant) => `${formatPlayerName(participant.player)} / ${participant.champion.name}`).join(' · ')}</span>
      </div>
    </article>
  );
}

function MatchReview({ result }: { result: MatchResult }) {
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
