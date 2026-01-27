<script lang="ts" setup>
import type { VbenFormProps } from '@vben/common-ui';
import type { AppInfo, IdType, PluginInfo, Recordable } from '@vben/types';

import type { OnActionClickParams, VxeGridProps } from '#/adapter/vxe-table';

import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';

import { confirm, Page, useVbenDrawer, useVbenModal } from '@vben/common-ui';
import { FormOpenType } from '@vben/constants';
import { useRequestHandler } from '@vben/hooks';
import { $t } from '@vben/locales';
import { CommonStatus, EntityType } from '@vben/types';

import { Button, message, Switch } from 'ant-design-vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  changeAppStatus,
  createApp,
  deleteApp,
  fetchAllPlugins,
  fetchAppPage,
  updateApp,
} from '#/api';

import AppForm from './modules/widgets/form.vue';
import { createSearchFormSchema, useColumns } from './modules/schemas';
import SubscriptionDrawer from './modules/widgets/subscription.vue';

defineOptions({
  name: 'NorthwardAppPage',
});

interface SelectOption {
  /**
   * Option label text.
   */
  label: string;
  /**
   * Option underlying value.
   */
  value: IdType;
}

const { handleRequest } = useRequestHandler();
const router = useRouter();

const pluginRecords = ref<PluginInfo[]>([]);
const pluginOptions = reactive<SelectOption[]>([]);

/**
 * Initialize plugin dropdown options.
 */
async function loadPluginOptions() {
  await handleRequest(
    () => fetchAllPlugins(),
    (data) => {
      pluginRecords.value = data;
      pluginOptions.splice(
        0,
        pluginOptions.length,
        ...data.map<SelectOption>((plugin) => ({
          label: plugin.name,
          value: plugin.id,
        })),
      );
    },
  );
}

const formOptions: VbenFormProps = {
  collapsed: true,
  schema: createSearchFormSchema(pluginOptions),
  showCollapseButton: true,
  submitOnEnter: false,
};

const gridOptions: VxeGridProps<AppInfo> = {
  checkboxConfig: {
    highlight: true,
    labelField: 'name',
  },
  columns: useColumns(onActionClick),
  exportConfig: {},
  height: 'auto',
  keepSource: true,
  proxyConfig: {
    autoLoad: true,
    response: {
      result: 'records',
      total: 'total',
      list: 'records',
    },
    ajax: {
      query: async ({ page }, formValues) => {
        return await fetchAppPage({
          page: page.currentPage,
          pageSize: page.pageSize,
          ...formValues,
        });
      },
    },
  },
  toolbarConfig: {
    custom: true,
    export: false,
    import: false,
    refresh: true,
    zoom: true,
  },
};

const [Grid, gridApi] = useVbenVxeGrid({
  formOptions,
  gridOptions,
});

const [FormDrawer, formDrawerApi] = useVbenDrawer({
  connectedComponent: AppForm,
});

const [SubModal, subModalApi] = useVbenModal({
  connectedComponent: SubscriptionDrawer,
});

/**
 * Handle table action button clicks.
 * @param payload - Event payload.
 * @param payload.code - Action code.
 * @param payload.row - Target row.
 */
function onActionClick(payload: OnActionClickParams<AppInfo>) {
  const { code, row } = payload;
  switch (code) {
    case 'delete': {
      handleDelete(row);
      break;
    }
    case 'edit': {
      handleEdit(row);
      break;
    }
    case 'observability': {
      router.push(`/northward/app/${row.id}/observability`);
      break;
    }
    case 'subscription': {
      handleSubscription(row);
      break;
    }
    default: {
      break;
    }
  }
}

/**
 * Handle create button click.
 */
function handleCreate() {
  formDrawerApi
    .setData({
      type: FormOpenType.CREATE,
    })
    .setState({
      title: $t('common.createWithName', {
        name: $t('page.northward.app.title'),
      }),
    })
    .open();
}

/**
 * Handle edit button click.
 * @param row - Target app row.
 */
function handleEdit(row: AppInfo) {
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
}

function handleSubscription(row: AppInfo) {
  subModalApi
    .setData({
      id: row.id,
      name: row.name,
    })
    .setState({
      title: $t('page.northward.app.subscription'),
    })
    .open();
}

async function handleSubscriptionSubmit() {
  await gridApi.query();
}

/**
 * Handle form submit event.
 * @param type - Form open type (create or edit).
 * @param id - App identifier (for edit mode).
 * @param values - Form values.
 */
async function handleFormSubmit(
  type: FormOpenType,
  id: IdType,
  values: Recordable<any>,
) {
  await (type === FormOpenType.CREATE
    ? handleRequest(
        () => createApp(values as AppInfo),
        async () => {
          formDrawerApi.close();
          message.success($t('common.action.createSuccess'));
          await gridApi.query();
        },
      )
    : handleRequest(
        () =>
          updateApp({
            id,
            ...values,
          } as AppInfo),
        async () => {
          formDrawerApi.close();
          message.success($t('common.action.updateSuccess'));
          await gridApi.query();
        },
      ));
}

/**
 * Toggle app enablement status.
 * @param row - Target app row.
 */
async function toggleStatus(row: AppInfo) {
  const status =
    row.status === CommonStatus.ENABLED
      ? CommonStatus.DISABLED
      : CommonStatus.ENABLED;
  await handleRequest(
    () => changeAppStatus(row.id, status),
    async () => {
      message.success($t('common.action.changeStatusSuccess'));
      await gridApi.query();
    },
  );
}

/**
 * Delete app after confirmation.
 * @param row - Target app row.
 */
function handleDelete(row: AppInfo) {
  confirm({
    content: $t('common.action.deleteConfirm', {
      entityType: $t(`entity.${EntityType.APP.toLowerCase()}`),
      name: row.name,
    }),
    icon: 'warning',
    title: $t('common.tips'),
  })
    .then(async () => {
      await handleRequest(
        () => deleteApp(row.id),
        async () => {
          message.success(
            $t('common.action.deleteSuccessWithName', { name: row.name }),
          );
          await gridApi.query();
        },
      );
    })
    .catch(() => {});
}

onMounted(() => {
  void loadPluginOptions();
});
</script>

<template>
  <Page auto-content-height>
    <Grid>
      <template #status="{ row }">
        <Switch
          :checked="row.status === CommonStatus.ENABLED"
          @update:checked="toggleStatus(row)"
        />
      </template>
      <template #toolbar-actions>
        <Button class="mr-2" type="primary" @click="handleCreate">
          <span>{{
            `${$t('common.createWithName', {
              name: $t('page.northward.app.title'),
            })}`
          }}</span>
        </Button>
      </template>
    </Grid>
    <FormDrawer @submit="handleFormSubmit" />
    <SubModal @submitted="handleSubscriptionSubmit" />
  </Page>
</template>
