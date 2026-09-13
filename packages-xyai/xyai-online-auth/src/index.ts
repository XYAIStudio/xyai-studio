/**
 * @xyai/dsh-online-auth — Host half.
 *
 * Links this installation to a www.cnxyai.cn account through the OAuth device
 * authorization flow: the Host requests a device code, the operator confirms it
 * in a browser, and the Host exchanges the code for a bearer token. The token is
 * a `role('secret')` settings field, so no wire surface reads it back; the
 * browser half drives the flow over this package's own Connection RPC channel.
 */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
// Activates the ctx.connection Context merge this plugin registers its channel on.
import type {} from '@deepseek-ai/dsh-client-connection'
import type { ConnectionRpcResult } from '@deepseek-ai/dsh-client-connection'
// Activates the ctx.settings Context merge this plugin stores the bearer token in.
import type {} from '@deepseek-ai/dsh-settings'
import type { SettingsScope } from '@deepseek-ai/dsh-settings'
import { ONLINE_CHANNEL, type OnlineEnvelope, type OnlineUser } from './protocol.ts'

/** Online-version API origin this installation links against. */
const BASE = 'https://www.cnxyai.cn'

/** Resolved online-account section; `accessToken` never leaves the Host. */
interface OnlineAccountSection {
  accessToken?: string
  loggedAt?: string
  userId?: number
  userName?: string
  userEmail?: string
  userIsAdmin?: boolean
}

const accountSchema: z<OnlineAccountSection> = z.object({
  accessToken: z.string().role('secret').default(''),
  loggedAt: z.string().default(''),
  userId: z.number().default(0),
  userName: z.string().default(''),
  userEmail: z.string().default(''),
  userIsAdmin: z.boolean().default(false),
})

/** One decoded online-backend answer: a flat `{ ok, message, ...fields }` record. */
type ApiAnswer = Record<string, unknown>

/**
 * POST one JSON body to the online backend.
 * @param path - API file below `/app/api`, such as `device.php`.
 * @param body - request fields.
 * @param token - bearer token to attach; omitted for the unauthenticated device-code request.
 * @returns the decoded answer, or an empty record when the response body was not JSON.
 */
async function apiPost(path: string, body: Record<string, unknown>, token?: string): Promise<ApiAnswer> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' }
  if (token !== undefined && token !== '') headers.Authorization = `Bearer ${token}`
  const response = await fetch(`${BASE}/app/api/${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
  try {
    return await response.json() as ApiAnswer
  } catch {
    // Only a non-JSON body reaches here; the caller routes on the envelope's own `ok` and `status` fields.
    return {}
  }
}

/**
 * Read one answer field as a string.
 * @param value - decoded answer field.
 * @returns the string, or empty when the field is absent or another type.
 */
function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/**
 * Read one answer field as a number.
 * @param value - decoded answer field.
 * @returns the number, or zero when the field is absent or another type.
 */
function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

/**
 * Read one answer field as the linked-account record.
 * @param value - decoded `user` field.
 * @returns the account, or null when the answer carried none.
 */
function userOf(value: unknown): OnlineUser | null {
  if (typeof value !== 'object' || value === null) return null
  const fields = value as Record<string, unknown>
  return { id: num(fields.id), name: str(fields.name), email: str(fields.email), isAdmin: fields.isAdmin === true }
}

/**
 * Read one decoded RPC payload as a field bag.
 * @param payload - the channel-delivered payload.
 * @returns its fields, or none when the payload is not an object.
 */
function fieldsOf(payload: unknown): Record<string, unknown> {
  return typeof payload === 'object' && payload !== null && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {}
}

/**
 * Wrap one endpoint answer as a successful channel result.
 * @param value - the endpoint's business answer.
 * @returns the Connection success result.
 */
function answered(value: unknown): ConnectionRpcResult<unknown> {
  return { ok: true, value }
}

/**
 * Wrap one refusal as a failed channel result.
 * @param code - stable machine code the browser half routes on.
 * @param message - operator-readable reason.
 * @returns the Connection failure result.
 */
function refused(code: string, message: string): ConnectionRpcResult<unknown> {
  return { ok: false, error: { code, message, details: {} } }
}

/** The link state the settings card opens with; the token itself is never included. */
type StatusAnswer = OnlineEnvelope & { baseUrl: string; loggedIn: boolean; user: OnlineUser | null }

/** One issued device code and where the operator confirms it. */
type DeviceCodeAnswer = OnlineEnvelope & {
  deviceCode: string
  userCode: string
  verificationUri: string
  expiresIn: number
}

/** One poll outcome: the backend's device status plus the account it authorized. */
type PollAnswer = OnlineEnvelope & { status: string; user: OnlineUser | null }

/** One revalidated session: the account the stored bearer token still belongs to. */
type MeAnswer = OnlineEnvelope & { user: OnlineUser | null }

/** Host verbs behind {@link ONLINE_CHANNEL}, each reading the account section afresh. */
class OnlineBackend {
  private readonly account: SettingsScope<OnlineAccountSection>

  /**
   * Register the online-account settings namespace on the plugin's own lifetime.
   * @param ctx - Host plugin context providing the settings service.
   */
  constructor(ctx: Context) {
    this.account = ctx.settings.register('xyai-online', accountSchema)
  }

  /**
   * Answer one channel call.
   * @param endpoint - channel-relative endpoint the browser half named.
   * @param payload - decoded request payload.
   * @returns the endpoint answer, or a refusal naming the failing endpoint.
   */
  async dispatch(endpoint: string, payload: unknown): Promise<ConnectionRpcResult<unknown>> {
    try {
      switch (endpoint) {
        case 'status': return answered(this.status())
        case 'device/code': return answered(await this.deviceCode())
        case 'device/poll': return answered(await this.devicePoll(fieldsOf(payload)))
        case 'me': return answered(await this.me())
        case 'logout': return answered(await this.logout())
        // The endpoint set is this package's own protocol, so an unknown name is a caller fault.
        default: return refused('online/unknown-endpoint', `unknown online endpoint ${JSON.stringify(endpoint)}`)
      }
    } catch (error) {
      return refused('online/network', error instanceof Error ? error.message : String(error))
    }
  }

  /** Report the stored link state; the bearer token stays on the Host. */
  private status(): StatusAnswer {
    const section = this.account.get()
    const loggedIn = (section.accessToken ?? '') !== ''
    return { errcode: '0', errmsg: '', baseUrl: BASE, loggedIn, user: loggedIn ? this.storedUser(section) : null }
  }

  /** Request one fresh device code from the online backend. */
  private async deviceCode(): Promise<DeviceCodeAnswer> {
    const answer = await apiPost('device.php', { action: 'code' })
    if (answer.ok !== true) {
      return {
        errcode: '400',
        errmsg: str(answer.message) || '获取设备码失败',
        deviceCode: '', userCode: '', verificationUri: '', expiresIn: 0,
      }
    }
    return {
      errcode: '0', errmsg: '',
      deviceCode: str(answer.device_code),
      userCode: str(answer.user_code),
      verificationUri: str(answer.verification_uri),
      expiresIn: num(answer.expires_in),
    }
  }

  /**
   * Exchange one device code for a bearer token and store it once authorized.
   * @param fields - decoded payload fields carrying `deviceCode`.
   * @returns the backend's device status and, once authorized, the linked account.
   */
  private async devicePoll(fields: Record<string, unknown>): Promise<PollAnswer> {
    const deviceCode = str(fields.deviceCode)
    if (deviceCode === '') return { errcode: '400', errmsg: 'missing deviceCode', status: 'invalid', user: null }
    const answer = await apiPost('device.php', { action: 'token', device_code: deviceCode })
    const status = str(answer.status)
    if (status !== 'authorized') {
      // A pending, expired, denied, or already-issued code is an ordinary poll outcome, not a failure.
      return { errcode: '0', errmsg: '', status: status === '' ? 'pending' : status, user: null }
    }
    const user = userOf(answer.user)
    await this.store(str(answer.access_token), user)
    return { errcode: '0', errmsg: '', status, user }
  }

  /** Revalidate the stored bearer token and refresh the stored account from the answer. */
  private async me(): Promise<MeAnswer> {
    const token = this.account.get().accessToken ?? ''
    if (token === '') return { errcode: '401', errmsg: '未登录', user: null }
    const answer = await apiPost('auth.php', { action: 'me' }, token)
    if (answer.ok !== true) {
      await this.account.replace({})
      return { errcode: '401', errmsg: str(answer.message) || '会话已失效', user: null }
    }
    const user = userOf(answer.user)
    await this.store(token, user)
    return { errcode: '0', errmsg: '', user }
  }

  /** End the online session and forget the stored bearer token. */
  private async logout(): Promise<OnlineEnvelope> {
    const token = this.account.get().accessToken ?? ''
    // A backend that already dropped the session still leaves nothing worth keeping locally.
    if (token !== '') await apiPost('auth.php', { action: 'logout' }, token)
    await this.account.replace({})
    return { errcode: '0', errmsg: '' }
  }

  /** Rebuild the linked account from the stored, non-secret section fields. */
  private storedUser(section: OnlineAccountSection): OnlineUser | null {
    const id = section.userId ?? 0
    const name = section.userName ?? ''
    const email = section.userEmail ?? ''
    if (id === 0 && name === '' && email === '') return null
    return { id, name, email, isAdmin: section.userIsAdmin ?? false }
  }

  /** Commit one bearer token together with the account it belongs to. */
  private async store(token: string, user: OnlineUser | null): Promise<void> {
    await this.account.update({
      accessToken: token,
      loggedAt: new Date().toISOString(),
      userId: user?.id ?? 0,
      userName: user?.name ?? '',
      userEmail: user?.email ?? '',
      userIsAdmin: user?.isAdmin ?? false,
    })
  }
}

/** Services this plugin cannot serve without: the RPC carrier and the durable token store. */
export const inject = ['connection', 'settings']

/**
 * Register the online-account settings namespace and the Connection RPC channel
 * the browser half drives the device authorization flow over.
 * @param ctx - Host plugin context.
 */
export function apply(ctx: Context): void {
  const backend = new OnlineBackend(ctx)
  ctx.effect(
    () => ctx.connection.rpc.handle(ONLINE_CHANNEL, (endpoint, payload) => backend.dispatch(endpoint, payload)),
    'xyai-online-auth: rpc channel',
  )
}
