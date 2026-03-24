import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

type JsonRecord = Record<string, unknown>

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
}

const supabaseUrl = Deno.env.get('SUPABASE_URL')
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const revokeLicenseUrl = Deno.env.get('REVOKE_LICENSE_URL')
const internalRevokeToken = Deno.env.get('INTERNAL_REVOKE_TOKEN')

if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables')
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
})

function jsonResponse(payload: JsonRecord, status = 200) {
    return new Response(JSON.stringify(payload), {
        status,
        headers: corsHeaders
    })
}

function normalizeText(value: unknown) {
    return typeof value === 'string' ? value.trim() : ''
}

function parseBoolean(value: unknown) {
    if (typeof value === 'boolean') return value
    const normalized = normalizeText(value).toLowerCase()
    return normalized === 'true' || normalized === '1' || normalized === 'yes'
}

function payloadToJsonRecord(payload: URLSearchParams | FormData | JsonRecord) {
    if (payload instanceof URLSearchParams) {
        return Object.fromEntries(payload.entries())
    }

    if (payload instanceof FormData) {
        return Object.fromEntries(Array.from(payload.entries()).map(([key, value]) => [key, String(value)]))
    }

    return payload
}

function deriveEventType(payload: JsonRecord) {
    if (parseBoolean(payload.refunded)) return 'refund'
    if (parseBoolean(payload.chargebacked)) return 'chargeback'
    if (normalizeText(payload.sale_id)) return 'sale'
    return 'unknown'
}

function resolveLicenseKey(payload: JsonRecord) {
    return normalizeText(payload.license_key) || normalizeText(payload.purchase?.license_key)
}

function resolveExternalEventId(payload: JsonRecord) {
    return normalizeText(payload.sale_id) || normalizeText(payload.order_id) || normalizeText(payload.id)
}

async function writeAuditLog(eventType: string, message: string, payload: JsonRecord = {}, licenseId?: string) {
    const { error } = await supabase
        .from('audit_logs')
        .insert({
            license_id: licenseId ?? null,
            event_type: eventType,
            message,
            payload
        })

    if (error) {
        console.error('audit_logs insert failed', error)
    }
}

async function parseIncomingPayload(request: Request) {
    const contentType = request.headers.get('content-type') || ''

    if (contentType.includes('application/json')) {
        const json = await request.json()
        return payloadToJsonRecord((json ?? {}) as JsonRecord)
    }

    if (contentType.includes('application/x-www-form-urlencoded')) {
        const rawBody = await request.text()
        return payloadToJsonRecord(new URLSearchParams(rawBody))
    }

    if (contentType.includes('multipart/form-data')) {
        const formData = await request.formData()
        return payloadToJsonRecord(formData)
    }

    const fallbackBody = await request.text()
    return payloadToJsonRecord(new URLSearchParams(fallbackBody))
}

async function findLicenseIdByKey(licenseKey: string) {
    if (!licenseKey) return undefined

    const { data, error } = await supabase
        .from('licenses')
        .select('id')
        .eq('gumroad_license_key', licenseKey)
        .maybeSingle()

    if (error) {
        throw error
    }

    return data?.id
}

async function storeWebhookEvent(payload: JsonRecord, eventType: string, externalEventId: string) {
    const { data, error } = await supabase
        .from('webhook_events')
        .insert({
            provider: 'gumroad',
            event_type: eventType,
            external_event_id: externalEventId || null,
            payload,
            processed: false
        })
        .select('id')
        .single()

    if (error) {
        throw error
    }

    return data.id as string
}

async function markWebhookProcessed(webhookEventId: string) {
    const { error } = await supabase
        .from('webhook_events')
        .update({
            processed: true,
            processed_at: new Date().toISOString()
        })
        .eq('id', webhookEventId)

    if (error) {
        throw error
    }
}

async function triggerRevokeLicense(licenseKey: string, reason: string) {
    if (!revokeLicenseUrl || !internalRevokeToken) {
        throw new Error('Missing REVOKE_LICENSE_URL or INTERNAL_REVOKE_TOKEN environment variables')
    }

    const response = await fetch(revokeLicenseUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-internal-revoke-token': internalRevokeToken
        },
        body: JSON.stringify({
            licenseKey,
            reason,
            status: 'refunded'
        })
    })

    const payload = await response.json().catch(() => ({}))

    if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || 'revoke-license returned an error')
    }

    return payload
}

Deno.serve(async request => {
    if (request.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    if (request.method !== 'POST') {
        return jsonResponse({ ok: false, code: 'METHOD_NOT_ALLOWED', message: 'Only POST is allowed' }, 405)
    }

    try {
        const payload = await parseIncomingPayload(request)
        const eventType = deriveEventType(payload)
        const externalEventId = resolveExternalEventId(payload)
        const licenseKey = resolveLicenseKey(payload)
        const webhookEventId = await storeWebhookEvent(payload, eventType, externalEventId)
        const licenseId = await findLicenseIdByKey(licenseKey)

        await writeAuditLog(
            'webhook_received',
            'Gumroad webhook received',
            {
                eventType,
                externalEventId,
                hasLicenseKey: Boolean(licenseKey)
            },
            licenseId
        )

        if (eventType !== 'refund') {
            await markWebhookProcessed(webhookEventId)

            await writeAuditLog(
                'webhook_processed',
                'Webhook stored with no revocation action required',
                {
                    eventType,
                    externalEventId
                },
                licenseId
            )

            return jsonResponse({
                ok: true,
                eventType,
                action: 'stored',
                message: 'Webhook registrado correctamente'
            })
        }

        if (!licenseKey) {
            await writeAuditLog(
                'webhook_refund_missing_license',
                'Refund webhook missing license key',
                {
                    eventType,
                    externalEventId
                },
                licenseId
            )

            return jsonResponse({
                ok: false,
                code: 'MISSING_LICENSE_KEY',
                message: 'El webhook de refund no incluye license key'
            }, 400)
        }

        const revokePayload = await triggerRevokeLicense(licenseKey, 'gumroad_refund')

        await markWebhookProcessed(webhookEventId)

        await writeAuditLog(
            'webhook_processed',
            'Refund webhook triggered revoke-license successfully',
            {
                eventType,
                externalEventId,
                revokePayload
            },
            licenseId
        )

        return jsonResponse({
            ok: true,
            eventType,
            action: 'revoked',
            revoke: revokePayload,
            message: 'Refund procesado y licencia revocada'
        })
    } catch (error) {
        console.error('gumroad-webhook error', error)

        return jsonResponse({
            ok: false,
            code: 'INTERNAL_ERROR',
            message: 'No se pudo procesar el webhook de Gumroad'
        }, 500)
    }
})