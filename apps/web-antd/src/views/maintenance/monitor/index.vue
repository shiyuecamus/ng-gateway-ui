<script lang="ts" setup>
import type { ChannelInfo, DeviceInfo } from '@vben/types';

import type { MonitorDeviceSnapshot, MonitorRow } from './modules/types';

import type { VxeGridListeners, VxeGridProps } from '#/adapter/vxe-table';

import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue';

import { Page } from '@vben/common-ui';
import { useRequestHandler } from '@vben/hooks';
import { $t } from '@vben/locales';

import { Input, Select, Tag } from 'ant-design-vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { fetchChannelList, getSubDevicesById } from '#/api';
import { useMonitorWs } from '#/shared/composables/use-monitor-ws';

import { useMonitorColumns } from './modules/schemas';

const channelOptions = ref<ChannelInfo[]>([]);
const deviceOptions = ref<DeviceInfo[]>([]);
const selectedChannelId = ref<number | undefined>();
const selectedDeviceId = ref<number | undefined>();
const keyword = ref('');

const pager = ref({
  currentPage: 1,
  pageSize: 20,
  total: 0,
});

const {
  status: connectionStatus,
  snapshots,
  updateHints,
  subscribe,
  unsubscribe,
  connect,
  disconnect,
} = useMonitorWs();

const { handleRequest } = useRequestHandler();

type MonitorRowMeta = Omit<MonitorRow, 'lastUpdate' | 'value'>;
const rowMetas = ref<MonitorRowMeta[]>([]);
const rowMetaIdSet = new Set<string>();

const gridOptions: VxeGridProps<MonitorRow> = {
  height: 'auto', // 如果设置为 auto，则必须确保存在父节点且不允许存在相邻元素，否则会出现高度闪动问题
  keepSource: true,
  pagerConfig: {},
  toolbarConfig: {
    custom: true,
    refresh: false,
    zoom: true,
  },
  columns: useMonitorColumns(),
};

const gridEvents: VxeGridListeners<MonitorRow> = {
  pageChange({ currentPage, pageSize }) {
    pager.value.currentPage = currentPage;
    pager.value.pageSize = pageSize;
    updateGridData();
  },
};

const [Grid, gridApi] = useVbenVxeGrid<MonitorRow>({
  gridOptions,
  gridEvents,
});

const statusText = computed(() => {
  switch (connectionStatus.value) {
    case 'connected': {
      return $t('page.monitor.realtime.status.connected');
    }
    case 'connecting': {
      return $t('page.monitor.realtime.status.connecting');
    }
    case 'reconnecting': {
      return $t('page.monitor.realtime.status.reconnecting');
    }
    default: {
      return $t('page.monitor.realtime.status.disconnected');
    }
  }
});

const statusColor = computed(() => {
  switch (connectionStatus.value) {
    case 'connected': {
      return 'success';
    }
    case 'connecting': {
      return 'processing';
    }
    case 'reconnecting': {
      return 'warning';
    }
    default: {
      return 'default';
    }
  }
});

function buildRowMetasFromSnapshots(): MonitorRowMeta[] {
  const metas: MonitorRowMeta[] = [];

  const pushMeta = (
    snap: MonitorDeviceSnapshot,
    key: string,
    sourceType: MonitorRow['sourceType'],
    scope?: MonitorRow['scope'],
  ) => {
    // Include scope in id so attributes with same key in different scopes won't collide.
    const scopePart = scope ? `-${scope}` : '';
    metas.push({
      id: `${snap.deviceId}-${sourceType}${scopePart}-${key}`,
      deviceId: snap.deviceId,
      deviceName: snap.deviceName,
      key,
      sourceType,
      scope,
    });
  };

  for (const snap of snapshots.value.values()) {
    for (const k in snap.telemetry) pushMeta(snap, k, 'telemetry');
    for (const k in snap.clientAttributes)
      pushMeta(snap, k, 'attributes', 'client');
    for (const k in snap.sharedAttributes)
      pushMeta(snap, k, 'attributes', 'shared');
    for (const k in snap.serverAttributes)
      pushMeta(snap, k, 'attributes', 'server');
  }

  return metas;
}

const filteredMetas = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  if (!kw) return rowMetas.value;
  return rowMetas.value.filter((m) => m.key.toLowerCase().includes(kw));
});

function rebuildRowMetaIdSet() {
  rowMetaIdSet.clear();
  for (const m of rowMetas.value) rowMetaIdSet.add(m.id);
}

function hydrateRow(meta: MonitorRowMeta): MonitorRow {
  const snap = snapshots.value.get(meta.deviceId);
  if (!snap) {
    return {
      ...meta,
      value: undefined,
      lastUpdate: '',
    };
  }

  let value: unknown;
  if (meta.sourceType === 'telemetry') {
    value = snap.telemetry?.[meta.key];
  } else {
    switch (meta.scope) {
      case 'client': {
        value = snap.clientAttributes?.[meta.key];
        break;
      }
      case 'server': {
        value = snap.serverAttributes?.[meta.key];
        break;
      }
      case 'shared': {
        value = snap.sharedAttributes?.[meta.key];
        break;
      }
      default: {
        value =
          snap.clientAttributes?.[meta.key] ??
          snap.sharedAttributes?.[meta.key] ??
          snap.serverAttributes?.[meta.key];
      }
    }
  }

  return {
    ...meta,
    value,
    lastUpdate: snap.lastUpdate,
  };
}

function updateGridData() {
  const allRows = filteredMetas.value;
  pager.value.total = allRows.length;
  let { currentPage, pageSize } = pager.value;

  const maxPage =
    allRows.length === 0
      ? 1
      : Math.max(1, Math.ceil(allRows.length / pageSize));
  if (currentPage > maxPage) {
    currentPage = maxPage;
    pager.value.currentPage = maxPage;
  }

  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;

  // Only hydrate current page values to keep refresh cost O(pageSize).
  const pageRows = allRows
    .slice(startIndex, endIndex)
    .map((row) => hydrateRow(row));

  gridApi.setGridOptions({
    data: pageRows,
    pagerConfig: {
      ...gridOptions.pagerConfig,
      currentPage,
      pageSize,
      total: pager.value.total,
    },
  });
}

watch(
  keyword,
  (newKeyword, oldKeyword) => {
    // 搜索关键字变化时重置到第一页
    if (newKeyword !== oldKeyword) pager.value.currentPage = 1;
    updateGridData();
  },
  { flush: 'post' },
);

watch(
  snapshots,
  () => {
    // Build metas on first snapshot after subscribe (or after device switch).
    if (rowMetas.value.length === 0 && snapshots.value.size > 0) {
      rowMetas.value = buildRowMetasFromSnapshots();
      rebuildRowMetaIdSet();
    }
    updateGridData();
  },
  {
    // 在本次 DOM 更新之后再刷新表格，避免和 VXE 内部初始化时序竞争
    flush: 'post',
  },
);

watch(
  updateHints,
  (hints) => {
    if (!hints || hints.length === 0) return;

    let added = 0;
    for (const hint of hints) {
      const snap = snapshots.value.get(hint.deviceId);
      if (!snap) continue;

      const sourceType: MonitorRow['sourceType'] =
        hint.dataType === 'telemetry' ? 'telemetry' : 'attributes';
      const scopePart = hint.scope ? `-${hint.scope}` : '';

      for (const key of hint.keys) {
        const id = `${hint.deviceId}-${sourceType}${scopePart}-${key}`;
        if (rowMetaIdSet.has(id)) continue;

        rowMetaIdSet.add(id);
        rowMetas.value.push({
          id,
          deviceId: hint.deviceId,
          deviceName: snap.deviceName,
          key,
          sourceType,
          scope: hint.scope,
        });
        added++;
      }
    }

    if (added > 0) updateGridData();
  },
  { flush: 'post' },
);

async function loadChannels() {
  await handleRequest(
    () => fetchChannelList(),
    (resp) => {
      channelOptions.value = resp ?? [];
    },
  );
}

async function loadDevices() {
  if (!selectedChannelId.value) {
    deviceOptions.value = [];
    return;
  }
  await handleRequest(
    () => getSubDevicesById(selectedChannelId.value!),
    (resp) => {
      deviceOptions.value = resp ?? [];
    },
  );
}

watch(selectedChannelId, async () => {
  selectedDeviceId.value = undefined;
  unsubscribe();
  rowMetas.value = [];
  rowMetaIdSet.clear();
  await loadDevices();
});

watch(
  selectedDeviceId,
  (id) => {
    if (!id) {
      unsubscribe();
      rowMetas.value = [];
      rowMetaIdSet.clear();
      return;
    }
    connect();
    rowMetas.value = [];
    rowMetaIdSet.clear();
    pager.value.currentPage = 1;
    subscribe([id], selectedChannelId.value);
  },
  { deep: true },
);

onBeforeUnmount(() => {
  unsubscribe();
  disconnect();
});

onMounted(async () => {
  await nextTick();
  await loadChannels();
});
</script>

<template>
  <Page auto-content-height>
    <Grid>
      <template #toolbar-actions>
        <Tag :color="statusColor" class="text-[13px]">
          {{ statusText }}
        </Tag>
      </template>
      <template #toolbar-tools>
        <div class="flex items-center gap-3">
          <Select
            v-model:value="selectedChannelId"
            :allow-clear="true"
            :options="
              channelOptions.map((c) => ({
                label: c.name,
                value: c.id,
              }))
            "
            class="w-52"
            :placeholder="$t('page.monitor.realtime.channel')"
          />
          <Select
            v-model:value="selectedDeviceId"
            :allow-clear="true"
            :disabled="!selectedChannelId"
            :options="
              deviceOptions.map((d) => ({
                label: d.deviceName,
                value: d.id,
              }))
            "
            class="w-72"
            :placeholder="$t('page.monitor.realtime.device')"
          />
          <Input
            v-model:value="keyword"
            :placeholder="$t('page.monitor.realtime.searchPlaceholder')"
            class="w-64"
            allow-clear
          />
        </div>
      </template>
    </Grid>
  </Page>
</template>
