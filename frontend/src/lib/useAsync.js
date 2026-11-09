import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Small data-fetching helper: { data, error, loading, reload }.
 * `fn` is always called fresh, so components can pass inline closures.
 */
export function useAsync(fn, deps = []) {
  const fnRef = useRef(fn)
  fnRef.current = fn

  const [state, setState] = useState({ data: null, error: null, loading: true })
  const [tick, setTick] = useState(0)

  const reload = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    let cancelled = false
    setState((s) => ({ ...s, loading: true }))
    Promise.resolve()
      .then(() => fnRef.current())
      .then((data) => {
        if (!cancelled) setState({ data, error: null, loading: false })
      })
      .catch((error) => {
        if (!cancelled) setState({ data: null, error: error.message, loading: false })
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps])

  return { ...state, reload }
}
