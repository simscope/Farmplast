export default function EmployeePlantTransferHint({ transfer, saving }) {
  if (!transfer.available) return null
  if (!transfer.active) {
    return (
      <button type="button" disabled={saving} onClick={transfer.completePreviousTransfer}
        className="mt-1 text-xs text-cyan-300 underline disabled:opacity-60">
        Complete a previous plant transfer
      </button>
    )
  }
  return (
    <div className="mt-1 space-y-1 text-xs text-slate-300">
      {transfer.error ? <p role="alert" className="text-amber-300">{transfer.error}</p> : (
        <p role="status">{transfer.suggestion
          ? `Suggested Employee Number: ${transfer.suggestion}. You can enter another available number.`
          : 'Checking available numbers…'}</p>
      )}
      <p>The ZKT user ID follows the selected number.</p>
      <button type="button" disabled={saving} onClick={transfer.cancelTransfer}
        className="text-cyan-300 underline disabled:opacity-60">Cancel transfer</button>
    </div>
  )
}
