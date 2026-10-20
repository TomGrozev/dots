import { badRequestError } from "./errors.ts";

export type TranscriptionForm = {
  audioBlob: Blob;
  language?: string;
  terms?: string[];
};

export function extractApiKey(req: Request): string | null {
  const header = req.headers.get("Authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  const token = match?.[1]?.trim();
  return token ? token : null;
}

export function parseTranscriptionForm(
  formData: FormData,
  maxFileSizeBytes: number,
): TranscriptionForm {
  const file = formData.get("file");
  if (!(file instanceof Blob)) {
    throw badRequestError("Missing 'file' field in form data");
  }
  if (file.size === 0) {
    throw badRequestError("Audio file is empty");
  }
  if (file.size > maxFileSizeBytes) {
    throw badRequestError(
      `Audio file too large (${file.size} bytes; max ${maxFileSizeBytes})`,
    );
  }

  return {
    audioBlob: file,
    language: readStringField(formData, "language"),
    terms: parseTerms(readStringField(formData, "prompt")),
  };
}

function readStringField(formData: FormData, field: string): string | undefined {
  const value = formData.get(field);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

export function parseTerms(prompt: string | undefined): string[] | undefined {
  if (!prompt) return undefined;
  const terms = prompt
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  return terms.length > 0 ? terms : undefined;
}
