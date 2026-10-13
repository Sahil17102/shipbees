"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assignSellerCodCycle = exports.getSellerCodCycle = exports.deleteCodCycle = exports.updateCodCycle = exports.createCodCycle = exports.listCodCycles = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../../models/client");
const codCycles_1 = require("../../models/schema/codCycles");
const listCodCycles = async (req, res) => {
    try {
        res.json({ data: await client_1.db.select().from(codCycles_1.codCycles).orderBy(codCycles_1.codCycles.days) });
    }
    catch {
        res.status(500).json({ message: 'Could not load COD cycles' });
    }
};
exports.listCodCycles = listCodCycles;
const createCodCycle = async (req, res) => {
    const name = String(req.body.name || '').trim();
    const days = Number(req.body.days);
    const fee = Number(req.body.fee);
    if (!name || name.length > 80 || !Number.isInteger(days) || days < 0 || days > 365 || !Number.isFinite(fee) || fee < 0 || fee > 100) {
        return res.status(400).json({ message: 'Enter a name, 0-365 days, and a fee percentage between 0 and 100.' });
    }
    try {
        const [data] = await client_1.db.insert(codCycles_1.codCycles).values({ name, days, fee: fee.toFixed(2) }).returning();
        res.status(201).json({ data });
    }
    catch {
        res.status(400).json({ message: 'Could not create cycle. Use a unique name.' });
    }
};
exports.createCodCycle = createCodCycle;
const validateCycleInput = (body) => {
    const name = String(body.name || '').trim();
    const days = Number(body.days);
    const fee = Number(body.fee);
    if (!name || name.length > 80 || !Number.isInteger(days) || days < 0 || days > 365 || !Number.isFinite(fee) || fee < 0 || fee > 100) {
        return { error: 'Enter a name, 0-365 days, and a fee percentage between 0 and 100.' };
    }
    return { name, days, fee: fee.toFixed(2) };
};
const updateCodCycle = async (req, res) => {
    const input = validateCycleInput(req.body);
    if (input.error)
        return res.status(400).json({ message: input.error });
    try {
        const [data] = await client_1.db.update(codCycles_1.codCycles)
            .set({ name: input.name, days: input.days, fee: input.fee })
            .where((0, drizzle_orm_1.eq)(codCycles_1.codCycles.id, req.params.id))
            .returning();
        if (!data)
            return res.status(404).json({ message: 'Cycle not found' });
        res.json({ data });
    }
    catch {
        res.status(400).json({ message: 'Could not update cycle. Use a unique name.' });
    }
};
exports.updateCodCycle = updateCodCycle;
const deleteCodCycle = async (req, res) => {
    try {
        const assignments = await client_1.db.select({ userId: codCycles_1.sellerCodCycles.userId })
            .from(codCycles_1.sellerCodCycles)
            .where((0, drizzle_orm_1.eq)(codCycles_1.sellerCodCycles.cycleId, req.params.id));
        if (assignments.length) {
            return res.status(409).json({ message: 'This cycle is assigned to sellers. Reassign them before deleting it.' });
        }
        const deleted = await client_1.db.delete(codCycles_1.codCycles).where((0, drizzle_orm_1.eq)(codCycles_1.codCycles.id, req.params.id)).returning({ id: codCycles_1.codCycles.id });
        if (!deleted.length)
            return res.status(404).json({ message: 'Cycle not found' });
        res.json({ data: deleted[0] });
    }
    catch {
        res.status(400).json({ message: 'Could not delete cycle' });
    }
};
exports.deleteCodCycle = deleteCodCycle;
const getSellerCodCycle = async (req, res) => {
    try {
        const [data] = await client_1.db.select({ cycle: codCycles_1.codCycles }).from(codCycles_1.sellerCodCycles).innerJoin(codCycles_1.codCycles, (0, drizzle_orm_1.eq)(codCycles_1.codCycles.id, codCycles_1.sellerCodCycles.cycleId)).where((0, drizzle_orm_1.eq)(codCycles_1.sellerCodCycles.userId, req.params.userId));
        res.json({ data: data?.cycle || null });
    }
    catch {
        res.status(400).json({ message: 'Could not load seller cycle' });
    }
};
exports.getSellerCodCycle = getSellerCodCycle;
const assignSellerCodCycle = async (req, res) => {
    try {
        const [cycle] = await client_1.db.select().from(codCycles_1.codCycles).where((0, drizzle_orm_1.eq)(codCycles_1.codCycles.id, req.body.cycleId));
        if (!cycle)
            return res.status(400).json({ message: 'Select a valid cycle' });
        const values = { userId: req.params.userId, cycleId: cycle.id, assignedBy: req.user.sub, assignedAt: new Date() };
        await client_1.db.insert(codCycles_1.sellerCodCycles).values(values).onConflictDoUpdate({ target: codCycles_1.sellerCodCycles.userId, set: values });
        res.json({ data: cycle });
    }
    catch {
        res.status(400).json({ message: 'Could not assign seller cycle' });
    }
};
exports.assignSellerCodCycle = assignSellerCodCycle;
