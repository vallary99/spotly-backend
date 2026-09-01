export function getEnvFile(
  nodeEnv: string | undefined = process.env.NODE_ENV,
): string {
  switch (nodeEnv) {
    case 'local':
      return '.env.local';
    // 'production' is canonical — it is Node's own convention, and what
    // express and friends check to enable production behaviour. 'prod' is
    // kept as an alias so an environment that already sets it keeps
    // resolving to the same file rather than silently falling to '.env'.
    case 'production':
    case 'prod':
      return '.env.prod';
    default:
      return '.env';
  }
}
