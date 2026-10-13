import assert from 'node:assert/strict'
import test from 'node:test'
import { applyTourAction, emptyTourProgress } from '../src/models/services/sellerTourProgress.logic'

test('seller tour progress follows the expected lifecycle', () => {
  const started = applyTourAction(emptyTourProgress(), 'start')
  const advanced = applyTourAction(started, 'complete-page', 'overview')
  const duplicate = applyTourAction(advanced, 'complete-page', 'overview')
  const finished = applyTourAction(duplicate, 'finish')

  assert.equal(started.status, 'active')
  assert.deepEqual(duplicate.completedPages, ['overview'])
  assert.equal(finished.status, 'completed')
})

test('reset clears prior progress and invalid page names are rejected', () => {
  const dismissed = applyTourAction(emptyTourProgress(), 'dismiss')
  assert.deepEqual(applyTourAction(dismissed, 'reset'), {
    version: 1,
    status: 'active',
    completedPages: [],
  })
  assert.throws(() => applyTourAction(emptyTourProgress(), 'complete-page', '../orders'))
})
