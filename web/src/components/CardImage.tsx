import { useState } from 'react'

type Props = { src: string | null; alt: string; className?: string }

// Cartas dupla-face têm image NULL no topo; o backend já cai pro card_faces.
// A caixa reserva o formato de carta (488×680, o das imagens do Scryfall) antes de carregar,
// pra grade não pular; object-cover não distorce porque a imagem já tem esse formato.
// key={src}: trocar a imagem remonta e zera o erro anterior.
export default function CardImage(props: Props) {
  return <CardImageInner key={props.src ?? ''} {...props} />
}

function CardImageInner({ src, alt, className }: Props) {
  const [err, setErr] = useState(false)
  if (!src || err) {
    return (
      <div className={`flex aspect-[488/680] items-center justify-center bg-surface-2 p-2 text-center text-xs text-muted ${className ?? ''}`}>
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
      className={`block aspect-[488/680] bg-surface-2 object-cover ${className ?? ''}`}
    />
  )
}
