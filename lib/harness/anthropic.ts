import Anthropic from "@anthropic-ai/sdk";
import { getApiKey } from "@/lib/config";

let client: Anthropic | null = null;

/** Server-side Anthropic client. The key is read from the environment and never returned or logged. */
export function getAnthropic(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: getApiKey(), maxRetries: 2, timeout: 120_000 });
  return client;
}
