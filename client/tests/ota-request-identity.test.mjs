import {test} from 'node:test'
import assert from 'node:assert/strict'
import {nextOtaRequest} from '../src/utils/otaRequestIdentity.mjs'
test('lost or active acknowledgements retain the original request identity',()=>{
 const previous={id:'request-1',release:'firmware-2'}
 const fail=()=>{throw Error('Must not create a duplicate job')}
 assert.equal(nextOtaRequest(previous,'firmware-2',undefined,fail),previous)
 assert.equal(nextOtaRequest(previous,'firmware-2',{id:'request-1',status:'downloading'},fail),previous)
 assert.equal(nextOtaRequest(previous,'firmware-2',{id:'older-job',status:'failed'},fail),previous)
})
test('confirmed failure permits a new job for the same immutable firmware',()=>{
 const previous={id:'request-1',release:'firmware-2'}
 assert.deepEqual(nextOtaRequest(previous,'firmware-2',{id:'request-1',status:'failed'},()=> 'request-2'),{id:'request-2',release:'firmware-2'})
})
test('a new target release gets an independent request identity',()=>{
 assert.deepEqual(nextOtaRequest({id:'old',release:'firmware-1'},'firmware-2',undefined,()=> 'new'),{id:'new',release:'firmware-2'})
})
