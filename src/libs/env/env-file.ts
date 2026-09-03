export function getEnvFile(
  nodeEnv: string | undefined = process.env.NODE_ENV,
): string {
  switch (nodeEnv) {
    case 'local':
      return '.env.local';
    case 'prod':
    case 'production':
      return '.env.prod';
    default:
      return '.env';
  }
}
