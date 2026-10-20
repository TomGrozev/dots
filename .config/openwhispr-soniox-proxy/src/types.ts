export type SonioxToken = {
  text?: string;
  speaker?: number;
  language?: string;
  translation_status?: string;
  type?: string;
};

export type SonioxTranscript = {
  tokens: SonioxToken[];
};

export type SonioxFile = {
  id: string;
  [key: string]: unknown;
};

export type SonioxTranscription = {
  id: string;
  status: "pending" | "processing" | "completed" | "error";
  error_message?: string;
  [key: string]: unknown;
};

export type SonioxCreateTranscriptionRequest = {
  file_id: string;
  model: string;
  enable_speaker_diarization?: boolean;
  language_hints?: string[];
  context?: {
    terms?: string[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
};
