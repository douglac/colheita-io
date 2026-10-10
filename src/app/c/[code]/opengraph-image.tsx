import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { ImageResponse } from 'next/og'
import { LOGO_SRC_1X } from '@/components/game-logo'
import { inviteCard } from '@/server/game'

export const alt = 'Convite para a fazenda no Colheita Feliz'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/jpeg'

const art = async (rel: string) =>
  `data:image/png;base64,${(await readFile(path.join(process.cwd(), 'public', 'art', rel))).toString('base64')}`

// Imagem da prévia do convite: gramado, casa e nabo maduro (arte do jogo) + quem convidou.
export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const card = await inviteCard((await params).code)
  // Fundo verde chapado (textura ou gradiente deixavam a imagem com 0,5–1,4 MB; o WhatsApp
  // costuma ignorar prévia acima de ~300 KB).
  const [house, crop, coin, logo] = await Promise.all([art('scene/house.png'), art('crops1/nabo_5.png'), art('ui/coin.png'), art(LOGO_SRC_1X.replace('/art/', ''))])
  const png = new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', display: 'flex', position: 'relative', fontFamily: 'sans-serif',
        background: '#8cd23c',
      }}>
        { }
        <img src={house} width={430} height={430} style={{ position: 'absolute', left: 40, top: 150 }} alt="" />
        { }
        <img src={crop} width={300} height={300} style={{ position: 'absolute', left: 380, top: 300 }} alt="" />
        { }
        <img src={logo} width={520} height={260} style={{ position: 'absolute', left: 16, top: 0 }} alt="" />
        <div style={{
          position: 'absolute', right: 50, top: 70, width: 560, display: 'flex', flexDirection: 'column', gap: 18,
          background: 'rgba(255,248,231,0.94)', border: '8px solid #8a5a2b', borderRadius: 36, padding: '34px 40px',
        }}>
          <div style={{ fontSize: 31, fontWeight: 900, color: '#8a5a2b' }}>Um convite para você</div>
          <div style={{ fontSize: 54, fontWeight: 900, color: '#3b2a1a', lineHeight: 1.1 }}>
            {card ? `${card.handle} te chamou para a fazenda` : 'Vem plantar com a gente'}
          </div>
          <div style={{ fontSize: 34, color: '#3b2a1a', display: 'flex', alignItems: 'center', gap: 12 }}>
            { }
            <img src={coin} width={44} height={44} alt="" />
            {card ? `Nível ${card.level} · ${card.plots} lotes` : 'Joga no celular, sem instalar'}
          </div>
          <div style={{ fontSize: 30, color: '#2e8b47', fontWeight: 800 }}>
            {card && card.ripe > 0 ? `${card.ripe} ${card.ripe === 1 ? 'lote maduro' : 'lotes maduros'} agora… vem pegar!` : 'Planta, colhe e pega da horta dos amigos'}
          </div>
        </div>
      </div>
    ),
    { ...size },
  )
  // JPEG fica com ~1/5 do PNG (o WhatsApp costuma ignorar prévia pesada). O sharp vem com o Next;
  // se não estiver disponível no ambiente, devolve o PNG mesmo.
  const buf = Buffer.from(await png.arrayBuffer())
  try {
    const sharp = (await import('sharp')).default
    const jpg = await sharp(buf).jpeg({ quality: 82, mozjpeg: true }).toBuffer()
    return new Response(new Uint8Array(jpg), { headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=600' } })
  } catch {
    return new Response(new Uint8Array(buf), { headers: { 'content-type': 'image/png' } })
  }
}
