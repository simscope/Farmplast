export function round2(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100
}

export function timeToMinutes(value) {
  if (!value) return null

  const [h, m] = String(value).split(':').map(Number)

  if (Number.isNaN(h) || Number.isNaN(m)) {
    return null
  }

  return h * 60 + m
}

export function roundMinutesToNearestQuarter(minutes) {
  const value = Number(minutes || 0)

  if (!Number.isFinite(value)) {
    return 0
  }

  return Math.round(value / 15) * 15
}

export function calcDayHours(
  timeIn,
  timeOut,
  lunchHours = 0,
  downtimeHours = 0
) {
  const start = timeToMinutes(timeIn)
  let end = timeToMinutes(timeOut)

  if (start === null || end === null) {
    return 0
  }

  // night shift
  if (end < start) {
    end += 24 * 60
  }

  const rawMinutes = end - start

  const roundedMinutes =
    roundMinutesToNearestQuarter(rawMinutes)

  const cappedMinutes =
    Math.min(roundedMinutes, 12 * 60)

  const lunchMinutes =
    roundMinutesToNearestQuarter(
      Number(lunchHours || 0) * 60
    )

  const downtimeMinutes =
    roundMinutesToNearestQuarter(
      Number(downtimeHours || 0) * 60
    )

  const payableMinutes =
    Math.max(
      0,
      cappedMinutes - lunchMinutes - downtimeMinutes
    )

  return round2(payableMinutes / 60)
}

export function getShiftLetter(timeIn) {
  const start = timeToMinutes(timeIn)

  if (start === null) {
    return '—'
  }

  const hour = Math.floor(start / 60)

  if (hour >= 18 || hour < 6) {
    return 'N'
  }

  return 'D'
}
