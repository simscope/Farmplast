import { useEffect, useId, useRef, useState } from 'react'

export default function ZktActionsMenu({ employee, disabled, onSync, onDelete, onVerify, mobile = false }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const panelId = useId()

  useEffect(() => {
    if (!open) return

    function handleOutsidePointer(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }

    document.addEventListener('pointerdown', handleOutsidePointer, true)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handleOutsidePointer, true)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        aria-expanded={open}
        aria-controls={panelId}
        className={`inline-flex items-center gap-1 rounded-lg border border-orange-500/30 bg-orange-500/10 ${mobile ? 'px-3 py-2' : 'px-2 py-1.5'} text-xs font-semibold text-orange-300 transition hover:bg-orange-500/20 disabled:cursor-not-allowed disabled:opacity-60`}
      >
        ZKT Actions
      </button>

      {open ? (
        <div id={panelId} role="group" aria-label={`ZKT actions for employee ${employee.employee_number}`} className="absolute right-0 top-full z-50 mt-1 min-w-[190px] overflow-hidden rounded-xl border border-slate-700 bg-[#08111f] shadow-2xl">
          <button
            type="button"
            disabled={disabled}
            onClick={() => onSync(employee)}
            className="block w-full border-b border-slate-800 px-4 py-3 text-left text-xs font-semibold text-cyan-300 transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Sync ZKT
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onDelete(employee)}
            className="block w-full border-b border-slate-800 px-4 py-3 text-left text-xs font-semibold text-orange-300 transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Delete from ZKT
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onVerify(employee)}
            className="block w-full px-4 py-3 text-left text-xs font-semibold text-purple-300 transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Verify selected
          </button>
        </div>
      ) : null}
    </div>
  )
}
