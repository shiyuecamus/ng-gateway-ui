<script lang="ts" setup>
import type { EchartsUIType } from '@vben/plugins/echarts';

import { onMounted, ref, watch } from 'vue';

import { EchartsUI, useEcharts } from '@vben/plugins/echarts';

const props = defineProps<{
  option: any;
}>();

const chartRef = ref<EchartsUIType>();
const { renderEcharts, getChartInstance } = useEcharts(chartRef);

onMounted(() => {
  renderEcharts(props.option, true);
});

watch(
  () => props.option,
  (opt) => {
    const inst = getChartInstance();
    if (inst) {
      inst.setOption(opt);
    } else {
      renderEcharts(opt, true);
    }
  },
  { deep: true },
);
</script>

<template>
  <EchartsUI ref="chartRef" />
</template>
