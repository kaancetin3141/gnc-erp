'use client'

import { useState, useEffect } from 'react'

/**
 * Count-up animation hook — animates a number from 0 to target value.
 * @param target The target number
 * @param duration Animation duration in ms (default 800)
 * @returns The current animated value
 */
export function useCountUp(target: number, duration = 800): number {
  const [value, setValue] = useState(0)

  useEffect(() => {
    let frameId: number | null = null
    let startTime: number | null = null

    const animate = (timestamp: number) => {
      if (startTime === null) {
        startTime = timestamp
      }
      const elapsed = timestamp - startTime
      const progress = Math.min(elapsed / duration, 1)
      // Ease-out cubic for smooth deceleration
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.floor(eased * target))

      if (progress < 1) {
        frameId = requestAnimationFrame(animate)
      } else {
        setValue(target)
      }
    }

    frameId = requestAnimationFrame(animate)

    return () => {
      if (frameId) cancelAnimationFrame(frameId)
    }
  }, [target, duration])

  return value
}

/**
 * Count-up hook for currency/float values with decimals.
 * @param target The target number
 * @param decimals Number of decimal places (default 0)
 * @param duration Animation duration in ms (default 800)
 * @returns The current animated value
 */
export function useCountUpFloat(target: number, decimals = 0, duration = 800): number {
  const [value, setValue] = useState(0)

  useEffect(() => {
    let frameId: number | null = null
    let startTime: number | null = null
    const factor = Math.pow(10, decimals)

    const animate = (timestamp: number) => {
      if (startTime === null) {
        startTime = timestamp
      }
      const elapsed = timestamp - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      const raw = eased * target
      setValue(Math.round(raw * factor) / factor)

      if (progress < 1) {
        frameId = requestAnimationFrame(animate)
      } else {
        setValue(target)
      }
    }

    frameId = requestAnimationFrame(animate)

    return () => {
      if (frameId) cancelAnimationFrame(frameId)
    }
  }, [target, decimals, duration])

  return value
}
