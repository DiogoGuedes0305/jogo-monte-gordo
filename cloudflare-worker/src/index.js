// Battle for Monte Gordo — relay de notificações push.
//
// Recebe um POST do jogo (firebase/public/index.html, função notifyEvent())
// sempre que alguém é atacado, abre um Desafio Relâmpago, ou conquista um
// território. Lê os tokens de dispositivo guardados na Realtime Database
// (teams/{id}/deviceTokens, leitura aberta, sem credenciais necessárias) e
// manda a notificação real via Firebase Cloud Messaging — este é o único
// sítio que guarda a credencial (FIREBASE_SERVICE_ACCOUNT_JSON, como secret,
// nunca no código nem no cliente).
//
// Body esperado: { title, body, targetTeamIds }
//   targetTeamIds: array de ids de equipa para notificar só essas (ex:
//   Assalto, privado à vítima), ou null/omitido para notificar todas as
//   equipas (Desafio Relâmpago, Conquista — públicos).

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

function base64url(buffer) {
  let str = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlFromString(str) {
  return base64url(new TextEncoder().encode(str));
}

// Assina um JWT (RS256) com a service account e troca-o por um access token
// OAuth2 junto da Google — é este token que autoriza o envio via FCM v1.
async function getGoogleAccessToken(env) {
  const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  const nowSec = Math.floor(Date.now() / 1000);

  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    exp: nowSec + 3600,
    iat: nowSec
  };

  const unsignedJwt = base64urlFromString(JSON.stringify(header)) + '.' + base64urlFromString(JSON.stringify(claim));

  const pemContents = serviceAccount.private_key
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');
  const binaryKey = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(unsignedJwt));
  const signedJwt = unsignedJwt + '.' + base64url(signature);

  const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + encodeURIComponent(signedJwt)
  });
  const tokenJson = await tokenResp.json();
  if (!tokenJson.access_token) throw new Error('Falha ao obter access token: ' + JSON.stringify(tokenJson));
  return tokenJson.access_token;
}

async function collectDeviceTokens(env, targetTeamIds) {
  const resp = await fetch(env.FIREBASE_DB_URL + '/teams.json');
  const teams = (await resp.json()) || {};

  const teamIds = Array.isArray(targetTeamIds) && targetTeamIds.length ? targetTeamIds : Object.keys(teams);

  const tokens = new Set();
  teamIds.forEach((id) => {
    const team = teams[id];
    if (team && team.deviceTokens) {
      Object.values(team.deviceTokens).forEach((t) => tokens.add(t));
    }
  });
  return tokens;
}

async function sendToToken(accessToken, projectId, token, title, body) {
  const resp = await fetch('https://fcm.googleapis.com/v1/projects/' + projectId + '/messages:send', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + accessToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      message: {
        token,
        notification: { title, body },
        webpush: { fcm_options: { link: '/' } }
      }
    })
  });
  return resp.ok;
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS });
    }

    let payload;
    try {
      payload = await request.json();
    } catch (e) {
      return new Response('Invalid JSON', { status: 400, headers: CORS_HEADERS });
    }

    const { title, body, targetTeamIds } = payload || {};
    if (!title || !body) {
      return new Response('Missing title/body', { status: 400, headers: CORS_HEADERS });
    }

    try {
      const tokens = await collectDeviceTokens(env, targetTeamIds);
      if (!tokens.size) {
        return new Response(JSON.stringify({ ok: true, sent: 0, total: 0 }), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
        });
      }

      const accessToken = await getGoogleAccessToken(env);
      let sent = 0;
      await Promise.all(
        Array.from(tokens).map(async (token) => {
          // Um token inválido/expirado (ex: permissão revogada) não deve
          // impedir o envio aos restantes — falha em silêncio por token.
          const ok = await sendToToken(accessToken, env.FIREBASE_PROJECT_ID, token, title, body).catch(() => false);
          if (ok) sent++;
        })
      );

      return new Response(JSON.stringify({ ok: true, sent, total: tokens.size }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    } catch (err) {
      return new Response(JSON.stringify({ ok: false, error: String(err && err.message || err) }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }
  }
};
