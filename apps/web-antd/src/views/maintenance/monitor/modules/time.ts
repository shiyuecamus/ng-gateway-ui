import type { MonitorRow } from '@vben/types';

import { $t } from '@vben/locales';
import { formatDateTime } from '@vben/utils';

/** Missing time remains missing; dayjs(undefined) would otherwise manufacture the current time. */
export function sampleTimeText(time: null | string | undefined): string {
  return time ? formatDateTime(time) : '—';
}

/** Display the source clock or its explicit absence; never substitute reception time. */
export function sourceTimeText(row: MonitorRow): string {
  return row.sourceTime
    ? sampleTimeText(row.sourceTime)
    : $t(
        `page.monitor.realtime.sourceTimeStatus.${row.sourceTimeStatus ?? 'notObserved'}`,
      );
}
