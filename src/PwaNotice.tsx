import { useEffect, useRef, useState } from 'react'

export default function PwaNotice() {
  const [offlineReady, setOfflineReady] = useState(false)
  const [needRefresh, setNeedRefresh] = useState(false)
  const [error, setError] = useState(false)
  const [updating, setUpdating] = useState(false)
  const registration = useRef<ServiceWorkerRegistration | undefined>(undefined)
  const reloadRequested = useRef(false)

  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
    let disposed = false
    let installing: ServiceWorker | null = null
    const installed = () => {
      if (installing?.state === 'installed') {
        if (registration.current?.active) setNeedRefresh(true)
        else setOfflineReady(true)
      }
      if (installing?.state === 'redundant') setError(true)
    }
    const updateFound = () => {
      installing?.removeEventListener('statechange', installed)
      installing = registration.current?.installing ?? null
      installing?.addEventListener('statechange', installed)
      installed()
    }
    const controllerChanged = () => {
      // An update accepted in another tab must never erase this tab's board.
      if (reloadRequested.current) window.location.reload()
      else setNeedRefresh(true)
    }
    const checkUpdate = () => {
      if (navigator.onLine) void registration.current?.update().catch(() => { /* Retain the offline version. */ })
    }
    navigator.serviceWorker.addEventListener('controllerchange', controllerChanged)
    window.addEventListener('focus', checkUpdate)
    void navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).then(result => {
      if (disposed) return
      registration.current = result
      if (result.waiting) setNeedRefresh(true)
      result.addEventListener('updatefound', updateFound)
      updateFound()
    }).catch(() => { if (!disposed) setError(true) })
    return () => {
      disposed = true
      installing?.removeEventListener('statechange', installed)
      registration.current?.removeEventListener('updatefound', updateFound)
      navigator.serviceWorker.removeEventListener('controllerchange', controllerChanged)
      window.removeEventListener('focus', checkUpdate)
    }
  }, [])

  useEffect(() => {
    if (!updating) return
    const timeout = window.setTimeout(() => {
      reloadRequested.current = false
      setUpdating(false)
      setError(true)
    }, 10000)
    return () => window.clearTimeout(timeout)
  }, [updating])

  function applyUpdate() {
    setUpdating(true)
    setError(false)
    reloadRequested.current = true
    if (registration.current?.waiting) registration.current.waiting.postMessage({ type: 'SKIP_WAITING' })
    else window.location.reload() // Another tab may already have activated it.
  }

  if (!offlineReady && !needRefresh && !error) return null
  return <aside className="pwa-notice" aria-label="App availability">
    <p role="status">{needRefresh
      ? 'A new demo version is ready. Reloading resets this tab’s dogs and headings; other open tabs keep their current session until reloaded.'
      : error
        ? 'Offline setup or update could not finish. You can keep using this demo; reconnect and reload to retry. Reloading resets the board.'
        : 'App saved on this device for offline opening. Dog selections and headings are not saved; reloading still resets the demo.'}</p>
    {needRefresh ? <button disabled={updating} onClick={applyUpdate}>{updating ? 'Updating…' : 'Reload & reset demo'}</button>
      : <button onClick={() => { setOfflineReady(false); setError(false) }}>Dismiss</button>}
    {needRefresh && error && <p role="alert">Update failed. Reconnect and try again.</p>}
  </aside>
}
