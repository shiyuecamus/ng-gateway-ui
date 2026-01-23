<script lang="ts" setup>
import type { EchartsUIType } from '@vben/plugins/echarts';

import { onMounted, ref, watch } from 'vue';

import { EchartsUI, useEcharts } from '@vben/plugins/echarts';

const props = defineProps<{
  option: unknown;
}>();

const chartRef = ref<EchartsUIType>();
const { renderEcharts, getChartInstance } = useEcharts(chartRef);

onMounted(() => {
  renderEcharts(props.option as any, true);
});

watch(
  () => props.option,
  (opt) => {
    const inst = getChartInstance();
    if (inst) {
      inst.setOption(opt as any);
    } else {
      renderEcharts(opt as any, true);
    }
  },
  // Avoid deep-watching a large option object; parent already produces a new option
  // reference when data changes.
  { deep: false },
);
</script>

<template>
  <EchartsUI ref="chartRef" />
</template>
