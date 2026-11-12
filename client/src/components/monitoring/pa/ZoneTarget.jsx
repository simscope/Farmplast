import {useState} from 'react'
export default function Target({ label, initial, onSave, disabled=false, min, max }) {
  const [value, setValue] = useState(initial ?? '')
  const step = amount => setValue(Number(value === '' ? (initial ?? 70) : value) + amount)
  return <form className="cl-target" onSubmit={event => { event.preventDefault(); if (value !== '' && Number.isFinite(Number(value))) onSave(Number(value)) }}>
    <label>{label} (°F)<input aria-label={label + ' in Fahrenheit'} disabled={disabled} required type="number" min={min} max={max} step="any" value={value} placeholder="—" onChange={e => setValue(e.target.value)} /></label>
    <button disabled={disabled} type="button" aria-label={'Decrease ' + label} onClick={() => step(-1)}>−</button>
    <button disabled={disabled} type="button" aria-label={'Increase ' + label} onClick={() => step(1)}>+</button>
    <button disabled={disabled} className="cl-save">{label === 'All zones' ? 'Apply to all zones' : 'Save target'}</button>
  </form>
}

