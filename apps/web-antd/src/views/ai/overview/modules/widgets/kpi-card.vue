<script lang="ts" setup>
import { Card, Statistic } from 'ant-design-vue';

defineOptions({ name: 'AiOverviewKpiCard' });

defineProps<{
  title: string;
  value: number | string;
}>();
</script>

<template>
  <Card>
    <Statistic :title="title" :value="value" />
  </Card>
</template>
