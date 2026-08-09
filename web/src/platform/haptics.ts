import { Haptics, NotificationType } from '@capacitor/haptics'
import { isNativeAndroid } from './runtime'

export async function selectionHaptic(): Promise<void> {
  if (!isNativeAndroid()) return

  try {
    await Haptics.selectionChanged()
  } catch {
    // Haptics are non-critical feedback.
  }
}

export async function successHaptic(): Promise<void> {
  if (!isNativeAndroid()) return

  try {
    await Haptics.notification({ type: NotificationType.Success })
  } catch {
    // Haptics are non-critical feedback.
  }
}
