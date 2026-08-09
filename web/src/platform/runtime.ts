import { Capacitor } from '@capacitor/core'

export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform()
}

export function isNativeAndroid(): boolean {
  return isNativePlatform() && Capacitor.getPlatform() === 'android'
}
