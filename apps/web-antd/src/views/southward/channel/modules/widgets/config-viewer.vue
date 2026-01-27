<script lang="ts" setup>
import type { Recordable } from '@vben/types';

import { nextTick, ref } from 'vue';

import { JsonViewer, useVbenModal } from '@vben/common-ui';

defineOptions({ name: 'ConfigViewer' });

const config = ref<Recordable<any> | undefined>(undefined);

const [Modal, modalApi] = useVbenModal({
  class: 'w-1/2',
  destroyOnClose: true,
  fullscreenButton: false,
  showConfirmButton: false,
  onCancel() {
    modalApi.close();
  },
  onOpenChange: async (isOpen: boolean) => {
    if (!isOpen) return;
    await nextTick();
    config.value = modalApi.getData<Recordable<any>>();
  },
});
</script>

<template>
  <Modal>
    <JsonViewer :value="config" copyable :sort="false" boxed />
  </Modal>
</template>

<style scoped></style>

