import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router'
import { MotionConfig } from 'motion/react'
import { AppProvider } from '@/app/app-context'
import App from '@/App'
import { NativeAppBridgeOwner } from '@/platform/native-app-bridge'
import {
  beginNativeStartup,
  reapplyHydratedTheme,
} from '@/platform/startup'
import { restoreRememberedApiToken } from '@/platform/auth-session'
import '@/index.css'

const startup = beginNativeStartup()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
    mutations: {
      retry: false,
    },
  },
})

async function bootstrap() {
  await startup.hydratePreferences()
  restoreRememberedApiToken()

  try {
    reapplyHydratedTheme()
    const root = document.getElementById('root')
    if (!root) throw new Error('Application root element was not found')

    createRoot(root).render(
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <MotionConfig reducedMotion="user">
              <AppProvider>
                <NativeAppBridgeOwner />
                <App />
              </AppProvider>
            </MotionConfig>
          </BrowserRouter>
        </QueryClientProvider>
      </StrictMode>,
    )
  } finally {
    await startup.releaseSplash()
    startup.abort()
  }
}

void bootstrap()
