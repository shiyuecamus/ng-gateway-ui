import type { IdType } from '@vben/types';

import { requestClient } from '#/api/request';

export interface CapabilityDefinition {
  id: string;
  permissionScope: string;
  resourcePermission: null | { operation: string; resource: string };
  platforms: number[];
  requestSchema: Record<string, unknown>;
  responseSchema: Record<string, unknown>;
  maxRequestBytes: number;
  maxResponseBytes: number;
  timeoutMs: number;
  requiresReady: boolean;
}
export interface CapabilityInventory {
  configurationRevision: string;
  definitions: CapabilityDefinition[];
}
export type MmsType =
  | {
      components: { name: null | string; specification: MmsType }[];
      kind: 'structure';
      packed: boolean;
    }
  | { date: boolean; kind: 'binaryTime' }
  | { element: MmsType; elements: number; kind: 'array'; packed: boolean }
  | { exponent_width: number; format_width: number; kind: 'floatingPoint' }
  | { kind: 'bcd' | 'integer' | 'unsigned'; width: number }
  | {
      kind: 'bitString' | 'mmsString' | 'octetString' | 'visibleString';
      length: number;
    }
  | { kind: 'boolean' | 'generalizedTime' | 'objectIdentifier' | 'utcTime' }
  | { kind: 'named'; name: MmsName };
export type MmsName =
  | { domain: string; item: string; kind: 'domain' }
  | { item: string; kind: 'association' | 'vmd' };
export interface MmsAlternateAccess {
  entries: {
    component_name: null | string;
    nested: MmsAlternateAccess | null;
    selection:
      | { count: number; kind: 'indexRange'; low_index: number }
      | { index: number; kind: 'index' }
      | { kind: 'allElements' }
      | { kind: 'component'; name: string };
  }[];
}
export type MmsData =
  | { hex: string; kind: 'bitString' | 'booleanArray'; unused_bits: number }
  | {
      hex: string;
      kind:
        | 'binary32'
        | 'binary64'
        | 'binaryTime'
        | 'objectIdentifier'
        | 'octetString'
        | 'utcTime';
    }
  | { kind: 'array' | 'structure'; values: MmsData[] }
  | { kind: 'boolean'; value: boolean }
  | {
      kind: 'integer' | 'mmsString' | 'unsigned' | 'visibleString';
      value: string;
    };
export interface MmsObservation {
  config_epoch: string;
  session_epoch: string;
  result:
    | {
        additional_code: null | string;
        class: number;
        code: string;
        description: null | string;
        kind: 'serviceError';
      }
    | {
        continue_after: null | string;
        kind: 'directory';
        more_follows: boolean;
        names: string[];
      }
    | {
        deletable: boolean;
        kind: 'dataSetMembers';
        members: {
          alternate_access: MmsAlternateAccess | null;
          name: MmsName;
        }[];
      }
    | {
        deletable: boolean;
        kind: 'namedType' | 'variableType';
        specification: MmsType;
      }
    | {
        kind: 'read';
        results: (
          | { code: string; kind: 'failure' }
          | { kind: 'success'; value: MmsData }
        )[];
      }
    | { kind: 'reject'; reason: string; reason_class: number };
}
export type MmsOperation =
  | 'data-set-members'
  | 'directory'
  | 'named-type'
  | 'passive-read'
  | 'report-control-read'
  | 'variable-type';
export function mmsCapabilityId(operation: MmsOperation) {
  return `ng:southward:iec61850:mms:${operation}`;
}
export function getChannelCapabilities(channelId: IdType, signal: AbortSignal) {
  return requestClient.get<CapabilityInventory>(
    `/channel/${channelId}/capabilities`,
    { signal, responseReturn: 'body' },
  );
}
export function observeMms(
  channelId: IdType,
  revision: string,
  operation: MmsOperation,
  request: Record<string, unknown>,
  signal: AbortSignal,
) {
  return requestClient.post<MmsObservation>(
    `/channel/${channelId}/capabilities/${encodeURIComponent(mmsCapabilityId(operation))}`,
    request,
    {
      signal,
      responseReturn: 'body',
      timeout: 20_000,
      headers: { 'X-Gateway-Configuration-Revision': revision },
    },
  );
}
