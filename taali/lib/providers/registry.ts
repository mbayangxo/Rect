import type { DistributionProvider } from "@/lib/providers/types";
import { demoProvider } from "@/lib/providers/demo";
import { appleDirectProvider } from "@/lib/providers/direct/apple-direct";
import { spotifyDirectProvider } from "@/lib/providers/direct/spotify-direct";
import { labelGridProvider } from "@/lib/providers/partner/labelgrid";

const providers: DistributionProvider[] = [
  demoProvider,
  labelGridProvider,
  appleDirectProvider,
  spotifyDirectProvider,
];

const providerMap = new Map(providers.map((provider) => [provider.id, provider]));

export function getProvider(id: string): DistributionProvider | null {
  return providerMap.get(id) ?? null;
}

export function listProviders(): DistributionProvider[] {
  return [...providers];
}

export function listConfiguredProviders(): DistributionProvider[] {
  return providers.filter((provider) => provider.configured);
}
