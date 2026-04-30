// Google OAuth flow for Calendar access.
// GET /api/google-auth          -> redirects user to Google consent screen
// GET /api/google-auth?code=... -> handles callback, shows refresh token to copy

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events'
].join(' ');

export default async function handler(req, res) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = `https://${req.headers.host}/api/google-auth`;

  if (!clientId || !clientSecret) {
    return res.status(500).send(
      'Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in environment variables. Set them in Vercel and redeploy.'
    );
  }

  const code = req.query.code;
  const error = req.query.error;

  if (error) {
    return res.status(400).send(`Google auth error: ${error}`);
  }

  // STEP 2: Google redirected back with auth code -> exchange for tokens
  if (code) {
    try {
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code'
        })
      });
      const tokens = await tokenRes.json();

      if (!tokenRes.ok) {
        return res.status(500).send(`Token exchange failed: ${JSON.stringify(tokens)}`);
      }

      const refreshToken = tokens.refresh_token;
      if (!refreshToken) {
        return res
          .status(400)
          .send(
            'No refresh_token returned. Revoke app access in your Google account, then visit /api/google-auth again. (Google only returns the refresh token on first consent.)'
          );
      }

      // Display the refresh token so the user can add it to Vercel env vars.
      res.setHeader('Content-Type', 'text/html');
      return res.status(200).send(`<!doctype html>
<html><head><title>Google Auth Success</title>
<style>
  body{font-family:system-ui;background:#0f172a;color:#e2e8f0;padding:40px;max-width:780px;margin:auto;line-height:1.6}
  code,pre{background:#1e293b;padding:4px 8px;border-radius:6px;color:#a5f3fc;word-break:break-all}
  pre{padding:16px;overflow:auto}
  .ok{color:#4ade80}
</style></head>
<body>
  <h1 class="ok">✅ Google Calendar connected</h1>
  <p>Copy this refresh token and run the command below to save it.</p>
  <h3>Refresh token:</h3>
  <pre>${refreshToken}</pre>
  <h3>Add it to Vercel:</h3>
  <pre>echo "${refreshToken}" | vercel env add GOOGLE_REFRESH_TOKEN production</pre>
  <p>Then redeploy: <code>vercel --prod</code></p>
  <p>You can close this tab once that's done.</p>
</body></html>`);
    } catch (err) {
      return res.status(500).send(`Error: ${err.message}`);
    }
  }

  // STEP 1: Send user to Google's consent screen
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', SCOPES);
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent'); // force refresh_token to be returned

  res.writeHead(302, { Location: authUrl.toString() });
  res.end();
}
