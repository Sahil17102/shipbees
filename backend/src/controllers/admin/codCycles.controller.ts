import { eq } from 'drizzle-orm'
import { db } from '../../models/client'
import { codCycles, sellerCodCycles } from '../../models/schema/codCycles'

export const listCodCycles = async (req: any, res: any) => {
  try { res.json({ data: await db.select().from(codCycles).orderBy(codCycles.days) }) }
  catch { res.status(500).json({ message: 'Could not load COD cycles' }) }
}
export const createCodCycle = async (req: any, res: any) => {
  const name = String(req.body.name || '').trim()
  const days = Number(req.body.days)
  const fee = Number(req.body.fee)
  if (!name || name.length > 80 || !Number.isInteger(days) || days < 0 || days > 365 || !Number.isFinite(fee) || fee < 0 || fee > 100) {
    return res.status(400).json({ message: 'Enter a name, 0-365 days, and a fee percentage between 0 and 100.' })
  }
  try {
    const [data] = await db.insert(codCycles).values({ name, days, fee: fee.toFixed(2) }).returning()
    res.status(201).json({ data })
  } catch { res.status(400).json({ message: 'Could not create cycle. Use a unique name.' }) }
}

const validateCycleInput = (body: any) => {
  const name = String(body.name || '').trim()
  const days = Number(body.days)
  const fee = Number(body.fee)
  if (!name || name.length > 80 || !Number.isInteger(days) || days < 0 || days > 365 || !Number.isFinite(fee) || fee < 0 || fee > 100) {
    return { error: 'Enter a name, 0-365 days, and a fee percentage between 0 and 100.' }
  }
  return { name, days, fee: fee.toFixed(2) }
}

export const updateCodCycle = async (req: any, res: any) => {
  const input = validateCycleInput(req.body)
  if (input.error) return res.status(400).json({ message: input.error })
  try {
    const [data] = await db.update(codCycles)
      .set({ name: input.name, days: input.days, fee: input.fee })
      .where(eq(codCycles.id, req.params.id))
      .returning()
    if (!data) return res.status(404).json({ message: 'Cycle not found' })
    res.json({ data })
  } catch { res.status(400).json({ message: 'Could not update cycle. Use a unique name.' }) }
}

export const deleteCodCycle = async (req: any, res: any) => {
  try {
    const assignments = await db.select({ userId: sellerCodCycles.userId })
      .from(sellerCodCycles)
      .where(eq(sellerCodCycles.cycleId, req.params.id))
    if (assignments.length) {
      return res.status(409).json({ message: 'This cycle is assigned to sellers. Reassign them before deleting it.' })
    }
    const deleted = await db.delete(codCycles).where(eq(codCycles.id, req.params.id)).returning({ id: codCycles.id })
    if (!deleted.length) return res.status(404).json({ message: 'Cycle not found' })
    res.json({ data: deleted[0] })
  } catch { res.status(400).json({ message: 'Could not delete cycle' }) }
}
export const getSellerCodCycle = async (req: any, res: any) => {
  try {
    const [data] = await db.select({ cycle: codCycles }).from(sellerCodCycles).innerJoin(codCycles, eq(codCycles.id, sellerCodCycles.cycleId)).where(eq(sellerCodCycles.userId, req.params.userId))
    res.json({ data: data?.cycle || null })
  } catch { res.status(400).json({ message: 'Could not load seller cycle' }) }
}
export const assignSellerCodCycle = async (req: any, res: any) => {
  try {
    const [cycle] = await db.select().from(codCycles).where(eq(codCycles.id, req.body.cycleId))
    if (!cycle) return res.status(400).json({ message: 'Select a valid cycle' })
    const values = { userId: req.params.userId, cycleId: cycle.id, assignedBy: req.user.sub, assignedAt: new Date() }
    await db.insert(sellerCodCycles).values(values).onConflictDoUpdate({ target: sellerCodCycles.userId, set: values })
    res.json({ data: cycle })
  } catch { res.status(400).json({ message: 'Could not assign seller cycle' }) }
}
