import { config } from "./config.ts";
import {
  SonioxError,
  badRequestError,
  errorResponse,
  internalError,
  invalidKeyError,
} from "./errors.ts";
import { extractApiKey, parseTranscriptionForm } from "./form.ts";
import { createSonioxApi, type SonioxApi } from "./soniox-api.ts";
import { transcribe } from "./transcribe.ts";

export const TRANSCRIPTION_PATH = "/v1/audio/transcriptions";

export type HandlerDeps = {
  createApi?: (apiKey: string) => SonioxApi;
};

const defaultCreateApi = (apiKey: string): SonioxApi => createSonioxApi({ apiKey });

export async function handleRequest(
  req: Request,
  deps: HandlerDeps = {},
): Promise<Response> {
  if (req.method !== "POST" || new URL(req.url).pathname !== TRANSCRIPTION_PATH) {
    return Response.json(
      {
        error: {
          message: `Not found. Use POST ${TRANSCRIPTION_PATH}`,
          type: "bad_request",
        },
      },
      { status: 404 },
    );
  }

  const startedAt = Date.now();
  try {
    return await handleTranscription(req, deps, startedAt);
  } catch (err) {
    return handleError(err, startedAt);
  }
}

async function handleTranscription(
  req: Request,
  deps: HandlerDeps,
  startedAt: number,
): Promise<Response> {
  const apiKey = extractApiKey(req);
  if (!apiKey) {
    throw invalidKeyError("Missing Authorization: Bearer <key> header");
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    throw badRequestError("Invalid multipart/form-data body");
  }

  const { audioBlob, language, terms } = parseTranscriptionForm(
    formData,
    config.MAX_FILE_SIZE_BYTES,
  );

  const createApi = deps.createApi ?? defaultCreateApi;
  const result = await transcribe({ api: createApi(apiKey), audioBlob, language, terms });
  console.log(
    `[soniox-proxy] POST ${TRANSCRIPTION_PATH} → 200 in ${Date.now() - startedAt}ms ` +
      `(soniox ${result.processingMs}ms, ${result.text.length} chars, ${language ?? "auto"})`,
  );
  return Response.json({ text: result.text });
}

function handleError(err: unknown, startedAt: number): Response {
  if (err instanceof SonioxError) {
    const { status, body } = errorResponse(err);
    console.log(
      `[soniox-proxy] POST ${TRANSCRIPTION_PATH} → ${status} in ${Date.now() - startedAt}ms (${body.error.type})`,
    );
    return Response.json(body, { status });
  }
  console.error("[soniox-proxy] unhandled error:", err);
  const wrapped = internalError(
    err instanceof Error ? err.message : "Unknown internal error",
  );
  const { status, body } = errorResponse(wrapped);
  return Response.json(body, { status });
}
