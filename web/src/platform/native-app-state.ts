import { useSyncExternalStore } from 'react'
import type { KeyboardState } from './keyboard'
import type { NetworkState } from './network'

export interface NativeAppState {
  readonly network: Readonly<NetworkState>
  readonly nativeKeyboard: Readonly<KeyboardState> | null
}

const DEFAULT_NETWORK: Readonly<NetworkState> = Object.freeze({
  connected: true,
  connectionType: 'unknown',
})

const SERVER_SNAPSHOT: NativeAppState = Object.freeze({
  network: DEFAULT_NETWORK,
  nativeKeyboard: null,
})

let snapshot: NativeAppState = SERVER_SNAPSHOT
const listeners = new Set<() => void>()

function sameNetwork(
  left: Readonly<NetworkState>,
  right: Readonly<NetworkState>,
): boolean {
  return (
    left.connected === right.connected &&
    left.connectionType === right.connectionType
  )
}

function sameKeyboard(
  left: Readonly<KeyboardState> | null,
  right: Readonly<KeyboardState> | null,
): boolean {
  return (
    left === right ||
    (left !== null &&
      right !== null &&
      left.open === right.open &&
      left.height === right.height)
  )
}

function publish(next: NativeAppState): void {
  if (
    sameNetwork(snapshot.network, next.network) &&
    sameKeyboard(snapshot.nativeKeyboard, next.nativeKeyboard)
  ) {
    return
  }

  snapshot = Object.freeze(next)
  listeners.forEach((listener) => listener())
}

export function publishNetworkState(network: NetworkState): void {
  publish({
    network: Object.freeze({ ...network }),
    nativeKeyboard: snapshot.nativeKeyboard,
  })
}

export function publishNativeKeyboardState(
  nativeKeyboard: KeyboardState | null,
): void {
  publish({
    network: snapshot.network,
    nativeKeyboard:
      nativeKeyboard === null
        ? null
        : Object.freeze({ ...nativeKeyboard }),
  })
}

export function getNativeAppState(): NativeAppState {
  return snapshot
}

export function getNativeAppStateServerSnapshot(): NativeAppState {
  return SERVER_SNAPSHOT
}

export function subscribeNativeAppState(listener: () => void): () => void {
  listeners.add(listener)
  let subscribed = true
  return () => {
    if (!subscribed) return
    subscribed = false
    listeners.delete(listener)
  }
}

export function useNativeAppState(): NativeAppState {
  return useSyncExternalStore(
    subscribeNativeAppState,
    getNativeAppState,
    getNativeAppStateServerSnapshot,
  )
}
