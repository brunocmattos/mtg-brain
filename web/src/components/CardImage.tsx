import { useState, useEffect } from 'react'

// Cartas dupla-face têm image NULL no topo; o backend já cai pro card_faces.
// A imagem é exibida no aspecto NATURAL (h-auto) — nada de forçar aspect-ratio,
// que era o que esticava/distorcia. O placeholder mantém o formato de carta.
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
  useEffect(() => setErr(false), [src]) // novo src -> limpa erro anterior
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
      className={`block h-auto ${className ?? ''}`}
    />
  )
}
