import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useState,
  useRef,
  useContext,
} from 'react'
import {
  IdentityContext,
  identityEventTypes,
} from './components/IdentityManager/IdentityManager'
import keycodes from './keycodes'
import { log, removeStartingSlash } from './utils'
import { atou } from './string-utils'

// Update `now` at a given interval.
export function useNow(updateEvery = 1000) {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date())
    }, updateEvery)
    return () => {
      clearInterval(timer)
    }
  }, [updateEvery])
  return now
}

// Handle arrow keys.
export function useArrows({ onUp, onLeft, onDown, onRight } = {}) {
  useEffect(() => {
    const actions = [
      [keycodes.up, onUp],
      [keycodes.left, onLeft],
      [keycodes.down, onDown],
      [keycodes.right, onRight],
    ]
    const onKeyDown = e => {
      for (const [keyCode, cb] of actions) {
        if (cb && e.keyCode === keyCode) {
          e.preventDefault()
          cb()
          break
        }
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onUp, onLeft, onDown, onRight])
}

function stepsReducer(state, { type, value, steps }) {
  const { step } = state

  let newStep = null

  if (type === 'set') {
    newStep = value
  }
  if (type === 'next' && step < steps - 1) {
    newStep = step + 1
  }
  if (type === 'prev' && step > 0) {
    newStep = step - 1
  }

  if (newStep !== null && step !== newStep) {
    return {
      step: newStep,
      direction: newStep > step ? 1 : -1,
    }
  }

  return state
}

// Simple hook to manage a given number of steps.
export function useSteps(steps) {
  const [{ step, direction }, updateStep] = useReducer(stepsReducer, {
    step: 0,
    direction: 0,
  })

  // If the number of steps change, we reset the current step
  useEffect(() => {
    updateStep({ type: 'set', value: 0, steps })
  }, [steps])

  const setStep = useCallback(
    value => {
      updateStep({ type: 'set', value, steps })
    },
    [steps]
  )

  const next = useCallback(() => {
    updateStep({ type: 'next', steps })
  }, [steps])

  const prev = useCallback(() => {
    updateStep({ type: 'prev', steps })
  }, [steps])

  return {
    direction,
    next,
    prev,
    setStep,
    step,
  }
}

export function usePromise(fn, memoParams, defaultValue) {
  const [result, setResult] = useState(defaultValue)
  useEffect(() => {
    let cancelled = false
    fn()
      .then(value => {
        if (!cancelled) {
          setResult(value)
        }
        return null
      })
      .catch(e => console.error('An error occured: ', e))
    return () => {
      cancelled = true
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...memoParams, fn])
  return result
}

export function useRepoDetails(baseUrl, detailsUrl) {
  const fetchDescription = async () => {
    try {
      const raw = await fetch(`${baseUrl}${removeStartingSlash(detailsUrl)}`)
      return raw.text()
    } catch (e) {
      log('Error fetching decription: ', e)
    }
    return ''
  }
  return usePromise(fetchDescription, [detailsUrl], null)
}

export function useEsc(cb, deps) {
  const handlekeyDown = useCallback(
    e => {
      if (e.keyCode === keycodes.esc) {
        cb()
      }
    },
    [cb]
  )
  useEffect(() => {
    window.addEventListener('keydown', handlekeyDown)
    return () => window.removeEventListener('keydown', handlekeyDown)
  }, [handlekeyDown])
}

const QUERY_VAR = '?labels='
// checks if query string var exists
// parses data and validates data consistency (will throw if prop don't exist)
export function useSharedLabels(dao) {
  const [isSharedLink, setIsSharedLink] = useState(false)
  const [sharedLabels, setSharedLabels] = useState([])

  const removeSharedLink = useCallback(
    () => (window.location.hash = `#/${dao}`),
    [dao]
  )

  useEffect(() => {
    const index = window.location.hash.indexOf(QUERY_VAR)
    if (index > -1) {
      const raw = window.location.hash.substr(index + QUERY_VAR.length)
      try {
        const data = JSON.parse(window.decodeURI(atou(raw)))
        setSharedLabels(data.map(({ address, name }) => ({ address, name })))
        setIsSharedLink(true)
      } catch (e) {
        console.warn(
          'There was an error parsing/validating the shared data: ',
          e
        )
      }
    }
  }, [])

  return { isSharedLink, setIsSharedLink, sharedLabels, removeSharedLink }
}

export function useSelected(initial) {
  const [selected, setSelected] = useState(initial)
  const [allSelected, someSelected] = useMemo(
    () => [
      Array.from(selected.values()).every(Boolean),
      Array.from(selected.values()).some(Boolean),
    ],
    [selected]
  )
  return { selected, setSelected, allSelected, someSelected }
}

export function useClickOutside(cb) {
  const ref = useRef()
  const handleClick = useCallback(
    e => {
      if (!ref.current.contains(e.target)) {
        cb()
      }
    },
    [cb, ref]
  )

  useEffect(() => {
    document.addEventListener('click', handleClick, true)
    return () => {
      document.removeEventListener('click', handleClick, true)
    }
  }, [handleClick])

  return { ref }
}

export function useLocalIdentity(entity) {
  const { resolve, identityEvents$ } = useContext(IdentityContext)
  const [name, setName] = useState(null)

  const handleResolve = useCallback(async () => {
    try {
      const { name = null } = (await resolve(entity)) || {}
      setName(name)
    } catch (e) {
      // address does not resolve to identity
    }
  }, [resolve, entity])

  useEffect(() => {
    handleResolve()
    const subscription = identityEvents$.subscribe(({ address, type }) => {
      switch (type) {
        case identityEventTypes.MODIFY:
          if (entity.toLowerCase() === address.toLowerCase()) {
            handleResolve()
          }
          return
        case identityEventTypes.CLEAR:
          setName(null)
          return
        case identityEventTypes.IMPORT:
          handleResolve()
      }
    })
    return () => {
      subscription.unsubscribe()
    }
  }, [identityEvents$, handleResolve, entity])

  return { name }
}
