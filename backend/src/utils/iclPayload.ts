export const ICL_ADDRESS_LINE_LIMIT = 35

export const splitIclAddress = (...parts: unknown[]) => {
  let remaining = parts
    .map((part) => String(part ?? '').trim())
    .filter(Boolean)
    .join(', ')
    .replace(/\s+/g, ' ')

  const takeLine = () => {
    if (remaining.length <= ICL_ADDRESS_LINE_LIMIT) {
      const line = remaining
      remaining = ''
      return line
    }

    let splitAt = remaining.lastIndexOf(' ', ICL_ADDRESS_LINE_LIMIT + 1)
    if (splitAt <= 0) splitAt = ICL_ADDRESS_LINE_LIMIT
    const line = remaining.slice(0, splitAt).replace(/[\s,]+$/, '')
    remaining = remaining.slice(splitAt).replace(/^[\s,]+/, '')
    return line
  }

  return {
    line1: takeLine(),
    line2: takeLine(),
  }
}
