import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

type JsonRecord = Record<string, unknown>

type RevokeLicenseBody = {
    licenseKey?: string
    reason?: string
    status?: 'refunded' | 'revoked' | 'disabled'
}

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-revoke-token',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
}

const supabaseUrl = Deno.env.get('SUPABASE_URL')
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
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

function maskLicenseKey(licenseKey: string) {
    if (licenseKey.length <= 8) return licenseKey
    return `${licenseKey.slice(0, 4)}-****-****-${licenseKey.slice(-4)}`
}

function isValidTargetStatus(value: string) {
    return value === 'refunded' || value === 'revoked' || value === 'disabled'
}

async function writeAuditLog(input: {
    licenseId?: string
    eventType: string
    message: string
    payload?: JsonRecord
}) {
    const { error } = await supabase
        .from('audit_logs')
        .insert({
            license_id: input.licenseId ?? null,
            event_type: input.eventType,
            message: input.message,
            payload: input.payload ?? {}
        })

    if (error) {
        console.error('audit_logs insert failed', error)
    }
}

Deno.serve(async request => {
    if (request.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    if (request.method !== 'POST') {
        return jsonResponse({ ok: false, code: 'METHOD_NOT_ALLOWED', message: 'Only POST is allowed' }, 405)
    }

    if (internalRevokeToken) {
        const providedToken = request.headers.get('x-internal-revoke-token')?.trim()
        if (!providedToken || providedToken !== internalRevokeToken) {
            return jsonResponse({
                ok: false,
                code: 'UNAUTHORIZED',
                message: 'Missing or invalid internal revoke token'
            }, 401)
        }
    }

    let body: RevokeLicenseBody

    try {
        body = await request.json()
    } catch {
        return jsonResponse({ ok: false, code: 'INVALID_JSON', message: 'Invalid JSON body' }, 400)
    }

    const licenseKey = normalizeText(body.licenseKey)
    const revokeReason = normalizeText(body.reason) || 'manual_revoke'
    const targetStatus = normalizeText(body.status) || 'revoked'

    if (!licenseKey) {
        return jsonResponse({
            ok: false,
            code: 'MISSING_FIELDS',
            message: 'licenseKey is required'
        }, 400)
    }

    if (!isValidTargetStatus(targetStatus)) {
        return jsonResponse({
            ok: false,
            code: 'INVALID_STATUS',
            message: 'status must be refunded, revoked or disabled'
        }, 400)
    }

    try {
        const { data: license, error: licenseError } = await supabase
            .from('licenses')
            .select('id, gumroad_license_key, status')
            .eq('gumroad_license_key', licenseKey)
            .maybeSingle()

        if (licenseError) {
            throw licenseError
        }

        if (!license) {
            await writeAuditLog({
                eventType: 'revoke_license_not_found',
                message: 'License key not found during revocation',
                payload: {
                    licenseKeyMasked: maskLicenseKey(licenseKey),
                    targetStatus,
                    revokeReason
                }
            })

            return jsonResponse({
                ok: false,
                code: 'LICENSE_NOT_FOUND',
                message: 'No se encontro la licencia a revocar'
            }, 404)
        }

        const revokedAt = new Date().toISOString()

        const { error: updateLicenseError } = await supabase
            .from('licenses')
            .update({
                status: targetStatus,
                updated_at: revokedAt,
                metadata: {
                    revokeReason,
                    revokedAt,
                    previousStatus: license.status
                }
            })
            .eq('id', license.id)

        if (updateLicenseError) {
            throw updateLicenseError
        }

        const { data: revokedActivations, error: updateActivationsError } = await supabase
            .from('license_activations')
            .update({
                activation_status: 'revoked',
                revoked_at: revokedAt,
                revoke_reason: revokeReason,
                last_validated_at: revokedAt
            })
            .eq('license_id', license.id)
            .eq('activation_status', 'active')
            .select('id, device_id')

        if (updateActivationsError) {
            throw updateActivationsError
        }

        await writeAuditLog({
            licenseId: license.id,
            eventType: targetStatus === 'refunded' ? 'refund_revoked' : 'license_revoked',
            message: 'License revoked successfully',
            payload: {
                targetStatus,
                revokeReason,
                licenseKeyMasked: maskLicenseKey(license.gumroad_license_key),
                revokedActivationCount: revokedActivations?.length ?? 0
            }
        })

        return jsonResponse({
            ok: true,
            license: {
                status: targetStatus,
                licenseKeyMasked: maskLicenseKey(license.gumroad_license_key)
            },
            revokedActivationCount: revokedActivations?.length ?? 0,
            message: 'Licencia revocada correctamente'
        })
    } catch (error) {
        console.error('revoke-license error', error)

        return jsonResponse({
            ok: false,
            code: 'INTERNAL_ERROR',
            message: 'No se pudo procesar la revocacion'
        }, 500)
    }
})