import {
  SystemBars,
  SystemBarType,
  SystemBarsStyle,
} from '@capacitor/core'
import type { ResolvedTheme } from '@/app/app-state'
import { isNativeAndroid } from './runtime'

export async function syncSystemBars(theme: ResolvedTheme): Promise<void> {
  if (!isNativeAndroid()) return

  const style =
    theme === 'light' ? SystemBarsStyle.Light : SystemBarsStyle.Dark

  try {
    await Promise.all([
      SystemBars.setStyle({ bar: SystemBarType.StatusBar, style }),
      SystemBars.setStyle({ bar: SystemBarType.NavigationBar, style }),
    ])
  } catch {
    // System UI feedback must not interrupt React rendering.
  }
}
