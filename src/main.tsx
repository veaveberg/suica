import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { TelegramProvider } from './components/TelegramProvider'
import { DataProvider } from './DataProvider'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ConvexProvider } from 'convex/react'
import { convex } from './convex-client'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConvexProvider client={convex}>
      <ErrorBoundary>
        <TelegramProvider>
          <DataProvider>
            <App />
          </DataProvider>
        </TelegramProvider>
      </ErrorBoundary>
    </ConvexProvider>
  </StrictMode>,
)
