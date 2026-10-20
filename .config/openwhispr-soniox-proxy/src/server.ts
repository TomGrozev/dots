// Vendored from alumpe/openwhispr-soniox-proxy @ a063bf7 (MIT; see LICENSE).
// Local changes: GET /v1/models, because OpenWhispr's "Test Connection" probes
// it before accepting a Custom transcription endpoint; upstream only served
// POST /v1/audio/transcriptions. SONIOX_REGION picks the regional API domain.
import { config } from "./config.ts";
import { handleRequest, TRANSCRIPTION_PATH } from "./handler.ts";

const MODELS_PATH = "/v1/models";

const server = Bun.serve({
  port: config.PORT,
  hostname: config.HOST,
  fetch: (req) => {
    const { pathname } = new URL(req.url);
    if (req.method === "GET" && pathname === MODELS_PATH) {
      // The proxy ignores the requested model (Soniox async is fixed via
      // SONIOX_MODEL), so advertising that id is enough for the app's check.
      return Response.json({
        object: "list",
        data: [{ id: config.SONIOX_MODEL, object: "model", owned_by: "soniox" }],
      });
    }
    return handleRequest(req);
  },
});

console.log(
  `[soniox-proxy] region=${config.SONIOX_REGION} upstream=${config.SONIOX_API_BASE} ` +
    `listening on http://${server.hostname}:${server.port}` +
    `${TRANSCRIPTION_PATH} (models: ${MODELS_PATH})`,
);
