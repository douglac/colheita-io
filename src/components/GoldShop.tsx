'use client'
import { Dialog } from './ui/Dialog'

/** O ouro desta edição é obtido jogando. */
export function GoldShopDialog({ onClose }: { orderId?: string; onGold: () => void; onClose: () => void }) {
  return <Dialog title="Moedas de ouro" onClose={onClose}>
    <h3>Compras com dinheiro indisponíveis</h3>
    <p>Ganhe ouro colhendo, vendendo produtos, cumprindo missões e ajudando amigos.</p>
    <p>A loja de sementes, bichos e decoração continua aceitando o ouro do jogo.</p>
  </Dialog>
}
