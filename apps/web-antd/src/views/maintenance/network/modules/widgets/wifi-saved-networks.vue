<script lang="ts" setup>
import type { SavedWifiConnection } from '@vben/types';

import { onMounted, ref } from 'vue';

import { useRequestHandler } from '@vben/hooks';
import { IconifyIcon } from '@vben/icons';
import { $t } from '@vben/locales';

import {
  Button,
  Collapse,
  Divider,
  List,
  message,
  Popconfirm,
  Tag,
} from 'ant-design-vue';

import { fetchSavedWifiConnections, forgetWifi } from '#/api/core';

import { securityShortLabel } from '../schemas';

defineProps<{
  isMobile: boolean;
}>();

const emit = defineEmits<{
  forgotten: [];
}>();

const { handleRequest } = useRequestHandler();

const savedConnections = ref<SavedWifiConnection[]>([]);
const loading = ref(false);
const forgetting = ref<string | null>(null);

async function loadSavedConnections() {
  loading.value = true;
  await handleRequest(
    () => fetchSavedWifiConnections(),
    (data) => {
      savedConnections.value = data;
    },
  );
  loading.value = false;
}

async function doForget(uuid: string) {
  forgetting.value = uuid;
  await handleRequest(
    () => forgetWifi(uuid),
    () => {
      message.success(
        $t('page.maintenance.network.wifiConfig.forgetSuccess'),
      );
      savedConnections.value = savedConnections.value.filter(
        (s) => s.uuid !== uuid,
      );
      emit('forgotten');
    },
  );
  forgetting.value = null;
}

function refresh() {
  loadSavedConnections();
}

defineExpose({ refresh });

onMounted(() => {
  loadSavedConnections();
});
</script>

<template>
  <template v-if="savedConnections.length > 0">
    <Divider orientation="left" class="!my-3 !text-xs">
      {{ $t('page.maintenance.network.wifiConfig.savedNetworksTitle') }}
    </Divider>

    <Collapse ghost class="saved-networks-collapse">
      <Collapse.Panel
        key="saved"
        :header="
          $t('page.maintenance.network.wifiConfig.savedNetworksCount', {
            count: savedConnections.length,
          })
        "
      >
        <List
          size="small"
          :data-source="savedConnections"
          :loading="loading"
        >
          <template #renderItem="{ item: saved }">
            <List.Item class="!px-3">
              <div class="flex w-full items-center gap-3">
                <IconifyIcon
                  icon="mdi:wifi"
                  :class="
                    saved.isActive ? 'text-green-500' : 'text-gray-400'
                  "
                  class="size-5 shrink-0"
                />

                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <span class="truncate text-sm font-medium">
                      {{ saved.ssid }}
                    </span>
                    <Tag
                      v-if="saved.isActive"
                      color="success"
                      size="small"
                      class="!m-0"
                    >
                      {{
                        $t(
                          'page.maintenance.network.wifiConfig.connected',
                        )
                      }}
                    </Tag>
                    <Tag
                      v-if="!saved.autoconnect"
                      size="small"
                      class="!m-0"
                    >
                      {{
                        $t(
                          'page.maintenance.network.wifiConfig.autoconnectOff',
                        )
                      }}
                    </Tag>
                  </div>
                  <div class="text-xs text-gray-400">
                    {{ securityShortLabel(saved.security) || 'Open' }}
                    <span class="mx-1">&middot;</span>
                    {{
                      saved.ipConfig.method === 'static'
                        ? 'Static IP'
                        : 'DHCP'
                    }}
                  </div>
                </div>

                <Popconfirm
                  :title="
                    $t(
                      'page.maintenance.network.wifiConfig.forgetConfirm',
                      { ssid: saved.ssid },
                    )
                  "
                  :ok-text="
                    $t('page.maintenance.network.confirmAction')
                  "
                  :cancel-text="
                    $t('page.maintenance.network.confirmCancel')
                  "
                  @confirm="doForget(saved.uuid)"
                >
                  <Button
                    size="small"
                    danger
                    :loading="forgetting === saved.uuid"
                  >
                    {{
                      $t('page.maintenance.network.wifiConfig.forget')
                    }}
                  </Button>
                </Popconfirm>
              </div>
            </List.Item>
          </template>
        </List>
      </Collapse.Panel>
    </Collapse>
  </template>
</template>
