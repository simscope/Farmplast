export const VIEWS = new Set(['v_asset_points_latest', 'v_nj_monitoring_overview', 'v_ch2_dashboard', 'v_ch3_dashboard', 'ch2_latest', 'ch3_latest'])
const ASSETS = ['CH-NJ-01','CH-NJ-02','CH-NJ-03','BARREL-NJ-01','BARREL-NJ-02']

export function filterTelemetryRows(input, params) {
  let rows = input
  for (const [key, expression] of params) {
    if (['view', 'select', 'order'].includes(key)) continue
    if (key === 'or' && expression === '(point_code.like.CH2_%,point_code.like.CH3_%)') {
      rows = rows.filter(row => /^CH[23]_/.test(row.point_code))
      continue
    }
    if (!['asset_code', 'raw_register'].includes(key)) throw new Error('Unsupported filter')
    if (expression.startsWith('eq.')) rows = rows.filter(row => String(row[key]) === expression.slice(3))
    else if (/^in\.\([A-Za-z0-9,_-]+\)$/.test(expression)) {
      const values = expression.slice(4, -1).split(',')
      rows = rows.filter(row => values.includes(String(row[key])))
    } else throw new Error('Unsupported filter')
  }
  const order = params.get('order')
  if (order) {
    const match = /^(asset_code|point_code|display_order|raw_register)\.(asc|desc)$/.exec(order)
    if (!match) throw new Error('Unsupported order')
    rows = [...rows].sort((a, b) => {
      const x = a[match[1]], y = b[match[1]]
      return (x < y ? -1 : x > y ? 1 : 0) * (match[2] === 'asc' ? 1 : -1)
    })
  }
  const select = params.get('select') || '*'
  if (select !== '*') {
    if (!/^[a-z_][a-z0-9_]*(?:,[a-z_][a-z0-9_]*)*$/.test(select)) throw new Error('Unsupported projection')
    const fields = select.split(',')
    rows = rows.map(row => Object.fromEntries(fields.map(name => [name, row[name] ?? null])))
  }
  return rows
}

export function createNjTelemetryHandler(env, fetcher = fetch) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0')
    res.setHeader('Pragma', 'no-cache')
    const send = (status, message, code = 'NJ_TELEMETRY') => res.status(status).json({ message, code, details: null, hint: null })
    if (req.method !== 'GET') return send(405, 'Read only')
    const token = req.headers.authorization?.match(/^Bearer (\S{20,4096})$/)?.[1]
    if (!token) return send(401, 'Sign in to Farmplast')
    const allow = (env.NJ_TELEMETRY_ALLOWED_USER_IDS || env.PA_CLIMATE_ALLOWED_USER_IDS || '').split(',').map(s => s.trim()).filter(Boolean)
    const upstream = env.NJ_TELEMETRY_UPSTREAM
    if (!allow.length || !env.NJ_TELEMETRY_READ_KEY || !/^https:\/\/msi\.tail4626fb\.ts\.net:10000$/.test(upstream || '')) return send(503, 'MSI telemetry not configured')
    const params = new URL(req.url, 'https://farmplast.vercel.app').searchParams
    const view = req.query?.view || params.get('view')
    if (!VIEWS.has(view)) return send(404, 'Unknown telemetry view')
    try {
      // A real Auth user and an explicit UUID allowlist authorize access.
      // user_metadata roles and browser-supplied identities are never trusted.
      const auth = await fetcher(env.VITE_SUPABASE_URL + '/auth/v1/user', {
        headers: { apikey: env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
        redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(7000),
      })
      if (!auth.ok) return send(401, 'Invalid Farmplast login')
      const user = await auth.json()
      if (!allow.includes(user.id)) return send(403, 'Monitoring access required')
      const response = await fetcher(`${upstream}/v1/read/${view}`, {
        headers: { Authorization: `Bearer ${env.NJ_TELEMETRY_READ_KEY}` },
        redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(7000),
      })
      if (!response.ok) return send(503, 'MSI telemetry unavailable')
      let input = await response.json()
      if (!Array.isArray(input) || input.length > 128) return send(502, 'Invalid MSI response')
      // Chillers can switch independently while barrels await USB installation.
      // Cloud reads are restricted to the explicitly untransferred asset codes.
      const migrated = new Set(env.NJ_TELEMETRY_MSI_ASSETS ? env.NJ_TELEMETRY_MSI_ASSETS.split(',').map(s=>s.trim()) : ASSETS)
      if ([...migrated].some(code=>!ASSETS.includes(code))) return send(503,'Invalid telemetry source configuration')
      const remaining = ASSETS.filter(code=>!migrated.has(code))
      if (remaining.length && ['v_asset_points_latest','v_nj_monitoring_overview'].includes(view)) {
        try {
          const cloudUrl = new URL(env.VITE_SUPABASE_URL+'/rest/v1/'+view)
          cloudUrl.searchParams.set('select','*')
          cloudUrl.searchParams.set('asset_code','in.('+remaining.join(',')+')')
          const cloud = await fetcher(cloudUrl.href, {headers:{apikey:env.VITE_SUPABASE_ANON_KEY,Authorization:`Bearer ${token}`},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(7000)})
          if (!cloud.ok) throw new Error('Untransferred source unavailable')
          const rows = await cloud.json()
          if (!Array.isArray(rows) || rows.length>128) throw new Error('Invalid cloud response')
          input = [...input.filter(r=>migrated.has(r.asset_code)),...rows.filter(r=>remaining.includes(r.asset_code))]
        } catch {
          if (view !== 'v_nj_monitoring_overview') return send(503,'Barrel source unavailable')
          input = input.map(r=>migrated.has(r.asset_code)?r:Object.fromEntries(Object.keys(r).map(k=>[k,['asset_code','asset_name','asset_type'].includes(k)?r[k]:k==='is_online'?false:null])))
        }
      }
      let rows
      try { rows = filterTelemetryRows(input, params) } catch { return send(400, 'Unsupported telemetry query') }
      const single = req.headers.accept?.includes('application/vnd.pgrst.object+json')
      if (single && rows.length !== 1) return send(406, 'Expected one telemetry row', 'PGRST116')
      return res.status(200).json(single ? rows[0] : rows)
    } catch { return send(503, 'MSI telemetry unavailable') }
  }
}
