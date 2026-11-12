import test from 'node:test'
import assert from 'node:assert/strict'
import {employeeNumberForSave,applyEmployeeNumberSuggestion} from '../src/utils/employeeNumber.js'

test('creation and edits preserve the selected number; blank and out-of-range input cannot silently allocate',()=>{
  assert.equal(employeeNumberForSave({employee_number:'12'},false),12)
  assert.throws(()=>employeeNumberForSave({employee_number:''}),/positive employee number/)
  assert.equal(employeeNumberForSave({id:'existing',employee_number:'12'},true),12)
  for(const employee_number of ['',0,-1,'1.5','invalid',2147483648,Number.MAX_SAFE_INTEGER+1]){
    assert.throws(()=>employeeNumberForSave({employee_number},false),/positive employee number/)
  }
})

test('initial suggestion autofills number and ZKT ID, while late replies and retries preserve manual input',()=>{
  assert.deepEqual(applyEmployeeNumberSuggestion({employee_number:'',zkt_user_id:''},3),{employee_number:'3',zkt_user_id:'3'})
  for(const employee_number of ['19','']) {
    const manual={employee_number,zkt_user_id:employee_number,employee_number_edited:true}
    assert.equal(applyEmployeeNumberSuggestion(manual,3),manual)
    if(employee_number)assert.equal(employeeNumberForSave(manual),19)
  }
  const existing={id:'existing',employee_number:'8'}
  assert.equal(applyEmployeeNumberSuggestion(existing,3),existing)
})
