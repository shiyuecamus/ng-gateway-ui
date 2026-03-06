import type { VbenFormSchema as FormSchema } from '@vben/common-ui';
import type { Nullable } from '@vben/types';

import type { CustomRenderType } from '@vben-core/shadcn-ui';

import type { UiText } from './types';

import { h } from 'vue';

import { get, isEqual } from '@vben/utils';

import { isNullOrUndefined } from '@vben-core/shared/utils';

import { requestClient } from '#/api/request';
import { z } from '#/adapter/form';

import { resolveUiText } from './types';

export type DynamicFormSchema = FormSchema;
export type DynamicFormSchemas = DynamicFormSchema[];
export type DriverFormSchema = DynamicFormSchema;
export type DriverFormSchemas = DynamicFormSchemas;
export type DriverSchemas = DynamicSchemas;
export type PluginConfigSchemas = Node[];

export interface DynamicSchemas {
  channel: Node[];
  device: Node[];
  point: Node[];
  action: Node[];
}

export type Node = FieldNode | GroupNode | UnionNode;

export interface FieldNode {
  kind: 'Field';
  path: string;
  label: UiText;
  data_type: UiDataType;
  default_value?: any;
  order?: Nullable<number>;
  ui?: UiProps;
  rules?: Rules;
  when?: When[];
}

export interface GroupNode {
  kind: 'Group';
  id: string;
  label: UiText;
  description?: Nullable<UiText>;
  collapsible: boolean;
  order?: Nullable<number>;
  children: Node[];
}

export interface UnionNode {
  kind: 'Union';
  order?: Nullable<number>;
  discriminator: string;
  mapping: UnionCase[];
}

export interface UnionCase {
  case_value: any;
  children: Node[];
}

export type UiDataType =
  | { items: EnumItem[]; kind: 'Enum' }
  | { kind: 'Any' }
  | { kind: 'Boolean' }
  | { kind: 'Float' }
  | { kind: 'Integer' }
  | { kind: 'String' };

export interface EnumItem {
  key: any;
  label: UiText;
}

/** Remote data source for dynamically populated select fields. */
export interface ApiDatasource {
  /** API endpoint to fetch options (relative to the API base URL). */
  endpoint: string;
  /** JSON path to the value field in each response item. */
  value_field: string;
  /** JSON path to the label field in each response item. */
  label_field: string;
  /** Optional query parameters appended as `?key=value&...`. */
  params?: Nullable<Record<string, any>>;
  /** Whether to allow creating new items inline (shows a quick-add button). */
  allow_create?: boolean;
  /** Route path to navigate when the user clicks the quick-add button. */
  create_route?: Nullable<string>;
  /** Display label for the quick-add button. */
  create_label?: Nullable<UiText>;
}

export interface UiProps {
  placeholder?: Nullable<UiText>;
  help?: Nullable<UiText>;
  prefix?: Nullable<string>;
  suffix?: Nullable<string>;
  col_span?: Nullable<number>;
  read_only?: Nullable<boolean>;
  disabled?: Nullable<boolean>;
  /** Remote data source for dynamically populated select fields. */
  datasource?: Nullable<ApiDatasource>;
}

export type RuleValue<T> = T | { message?: UiText; value: T };

export interface Rules {
  required?: Nullable<RuleValue<boolean>>;
  min?: Nullable<RuleValue<number>>;
  max?: Nullable<RuleValue<number>>;
  min_length?: Nullable<RuleValue<number>>;
  max_length?: Nullable<RuleValue<number>>;
  min_items?: Nullable<RuleValue<number>>;
  max_items?: Nullable<RuleValue<number>>;
  pattern?: Nullable<RuleValue<string>>;
}

export interface When {
  target: string;
  operator:
  | 'Between'
  | 'Contains'
  | 'Eq'
  | 'Gt'
  | 'Gte'
  | 'In'
  | 'Lt'
  | 'Lte'
  | 'Neq'
  | 'NotBetween'
  | 'NotIn'
  | 'NotNull'
  | 'Prefix'
  | 'Regex'
  | 'Suffix';
  value?: Nullable<any>;
  effect:
  | 'Disable'
  | 'Enable'
  | 'If'
  | 'IfNot'
  | 'Invisible'
  | 'Optional'
  | 'Require'
  | 'Visible';
}

function getNodeOrder(node: Node): number {
  return isNullOrUndefined(node.order) ? 0 : Number(node.order);
}

/**
 * Sort nodes by `order` recursively.
 *
 * Note: API payloads may omit arrays (e.g. `children`) in edge cases. This
 * function is deliberately defensive to avoid UI crashes.
 */
export function sortNodes(nodes?: null | Node[]): Node[] {
  const list = Array.isArray(nodes) ? nodes : [];
  return list
    .map((n) => sortNode(n))
    .toSorted((a, b) => getNodeOrder(a) - getNodeOrder(b));
}

function sortNode(node: Node): Node {
  switch (node.kind) {
    case 'Field': {
      return node;
    }
    case 'Group': {
      return {
        ...node,
        children: sortNodes((node as any).children),
      };
    }
    case 'Union': {
      const mapping = Array.isArray((node as any).mapping)
        ? (node as any).mapping
        : [];
      return {
        ...node,
        mapping: mapping.map((m: any) => ({
          ...m,
          children: sortNodes(m?.children),
        })),
      };
    }
  }
}

export function sortDynamicSchemas(schemas: DynamicSchemas): DynamicSchemas {
  return {
    channel: sortNodes(schemas.channel),
    device: sortNodes(schemas.device),
    point: sortNodes(schemas.point),
    action: sortNodes(schemas.action),
  };
}

export const sortDriverSchemas = sortDynamicSchemas;

export function mapChannelSchemasToForm(schemas: DynamicSchemas): FormSchema[] {
  const result: FormSchema[] = [];
  for (const item of schemas.channel) {
    result.push(...mapNode(item, undefined));
  }
  return result;
}

export function mapDeviceSchemasToForm(schemas: DynamicSchemas): FormSchema[] {
  const result: FormSchema[] = [];
  for (const item of schemas.device) {
    result.push(...mapNode(item, undefined));
  }
  return result;
}

export function mapPointSchemasToForm(schemas: DynamicSchemas): FormSchema[] {
  const result: FormSchema[] = [];
  for (const item of schemas.point) {
    result.push(...mapNode(item, undefined));
  }
  return result;
}

export function mapActionSchemasToForm(schemas: DynamicSchemas): FormSchema[] {
  const result: FormSchema[] = [];
  for (const item of schemas.action) {
    result.push(...mapNode(item, undefined));
  }
  return result;
}

/**
 * Map plugin config schemas to form schemas.
 * @param schemas - Plugin config schemas (array of nodes).
 */
export function mapPluginConfigSchemasToForm(
  schemas: PluginConfigSchemas,
): FormSchema[] {
  const result: FormSchema[] = [];
  for (const item of schemas) {
    result.push(...mapNode(item, undefined));
  }
  return result;
}

function mapNode(
  node: Node,
  discriminator?: { equals: any; field: string },
): FormSchema[] {
  switch (node.kind) {
    case 'Field': {
      return [mapField(node, discriminator)];
    }
    case 'Group': {
      const divider: FormSchema = {
        component: 'Divider',
        fieldName: `__divider__${node.id}`,
        hideLabel: true,
        renderComponentContent() {
          return {
            default: () => resolveUiText(node.label),
          };
        },
        formItemClass: `col-span-2`,
      };

      // Best-effort: make group divider follow discriminator / the first field's conditions
      // to avoid "empty divider" artifacts for unions and conditional groups.
      const controller =
        node.children && node.children.length > 0
          ? node.children[0]
          : undefined;
      const controllerWhen =
        controller && controller.kind === 'Field' ? controller.when : undefined;
      const dividerDeps = buildDependencies(controllerWhen, discriminator);
      if (dividerDeps) divider.dependencies = dividerDeps;

      const children = node.children.flatMap((n) => mapNode(n, discriminator));
      return [divider, ...children];
    }
    case 'Union': {
      const acc: FormSchema[] = [];
      for (const c of node.mapping) {
        const nextDiscriminator = {
          field: node.discriminator,
          equals: c.case_value,
        };
        acc.push(...c.children.flatMap((n) => mapNode(n, nextDiscriminator)));
      }
      return acc;
    }
  }
}

function buildDependencies(
  when?: null | When[],
  discriminator?: { equals: any; field: string },
):
  | undefined
  | {
    if?: (values: Record<string, any>) => boolean;
    show?: (values: Record<string, any>) => boolean;
    triggerFields: string[];
  } {
  if ((!when || when.length === 0) && !discriminator) return undefined;

  const targets = new Set<string>();
  if (discriminator) targets.add(discriminator.field);
  for (const w of when || []) targets.add(w.target);

  const computeIf = (values: Record<string, any>): boolean => {
    let render = true;
    if (discriminator) {
      render = isEqual(get(values, discriminator.field), discriminator.equals);
    }
    if (when) {
      for (const w of when) {
        const val = get(values, w.target);
        if (!evalOperator(w.operator, val, w.value)) continue;
        if (w.effect === 'If') render = true;
        if (w.effect === 'IfNot') render = false;
      }
    }
    return render;
  };

  const computeShow = (values: Record<string, any>): boolean => {
    let show = true;
    if (when) {
      for (const w of when) {
        const val = get(values, w.target);
        if (!evalOperator(w.operator, val, w.value)) continue;
        if (w.effect === 'Invisible') show = false;
        if (w.effect === 'Visible') show = true;
      }
    }
    return show;
  };

  return {
    triggerFields: [...targets],
    // For layout nodes (divider), "rendered" should also respect `Visible/Invisible`.
    if: (values) => computeIf(values) && computeShow(values),
    show: (values) => computeShow(values),
  };
}

function mapField(
  node: FieldNode,
  discriminator?: { equals: any; field: string },
): FormSchema {
  const component = resolveComponent(node);
  const colSpan = node.ui?.col_span ?? 2;
  const controlClass = component === 'Switch' ? '' : 'w-full';
  const base: FormSchema = {
    component,
    fieldName: node.path,
    label: resolveUiText(node.label),
    defaultValue: node.default_value ?? undefined,
    formItemClass: `col-span-${colSpan}`,
    controlClass,
  };

  if (node.ui?.placeholder) {
    const prev = (base.componentProps ?? {}) as Record<string, any>;
    base.componentProps = {
      ...prev,
      placeholder: resolveUiText(node.ui.placeholder),
    };
  }
  if (node.ui?.prefix) {
    const prev = (base.componentProps ?? {}) as Record<string, any>;
    base.componentProps = { ...prev, prefix: node.ui.prefix } as any;
  }
  if (node.ui?.suffix) {
    const prev = (base.componentProps ?? {}) as Record<string, any>;
    base.componentProps = { ...prev, suffix: node.ui.suffix } as any;
  }
  if (node.ui && !isNullOrUndefined(node.ui.read_only)) {
    const prev = (base.componentProps ?? {}) as Record<string, any>;
    base.componentProps = { ...prev, readonly: !!node.ui.read_only } as any;
  }
  if (node.ui && !isNullOrUndefined(node.ui.disabled)) {
    const prev = (base.componentProps ?? {}) as Record<string, any>;
    base.componentProps = { ...prev, disabled: !!node.ui.disabled } as any;
  }
  if (node.ui?.help !== null && node.ui?.help !== undefined) {
    base.help = resolveUiText(node.ui.help) as CustomRenderType;
  }

  if (node.data_type.kind === 'Integer' || node.data_type.kind === 'Float') {
    const cp: any = { ...((base.componentProps ?? {}) as any) };
    const rvMin = extractRuleValue<number>(node.rules?.min);
    const rvMax = extractRuleValue<number>(node.rules?.max);
    if (!isNullOrUndefined(rvMin.value)) cp.min = rvMin.value;
    if (!isNullOrUndefined(rvMax.value)) cp.max = rvMax.value;
    base.componentProps = cp;
  }

  if (node.data_type.kind === 'String') {
    const cp: any = { ...((base.componentProps ?? {}) as any) };
    const rvMaxLen = extractRuleValue<number>(node.rules?.max_length);
    if (!isNullOrUndefined(rvMaxLen.value)) cp.maxLength = rvMaxLen.value;
    base.componentProps = cp;
  }

  if (node.ui?.datasource) {
    const ds = node.ui.datasource;
    const prev = (base.componentProps ?? {}) as Record<string, any>;
    const apiSelectProps: Record<string, any> = {
      ...prev,
      api: async () => {
        const params = ds.params
          ? `?${new URLSearchParams(ds.params as any).toString()}`
          : '';
        const resp = await requestClient.get(`${ds.endpoint}${params}`);
        return resp?.data ?? resp ?? [];
      },
      labelField: ds.label_field,
      valueField: ds.value_field,
      resultField: '',
      immediate: true,
      showSearch: true,
      allowClear: true,
      filterOption: (input: string, option: Record<string, any>) => {
        const label = String(option[ds.label_field] ?? '');
        return label.toLowerCase().includes(input.toLowerCase());
      },
    };

    if (ds.allow_create && ds.create_route) {
      const createRoute = ds.create_route;
      const createLabel = ds.create_label
        ? String(resolveUiText(ds.create_label))
        : '+ Create';
      apiSelectProps.dropdownRender = ({ menuNode }: { menuNode: any }) => {
        return h('div', [
          menuNode,
          h(
            'a',
            {
              style:
                'display: block; border-top: 1px solid #f0f0f0; padding: 6px 12px; color: #1890ff; font-size: 13px; cursor: pointer; text-decoration: none;',
              href: `#${createRoute}`,
            },
            createLabel,
          ),
        ]);
      };
    }

    base.componentProps = apiSelectProps as any;
  } else if (node.data_type.kind === 'Enum') {
    const prev = (base.componentProps ?? {}) as Record<string, any>;
    base.componentProps = {
      ...prev,
      options: node.data_type.items.map((it) => ({
        label: resolveUiText(it.label),
        value: it.key,
      })),
      allowClear: true,
    } as any;
  }

  base.rules = buildRuleForNode(node);

  if ((node.when && node.when.length > 0) || discriminator) {
    base.dependencies = base.dependencies || ({ triggerFields: [] } as any);
    const dep: any = base.dependencies;
    const targets = new Set<string>();
    if (discriminator) targets.add(discriminator.field);
    for (const w of node.when || []) targets.add(w.target);
    dep.triggerFields = [...targets];
    const computeIf = (values: Record<string, any>) => {
      let render = true;
      if (discriminator) {
        render = isEqual(
          get(values, discriminator.field),
          discriminator.equals,
        );
      }
      if (node.when) {
        for (const w of node.when) {
          const val = get(values, w.target);
          if (!evalOperator(w.operator, val, w.value)) continue;
          if (w.effect === 'If') render = true;
          if (w.effect === 'IfNot') render = false;
        }
      }
      return render;
    };

    const computeShow = (values: Record<string, any>) => {
      let show = true;
      if (node.when) {
        for (const w of node.when) {
          const val = get(values, w.target);
          if (!evalOperator(w.operator, val, w.value)) continue;
          if (w.effect === 'Invisible') show = false;
          if (w.effect === 'Visible') show = true;
        }
      }
      return show;
    };

    // `if`: controls whether the component is mounted (removes DOM when false).
    // This is primarily used for union discriminator gating and explicit `If/IfNot` effects.
    dep.if = (values: Record<string, any>) => computeIf(values);

    // `show`: controls CSS visibility (keeps DOM).
    dep.show = (values: Record<string, any>) => computeShow(values);

    dep.rules = (values: Record<string, any>) => {
      let required = !!extractRuleValue<boolean>(node.rules?.required).value;
      if (node.when) {
        for (const w of node.when) {
          const val = get(values, w.target);
          if (evalOperator(w.operator, val, w.value)) {
            if (w.effect === 'Require') required = true;
            if (w.effect === 'Optional') required = false;
          }
        }
      }
      return buildRuleForNode(node, required);
    };
    dep.disabled = (values: Record<string, any>) => {
      let disabled = !!node.ui?.disabled;
      if (node.when) {
        for (const w of node.when) {
          const val = get(values, w.target);
          if (evalOperator(w.operator, val, w.value)) {
            if (w.effect === 'Disable') disabled = true;
            if (w.effect === 'Enable') disabled = false;
          }
        }
      }
      return disabled;
    };
  }

  return base;
}

const COMPONENT_BY_KIND: Record<UiDataType['kind'], any> = {
  Any: 'JsonEditor',
  Boolean: 'Switch',
  Enum: 'Select',
  Float: 'InputNumber',
  Integer: 'InputNumber',
  String: 'Input',
};

function resolveComponent(node: FieldNode): any {
  if (node.ui?.datasource) return 'ApiSelect';
  return COMPONENT_BY_KIND[node.data_type.kind] ?? 'Input';
}

function evalOperator(op: When['operator'], left: any, right: any): boolean {
  switch (op) {
    case 'Between': {
      return (
        Array.isArray(right) &&
        right.length >= 2 &&
        Number(left) >= Number(right[0]) &&
        Number(left) <= Number(right[1])
      );
    }
    case 'Contains': {
      if (Array.isArray(left)) return left.includes(right);
      if (typeof left === 'string') return left.includes(String(right));
      return false;
    }
    case 'Eq': {
      return left === right;
    }
    case 'Gt': {
      return Number(left) > Number(right);
    }
    case 'Gte': {
      return Number(left) >= Number(right);
    }
    case 'Lt': {
      return Number(left) < Number(right);
    }
    case 'Lte': {
      return Number(left) <= Number(right);
    }
    case 'Neq': {
      return left !== right;
    }
    case 'NotBetween': {
      return (
        Array.isArray(right) &&
        right.length >= 2 &&
        (Number(left) < Number(right[0]) || Number(left) > Number(right[1]))
      );
    }
    case 'NotIn': {
      return Array.isArray(right) && !right.includes(left);
    }
    case 'NotNull': {
      return left !== null && left !== undefined;
    }
    case 'Prefix': {
      return typeof left === 'string' && String(left).startsWith(String(right));
    }
    case 'Regex': {
      try {
        const re = new RegExp(String(right));
        return re.test(String(left));
      } catch {
        return false;
      }
    }
    case 'In': {
      return Array.isArray(right) && right.includes(left);
    }
    case 'Suffix': {
      return typeof left === 'string' && String(left).endsWith(String(right));
    }
  }
}

function extractRuleValue<T>(
  rv?: null | Nullable<RuleValue<T>>,
):
  | { message?: string; value: T | undefined }
  | { message?: string; value: undefined } {
  if (rv === null || rv === undefined) return { value: undefined } as any;
  if (typeof rv === 'object' && rv !== null && 'value' in rv) {
    return {
      value: (rv as any).value as T,
      message: (rv as any).message
        ? String(resolveUiText((rv as any).message))
        : undefined,
    };
  }
  return { value: rv as any };
}

function buildRuleForNode(node: FieldNode, requiredOverride?: boolean) {
  const schema = buildZodSchema(node.data_type, node.rules);
  const rvRequired = extractRuleValue<boolean>(node.rules?.required);
  const required =
    typeof requiredOverride === 'boolean'
      ? requiredOverride
      : !!rvRequired.value;

  if (!schema) return required ? 'required' : null;

  if (required && node.data_type.kind === 'String') {
    const msg = rvRequired.message;
    const rvMinLen = extractRuleValue<number>(node.rules?.min_length);
    if (isNullOrUndefined(rvMinLen.value)) {
      return (schema as any).min(1, { message: msg } as any);
    }
  }
  return required ? schema : (schema as any).optional();
}

type ZodBuilder = (dataType: UiDataType, rules?: Rules) => any;

const ZOD_BUILDERS: Partial<Record<UiDataType['kind'], ZodBuilder>> = {
  Any: () => z.any(),
  Boolean: () => z.boolean(),
  Enum: (dataType) => {
    const dt = dataType as Extract<UiDataType, { kind: 'Enum' }>;
    const literals = dt.items.map((it) => z.literal(it.key as any));
    return literals.length > 0 ? (z.union(literals as any) as any) : null;
  },
  Float: (_dataType, rules) => {
    let s = z.number();
    const rvMin = extractRuleValue<number>(rules?.min);
    const rvMax = extractRuleValue<number>(rules?.max);
    if (!isNullOrUndefined(rvMin.value))
      s = (s as any).min(Number(rvMin.value), {
        message: rvMin.message,
      } as any);
    if (!isNullOrUndefined(rvMax.value))
      s = (s as any).max(Number(rvMax.value), {
        message: rvMax.message,
      } as any);
    return s;
  },
  Integer: (_dataType, rules) => {
    let s = z.number().int();
    const rvMin = extractRuleValue<number>(rules?.min);
    const rvMax = extractRuleValue<number>(rules?.max);
    if (!isNullOrUndefined(rvMin.value))
      s = (s as any).min(Number(rvMin.value), {
        message: rvMin.message,
      } as any);
    if (!isNullOrUndefined(rvMax.value))
      s = (s as any).max(Number(rvMax.value), {
        message: rvMax.message,
      } as any);
    return s;
  },
  String: (_dataType, rules) => {
    let s = z.string();
    const rvMinLen = extractRuleValue<number>(rules?.min_length);
    const rvMaxLen = extractRuleValue<number>(rules?.max_length);
    const rvPattern = extractRuleValue<string>(rules?.pattern);
    if (!isNullOrUndefined(rvMinLen.value))
      s = (s as any).min(Number(rvMinLen.value), {
        message: rvMinLen.message,
      } as any);
    if (!isNullOrUndefined(rvMaxLen.value))
      s = (s as any).max(Number(rvMaxLen.value), {
        message: rvMaxLen.message,
      } as any);
    if (!isNullOrUndefined(rvPattern.value)) {
      try {
        s = (s as any).regex(new RegExp(String(rvPattern.value)), {
          message: rvPattern.message,
        } as any);
      } catch { }
    }
    return s;
  },
};

function buildZodSchema(dataType: UiDataType, rules?: Rules): any {
  const builder = ZOD_BUILDERS[dataType.kind];
  if (!builder) return null;
  return builder(dataType as any, rules);
}

export { resolveUiText } from './types';
export type { UiText } from './types';
