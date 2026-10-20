import { config } from "./config.ts";
import {
  fromUpstreamResponse,
  internalError,
  upstreamError,
} from "./errors.ts";
import type {
  SonioxCreateTranscriptionRequest,
  SonioxFile,
  SonioxTranscript,
  SonioxTranscription,
} from "./types.ts";

export type SonioxResourceKind = "transcriptions" | "files";

export type SonioxApi = {
  uploadFile(audioBlob: Blob): Promise<string>;
  createTranscription(input: {
    fileId: string;
    language?: string;
    terms?: string[];
  }): Promise<string>;
  getTranscription(transcriptionId: string): Promise<SonioxTranscription>;
  getTranscript(transcriptionId: string): Promise<SonioxTranscript>;
  deleteResource(resource: SonioxResourceKind, id: string): Promise<void>;
};

export type SonioxApiOptions = {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  fetchFn?: typeof fetch;
};

function uploadFilename(audioBlob: Blob): string {
  const subtype = audioBlob.type.split(";")[0]?.split("/")[1]?.trim();
  return `audio.${subtype || "webm"}`;
}

export function createSonioxApi(options: SonioxApiOptions): SonioxApi {
  const {
    apiKey,
    baseUrl = config.SONIOX_API_BASE,
    model = config.SONIOX_MODEL,
    fetchFn = fetch,
  } = options;

  const authHeaders = (): Record<string, string> => ({
    Authorization: `Bearer ${apiKey}`,
  });

  const request = async (
    path: string,
    init: RequestInit,
    context: string,
  ): Promise<Response> => {
    const res = await fetchFn(`${baseUrl}${path}`, init);
    if (!res.ok) {
      throw await fromUpstreamResponse(res, context);
    }
    return res;
  };

  const requestJson = async <T>(
    path: string,
    init: RequestInit,
    context: string,
  ): Promise<T> => {
    const res = await request(path, init, context);
    try {
      return (await res.json()) as T;
    } catch {
      throw upstreamError(`${context}: Soniox returned malformed JSON`);
    }
  };

  return {
    async uploadFile(audioBlob: Blob): Promise<string> {
      const form = new FormData();
      form.append("file", audioBlob, uploadFilename(audioBlob));

      const data = await requestJson<SonioxFile>(
        "/files",
        { method: "POST", headers: authHeaders(), body: form },
        "Soniox file upload failed",
      );
      if (!data?.id) {
        throw internalError("Soniox file upload returned no id");
      }
      return data.id;
    },

    async createTranscription({ fileId, language, terms }): Promise<string> {
      const body: SonioxCreateTranscriptionRequest = {
        file_id: fileId,
        model,
        enable_speaker_diarization: false,
      };
      if (language && language !== "auto") {
        body.language_hints = [language];
      }
      if (terms && terms.length > 0) {
        body.context = { terms };
      }

      const data = await requestJson<SonioxTranscription>(
        "/transcriptions",
        {
          method: "POST",
          headers: { ...authHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        "Soniox transcription create failed",
      );
      if (!data?.id) {
        throw internalError("Soniox transcription create returned no id");
      }
      return data.id;
    },

    async getTranscription(transcriptionId): Promise<SonioxTranscription> {
      return requestJson<SonioxTranscription>(
        `/transcriptions/${encodeURIComponent(transcriptionId)}`,
        { headers: authHeaders() },
        "Soniox transcription poll failed",
      );
    },

    async getTranscript(transcriptionId): Promise<SonioxTranscript> {
      const data = await requestJson<SonioxTranscript>(
        `/transcriptions/${encodeURIComponent(transcriptionId)}/transcript`,
        { headers: authHeaders() },
        "Soniox transcript fetch failed",
      );
      if (!Array.isArray(data?.tokens)) {
        throw internalError("Soniox transcript returned no tokens array");
      }
      return data;
    },

    async deleteResource(resource, id): Promise<void> {
      try {
        const res = await fetchFn(
          `${baseUrl}/${resource}/${encodeURIComponent(id)}`,
          { method: "DELETE", headers: authHeaders() },
        );
        if (!res.ok && res.status !== 404) {
          console.warn(
            `[soniox-proxy] cleanup: DELETE /${resource}/${id} returned ${res.status}`,
          );
        }
      } catch (err) {
        console.warn(`[soniox-proxy] cleanup: DELETE /${resource}/${id} threw`, err);
      }
    },
  };
}
