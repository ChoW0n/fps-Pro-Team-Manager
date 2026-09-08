/**
 * 메인 애플리케이션 화면
 * 화면에는 최소한의 안내 문구만 렌더링하고, 실제 결과는 개발자 콘솔에서 확인하도록 유도합니다.
 */

import { useEffect } from 'react';
import {
  printPlayersToConsole,
  printChampionsToConsole,
  printMatchResultToConsole,
  printSimulationToConsole,
  printStandingsToConsole,
} from './domain/consoleOutput';
import { SeasonSimulation } from './domain/SeasonSimulation';
import { TeamGenerator } from './domain/TeamGenerator';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';

const queryClient = new QueryClient();
// StrictMode의 효과 재실행에도 콘솔 시뮬레이션을 한 번만 수행하는 플래그
let hasSimulationRun = false;

/**
 * 콘솔 시뮬레이션을 시작하는 최소 안내 화면입니다.
 */
function Home() {
  useEffect(() => {
    if (hasSimulationRun) return;
    hasSimulationRun = true;
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

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-zinc-50">
      <div className="text-center p-8 bg-white rounded-lg shadow-sm border border-zinc-200">
        <h1 className="text-2xl font-bold text-zinc-900 mb-4" data-testid="text-title">
          DRAFT ORDER 시즌 시뮬레이션
        </h1>
        <p className="text-zinc-600 mb-2" data-testid="text-instruction-main">
          팀 10개의 정규시즌과 100회 반복 검증이 완료되었습니다.
        </p>
        <p className="text-zinc-800 font-medium" data-testid="text-instruction-sub">
          키보드의 F12 키를 눌러 개발자 도구의 콘솔(Console) 탭을 확인해주세요.
        </p>
      </div>
    </div>
  );
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
