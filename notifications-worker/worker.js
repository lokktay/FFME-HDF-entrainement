/**
 * Worker Cloudflare — envoi des notifications push de HDF Training.
 *
 * Route : POST /notify-assignments
 *   En-tête : Authorization: Bearer <jeton Firebase de l'utilisateur connecté>
 *   Corps   : { "assignmentIds": ["...", "..."] }
 *
 * Sécurité :
 *   - Le jeton Firebase du coach est réutilisé pour lire Firestore : les règles de sécurité
 *     Firestore s'appliquent donc exactement comme dans l'app (un jeton invalide = lecture refusée).
 *   - Chaque attribution doit avoir été créée par CE coach (assignerId), il y a moins de 30 min,
 *     et ne pas être déjà réalisée. Impossible de notifier quelqu'un sans lui avoir attribué une séance.
 *   - La clé privée VAPID (qui signe les envois) n'existe que dans les secrets du Worker.
 *
 * Variables à définir dans Cloudflare (Settings → Variables and Secrets) :
 *   FIREBASE_PROJECT_ID  (texte)   ex. ffme-plateforme-entrainement
 *   ALLOWED_ORIGINS      (texte)   adresses autorisées à appeler le Worker, séparées par des virgules
 *                                  ex. https://ffme-plateforme-entrainement.web.app,http://localhost:3000
 *   VAPID_PUBLIC_KEY     (texte)   clé publique (format base64url)
 *   VAPID_PRIVATE_JWK    (secret)  clé privée (format JSON / JWK)
 *   VAPID_SUBJECT        (texte)   contact de l'expéditeur, ex. mailto:contact@monclub.fr
 */

const MAX_ASSIGNMENTS_PER_CALL = 50;
const MAX_ASSIGNMENT_AGE_MS = 30 * 60 * 1000;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const encoder = new TextEncoder();

export default {
    async fetch(request, env) {
        const cors = buildCorsHeaders(request, env);

        if(request.method === 'OPTIONS') {
            return new Response(null, { status: cors ? 204 : 403, headers: cors || {} });
        }
        if(!cors) return json({ error: 'Origine non autorisée.' }, 403);

        const url = new URL(request.url);
        if(request.method !== 'POST' || url.pathname !== '/notify-assignments') {
            return json({ error: 'Route inconnue.' }, 404, cors);
        }

        try {
            return json(await handleNotifyAssignments(request, env), 200, cors);
        } catch(error) {
            const status = error.status || 500;
            if(status === 500) console.error(error);
            return json({ error: error.publicMessage || 'Erreur interne.' }, status, cors);
        }
    }
};

// ---------------------------------------------------------------------------
// Logique métier
// ---------------------------------------------------------------------------

async function handleNotifyAssignments(request, env) {
    const token = getBearerToken(request);
    const uid = getTokenUid(token, env);

    let body;
    try {
        body = await request.json();
    } catch {
        throw httpError(400, 'Corps de requête invalide.');
    }
    const assignmentIds = [...new Set(Array.isArray(body && body.assignmentIds) ? body.assignmentIds : [])]
        .filter(id => typeof id === 'string' && ID_PATTERN.test(id))
        .slice(0, MAX_ASSIGNMENTS_PER_CALL);
    if(assignmentIds.length === 0) throw httpError(400, 'Aucune attribution valide.');

    // 1. Vérifie chaque attribution avec les droits du coach, et regroupe par athlète
    const now = Date.now();
    const perAthlete = new Map(); // athleteId -> { count, sessionName }
    let skipped = 0;
    for(const assignmentId of assignmentIds) {
        const assignment = await getFirestoreDoc(env, token, `assignments/${assignmentId}`);
        const isValid = assignment &&
            assignment.assignerId === uid &&
            assignment.isDone === false &&
            typeof assignment.athleteId === 'string' && ID_PATTERN.test(assignment.athleteId) &&
            typeof assignment.assignedAt === 'number' &&
            Math.abs(now - assignment.assignedAt) <= MAX_ASSIGNMENT_AGE_MS;
        if(!isValid) {
            skipped++;
            console.warn(`Attribution ${assignmentId} ignorée : ` + (!assignment
                ? 'introuvable ou non lisible avec les droits du coach'
                : 'auteur différent, déjà réalisée ou trop ancienne'));
            continue;
        }

        const entry = perAthlete.get(assignment.athleteId) || { count: 0, sessionName: '' };
        entry.count++;
        entry.sessionName = (assignment.sessionSnapshot && assignment.sessionSnapshot.name) || entry.sessionName;
        perAthlete.set(assignment.athleteId, entry);
    }

    // 2. Envoie une notification par appareil de chaque athlète
    let sent = 0;
    let failed = 0;
    let athletesWithoutDevice = 0;
    for(const [athleteId, entry] of perAthlete) {
        const record = await getFirestoreDoc(env, token, `pushSubscriptions/${athleteId}`);
        const devices = record && record.devices && typeof record.devices === 'object' ? Object.values(record.devices) : [];
        if(devices.length === 0) athletesWithoutDevice++;
        const payload = encoder.encode(JSON.stringify({
            type: 'sessions_assigned',
            count: entry.count,
            sessionName: String(entry.sessionName || '').slice(0, 120),
            url: './index.html'
        }));
        for(const device of devices) {
            if(!device || !device.endpoint || !device.p256dh || !device.auth) continue;
            try {
                const ok = await sendWebPush(device, payload, env);
                if(ok) sent++; else failed++;
            } catch(error) {
                console.error('Échec d’envoi push :', error);
                failed++;
            }
        }
    }

    const result = { sent, failed, skipped, athletes: perAthlete.size, athletesWithoutDevice };
    // Résumé lisible dans l'onglet « Logs » du Worker
    console.log(
        `Bilan : ${sent} notification(s) envoyée(s), ${failed} échec(s), ` +
        `${skipped} attribution(s) refusée(s), ${perAthlete.size} athlète(s) concerné(s), ` +
        `${athletesWithoutDevice} sans appareil abonné`
    );
    return result;
}

// ---------------------------------------------------------------------------
// Authentification & Firestore
// ---------------------------------------------------------------------------

function getBearerToken(request) {
    const header = request.headers.get('Authorization') || '';
    const match = header.match(/^Bearer\s+([A-Za-z0-9._-]+)$/);
    if(!match) throw httpError(401, 'Authentification requise.');
    return match[1];
}

/**
 * Lit l'identifiant de l'utilisateur dans le jeton. La signature n'est pas vérifiée ici :
 * c'est Firestore qui la vérifie à chaque lecture (un jeton falsifié est refusé), et les
 * lectures sont la condition de tout envoi. On contrôle tout de même le projet et l'expiration.
 */
function getTokenUid(token, env) {
    let claims;
    try {
        claims = JSON.parse(new TextDecoder().decode(base64UrlToBytes(token.split('.')[1] || '')));
    } catch {
        throw httpError(401, 'Jeton invalide.');
    }
    const nowSeconds = Math.floor(Date.now() / 1000);
    if(claims.aud !== env.FIREBASE_PROJECT_ID ||
       claims.iss !== `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}` ||
       typeof claims.exp !== 'number' || claims.exp < nowSeconds ||
       typeof claims.sub !== 'string' || !claims.sub) {
        throw httpError(401, 'Jeton invalide ou expiré.');
    }
    return claims.sub;
}

async function getFirestoreDoc(env, token, path) {
    const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}` +
        `/databases/(default)/documents/${path}`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if(response.status === 404 || response.status === 403) return null;
    if(response.status === 401) throw httpError(401, 'Jeton refusé par Firebase.');
    if(!response.ok) throw new Error(`Firestore ${response.status} : ${await response.text()}`);
    const doc = await response.json();
    return decodeFirestoreFields(doc.fields || {});
}

function decodeFirestoreFields(fields) {
    const result = {};
    for(const [key, value] of Object.entries(fields)) result[key] = decodeFirestoreValue(value);
    return result;
}

function decodeFirestoreValue(value) {
    if(!value || typeof value !== 'object') return null;
    if('stringValue' in value) return value.stringValue;
    if('integerValue' in value) return Number(value.integerValue);
    if('doubleValue' in value) return Number(value.doubleValue);
    if('booleanValue' in value) return value.booleanValue;
    if('timestampValue' in value) return Date.parse(value.timestampValue);
    if('mapValue' in value) return decodeFirestoreFields(value.mapValue.fields || {});
    if('arrayValue' in value) return (value.arrayValue.values || []).map(decodeFirestoreValue);
    return null;
}

// ---------------------------------------------------------------------------
// Web Push (RFC 8291 : chiffrement aes128gcm, RFC 8292 : authentification VAPID)
// ---------------------------------------------------------------------------

async function sendWebPush(device, payloadBytes, env) {
    const body = await encryptPayload(device, payloadBytes);
    const response = await fetch(device.endpoint, {
        method: 'POST',
        headers: {
            Authorization: await buildVapidAuthorization(device.endpoint, env),
            'Content-Encoding': 'aes128gcm',
            'Content-Type': 'application/octet-stream',
            TTL: '86400',
            Urgency: 'normal'
        },
        body
    });
    // 404 / 410 : l'appareil s'est désabonné. L'app nettoie ses abonnements à la prochaine ouverture.
    if(!response.ok) {
        const service = new URL(device.endpoint).host;
        console.warn(`Refus du service de notification ${service} : ${response.status} ${(await response.text()).slice(0, 300)}`);
    }
    return response.ok;
}

async function encryptPayload(device, payloadBytes) {
    const uaPublic = base64UrlToBytes(device.p256dh);   // clé publique du navigateur (65 octets)
    const authSecret = base64UrlToBytes(device.auth);   // secret d'authentification (16 octets)

    // Clé éphémère du serveur
    const serverKeys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    const serverPublic = new Uint8Array(await crypto.subtle.exportKey('raw', serverKeys.publicKey));
    const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, serverKeys.privateKey, 256));

    // Dérivation des clés (HKDF avec HMAC-SHA-256)
    const prkKey = await hmacSha256(authSecret, ecdhSecret);
    const keyInfo = concatBytes(encoder.encode('WebPush: info\0'), uaPublic, serverPublic);
    const ikm = await hmacSha256(prkKey, concatBytes(keyInfo, new Uint8Array([1])));
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const prk = await hmacSha256(salt, ikm);
    const contentKey = (await hmacSha256(prk, concatBytes(encoder.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16);
    const nonce = (await hmacSha256(prk, concatBytes(encoder.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);

    // Chiffrement (un seul enregistrement, délimiteur 0x02)
    const aesKey = await crypto.subtle.importKey('raw', contentKey, { name: 'AES-GCM' }, false, ['encrypt']);
    const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: nonce },
        aesKey,
        concatBytes(payloadBytes, new Uint8Array([2]))
    ));

    // En-tête : sel (16) | taille d'enregistrement (4, = 4096) | longueur de clé (1) | clé publique serveur (65)
    const recordSize = new Uint8Array([0x00, 0x00, 0x10, 0x00]);
    return concatBytes(salt, recordSize, new Uint8Array([serverPublic.length]), serverPublic, ciphertext);
}

async function buildVapidAuthorization(endpoint, env) {
    const header = bytesToBase64Url(encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
    const claims = bytesToBase64Url(encoder.encode(JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(Date.now() / 1000) + 12 * 3600,
        sub: normalizeVapidSubject(env.VAPID_SUBJECT)
    })));
    const unsigned = `${header}.${claims}`;
    const privateJwk = JSON.parse(env.VAPID_PRIVATE_JWK);
    delete privateJwk.key_ops; // évite un conflit d'usages selon l'outil qui a exporté la clé
    const key = await crypto.subtle.importKey('jwk', privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, encoder.encode(unsigned)));
    return `vapid t=${unsigned}.${bytesToBase64Url(signature)}, k=${env.VAPID_PUBLIC_KEY}`;
}

// Apple et Google exigent « mailto:adresse » ou une adresse https : on complète si besoin.
function normalizeVapidSubject(value) {
    const subject = String(value || '').trim();
    if(/^(mailto:|https:\/\/)/i.test(subject)) return subject;
    if(subject.includes('@')) return `mailto:${subject}`;
    return subject;
}

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------

async function hmacSha256(keyBytes, data) {
    const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return new Uint8Array(await crypto.subtle.sign('HMAC', key, data));
}

function concatBytes(...parts) {
    const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
    let offset = 0;
    for(const part of parts) {
        output.set(part, offset);
        offset += part.length;
    }
    return output;
}

function base64UrlToBytes(value) {
    let base64 = String(value).replace(/-/g, '+').replace(/_/g, '/');
    while(base64.length % 4) base64 += '=';
    const binary = atob(base64);
    return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function bytesToBase64Url(bytes) {
    let binary = '';
    for(const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function buildCorsHeaders(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(item => item.trim()).filter(Boolean);
    if(!origin || !allowed.includes(origin)) return null;
    return {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin'
    };
}

function httpError(status, publicMessage) {
    const error = new Error(publicMessage);
    error.status = status;
    error.publicMessage = publicMessage;
    return error;
}

function json(data, status = 200, extraHeaders = {}) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders }
    });
}
