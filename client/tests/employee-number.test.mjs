import test from 'node:test'
import assert from 'node:assert/strict'
import {employeeNumberForSave} from '../src/utils/employeeNumber.js'

test('archive-only ordinary creation preserves the entered number; released allocation is server assigned',()=>{
  assert.equal(employeeNumberForSave({employee_number:'12'},false),12)
  assert.equal(employeeNumberForSave({employee_number:''},true),null)
  assert.equal(employeeNumberForSave({id:'existing',employee_number:'12'},true),12)
  for(const employee_number of ['',0,-1,'1.5','invalid',Number.MAX_SAFE_INTEGER+1]){
    assert.throws(()=>employeeNumberForSave({employee_number},false),/positive employee number/)
  }
})
