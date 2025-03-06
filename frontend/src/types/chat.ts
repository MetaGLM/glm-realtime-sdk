export type AudioSynthesisResp = {
  audio: string;
  input_tokens: string;
  completion_tokens: string;
};

export abstract class Player {
  abstract playing: boolean;

  abstract init(): Promise<void>;

  abstract append(audioParts: unknown): void;

  abstract reset(): void;

  abstract destroy(): void;

  abstract pause(): void;
}
