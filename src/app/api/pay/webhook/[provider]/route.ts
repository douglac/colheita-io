// Esta edição não oferece cobrança ou relatórios comerciais.
export function GET(_req?: Request) {
  return Response.json({ error: 'Recurso indisponível nesta edição' }, { status: 404, headers: { 'Cache-Control': 'no-store' } })
}
export const POST = GET
