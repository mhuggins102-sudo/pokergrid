// GET /share?score=...&mode=...&diff=...&grid=<50-char encoding>
//
// Returns an HTML page whose Open Graph + Twitter Card meta tags point to the
// /share/og.png image generator. When the URL is dropped into iMessage / Slack /
// Discord etc., the client fetches THIS page, parses the meta tags, fetches the
// og:image, and renders the unfurled card.
//
// A human who actually clicks the link sees a small fallback page and a button
// to launch the game.

import { escapeHtml, parseShare, shareTitle } from './_shared';

export const onRequest: PagesFunction = async ({ request }) => {
  const url = new URL(request.url);
  const { score, mode, difficulty } = parseShare(url);
  const title = shareTitle(score, mode, difficulty);

  // og:image carries the same query params so the image generator sees the
  // same grid/score/mode. Use the request origin so this works on any domain
  // (preview deploys, custom domains, etc.).
  const ogImageUrl = new URL('/share/og.png', url.origin);
  ogImageUrl.search = url.search;

  const playUrl = url.origin + '/';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <meta name="viewport" content="width=device-width,initial-scale=1" />

  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="PokerGrid" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="5×5 poker solitaire. Place every card, score the 10 lines, beat your target." />
  <meta property="og:url" content="${escapeHtml(url.href)}" />
  <meta property="og:image" content="${escapeHtml(ogImageUrl.href)}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:image" content="${escapeHtml(ogImageUrl.href)}" />

  <style>
    html, body {
      margin: 0; padding: 0;
      background: #06070d;
      color: #e9ecff;
      font-family: ui-monospace, Menlo, Consolas, "Courier New", monospace;
      min-height: 100vh;
    }
    main {
      max-width: 480px;
      margin: 0 auto;
      padding: 48px 24px;
      text-align: center;
    }
    h1 {
      font-size: 22px;
      letter-spacing: 1.5px;
      font-weight: 800;
      line-height: 1.4;
      margin: 0 0 24px;
      color: #e9ecff;
    }
    .score {
      font-size: 64px;
      font-weight: 900;
      color: #6bd6ff;
      text-shadow: 0 0 18px rgba(107, 214, 255, 0.7);
      letter-spacing: 2px;
      margin: 16px 0;
    }
    .mode {
      font-size: 12px;
      letter-spacing: 3px;
      text-transform: uppercase;
      color: #a8b0d6;
      margin-bottom: 32px;
    }
    a.play {
      display: inline-block;
      padding: 14px 28px;
      background: rgba(107, 214, 255, 0.15);
      border: 1px solid #6bd6ff;
      border-radius: 6px;
      color: #6bd6ff;
      text-decoration: none;
      font-weight: 800;
      letter-spacing: 2px;
      text-transform: uppercase;
      font-size: 12px;
      text-shadow: 0 0 8px rgba(107, 214, 255, 0.9);
      box-shadow: 0 0 18px rgba(107, 214, 255, 0.3);
    }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(title)}</h1>
    <div class="score">${score}</div>
    <div class="mode">${escapeHtml(mode)}${difficulty ? ' · ' + escapeHtml(difficulty.toUpperCase()) : ''}</div>
    <a class="play" href="${escapeHtml(playUrl)}">Play PokerGrid</a>
  </main>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // Allow ~10 minutes of edge caching since the URL params fully determine
      // the output. Long enough to absorb iMessage/Slack/etc. unfurl bursts.
      'cache-control': 'public, max-age=600',
    },
  });
};
