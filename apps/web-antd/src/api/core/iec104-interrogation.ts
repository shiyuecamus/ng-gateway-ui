import type { DeviceInfo, IdType } from '@vben/types';

import { requestClient } from '#/api/request';

import { getChannelCapabilities } from './capability';
import { ChannelApi } from './channel';

export const interrogationCapability = 'ng:southward:iec104:interrogation:boot';

export interface InterrogationRequest {
  kind: 'counter' | 'general';
  ca: number;
  qualifier: number;
}

export interface InterrogationObservation {
  config_epoch: string;
  session_epoch: string;
  request: InterrogationRequest;
  result: 'completed' | 'rejected';
  local_write: {
    send_sequence: number;
    transmission_ordinal: string;
    wire_bytes: number;
  };
  acceptance: [number, number, number] | null;
  termination: [number, number, number];
  association_dropped_asdus: string;
}

/** Bind source choices and observational authority to one configuration revision. */
export async function getInterrogationSources(id: IdType, signal: AbortSignal) {
  const [inventory, devices] = await Promise.all([
    getChannelCapabilities(id, signal),
    requestClient.get<DeviceInfo[]>(ChannelApi.subDevices(id), { signal }),
  ]);
  const sources = new Map<number, string[]>();
  for (const device of devices) {
    const ca = device.driverConfig?.ca;
    if (
      typeof ca !== 'number' ||
      !Number.isInteger(ca) ||
      ca < 1 ||
      ca > 65_534
    )
      continue;
    const names = sources.get(ca) ?? [];
    names.push(device.deviceName);
    sources.set(ca, names);
  }
  return {
    revision: inventory.configurationRevision,
    available: inventory.definitions.some(
      (definition) => definition.id === interrogationCapability,
    ),
    sources: [...sources.entries()]
      .toSorted(([left], [right]) => left - right)
      .map(([ca, names]) => ({ ca, names })),
  };
}

/** Remote termination and independent point observation remain separate facts. */
export function interrogate(
  id: IdType,
  revision: string,
  request: InterrogationRequest,
  signal: AbortSignal,
) {
  return requestClient.post<InterrogationObservation>(
    `/channel/${id}/capabilities/${encodeURIComponent(interrogationCapability)}`,
    request,
    {
      headers: { 'X-Gateway-Configuration-Revision': revision },
      responseReturn: 'body',
      signal,
      timeout: 20_000,
    },
  );
}
