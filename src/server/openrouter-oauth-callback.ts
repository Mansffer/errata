import { createHash, randomBytes } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { getGlobalConfig, saveGlobalConfig } from './config/storage'
import { ProviderConfigSchema } from './config/schema'

const CALLBACK_PORT = 3000
const CALLBACK_PATH = '/openrouter-oauth-callback'
const SESSION_TTL_MS = 10 * 60 * 1000
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'
const OPENROUTER_FREE_MODEL_ID = 'openrouter/free'

let callbackServer: Server | null = null
let callbackServerStarting: Promise<void> | null = null
let callbackServerUnavailable = false
const sessions = new Map<string, { verifier: string; dataDir: string; expiresAt: number }>()

function base64Url(bytes: Buffer) {
  return bytes.toString('base64url')
}

function createCodeChallenge(verifier: string) {
  return base64Url(createHash('sha256').update(verifier).digest())
}

function isOpenRouterProvider(provider: { preset?: string; baseURL: string }) {
  return provider.preset === 'openrouter' || provider.baseURL.includes('openrouter.ai')
}

function sendHtml(res: ServerResponse, status: number, body: string) {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' })
  res.end(`<!doctype html>
<html>
  <head>
    <title>Errata OpenRouter OAuth</title>
    <style>
      body { font-family: system-ui, sans-serif; max-width: 36rem; margin: 4rem auto; padding: 0 1rem; line-height: 1.5; color: #171717; }
      p { color: #525252; }
      code { background: #f5f5f5; padding: 0.125rem 0.25rem; border-radius: 0.25rem; }
    </style>
  </head>
  <body>${body}</body>
</html>`)
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

async function exchangeCodeForKey(code: string, verifier: string) {
  const res = await fetch('https://openrouter.ai/api/v1/auth/keys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      code_verifier: verifier,
      code_challenge_method: 'S256',
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`OpenRouter OAuth failed: ${res.status} ${text}`)
  }

  const json = await res.json() as { key?: string }
  if (!json.key) throw new Error('OpenRouter OAuth did not return an API key')
  return json.key
}

export async function saveOpenRouterOAuthProvider(dataDir: string, apiKey: string) {
  const config = await getGlobalConfig(dataDir)
  const existingIdx = config.providers.findIndex((p) => isOpenRouterProvider(p))
  const now = new Date().toISOString()

  if (existingIdx === -1) {
    const provider = ProviderConfigSchema.parse({
      id: `prov-${Date.now().toString(36)}`,
      name: 'OpenRouter',
      preset: 'openrouter',
      baseURL: OPENROUTER_BASE_URL,
      apiKey,
      defaultModel: OPENROUTER_FREE_MODEL_ID,
      enabled: true,
      customHeaders: {},
      createdAt: now,
    })
    config.providers.push(provider)
    if (!config.defaultProviderId) config.defaultProviderId = provider.id
  } else {
    config.providers[existingIdx] = {
      ...config.providers[existingIdx],
      name: config.providers[existingIdx].name || 'OpenRouter',
      preset: 'openrouter',
      baseURL: OPENROUTER_BASE_URL,
      apiKey,
      defaultModel: config.providers[existingIdx].defaultModel || OPENROUTER_FREE_MODEL_ID,
      enabled: true,
    }
  }

  await saveGlobalConfig(dataDir, config)
  return config
}

export async function exchangeAndSaveOpenRouterOAuthCode(dataDir: string, code: string, verifier: string) {
  const apiKey = await exchangeCodeForKey(code, verifier)
  return saveOpenRouterOAuthProvider(dataDir, apiKey)
}

async function handleCallback(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', `http://localhost:${CALLBACK_PORT}`)

  if (url.pathname === `${CALLBACK_PATH}/health`) {
    res.writeHead(200, {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
    })
    res.end(JSON.stringify({ ok: true }))
    return
  }

  if (url.pathname !== CALLBACK_PATH) {
    sendHtml(res, 404, '<p>Not found.</p>')
    return
  }

  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')
  const sessionId = url.searchParams.get('session_id')

  if (error) {
    sendHtml(res, 400, `<h1>OpenRouter sign-in failed</h1><p>${escapeHtml(error)}</p>`)
    return
  }

  if (!code || !sessionId) {
    sendHtml(res, 400, '<h1>OpenRouter sign-in failed</h1><p>The callback was missing its code or session.</p>')
    return
  }

  const session = sessions.get(sessionId)
  sessions.delete(sessionId)
  if (!session || session.expiresAt < Date.now()) {
    sendHtml(res, 400, '<h1>OpenRouter sign-in expired</h1><p>Return to Errata and start the OpenRouter connection again.</p>')
    return
  }

  try {
    await exchangeAndSaveOpenRouterOAuthCode(session.dataDir, code, session.verifier)
    sendHtml(res, 200, '<h1>OpenRouter connected</h1><p>You may close this window and return to Errata.</p>')
  } catch (err) {
    const message = err instanceof Error ? err.message : 'OpenRouter OAuth exchange failed'
    sendHtml(res, 502, `<h1>OpenRouter sign-in failed</h1><p>${escapeHtml(message)}</p>`)
  }
}

export function createOpenRouterOAuthAuthorizationUrl(dataDir: string) {
  if (!callbackServer?.listening) {
    throw new Error('OpenRouter OAuth callback bridge is not running on localhost:3000.')
  }

  const sessionId = base64Url(randomBytes(32))
  const verifier = base64Url(randomBytes(48))
  sessions.set(sessionId, { verifier, dataDir, expiresAt: Date.now() + SESSION_TTL_MS })

  const callback = new URL(`http://localhost:${CALLBACK_PORT}${CALLBACK_PATH}`)
  callback.searchParams.set('session_id', sessionId)

  const authUrl = new URL('https://openrouter.ai/auth')
  authUrl.searchParams.set('callback_url', callback.toString())
  authUrl.searchParams.set('code_challenge', createCodeChallenge(verifier))
  authUrl.searchParams.set('code_challenge_method', 'S256')

  return { authUrl: authUrl.toString() }
}

export function ensureOpenRouterOAuthCallbackBridge() {
  if (callbackServer?.listening || callbackServerStarting) {
    return callbackServerStarting ?? Promise.resolve()
  }

  callbackServerUnavailable = false
  const server = createServer((req, res) => {
    void handleCallback(req, res).catch((err) => {
      const message = err instanceof Error ? err.message : 'Unknown error'
      sendHtml(res, 500, `<h1>OpenRouter sign-in failed</h1><p>${escapeHtml(message)}</p>`)
    })
  })
  callbackServer = server

  callbackServerStarting = new Promise<void>((resolve) => {
    server.once('error', (err: NodeJS.ErrnoException) => {
      callbackServer = null
      callbackServerStarting = null
      if (err.code === 'EADDRINUSE') {
        callbackServerUnavailable = true
        console.warn('[openrouter] OAuth callback bridge skipped: localhost:3000 is already in use.')
        resolve()
        return
      }
      console.warn('[openrouter] OAuth callback bridge failed:', err)
      resolve()
    })
    server.listen(CALLBACK_PORT, () => {
      callbackServerStarting = null
      console.info(`[openrouter] OAuth callback bridge listening at http://localhost:${CALLBACK_PORT}${CALLBACK_PATH}`)
      resolve()
    })
  })

  return callbackServerStarting
}

export function isOpenRouterOAuthCallbackBridgeAvailable() {
  return Boolean(callbackServer?.listening) && !callbackServerUnavailable
}
