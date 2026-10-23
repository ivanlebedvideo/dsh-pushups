/**
 * Host half of dsh-pushups.
 *
 * Counts human prompts that the Harness actually admitted, turns them into an
 * unpaid push-up debt, keeps the ledger on disk, serves the Client half over
 * two loopback HTTP routes, and exposes one read-only agent tool.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const name = 'dsh-pushups'
export const inject = ['tools', 'webServer']

const STATE_VERSION = 1
const MAX_PAYMENTS = 500
const MAX_DAYS = 400
const MAX_BODY_BYTES = 4096

const STORAGE_DIR = join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'storages', 'pushups')
const STATE_FILE = join(STORAGE_DIR, 'state.json')

/** Local (host time zone) calendar day key, `YYYY-MM-DD`. */
function dayKey(ts = Date.now()) {
  const date = new Date(ts)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** The next local day key; constructing a date keeps DST transitions correct. */
function nextDayKey(key) {
  const [year, month, day] = key.split('-').map(Number)
  return dayKey(new Date(year, month - 1, day + 1).getTime())
}

function emptyState(now) {
  const key = dayKey(now)
  return {
    version: STATE_VERSION,
    installedAt: now,
    total: 0,
    debt: 0,
    streak: 0,
    day: key,
    days: { [key]: { messages: 0, paid: 0 } },
    payments: [],
  }
}

function isCount(value) {
  return Number.isSafeInteger(value) && value >= 0
}

/** Coerce whatever is on disk into the current shape, or start over. */
function normalize(raw, now) {
  if (raw === null || typeof raw !== 'object' || raw.version !== STATE_VERSION) return emptyState(now)
  const state = emptyState(now)
  if (isCount(raw.installedAt)) state.installedAt = raw.installedAt
  if (isCount(raw.total)) state.total = raw.total
  if (isCount(raw.debt)) state.debt = raw.debt
  if (isCount(raw.streak)) state.streak = raw.streak
  if (typeof raw.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.day)) state.day = raw.day
  if (raw.days && typeof raw.days === 'object') {
    for (const [key, value] of Object.entries(raw.days)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || value === null || typeof value !== 'object') continue
      state.days[key] = {
        messages: isCount(value.messages) ? value.messages : 0,
        paid: isCount(value.paid) ? value.paid : 0,
      }
    }
  }
  if (Array.isArray(raw.payments)) {
    state.payments = raw.payments
      .filter((entry) => entry && isCount(entry.at) && isCount(entry.amount) && entry.amount > 0)
      .slice(0, MAX_PAYMENTS)
      .map((entry) => ({ at: entry.at, amount: entry.amount }))
  }
  return state
}

function load(now) {
  try {
    return normalize(JSON.parse(readFileSync(STATE_FILE, 'utf8')), now)
  } catch {
    return emptyState(now)
  }
}

function trimDays(state) {
  const keys = Object.keys(state.days).sort()
  while (keys.length > MAX_DAYS) {
    const stale = keys.shift()
    if (stale !== state.day) delete state.days[stale]
  }
}

/**
 * Move the ledger to today, closing every elapsed day.
 * A day that ends with debt breaks the streak; a closed day extends it.
 */
function rollDay(state, now) {
  const today = dayKey(now)
  let changed = false
  if (state.day > today) {
    state.day = today
    changed = true
  }
  let guard = 0
  while (state.day !== today && guard < MAX_DAYS + 2) {
    state.streak = state.debt > 0 ? 0 : state.streak + 1
    state.day = nextDayKey(state.day)
    changed = true
    guard += 1
  }
  if (!state.days[state.day]) {
    state.days[state.day] = { messages: 0, paid: 0 }
    changed = true
  }
  trimDays(state)
  return changed
}

function snapshot(state, now) {
  return {
    installedAt: state.installedAt,
    now,
    total: state.total,
    debt: state.debt,
    streak: state.streak,
    day: state.day,
    today: state.days[state.day] || { messages: 0, paid: 0 },
    payments: state.payments.slice(0, 20),
  }
}

function save(state) {
  try {
    mkdirSync(STORAGE_DIR, { recursive: true })
    const temporary = `${STATE_FILE}.tmp`
    writeFileSync(temporary, JSON.stringify(state), 'utf8')
    renameSync(temporary, STATE_FILE)
  } catch (error) {
    console.warn('[dsh-pushups] could not save the ledger:', error)
  }
}

function sendJson(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  response.end(JSON.stringify(value))
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let bytes = 0
    const chunks = []
    request.on('data', (chunk) => {
      bytes += chunk.length
      if (bytes > MAX_BODY_BYTES) {
        reject(new Error('request body is too large'))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'))
      } catch (error) {
        reject(error)
      }
    })
    request.on('error', reject)
  })
}

export function apply(ctx) {
  const state = load(Date.now())

  /** Admitted human prompts only: `source.kind === 'user'` plus a client rpc id. */
  ctx.on('session/event', (session, event) => {
    try {
      if (!event || event.type !== 'user/message') return
      const source = event.data && event.data.source
      if (!source || source.kind !== 'user' || typeof source.rpcId !== 'string') return
      if (session && session.header && session.header.origin === 'subagent') return
      const now = Date.now()
      rollDay(state, now)
      state.total += 1
      state.debt += 1
      state.days[state.day].messages += 1
      save(state)
    } catch (error) {
      console.warn('[dsh-pushups] could not count a prompt:', error)
    }
  })

  const handleState = (request, response) => {
    if (request.method !== 'GET') return sendJson(response, 405, { error: 'use GET' })
    const now = Date.now()
    if (rollDay(state, now)) save(state)
    sendJson(response, 200, snapshot(state, now))
  }

  const handlePay = async (request, response) => {
    if (request.method !== 'POST') return sendJson(response, 405, { error: 'use POST' })
    let body
    try {
      body = await readJsonBody(request)
    } catch (error) {
      return sendJson(response, 400, { error: String(error && error.message ? error.message : error) })
    }
    const amount = Number(body && body.amount)
    const now = Date.now()
    rollDay(state, now)
    if (!Number.isSafeInteger(amount) || amount <= 0) return sendJson(response, 400, { error: 'amount must be a positive integer' })
    if (amount > state.debt) return sendJson(response, 400, { error: `amount exceeds the debt (${state.debt})` })
    state.debt -= amount
    state.days[state.day].paid += amount
    state.payments.unshift({ at: now, amount })
    if (state.payments.length > MAX_PAYMENTS) state.payments.length = MAX_PAYMENTS
    save(state)
    sendJson(response, 200, snapshot(state, now))
  }

  const handleReset = async (request, response) => {
    if (request.method !== 'POST') return sendJson(response, 405, { error: 'use POST' })
    let body
    try {
      body = await readJsonBody(request)
    } catch (error) {
      return sendJson(response, 400, { error: String(error && error.message ? error.message : error) })
    }
    if (!body || body.confirm !== true) return sendJson(response, 400, { error: 'confirm: true is required' })
    const now = Date.now()
    state.total = 0
    state.debt = 0
    state.streak = 0
    state.payments = []
    state.days = {}
    state.day = dayKey(now)
    state.days[state.day] = { messages: 0, paid: 0 }
    save(state)
    sendJson(response, 200, snapshot(state, now))
  }

  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/pushups/state', handler: handleState }))
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/pushups/pay', handler: handlePay }))
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/pushups/reset', handler: handleReset }))

  const toolValue = () => {
    const now = Date.now()
    if (rollDay(state, now)) save(state)
    return {
      total: state.total,
      debt: state.debt,
      streak: state.streak,
      installedAt: state.installedAt,
      messagesToday: state.days[state.day].messages,
      paidToday: state.days[state.day].paid,
    }
  }

  try {
    ctx.tools.register({
      name: 'pushups_status',
      description:
        'Read the push-up debt derived from how many messages the human has sent this installation. Returns the lifetime admitted-prompt count, the unpaid push-up debt, the streak of days closed without debt, and today numbers. Read-only.',
      parameters: { type: 'object', properties: {} },
      output: {
        schema: {
          type: 'object',
          properties: {
            total: { type: 'number' },
            debt: { type: 'number' },
            streak: { type: 'number' },
            installedAt: { type: 'number' },
            messagesToday: { type: 'number' },
            paidToday: { type: 'number' },
          },
        },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
      },
      execute: () => Promise.resolve(toolValue()),
    })
  } catch (error) {
    console.warn('[dsh-pushups] could not register the pushups_status tool:', error)
  }
}
