import { Logger } from '@nestjs/common';

export function runInBackground(
  logger: Logger,
  label: string,
  task: () => Promise<unknown>,
): void {
  void task().catch((err) => {
    logger.error(
      `Background task "${label}" failed: ${(err as Error).message}`,
    );
  });
}
