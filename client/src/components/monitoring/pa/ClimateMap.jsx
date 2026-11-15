import { useRef, useState } from 'react'
import './climateMap.css'

const key = 'farmplast.pa.climate.mapPositions.v1'
const clamp = value => Math.max(7, Math.min(93, value))

export default function ClimateMap({ zones, onOpen }) {
  const [editing, setEditing] = useState(false)
  const [notice, setNotice] = useState('')
  const [positions, setPositions] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key))
      return Object.fromEntries(Object.entries(saved || {}).filter(([, p]) =>
        Number.isFinite(p?.x) && Number.isFinite(p?.y)).map(([id, p]) =>
        [id, { x: clamp(p.x), y: clamp(p.y) }]))
    } catch { return {} }
  })
  const surface = useRef(null)
  const drag = useRef(null)
  function move(event) {
    if (!drag.current) return
    const bounds = surface.current.getBoundingClientRect()
    const { id, offsetX, offsetY } = drag.current
    setPositions(current => ({ ...current, [id]: {
      x: clamp((event.clientX - bounds.left - offsetX) / bounds.width * 100),
      y: clamp((event.clientY - bounds.top - offsetY) / bounds.height * 100),
    } }))
  }
  function save() {
    try {
      localStorage.setItem(key, JSON.stringify(positions))
      setEditing(false)
      setNotice('Positions saved in this browser.')
    } catch { setNotice('Could not save positions. Please try again.') }
  }
  return <section className="cl-map" aria-label="Plant climate map">
    <div className="cl-map-toolbar"><h2>Plant temperatures</h2>
      <button type="button" onClick={() => editing ? save() : setEditing(true)}>{editing ? 'Save positions' : 'Move zones'}</button>
    </div>
    <p>{editing ? 'Drag zones to their locations. Arrow keys adjust the selected marker.' : 'Select a temperature to control its zone.'}</p>
    <div className="cl-map-scroll"><div className="cl-map-surface" ref={surface}>
      <img src="/pa-climate/plant-layout.jpg" alt="Pennsylvania plant floor plan" draggable="false" />
      {zones.map((zone, index) => {
        const point = positions[zone.id] || { x: 18 + index % 4 * 21, y: 25 + Math.floor(index / 4) * 20 }
        const hasBoth = Number.isFinite(zone.temperatureF) && Number.isFinite(zone.secondTemperatureF)
        const label = hasBoth ? ((zone.temperatureF + zone.secondTemperatureF) / 2).toFixed(1) + ' °F' : '— °F'
        return <button key={zone.id} type="button" className={'cl-map-marker' + (editing ? ' is-moving' : '')}
          style={{ left: clamp(point.x) + '%', top: clamp(point.y) + '%' }}
          aria-label={zone.name + ', average ' + label + (editing ? ', move with arrow keys' : ', open controls')}
          onClick={() => { if (!editing) onOpen(zone.id) }}
          onPointerDown={event => {
            if (!editing) return
            event.preventDefault()
            event.currentTarget.focus()
            const bounds = surface.current.getBoundingClientRect()
            drag.current = { id: zone.id, offsetX: event.clientX - bounds.left - bounds.width * point.x / 100,
              offsetY: event.clientY - bounds.top - bounds.height * point.y / 100 }
            event.currentTarget.setPointerCapture(event.pointerId)
          }} onPointerMove={move} onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }}
          onKeyDown={event => {
            if (!editing || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
            event.preventDefault()
            const step = event.shiftKey ? 2 : 0.5
            setPositions(current => ({ ...current, [zone.id]: {
              x: clamp(point.x + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0)),
              y: clamp(point.y + (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0)),
            } }))
          }}><span>{zone.name}</span><strong>{label}</strong>
          <small>{hasBoth ? 'Average · 2 sensors' : zone.connection === 'ONLINE' ? 'Two readings required' : zone.connection || 'NO DATA'}</small>
        </button>
      })}
    </div></div>
    {notice && <p role="status">{notice}</p>}
  </section>
}
