import { useState } from 'react'

// Cartas dupla-face têm image NULL no topo; o backend já cai pro card_faces.
// Aqui tratamos imagem ausente / erro de carregamento com um placeholder.
export default function CardImage({
  src,
  alt,
  className,
}: {
  src: string | null
  alt: string
  className?: string
}) {
  const [err, setErr] = useState(false)
  if (!src || err) {
    return (
      <div
        className={`flex items-center justify-center bg-surface-2 text-muted text-xs text-center p-2 ${className ?? ''}`}
        style={{ aspectRatio: '0.716' }}
      >
        {alt}
      </div>
    )
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setErr(true)}
      className={className}
      style={{ aspectRatio: '0.716' }}
    />
  )
}
