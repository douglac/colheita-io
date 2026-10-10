// Confere que o servidor e o banco estão no ar antes de rodar (mensagem clara em vez de 40 timeouts).
export default async function globalSetup() {
  const base = process.env.E2E_BASE_URL ?? 'http://localhost:3200'
  const res = await fetch(`${base}/api/health`).catch((e) => ({ ok: false, statusText: String(e) }) as Response)
  if (!res.ok) {
    throw new Error(`Servidor fora do ar em ${base} (${res.statusText}). Suba com:\n` +
      '  docker compose --profile prod-local up -d --build\nou aponte E2E_BASE_URL para um servidor rodando.')
  }
}
