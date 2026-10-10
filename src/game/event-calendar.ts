// Calendário dos eventos (Evolução 13, E1): datas fixas ("MM-DD"), datas presas à Páscoa (Carnaval, Páscoa) e
// ao n-ésimo domingo de um mês (Dia das Mães, Dia dos Pais). Tudo no fuso de Brasília. Sem dependências: config.ts
// (loja) e events.ts (servidor) usam as mesmas contas.

export const EVENT_TZ = 'America/Sao_Paulo'

/** Data fixa, todo ano: do começo de `start` ao fim de `end` (inclusive). "MM-DD"; pode virar o ano. */
export type FixedCalendar = { start: string; end: string }
/** Dias relativos ao Domingo de Páscoa (−58 = sexta, uma semana antes do Carnaval; 0 = o domingo). Fim inclusive. */
export type EasterCalendar = { rule: 'pascoa'; from: number; to: number }
/** Dias relativos ao `nth` domingo de `month` (Mães: 2º domingo de maio). Fim inclusive. */
export type SundayCalendar = { rule: 'domingo'; month: number; nth: number; from: number; to: number }
export type EventCalendar = FixedCalendar | EasterCalendar | SundayCalendar

// ---------- fuso ----------

const fmt = new Map<string, Intl.DateTimeFormat>()
function parts(t: number, tz: string) {
  let f = fmt.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    fmt.set(tz, f)
  }
  const o: Record<string, number> = {}
  for (const p of f.formatToParts(new Date(t))) if (p.type !== 'literal') o[p.type] = Number(p.value)
  return o as { year: number; month: number; day: number; hour: number; minute: number; second: number }
}

/** Diferença "relógio local − UTC" no instante t (−3 h em Brasília desde o fim do horário de verão em 2019). */
function offsetMs(t: number, tz: string): number {
  const p = parts(t, tz)
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(t / 1000) * 1000
}

/** Meia-noite do dia y-m-d no fuso `tz`, em ms UTC (vale também para fuso com horário de verão). Aceita dia fora
 *  do mês (32/10 vira 1/11), como o Date.UTC. */
export function zonedMidnight(y: number, m: number, d: number, tz = EVENT_TZ): number {
  const guess = Date.UTC(y, m - 1, d)
  let t = guess - offsetMs(guess, tz)
  const again = guess - offsetMs(t, tz)
  if (again !== t) t = again
  return t
}

/** Ano, mês e dia do instante t no fuso. */
export function zonedDate(t: number, tz = EVENT_TZ) {
  const p = parts(t, tz)
  return { y: p.year, m: p.month, d: p.day }
}

// ---------- datas móveis ----------

/** Domingo de Páscoa (calendário gregoriano, algoritmo de Meeus/Jones/Butcher): mês e dia. */
export function easter(y: number): { m: number; d: number } {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  return { m: month, d: ((h + l - 7 * m + 114) % 31) + 1 }
}

/** Dia do mês do `nth` domingo de `month` em `y` (2º domingo de maio de 2026 = 10). */
export function nthSunday(y: number, month: number, nth: number): number {
  const dow = new Date(Date.UTC(y, month - 1, 1)).getUTCDay() // 0 = domingo
  return 1 + ((7 - dow) % 7) + (nth - 1) * 7
}

export type EventWindow = { startsAt: number; endsAt: number }

const mmdd = (s: string) => {
  const [m, d] = s.split('-').map(Number)
  return { m, d }
}

/** Janela do evento que começa no ano `y` (fim inclusive: termina à meia-noite do dia seguinte ao último dia). */
export function calendarWindow(cal: EventCalendar, y: number): EventWindow {
  if ('rule' in cal) {
    const base = cal.rule === 'pascoa' ? easter(y) : { m: cal.month, d: nthSunday(y, cal.month, cal.nth) }
    return { startsAt: zonedMidnight(y, base.m, base.d + cal.from), endsAt: zonedMidnight(y, base.m, base.d + cal.to + 1) }
  }
  const s = mmdd(cal.start), e = mmdd(cal.end)
  const crosses = e.m * 100 + e.d < s.m * 100 + s.d // ex.: Ano-Novo 29/12 → 05/01
  return { startsAt: zonedMidnight(y, s.m, s.d), endsAt: zonedMidnight(crosses ? y + 1 : y, e.m, e.d + 1) }
}

/** Janela em curso ou a próxima (a primeira que ainda não acabou). */
export function nextWindow(cal: EventCalendar, now: number): EventWindow {
  const { y } = zonedDate(now)
  for (const year of [y - 1, y, y + 1]) {
    const w = calendarWindow(cal, year)
    if (w.endsAt > now) return w
  }
  return calendarWindow(cal, y + 1)
}

/** O instante `now` está dentro da janela do calendário? */
export function inWindow(cal: EventCalendar, now: number): boolean {
  const w = nextWindow(cal, now)
  return now >= w.startsAt && now < w.endsAt
}

/** "MM-DD" do ano em que a janela começou (ex.: os presentes de Natal abrem em 12-25), em ms. Se a data cai antes do
 *  começo da janela (janela que vira o ano), vale a do ano seguinte. */
export function dateInWindow(w: EventWindow, md: string): number {
  const { m, d } = mmdd(md)
  const { y } = zonedDate(w.startsAt)
  const t = zonedMidnight(y, m, d)
  return t >= w.startsAt ? t : zonedMidnight(y + 1, m, d)
}
