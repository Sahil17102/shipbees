"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyTourAction = exports.emptyTourProgress = exports.SELLER_TOUR_VERSION = void 0;
exports.SELLER_TOUR_VERSION = 1;
const emptyTourProgress = () => ({
    version: exports.SELLER_TOUR_VERSION,
    status: 'pending',
    completedPages: [],
});
exports.emptyTourProgress = emptyTourProgress;
const applyTourAction = (current, action, page) => {
    if (action === 'reset')
        return { ...(0, exports.emptyTourProgress)(), status: 'active' };
    if (action === 'dismiss')
        return { ...current, status: 'dismissed' };
    if (action === 'finish')
        return { ...current, status: 'completed' };
    if (action === 'start')
        return { ...current, status: 'active' };
    if (!page || !/^[a-z][a-z0-9-]{0,39}$/.test(page))
        throw new Error('Invalid tour page');
    return {
        ...current,
        completedPages: Array.from(new Set([...current.completedPages, page])),
    };
};
exports.applyTourAction = applyTourAction;
