export class PixelBisectError extends Error {
  constructor(message: string, public readonly exitCode = 2, options?: ErrorOptions) {
    super(message, options);
    this.name = 'PixelBisectError';
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
