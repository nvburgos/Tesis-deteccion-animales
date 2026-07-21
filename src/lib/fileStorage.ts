import { existsSync } from 'node:fs'
import path from 'node:path'

export function getStorageRoot() {
  return path.resolve(process.env.STORAGE_ROOT || path.join(/*turbopackIgnore: true*/ process.cwd(), 'storage'))
}

export function toProtectedDetectionImagePath(detectionId: number) {
  return `/api/files/${detectionId}`
}

function isInside(root: string, candidate: string) {
  const relative = path.relative(root, candidate)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

export function resolveStoredDetectionPath(imagePath: string) {
  const storageRoot = getStorageRoot()
  const publicUploadsRoot = path.resolve(process.cwd(), 'public', 'uploads')
  const normalized = imagePath.replace(/\\/g, '/')
  const candidates: string[] = []

  if (normalized.startsWith('/uploads/')) {
    candidates.push(path.resolve(process.cwd(), 'public', normalized.slice(1)))
    candidates.push(path.resolve(storageRoot, normalized.slice('/'.length)))
  } else if (normalized.startsWith('uploads/')) {
    candidates.push(path.resolve(storageRoot, normalized))
    candidates.push(path.resolve(process.cwd(), 'public', normalized))
  } else if (!path.isAbsolute(normalized) && !normalized.split('/').includes('..')) {
    candidates.push(path.resolve(storageRoot, normalized))
  }

  for (const candidate of candidates) {
    const inStorage = isInside(storageRoot, candidate)
    const inPublicUploads = isInside(publicUploadsRoot, candidate)

    if ((inStorage || inPublicUploads) && existsSync(candidate)) {
      return candidate
    }
  }

  return null
}

export function getContentType(filePath: string) {
  const extension = path.extname(filePath).toLowerCase()
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg'
  if (extension === '.png') return 'image/png'
  if (extension === '.webp') return 'image/webp'
  if (extension === '.bmp') return 'image/bmp'
  return 'application/octet-stream'
}

