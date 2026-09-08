/**
 * 메인 애플리케이션 화면
 * 화면에는 최소한의 안내 문구만 렌더링하고, 실제 결과는 개발자 콘솔에서 확인하도록 유도합니다.
 */

import { useEffect } from 'react';
import { PlayerGenerator } from './domain/PlayerGenerator';
import { printPlayersToConsole } from './domain/consoleOutput';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';

const queryClient = new QueryClient();

function Home() {
  useEffect(() => {
    // 1. 선수 생성기 인스턴스를 생성
    const generator = new PlayerGenerator();
    
    // 2. 50명의 가상 선수를 생성
    const players = generator.generateFiftyPlayers();
    
    // 3. 생성된 선수를 콘솔에 출력 (내부적으로 중복 실행 방지됨)
    printPlayersToConsole(players);
  }, []);

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-zinc-50">
      <div className="text-center p-8 bg-white rounded-lg shadow-sm border border-zinc-200">
        <h1 className="text-2xl font-bold text-zinc-900 mb-4" data-testid="text-title">
          DRAFT ORDER 선수 생성기
        </h1>
        <p className="text-zinc-600 mb-2" data-testid="text-instruction-main">
          가상 선수 50명이 성공적으로 생성되었습니다.
        </p>
        <p className="text-zinc-800 font-medium" data-testid="text-instruction-sub">
          키보드의 F12 키를 눌러 개발자 도구의 콘솔(Console) 탭을 확인해주세요.
        </p>
      </div>
    </div>
  );
}

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
