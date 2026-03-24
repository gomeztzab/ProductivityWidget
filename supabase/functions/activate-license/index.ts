import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

type JsonRecord = Record<string, unknown>

type ActivateLicenseBody = {
    licenseKey?: string
    deviceFingerprint?: string
    deviceName?: string
    osName?: string
    osVersion?: string
    appVersion?: string
}

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
}

const supabaseUrl = Deno.env.get('SUPABASE_URL')
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

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

async function writeAuditLog(input: {
    licenseId?: string
    deviceId?: string
    eventType: string
    message: string
    payload?: JsonRecord
}) {
    const { error } = await supabase
        .from('audit_logs')
        .insert({
            license_id: input.licenseId ?? null,
            device_id: input.deviceId ?? null,
            event_type: input.eventType,
            message: input.message,
            payload: input.payload ?? {}
        })

    if (error) {
        console.error('audit_logs insert failed', error)
    }
}

async function upsertDevice(body: Required<Pick<ActivateLicenseBody, 'deviceFingerprint'>> & ActivateLicenseBody) {
    const { data: existingDevice, error: existingDeviceError } = await supabase
        .from('devices')
        .select('id, device_fingerprint')
        .eq('device_fingerprint', body.deviceFingerprint)
        .maybeSingle()

    if (existingDeviceError) {
        throw existingDeviceError
    }

    const devicePayload = {
        device_fingerprint: body.deviceFingerprint,
        device_name: normalizeText(body.deviceName) || null,
        os_name: normalizeText(body.osName) || null,
        os_version: normalizeText(body.osVersion) || null,
        app_version: normalizeText(body.appVersion) || null,
        last_seen_at: new Date().toISOString()
    }

    if (existingDevice) {
        const { data: updatedDevice, error: updateError } = await supabase
            .from('devices')
            .update(devicePayload)
            .eq('id', existingDevice.id)
            .select('id, device_fingerprint')
            .single()

        if (updateError) {
            throw updateError
        }

        return updatedDevice
    }

    const { data: insertedDevice, error: insertError } = await supabase
        .from('devices')
        .insert({
            ...devicePayload,
            first_seen_at: new Date().toISOString()
        })
        .select('id, device_fingerprint')
        .single()

    if (insertError) {
        throw insertError
    }

    return insertedDevice
}

async function getPlanFeatures(planId: string) {
    const { data, error } = await supabase
        .from('feature_sets')
        .select('feature_key, enabled')
        .eq('plan_id', planId)

    if (error) {
        throw error
    }

    return (data ?? []).reduce<Record<string, boolean>>((acc, row) => {
        acc[row.feature_key] = Boolean(row.enabled)
        return acc
    }, {})
}

Deno.serve(async request => {
    if (request.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    if (request.method !== 'POST') {
        return jsonResponse({ ok: false, code: 'METHOD_NOT_ALLOWED', message: 'Only POST is allowed' }, 405)
    }

    let body: ActivateLicenseBody

    try {
        body = await request.json()
    } catch {
        return jsonResponse({ ok: false, code: 'INVALID_JSON', message: 'Invalid JSON body' }, 400)
    }

    const licenseKey = normalizeText(body.licenseKey)
    const deviceFingerprint = normalizeText(body.deviceFingerprint)

    if (!licenseKey || !deviceFingerprint) {
        return jsonResponse({
            ok: false,
            code: 'MISSING_FIELDS',
            message: 'licenseKey and deviceFingerprint are required'
        }, 400)
    }

    try {
        const { data: license, error: licenseError } = await supabase
            .from('licenses')
            .select(`
                id,
                plan_id,
                gumroad_license_key,
                status,
                max_devices,
                plans (
                    code,
                    name
                )
            `)
            .eq('gumroad_license_key', licenseKey)
            .maybeSingle()

        if (licenseError) {
            throw licenseError
        }

        if (!license) {
            await writeAuditLog({
                eventType: 'activation_denied',
                message: 'License key not found',
                payload: {
                    licenseKeyMasked: maskLicenseKey(licenseKey),
                    deviceFingerprint
                }
            })

            return jsonResponse({
                ok: false,
                code: 'LICENSE_NOT_FOUND',
                message: 'Codigo invalido'
            }, 404)
        }

        if (license.status !== 'active') {
            await writeAuditLog({
                licenseId: license.id,
                eventType: 'activation_denied',
                message: 'License is not active',
                payload: {
                    status: license.status,
                    licenseKeyMasked: maskLicenseKey(licenseKey),
                    deviceFingerprint
                }
            })

            return jsonResponse({
                ok: false,
                code: 'LICENSE_NOT_ACTIVE',
                message: 'La licencia no esta disponible para activacion',
                status: license.status
            }, 403)
        }

        const device = await upsertDevice({
            ...body,
            deviceFingerprint
        })

        const { data: existingActivation, error: existingActivationError } = await supabase
            .from('license_activations')
            .select('id, activated_at')
            .eq('license_id', license.id)
            .eq('device_id', device.id)
            .eq('activation_status', 'active')
            .maybeSingle()

        if (existingActivationError) {
            throw existingActivationError
        }

        if (existingActivation) {
            const { error: touchActivationError } = await supabase
                .from('license_activations')
                .update({
                    last_validated_at: new Date().toISOString()
                })
                .eq('id', existingActivation.id)

            if (touchActivationError) {
                throw touchActivationError
            }

            const features = await getPlanFeatures(license.plan_id)

            await writeAuditLog({
                licenseId: license.id,
                deviceId: device.id,
                eventType: 'activation_success',
                message: 'License already active on this device',
                payload: {
                    existingActivationId: existingActivation.id,
                    idempotent: true
                }
            })

            return jsonResponse({
                ok: true,
                plan: license.plans,
                license: {
                    status: license.status,
                    maxDevices: license.max_devices,
                    licenseKeyMasked: maskLicenseKey(license.gumroad_license_key)
                },
                activation: {
                    deviceFingerprint,
                    activatedAt: existingActivation.activated_at,
                    isNew: false
                },
                features,
                message: 'PRO activado correctamente'
            })
        }

        const { count: activeActivationsCount, error: countError } = await supabase
            .from('license_activations')
            .select('id', { count: 'exact', head: true })
            .eq('license_id', license.id)
            .eq('activation_status', 'active')

        if (countError) {
            throw countError
        }

        if ((activeActivationsCount ?? 0) >= license.max_devices) {
            await writeAuditLog({
                licenseId: license.id,
                deviceId: device.id,
                eventType: 'activation_limit_reached',
                message: 'Device limit reached',
                payload: {
                    maxDevices: license.max_devices,
                    currentCount: activeActivationsCount ?? 0,
                    deviceFingerprint
                }
            })

            return jsonResponse({
                ok: false,
                code: 'DEVICE_LIMIT_REACHED',
                message: 'Esta licencia ya alcanzo el maximo de 2 maquinas activadas.'
            }, 403)
        }

        const { data: newActivation, error: insertActivationError } = await supabase
            .from('license_activations')
            .insert({
                license_id: license.id,
                device_id: device.id,
                activation_status: 'active',
                activated_at: new Date().toISOString(),
                last_validated_at: new Date().toISOString(),
                metadata: {
                    source: 'activate-license-edge-function',
                    appVersion: normalizeText(body.appVersion) || null
                }
            })
            .select('id, activated_at')
            .single()

        if (insertActivationError) {
            throw insertActivationError
        }

        const features = await getPlanFeatures(license.plan_id)

        await writeAuditLog({
            licenseId: license.id,
            deviceId: device.id,
            eventType: 'activation_success',
            message: 'License activated successfully',
            payload: {
                activationId: newActivation.id,
                deviceFingerprint
            }
        })

        return jsonResponse({
            ok: true,
            plan: license.plans,
            license: {
                status: license.status,
                maxDevices: license.max_devices,
                licenseKeyMasked: maskLicenseKey(license.gumroad_license_key)
            },
            activation: {
                deviceFingerprint,
                activatedAt: newActivation.activated_at,
                isNew: true
            },
            features,
            message: 'PRO activado correctamente'
        })
    } catch (error) {
        console.error('activate-license error', error)

        return jsonResponse({
            ok: false,
            code: 'INTERNAL_ERROR',
            message: 'No se pudo procesar la activacion'
        }, 500)
    }
})