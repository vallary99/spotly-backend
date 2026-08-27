import { createRequire } from 'module';

// Pinned to whatever swagger-ui-dist npm resolved, so the CDN copy and the
// installed one can never drift. This is a require of a .json module rather
// than a file read, so bundlers trace it and it survives a serverless build.
const { version: swaggerUiVersion } = createRequire(__filename)(
  'swagger-ui-dist/package.json',
) as { version: string };

const cdn = `https://cdn.jsdelivr.net/npm/swagger-ui-dist@${swaggerUiVersion}`;

/**
 * The Swagger UI page, loading the UI bundle from a CDN rather than from
 * disk.
 *
 * @nestjs/swagger normally serves swagger-ui.css and swagger-ui-bundle.js
 * out of node_modules/swagger-ui-dist. Those are data files, not modules,
 * so serverless bundlers — which trace `require` graphs — leave them out
 * of the deployment. The HTML and the generated init script still load,
 * the two assets 404, and the page renders blank. Pointing at a CDN makes
 * the page independent of what the host happens to bundle.
 */
export function buildSwaggerHtml(jsonUrl: string, title: string): string {
  const options = JSON.stringify({
    url: jsonUrl,
    docExpansion: 'none',
    tagsSorter: 'alpha',
    operationsSorter: 'alpha',
    persistAuthorization: true,
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <link rel="stylesheet" href="${cdn}/swagger-ui.css">
  <link rel="icon" type="image/png" href="${cdn}/favicon-32x32.png" sizes="32x32">
  <style>
    html { box-sizing: border-box; overflow-y: scroll; }
    *, *:before, *:after { box-sizing: inherit; }
    body { margin: 0; background: #fafafa; }
    .swagger-ui .topbar { display: none; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="${cdn}/swagger-ui-bundle.js" crossorigin></script>
  <script src="${cdn}/swagger-ui-standalone-preset.js" crossorigin></script>
  <script>
    window.onload = function () {
      window.ui = SwaggerUIBundle(Object.assign(${options}, {
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
        plugins: [SwaggerUIBundle.plugins.DownloadUrl],
        layout: 'StandaloneLayout',
      }));
    };
  </script>
</body>
</html>`;
}
