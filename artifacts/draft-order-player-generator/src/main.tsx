import { createRoot } from 'react-dom/client';

import App from './App';
import { ErrorBoundary } from '@/components/error-boundary';
import { printTacticalSimulationValidation } from './domain/TacticalRoundSimulation';

import './index.css';

// 새 전술 FPS 공식과 12명 오퍼레이터 데이터를 브라우저 콘솔에서 검증합니다.
printTacticalSimulationValidation();

createRoot(document.getElementById('root')!, {
  // Keeps caught errors off reportError(), which would raise the dev overlay.
  onCaughtError: (error, errorInfo) => {
    console.error(error, errorInfo.componentStack);
  },
}).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
