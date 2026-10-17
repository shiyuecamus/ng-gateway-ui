<script lang="ts" setup>
import type { VbenFormProps } from '@vben/common-ui';
import type { ChannelInfo, IdType, Recordable } from '@vben/types';

import type { OnActionClickParams, VxeGridProps } from '#/adapter/vxe-table';

import { ref } from 'vue';
import { useRouter } from 'vue-router';

import { confirm, Page, useVbenDrawer, useVbenModal } from '@vben/common-ui';
import { FormOpenType } from '@vben/constants';
import { useRequestHandler } from '@vben/hooks';
import { $t } from '@vben/locales';
import { CommonStatus, EntityType } from '@vben/types';

import { useIntervalFn } from '@vueuse/core';
import { Button, message, Switch } from 'ant-design-vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  changeChannelStatus,
  createChannel,
  deleteChannel,
  fetchChannelPage,
  updateChannel,
} from '#/api';
import { activateChannel } from '#/api/core/channel';

import { searchFormSchema, useColumns } from './modules/schemas';
import OpcuaClientCertificateModal from './modules/widgets/certificate.vue';
import ConfigViewer from './modules/widgets/config-viewer.vue';
import EngineeringModal from './modules/widgets/engineering.vue';
import ChannelForm from './modules/widgets/form.vue';
import Iec104InterrogationModal from './modules/widgets/iec104-interrogation.vue';
import LogLevelModal from './modules/widgets/log-level-modal.vue';
import MmsTlsModal from './modules/widgets/mms-tls.vue';
import OnlineEngineeringModal from './modules/widgets/online-engineering.vue';
import SubDeviceModal from './modules/widgets/sub-device-manager.vue';

const { handleRequest } = useRequestHandler();
const router = useRouter();
const pendingConfigurations = ref(false);
const activating = ref(new Set<IdType>());
let refreshingConfigurations = false;

const formOptions: VbenFormProps = {
  // 默认展开
  collapsed: true,
  schema: searchFormSchema,
  // 控制表单是否显示折叠按钮
  showCollapseButton: true,
  // 按下回车时是否提交表单
  submitOnEnter: false,
};

const gridOptions: VxeGridProps<ChannelInfo> = {
  checkboxConfig: {
    highlight: true,
    labelField: 'name',
  },
  columns: useColumns(onActionClick),
  exportConfig: {},
  height: 'auto', // 如果设置为 auto，则必须确保存在父节点且不允许存在相邻元素，否则会出现高度闪动问题
  keepSource: true,
  proxyConfig: {
    autoLoad: true,
    response: {
      result: 'records',
      total: 'total',
      list: 'records',
    },
    ajax: {
      query: async ({ page, sort }, formValues) => {
        const result = await fetchChannelPage({
          page: page.currentPage,
          pageSize: page.pageSize,
          sortBy: sort.field || undefined,
          sortOrder: sort.order || undefined,
          ...formValues,
        });
        pendingConfigurations.value = result.records.some((channel) =>
          ['activating', 'pending'].includes(
            channel.configuration?.state ?? '',
          ),
        );
        return result;
      },
    },
    sort: true,
  },
  sortConfig: {
    remote: true,
  },
  toolbarConfig: {
    custom: true,
    export: false,
    import: false,
    refresh: true,
    zoom: true,
  },
};

type ChannelGridApi = {
  query: () => Promise<unknown>;
};

// Note: vxe-table's `DeepPartial<...>` generics can cause TS(2589) (excessively deep instantiation).
// Keep safety via the explicitly-typed `gridOptions` above, and avoid forcing TS to fully expand
// vxe-table's complex conditional types at this call boundary.
const [Grid, gridApi] = (
  useVbenVxeGrid as unknown as (options: any) => readonly [any, ChannelGridApi]
)({
  formOptions,
  gridOptions,
});

const [FormDrawer, formDrawerApi] = useVbenDrawer({
  connectedComponent: ChannelForm,
});

const [ConfigViewerModal, configViewerModalApi] = useVbenModal({
  connectedComponent: ConfigViewer,
});

const [SubDeviceModalRef, deviceModalApi] = useVbenModal({
  connectedComponent: SubDeviceModal,
});

const [ChannelLogLevelModalRef, channelLogLevelModalApi] = useVbenModal({
  connectedComponent: LogLevelModal,
});

const [CertificateModal, certificateModalApi] = useVbenModal({
  connectedComponent: OpcuaClientCertificateModal,
});

const [EngineeringModalRef, engineeringModalApi] = useVbenModal({
  connectedComponent: EngineeringModal,
});
const [OnlineEngineeringModalRef, onlineEngineeringModalApi] = useVbenModal({
  connectedComponent: OnlineEngineeringModal,
});
const [MmsTlsModalRef, mmsTlsModalApi] = useVbenModal({
  connectedComponent: MmsTlsModal,
});
const [Iec104InterrogationModalRef, iec104InterrogationModalApi] = useVbenModal(
  {
    connectedComponent: Iec104InterrogationModal,
  },
);
function openCapturedEngineering(digest: string) {
  engineeringModalApi.setData({ digest }).open();
}

useIntervalFn(async () => {
  if (!pendingConfigurations.value || refreshingConfigurations) return;
  refreshingConfigurations = true;
  try {
    await gridApi.query();
  } finally {
    refreshingConfigurations = false;
  }
}, 2000);

async function handleActivate(row: ChannelInfo) {
  if (!row.canActivate || !row.configuration || activating.value.has(row.id))
    return;
  activating.value.add(row.id);
  try {
    const result = await handleRequest(() =>
      activateChannel(row.id, row.configuration!.desiredRevision),
    );
    if (result?.state === 'failed') {
      message.warning(
        result.lastError ?? $t('page.southward.channel.activation.failed'),
      );
    } else if (result) {
      message.success($t(`page.southward.channel.activation.${result.state}`));
    }
    await gridApi.query();
  } finally {
    activating.value.delete(row.id);
  }
}

function onActionClick({ code, row }: OnActionClickParams<ChannelInfo>) {
  switch (code) {
    case 'certificate': {
      certificateModalApi
        .setData({
          channelId: row.id,
          channelName: row.name,
        })
        .setState({
          title: $t('page.southward.channel.certificate.titleWithName', {
            name: row.name,
          }),
        })
        .open();
      break;
    }
    case 'configView': {
      handleConfigView(row);
      break;
    }
    case 'delete': {
      handleDelete(row);
      break;
    }
    case 'edit': {
      handleEdit(row);
      break;
    }
    case 'iec104Interrogation': {
      iec104InterrogationModalApi.setData({ channelId: row.id }).open();
      break;
    }
    case 'logLevel': {
      channelLogLevelModalApi
        .setData({ channelId: row.id, channelName: row.name })
        .setState({
          title: $t('page.southward.channel.logLevelModal.titleWithName', {
            name: row.name,
          }),
        })
        .open();
      break;
    }
    case 'mmsTls': {
      mmsTlsModalApi.setData({ channelId: row.id }).open();
      break;
    }
    case 'observability': {
      router.push(`/southward/channel/${row.id}/observability`);
      break;
    }
    case 'onlineEngineering': {
      onlineEngineeringModalApi.setData({ channelId: row.id }).open();
      break;
    }
    case 'subDevice': {
      handleSubDevice(row);
      break;
    }
    default: {
      break;
    }
  }
}

const handleCreate = () => {
  formDrawerApi
    .setData({
      type: FormOpenType.CREATE,
    })
    .setState({
      title: $t('common.createWithName', {
        name: $t('page.southward.title'),
      }),
    })
    .open();
};

const handleConfigView = (row: ChannelInfo) => {
  configViewerModalApi.setData(row.driverConfig).open();
};

const handleEdit = (row: ChannelInfo) => {
  formDrawerApi
    .setData({
      type: FormOpenType.EDIT,
      id: row.id,
    })
    .setState({
      title: $t('common.editWithName', {
        name: row.name,
      }),
    })
    .open();
};

const handleDelete = async (row: ChannelInfo) => {
  confirm({
    content: $t('common.action.deleteConfirm', {
      entityType: $t(`entity.${EntityType.CHANNEL.toLowerCase()}`),
      name: row.name,
    }),
    icon: 'warning',
    title: $t('common.tips'),
  })
    .then(async () => {
      await handleRequest(
        () => deleteChannel(row.id),
        (_) => {
          message.success(
            $t('common.action.deleteSuccessWithName', { name: row.name }),
          );
        },
      );
      await gridApi.query();
    })
    .catch(() => {});
};

const toggleStatus = async (row: ChannelInfo) => {
  const status =
    row.status === CommonStatus.ENABLED
      ? CommonStatus.DISABLED
      : CommonStatus.ENABLED;
  await handleRequest(
    () => changeChannelStatus(row.id, status),
    async (_) => {
      message.success($t('common.action.changeStatusSuccess'));
      await gridApi.query();
    },
  );
};

const handleSubDevice = async (row: ChannelInfo) => {
  deviceModalApi
    .setData({
      channelId: row.id,
      driverId: row.driverId,
      channelName: row.name,
    })
    .setState({
      title: `${row.name} - ${$t('page.southward.channel.subDevice')}`,
    })
    .open();
};

const handleFormSubmit = async (
  type: FormOpenType,
  id: IdType,
  values: Recordable<any>,
) => {
  await (type === FormOpenType.CREATE
    ? handleRequest(
        () => createChannel(values as ChannelInfo),
        async (_) => {
          formDrawerApi.close();
          message.success($t('common.action.createSuccess'));
          await gridApi.query();
        },
      )
    : handleRequest(
        () =>
          updateChannel({
            id,
            ...values,
          } as ChannelInfo),
        async (_) => {
          formDrawerApi.close();
          message.success($t('common.action.updateSuccess'));
          await gridApi.query();
        },
      ));
};
</script>

<template>
  <Page auto-content-height>
    <Grid>
      <template #configuration="{ row }">
        <div v-if="row.configuration" class="flex flex-col gap-1 py-1">
          <Tag
            :color="
              row.configuration.state === 'active'
                ? 'green'
                : row.configuration.state === 'failed'
                  ? 'red'
                  : 'orange'
            "
            class="w-fit"
          >
            {{
              $t(`page.southward.channel.activation.${row.configuration.state}`)
            }}
          </Tag>
          <span class="text-xs text-muted-foreground">
            {{
              $t('page.southward.channel.activation.revisions', {
                desired: row.configuration.desiredRevision,
                applied: row.configuration.appliedRevision ?? '—',
              })
            }}
          </span>
          <span
            v-if="row.configuration.lastError"
            class="text-xs text-destructive"
          >
            {{ row.configuration.lastError }}
          </span>
          <code
            v-if="row.engineeringPublication"
            class="block max-w-full truncate text-xs"
            :title="row.engineeringPublication.sourceDigest"
            >SHA-256: {{ row.engineeringPublication.sourceDigest }}
          </code>
          <Button
            v-if="
              row.canActivate &&
              ['failed', 'pending'].includes(row.configuration.state)
            "
            size="small"
            :loading="activating.has(row.id)"
            @click="handleActivate(row)"
          >
            {{ $t('page.southward.channel.activation.retry') }}
          </Button>
        </div>
        <span v-else>—</span>
      </template>
      <template #status="{ row }">
        <Switch
          :checked="row.status === CommonStatus.ENABLED"
          @update:checked="toggleStatus(row)"
        />
      </template>
      <template #toolbar-actions>
        <Button class="mr-2" @click="engineeringModalApi.open()">
          {{ $t('page.southward.channel.engineering.title') }}
        </Button>
        <Button class="mr-2" type="primary" @click="handleCreate">
          <span>{{
            `${$t('common.createWithName', { name: $t('page.southward.title') })}`
          }}</span>
        </Button>
      </template>
    </Grid>
    <FormDrawer @submit="handleFormSubmit" />
    <ConfigViewerModal />
    <SubDeviceModalRef />
    <ChannelLogLevelModalRef />
    <CertificateModal />
    <MmsTlsModalRef />
    <Iec104InterrogationModalRef />
    <EngineeringModalRef @published="gridApi.query()" />
    <OnlineEngineeringModalRef @captured="openCapturedEngineering" />
  </Page>
</template>
