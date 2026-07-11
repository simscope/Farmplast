export const EMPLOYEE_PHOTO_BUCKET = 'employee-photos'

const COMPRESSED_PHOTO_TYPE = 'image/webp'
const FALLBACK_PHOTO_TYPE = 'image/jpeg'
const PHOTO_MAX_SIZE = 640
const PHOTO_QUALITY = 0.7

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()

    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }

    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read selected image'))
    }

    image.src = url
  })
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, type, quality)
  })
}

export async function compressEmployeePhoto(file) {
  const image = await loadImage(file)
  const width = image.naturalWidth || image.width
  const height = image.naturalHeight || image.height

  if (!width || !height) {
    throw new Error('Could not read selected image size')
  }

  const scale = Math.min(1, PHOTO_MAX_SIZE / Math.max(width, height))
  const targetWidth = Math.max(1, Math.round(width * scale))
  const targetHeight = Math.max(1, Math.round(height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = targetHeight

  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not prepare selected image')

  context.drawImage(image, 0, 0, targetWidth, targetHeight)

  let blob = await canvasToBlob(canvas, COMPRESSED_PHOTO_TYPE, PHOTO_QUALITY)
  let type = COMPRESSED_PHOTO_TYPE
  let extension = 'webp'

  if (!blob || blob.size > file.size) {
    blob = await canvasToBlob(canvas, FALLBACK_PHOTO_TYPE, PHOTO_QUALITY)
    type = FALLBACK_PHOTO_TYPE
    extension = 'jpg'
  }

  if (!blob) throw new Error('Could not compress selected image')

  return {
    file: new File([blob], 'employee-photo.' + extension, { type }),
    extension,
    type,
  }
}

export function getEmployeePhotoThumbnailUrl(photoUrl, size = 96) {
  if (!photoUrl) return ''

  try {
    const url = new URL(photoUrl)

    if (!url.pathname.includes(`/storage/v1/object/public/${EMPLOYEE_PHOTO_BUCKET}/`)) {
      return photoUrl
    }

    url.pathname = url.pathname.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/')
    url.searchParams.set('width', String(size))
    url.searchParams.set('height', String(size))
    url.searchParams.set('resize', 'cover')
    url.searchParams.set('quality', '65')

    return url.toString()
  } catch {
    return photoUrl
  }
}

export function getEmployeePhotoStoragePath(photoUrl) {
  if (!photoUrl) return ''

  try {
    const url = new URL(photoUrl)
    const marker = `/storage/v1/object/public/${EMPLOYEE_PHOTO_BUCKET}/`
    const markerIndex = url.pathname.indexOf(marker)

    if (markerIndex === -1) return ''

    return decodeURIComponent(url.pathname.slice(markerIndex + marker.length))
  } catch {
    return ''
  }
}
