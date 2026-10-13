export const SELLER_TOUR_VERSION = 1
export type TourStatus = 'pending' | 'active' | 'completed' | 'dismissed'
export type TourAction = 'start' | 'dismiss' | 'complete-page' | 'finish' | 'reset'

export const emptyTourProgress = () => ({
  version: SELLER_TOUR_VERSION,
  status: 'pending' as TourStatus,
  completedPages: [] as string[],
})

export const applyTourAction = (
  current: ReturnType<typeof emptyTourProgress>,
  action: TourAction,
  page?: string,
) => {
  if (action === 'reset') return { ...emptyTourProgress(), status: 'active' as TourStatus }
  if (action === 'dismiss') return { ...current, status: 'dismissed' as TourStatus }
  if (action === 'finish') return { ...current, status: 'completed' as TourStatus }
  if (action === 'start') return { ...current, status: 'active' as TourStatus }
  if (!page || !/^[a-z][a-z0-9-]{0,39}$/.test(page)) throw new Error('Invalid tour page')
  return {
    ...current,
    completedPages: Array.from(new Set([...current.completedPages, page])),
  }
}
