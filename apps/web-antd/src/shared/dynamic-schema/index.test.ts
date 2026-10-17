import type { Node, When } from './index';

import { describe, expect, it } from 'vitest';

import { mapChannelSchemasToForm, projectActiveDriverConfig } from './index';

const field = (path: string, when?: When[]): Node => ({
  kind: 'Field',
  path,
  label: { kind: 'simple', value: path },
  data_type: { kind: 'String' },
  ...(when ? { when } : {}),
});

const engineering: Node[] = [
  field('kind'),
  field('configuration.objectReference'),
  {
    kind: 'Union',
    discriminator: 'kind',
    mapping: [
      {
        case_value: 'read',
        children: [field('configuration.functionalConstraint')],
      },
      {
        case_value: 'control',
        children: [
          field('configuration.expectedControlModel'),
          field('configuration.originIdentifierHex'),
          field('configuration.sboClass', [
            {
              target: 'configuration.expectedControlModel',
              operator: 'NotIn',
              value: [2, 4],
              effect: 'IfNot',
            },
          ]),
          field('configuration.terminationTimeoutMs', [
            {
              target: 'configuration.expectedControlModel',
              operator: 'NotIn',
              value: [3, 4],
              effect: 'IfNot',
            },
          ]),
        ],
      },
    ],
  },
];

describe('driver engineering submission', () => {
  it('keeps narrow fields readable without changing metadata values or help semantics', () => {
    const timer: Node = {
      ...field('t1Ms'),
      kind: 'Field',
      path: 't1Ms',
      label: { kind: 'simple', value: 't1' },
      data_type: { kind: 'Integer' },
      default_value: 15_000,
      ui: {
        col_span: 1,
        help: { kind: 'simple', value: 'I/U confirmation timeout' },
      },
    };
    const schemas = mapChannelSchemasToForm({
      channel: [timer, field('host')],
      device: [],
      point: [],
      action: [],
    });
    expect(schemas[0]).toMatchObject({
      fieldName: 't1Ms',
      defaultValue: 15_000,
      formItemClass: 'col-span-2 md:col-span-1',
      help: 'I/U confirmation timeout',
    });
    expect(schemas[1]?.formItemClass).toBe('col-span-2');
    expect(projectActiveDriverConfig([timer], { t1Ms: 15_000 })).toEqual({
      t1Ms: 15_000,
    });
  });
  it('removes values from inactive point purposes and control models', () => {
    const edited = {
      kind: 'control',
      configuration: {
        objectReference: 'IED/GGIO1.SPCSO1',
        functionalConstraint: 'ST',
        expectedControlModel: 1,
        originIdentifierHex: '6e67',
        sboClass: 'operateOnce',
        terminationTimeoutMs: 5000,
      },
    };
    expect(projectActiveDriverConfig(engineering, edited)).toEqual({
      kind: 'control',
      configuration: {
        objectReference: 'IED/GGIO1.SPCSO1',
        expectedControlModel: 1,
        originIdentifierHex: '6e67',
      },
    });
    edited.configuration.expectedControlModel = 4;
    expect(projectActiveDriverConfig(engineering, edited)).toEqual({
      kind: 'control',
      configuration: {
        objectReference: 'IED/GGIO1.SPCSO1',
        expectedControlModel: 4,
        originIdentifierHex: '6e67',
        sboClass: 'operateOnce',
        terminationTimeoutMs: 5000,
      },
    });
    edited.kind = 'read';
    expect(projectActiveDriverConfig(engineering, edited)).toEqual({
      kind: 'read',
      configuration: {
        objectReference: 'IED/GGIO1.SPCSO1',
        functionalConstraint: 'ST',
      },
    });
  });
});
