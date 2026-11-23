import type { MmsAlternateAccess } from '#/api/core/capability';
import type { GooseSourceRequest } from '#/api/core/engineering';

import { $t } from '@vben/locales';

export type EngineeringDiagnostic =
  | string
  | { key: string; values?: Record<string, number | string> };

/** Keep the key for a local validation error until rendering. */
export class EngineeringValidationError extends Error {
  constructor(readonly key: string) {
    super(key);
  }
}

export function engineeringFailure(
  cause: unknown,
  fallbackKey: string,
): EngineeringDiagnostic {
  if (cause instanceof EngineeringValidationError) return { key: cause.key };
  return describeFailure(cause, '') || { key: fallbackKey };
}

export function renderEngineeringDiagnostic(
  diagnostic: EngineeringDiagnostic,
): string {
  return typeof diagnostic === 'string'
    ? diagnostic
    : $t(diagnostic.key, diagnostic.values ?? {});
}

/** A pinned original cannot cross source roles or acquire a service binding by inference. */
export function validNamespaceBasis(
  basis: Pick<GooseSourceRequest['namespaces'], 'data' | 'services'>,
  sources: readonly (string | undefined)[],
): boolean {
  const validDigest = (value: string) => /^[a-f\d]{64}$/.test(value);
  const { data, services } = basis;
  if (data.length + services.length * 2 > 64) return false;
  const dataSet = new Set(data);
  if (
    dataSet.size !== data.length ||
    data.some((digest) => !validDigest(digest) || sources.includes(digest))
  )
    return false;
  const serviceSet = new Set<string>();
  const applicabilitySet = new Set<string>();
  for (const binding of services) {
    if (
      !validDigest(binding.service) ||
      !validDigest(binding.applicability) ||
      !dataSet.has(binding.data) ||
      binding.service === binding.applicability ||
      dataSet.has(binding.service) ||
      dataSet.has(binding.applicability) ||
      sources.includes(binding.service) ||
      sources.includes(binding.applicability) ||
      serviceSet.has(binding.service) ||
      applicabilitySet.has(binding.service) ||
      serviceSet.has(binding.applicability) ||
      binding.primitives.length > 2 ||
      new Set(binding.primitives).size !== binding.primitives.length ||
      binding.primitives.some(
        (value) => value !== 'octet6' && value !== 'octet16',
      )
    )
      return false;
    serviceSet.add(binding.service);
    applicabilitySet.add(binding.applicability);
  }
  return true;
}

export function describeAccess(access: MmsAlternateAccess | null): string {
  if (!access) return '';
  const entries = access.entries.map((entry) => {
    let selected: string;
    switch (entry.selection.kind) {
      case 'allElements': {
        selected = '[*]';
        break;
      }
      case 'component': {
        selected = `$${entry.selection.name}`;
        break;
      }
      case 'index': {
        selected = `(${entry.selection.index})`;
        break;
      }
      case 'indexRange': {
        selected = `[${entry.selection.low_index}, count=${entry.selection.count}]`;
        break;
      }
    }
    const nested = `${selected}${describeAccess(entry.nested)}`;
    return entry.component_name === null
      ? nested
      : `${entry.component_name}=${nested}`;
  });
  return entries.length === 1 && access.entries[0]?.component_name === null
    ? (entries[0] ?? '')
    : `{${entries.join(', ')}}`;
}

function diagnosticMessage(value: unknown): string | undefined {
  if (
    value !== null &&
    typeof value === 'object' &&
    'message' in value &&
    typeof value.message === 'string' &&
    value.message.trim()
  )
    return value.message;
  return undefined;
}

/** The request adapter preserves the server body inside the original rejection. */
export function describeFailure(cause: unknown, fallback: string): string {
  if (cause !== null && typeof cause === 'object' && 'response' in cause) {
    const response = cause.response;
    if (
      response !== null &&
      typeof response === 'object' &&
      'data' in response
    ) {
      const diagnostic = diagnosticMessage(response.data);
      if (diagnostic) return diagnostic;
    }
  }
  return diagnosticMessage(cause) ?? fallback;
}
