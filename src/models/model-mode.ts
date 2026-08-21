export function shouldUseLocalFakeModels(environment: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return environment.NODE_ENV === "development" && !environment.OPENAI_API_KEY;
}
