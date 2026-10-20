import { config } from "./config.ts";
import { timeoutError, transcriptionFailedError } from "./errors.ts";
import type { SonioxApi } from "./soniox-api.ts";
import { renderTranscript } from "./token-renderer.ts";

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export type PollOptions = {
  intervalMs: number;
  timeoutMs: number;
};

export type TranscribeInput = {
  api: SonioxApi;
  audioBlob: Blob;
  language?: string;
  terms?: string[];
  poll?: PollOptions;
};

export type TranscribeResult = {
  text: string;
  processingMs: number;
};

/**
 * Run a full Soniox async transcription: upload → create → poll → fetch →
 * render. Always deletes the file and transcription in `finally`.
 */
export async function transcribe(input: TranscribeInput): Promise<TranscribeResult> {
  const { api, audioBlob, language, terms } = input;
  const poll: PollOptions = input.poll ?? {
    intervalMs: config.POLL_INTERVAL_MS,
    timeoutMs: config.POLL_TIMEOUT_MS,
  };

  let fileId: string | null = null;
  let transcriptionId: string | null = null;

  const startedAt = Date.now();
  try {
    fileId = await api.uploadFile(audioBlob);
    transcriptionId = await api.createTranscription({ fileId, language, terms });
    await pollUntilComplete(api, transcriptionId, poll);
    const transcript = await api.getTranscript(transcriptionId);
    return {
      text: renderTranscript(transcript.tokens),
      processingMs: Date.now() - startedAt,
    };
  } finally {
    const tasks: Promise<void>[] = [];
    if (transcriptionId) {
      tasks.push(api.deleteResource("transcriptions", transcriptionId));
    }
    if (fileId) {
      tasks.push(api.deleteResource("files", fileId));
    }
    await Promise.allSettled(tasks);
  }
}

async function pollUntilComplete(
  api: SonioxApi,
  transcriptionId: string,
  poll: PollOptions,
): Promise<void> {
  const deadline = Date.now() + poll.timeoutMs;

  while (Date.now() < deadline) {
    const data = await api.getTranscription(transcriptionId);

    if (data.status === "completed") return;
    if (data.status === "error") {
      throw transcriptionFailedError(
        `Soniox transcription failed${data.error_message ? `: ${data.error_message}` : ""}`,
      );
    }

    await sleep(poll.intervalMs);
  }

  throw timeoutError();
}
