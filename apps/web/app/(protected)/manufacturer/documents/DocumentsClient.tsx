'use client'

import { useRouter } from 'next/navigation'
import { UploadWidget } from './UploadWidget'

interface Props {
  manufacturerId: string
}

export function DocumentsClient({ manufacturerId }: Props) {
  const router = useRouter()

  function handleUploaded() {
    router.refresh()
  }

  return (
    <UploadWidget manufacturerId={manufacturerId} onUploaded={handleUploaded} />
  )
}
