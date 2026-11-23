import type {
  CommonPageRequest,
  CommonPageResponse,
  IdType,
} from '@vben/types';

import { computed, ref, shallowRef, useId, watch } from 'vue';

import { useDocumentVisibility, useIntervalFn } from '@vueuse/core';

interface QuotaScopeTarget {
  id: IdType;
  name: string;
}

interface QuotaScopeSource<Target, Sample> {
  active: () => boolean;
  loadPage: (
    params: CommonPageRequest & { name?: string },
    signal: AbortSignal,
  ) => Promise<CommonPageResponse<Target>>;
  loadSample: (id: string, signal: AbortSignal) => Promise<null | Sample>;
  sampleId: (sample: Sample) => IdType;
}

/** Keep one selected scope and cancel requests which can no longer supply its view. */
export function useQuotaScopeSelection<
  Target extends QuotaScopeTarget,
  Sample,
>({
  active: isActive,
  loadPage,
  loadSample,
  sampleId,
}: QuotaScopeSource<Target, Sample>) {
  const pageSize = 20;
  const visibility = useDocumentVisibility();
  const pickerId = useId();
  const page = ref(1);
  const total = ref(0);
  const search = ref('');
  const listRevision = ref(0);
  const sampleRevision = ref(0);
  const listPending = ref(false);
  const samplePending = ref(false);
  const listProblem = ref<'denied' | 'failed'>();
  const sampleProblem = ref<'denied' | 'failed'>();
  const options = shallowRef<Target[]>([]);
  const selected = shallowRef<Target>();
  const sample = shallowRef<null | Sample>();
  const selectedId = computed(() =>
    selected.value ? String(selected.value.id) : undefined,
  );

  const targetOptions = computed(() => {
    const visible = options.value;
    const current = selected.value;
    return (
      current && !visible.some(({ id }) => String(id) === String(current.id))
        ? [current, ...visible]
        : visible
    ).map(({ id, name }) => ({ label: name, value: String(id) }));
  });

  function denied(error: unknown) {
    return (
      (error as { response?: { status?: number } })?.response?.status === 403
    );
  }

  watch(
    [isActive, search, page, listRevision],
    ([active, name, requestedPage], previous, onCleanup) => {
      if (!active) return;
      listPending.value = true;
      listProblem.value = undefined;
      const request = new AbortController();
      const timer = setTimeout(
        async () => {
          try {
            const result = await loadPage(
              { name: name || undefined, page: requestedPage, pageSize },
              request.signal,
            );
            if (request.signal.aborted) return;
            total.value = result.total;
            const lastPage = Math.max(1, result.pages);
            if (requestedPage > lastPage) {
              page.value = lastPage;
              return;
            }
            options.value = result.records;
            const updated = result.records.find(
              ({ id }) => String(id) === selectedId.value,
            );
            if (updated) selected.value = updated;
          } catch (error) {
            if (!request.signal.aborted) {
              listProblem.value = denied(error) ? 'denied' : 'failed';
              options.value = [];
              total.value = 0;
              if (listProblem.value === 'denied') selected.value = undefined;
            }
          } finally {
            if (!request.signal.aborted) listPending.value = false;
          }
        },
        previous[1] === name ? 0 : 250,
      );
      onCleanup(() => {
        clearTimeout(timer);
        request.abort();
        listPending.value = false;
      });
    },
    { immediate: true },
  );

  watch(
    [isActive, selectedId, sampleRevision],
    async ([active, id], previous, onCleanup) => {
      if (previous[1] !== id) {
        sample.value = undefined;
        sampleProblem.value = undefined;
      }
      if (!active || id === undefined) return;
      const request = new AbortController();
      samplePending.value = true;
      onCleanup(() => {
        request.abort();
        samplePending.value = false;
      });
      try {
        const current = await loadSample(id, request.signal);
        if (request.signal.aborted) return;
        if (current !== null && String(sampleId(current)) !== id) {
          sampleProblem.value = 'failed';
          return;
        }
        sample.value = current;
        sampleProblem.value = undefined;
      } catch (error) {
        if (!request.signal.aborted) {
          sampleProblem.value = denied(error) ? 'denied' : 'failed';
          if (sampleProblem.value === 'denied') sample.value = undefined;
        }
      } finally {
        if (!request.signal.aborted) samplePending.value = false;
      }
    },
    { immediate: true },
  );

  function searchTargets(value: string) {
    const next = value.slice(0, 128).trim();
    if (search.value === next) return;
    search.value = next;
    page.value = 1;
  }

  function chooseTarget(value: unknown) {
    if (value === selectedId.value) return;
    selected.value = options.value.find(({ id }) => String(id) === value);
  }

  function refresh() {
    if (!isActive()) return;
    if (!listPending.value) listRevision.value++;
    if (selected.value && !samplePending.value) sampleRevision.value++;
  }

  useIntervalFn(() => {
    if (
      isActive() &&
      visibility.value === 'visible' &&
      selectedId.value &&
      !samplePending.value &&
      !sampleProblem.value
    ) {
      sampleRevision.value++;
    }
  }, 2000);

  watch(visibility, (state) => {
    if (state === 'visible') refresh();
  });
  return {
    chooseTarget,
    listPending,
    listProblem,
    page,
    pageSize,
    pickerId,
    refresh,
    sample,
    samplePending,
    sampleProblem,
    searchTargets,
    selected,
    selectedId,
    targetOptions,
    total,
  };
}
