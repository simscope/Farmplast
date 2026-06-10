import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const clientRoot = resolve(__dirname, '..')

const PHOTO_BUCKET = 'employee-photos'
const DEFAULT_MAX_WIDTH = 900
const DEFAULT_QUALITY = 78

function loadDotEnv(fileName) {
  const filePath = resolve(clientRoot, fileName)
  if (!existsSync(filePath)) return

  const text = readFileSync(filePath, 'utf8')
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (!match) continue

    const key = match[1]
    let value = match[2].trim()

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    if (!process.env[key]) process.env[key] = value
  }
}

loadDotEnv('.env')
loadDotEnv('.env.local')

function parseArgs(argv) {
  const args = {
    dryRun: true,
    limit: 0,
    width: DEFAULT_MAX_WIDTH,
    quality: DEFAULT_QUALITY,
    deleteOld: false,
    storageOnly: false,
  }

  for (const arg of argv) {
    if (arg === '--apply') args.dryRun = false
    if (arg === '--delete-old') args.deleteOld = true
    if (arg === '--storage-only') args.storageOnly = true
    if (arg.startsWith('--limit=')) args.limit = Number(arg.slice('--limit='.length)) || 0
    if (arg.startsWith('--width=')) args.width = Number(arg.slice('--width='.length)) || DEFAULT_MAX_WIDTH
    if (arg.startsWith('--quality=')) args.quality = Number(arg.slice('--quality='.length)) || DEFAULT_QUALITY
  }

  return args
}

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error('Missing Supabase config. Set SUPABASE_URL/VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.')
  }

  return { url, key }
}

function isImageFile(name = '') {
  return /\.(avif|gif|heic|jpeg|jpg|png|webp)$/i.test(name)
}

function getStoragePathFromPublicUrl(photoUrl) {
  try {
    const url = new URL(photoUrl)
    const marker = `/storage/v1/object/public/${PHOTO_BUCKET}/`
    const index = url.pathname.indexOf(marker)
    if (index === -1) return ''

    return decodeURIComponent(url.pathname.slice(index + marker.length))
  } catch {
    return ''
  }
}

function getTransformedUrl(photoUrl, width, quality) {
  const url = new URL(photoUrl)
  url.pathname = url.pathname.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/')
  url.search = ''
  url.searchParams.set('width', String(width))
  url.searchParams.set('resize', 'contain')
  url.searchParams.set('quality', String(quality))
  return url.toString()
}

function getCompressedPath(employee, originalPath) {
  const folder = `employees/${employee.id}`
  const base = originalPath.split('/').pop()?.replace(/\.[^.]+$/, '') || 'photo'
  return `${folder}/${Date.now()}-${base}-compressed.jpg`
}

async function listStorageImages(supabase, prefix = 'employees') {
  const results = []
  const stack = [prefix]

  while (stack.length > 0) {
    const folder = stack.pop()
    const { data, error } = await supabase.storage
      .from(PHOTO_BUCKET)
      .list(folder, { limit: 1000 })

    if (error) throw error

    for (const item of data || []) {
      const path = `${folder}/${item.name}`

      if (item.id === null || item.metadata === null) {
        stack.push(path)
        continue
      }

      if (isImageFile(item.name)) {
        results.push({
          path,
          size: Number(item.metadata?.size || 0),
        })
      }
    }
  }

  return results
}

function getPublicUrl(supabase, path) {
  const { data } = supabase.storage
    .from(PHOTO_BUCKET)
    .getPublicUrl(path)

  if (!data?.publicUrl) {
    throw new Error(`Public URL was not created for ${path}`)
  }

  return data.publicUrl
}

async function fetchCompressedPhoto(photoUrl, width, quality) {
  const transformedUrl = getTransformedUrl(photoUrl, width, quality)
  const response = await fetch(transformedUrl)

  if (!response.ok) {
    throw new Error(`Could not fetch transformed photo: ${response.status} ${response.statusText}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  const contentType = response.headers.get('content-type') || 'image/jpeg'

  return {
    bytes: new Uint8Array(arrayBuffer),
    contentType,
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const { url, key } = getSupabaseConfig()
  const supabase = createClient(url, key)

  if (args.storageOnly) {
    const images = (await listStorageImages(supabase))
      .slice(0, args.limit > 0 ? args.limit : undefined)

    console.log(
      `${args.dryRun ? 'DRY RUN' : 'APPLY'} storage-only: ${images.length} image file(s), width=${args.width}, quality=${args.quality}`
    )

    let processed = 0
    let skipped = 0
    let failed = 0

    for (const image of images) {
      try {
        const publicUrl = getPublicUrl(supabase, image.path)
        console.log(`- ${image.path}${image.size ? ` (${Math.round(image.size / 1024)} KB)` : ''}`)

        if (args.dryRun) {
          skipped += 1
          continue
        }

        const compressed = await fetchCompressedPhoto(publicUrl, args.width, args.quality)

        const { error: uploadError } = await supabase.storage
          .from(PHOTO_BUCKET)
          .upload(image.path, compressed.bytes, {
            cacheControl: '3600',
            contentType: compressed.contentType,
            upsert: true,
          })

        if (uploadError) throw uploadError

        processed += 1
      } catch (err) {
        failed += 1
        console.error(`  Failed: ${err.message || err}`)
      }
    }

    console.log(`Done. processed=${processed}, dryRunSkipped=${skipped}, failed=${failed}`)
    return
  }

  const { data: employees, error } = await supabase
    .from('employees')
    .select('id,employee_number,first_name,last_name,photo_url')
    .not('photo_url', 'is', null)
    .order('employee_number', { ascending: true })

  if (error) throw error

  const candidates = (employees || [])
    .filter((employee) => getStoragePathFromPublicUrl(employee.photo_url))
    .slice(0, args.limit > 0 ? args.limit : undefined)

  console.log(
    `${args.dryRun ? 'DRY RUN' : 'APPLY'}: ${candidates.length} employee photo(s), width=${args.width}, quality=${args.quality}`
  )

  let processed = 0
  let skipped = 0
  let failed = 0

  for (const employee of candidates) {
    const name = `${employee.first_name || ''} ${employee.last_name || ''}`.trim()
    const originalPath = getStoragePathFromPublicUrl(employee.photo_url)

    try {
      const compressedPath = getCompressedPath(employee, originalPath)
      console.log(`- ${employee.employee_number || employee.id} ${name}: ${originalPath}`)

      if (args.dryRun) {
        skipped += 1
        continue
      }

      const compressed = await fetchCompressedPhoto(employee.photo_url, args.width, args.quality)

      const { error: uploadError } = await supabase.storage
        .from(PHOTO_BUCKET)
        .upload(compressedPath, compressed.bytes, {
          cacheControl: '3600',
          contentType: compressed.contentType,
          upsert: true,
        })

      if (uploadError) throw uploadError

      const { data: publicUrlData } = supabase.storage
        .from(PHOTO_BUCKET)
        .getPublicUrl(compressedPath)

      if (!publicUrlData?.publicUrl) {
        throw new Error('Public URL was not created')
      }

      const finalUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`

      const { error: updateError } = await supabase
        .from('employees')
        .update({ photo_url: finalUrl })
        .eq('id', employee.id)

      if (updateError) throw updateError

      if (args.deleteOld && originalPath !== compressedPath) {
        const { error: removeError } = await supabase.storage
          .from(PHOTO_BUCKET)
          .remove([originalPath])

        if (removeError) throw removeError
      }

      processed += 1
    } catch (err) {
      failed += 1
      console.error(`  Failed: ${err.message || err}`)
    }
  }

  console.log(`Done. processed=${processed}, dryRunSkipped=${skipped}, failed=${failed}`)
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
