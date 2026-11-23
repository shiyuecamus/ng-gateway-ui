import type { Node, When } from './index';

import { describe, expect, it } from 'vitest';

import {
  mapChannelSchemasToForm,
  mapPluginConfigSchemasToForm,
  projectActiveConfig,
} from './index';

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

const provision: Node[] = [
  field('connection.mode'),
  {
    kind: 'Union',
    discriminator: 'connection.mode',
    mapping: [
      {
        case_value: 'provision',
        children: [
          field('connection.provision_method'),
          field('connection.cert_path', [
            {
              target: 'connection.provision_method',
              operator: 'Eq',
              value: 'X509_CERTIFICATE',
              effect: 'If',
            },
          ]),
          {
            kind: 'Union',
            discriminator: 'connection.provision_method',
            mapping: [
              {
                case_value: 'X509_CERTIFICATE',
                children: [field('connection.private_key_path')],
              },
            ],
          },
        ],
      },
    ],
  },
];

function renderGate(nodes: Node[], path: string, values: Record<string, any>) {
  const gate = mapPluginConfigSchemasToForm(nodes).find(
    (schema) => schema.fieldName === path,
  )?.dependencies?.if;
  if (typeof gate !== 'function')
    throw new Error('Missing structural gate in fixture');
  return Reflect.apply(gate, undefined, [values]);
}

describe('declared structural conditions', () => {
  it('does not mount or submit X.509 material for access-token provisioning', () => {
    const values = {
      connection: {
        mode: 'provision',
        provision_method: 'ACCESS_TOKEN',
        cert_path: 'old.pem',
      },
    };
    expect(renderGate(provision, 'connection.cert_path', values)).toBe(false);
    expect(projectActiveConfig(provision, values)).toEqual({
      connection: { mode: 'provision', provision_method: 'ACCESS_TOKEN' },
    });
  });

  it('cannot reactivate an inactive parent branch and keeps every nested discriminator', () => {
    const values = {
      connection: {
        mode: 'token',
        provision_method: 'X509_CERTIFICATE',
        cert_path: 'old.pem',
        private_key_path: 'old.key',
      },
    };
    expect(renderGate(provision, 'connection.cert_path', values)).toBe(false);
    expect(renderGate(provision, 'connection.private_key_path', values)).toBe(
      false,
    );
    expect(projectActiveConfig(provision, values)).toEqual({
      connection: { mode: 'token' },
    });
    values.connection.mode = 'provision';
    expect(renderGate(provision, 'connection.cert_path', values)).toBe(true);
    expect(renderGate(provision, 'connection.private_key_path', values)).toBe(
      true,
    );
    expect(projectActiveConfig(provision, values)).toEqual(values);
  });

  it('conjoins positive/negative gates but preserves values hidden only by CSS', () => {
    const nodes: Node[] = [
      field('material', [
        { target: 'enabled', operator: 'Eq', value: true, effect: 'If' },
        { target: 'denied', operator: 'Eq', value: true, effect: 'IfNot' },
      ]),
      field('retained', [
        { target: 'hide', operator: 'Eq', value: true, effect: 'Invisible' },
      ]),
    ];
    const values = {
      enabled: false,
      denied: false,
      hide: true,
      material: 'private',
      retained: 0,
    };
    expect(renderGate(nodes, 'material', values)).toBe(false);
    expect(renderGate(nodes, 'retained', values)).toBe(true);
    expect(projectActiveConfig(nodes, values)).toEqual({ retained: 0 });
    values.enabled = true;
    values.denied = true;
    expect(renderGate(nodes, 'material', values)).toBe(false);
  });
});

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
    expect(projectActiveConfig([timer], { t1Ms: 15_000 })).toEqual({
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
    expect(projectActiveConfig(engineering, edited)).toEqual({
      kind: 'control',
      configuration: {
        objectReference: 'IED/GGIO1.SPCSO1',
        expectedControlModel: 1,
        originIdentifierHex: '6e67',
      },
    });
    edited.configuration.expectedControlModel = 4;
    expect(projectActiveConfig(engineering, edited)).toEqual({
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
    expect(projectActiveConfig(engineering, edited)).toEqual({
      kind: 'read',
      configuration: {
        objectReference: 'IED/GGIO1.SPCSO1',
        functionalConstraint: 'ST',
      },
    });
  });
});

describe('exact text input preservation', () => {
  it('rejects the full oversized input instead of admitting a different cropped prefix', () => {
    const endpoint: Node = {
      kind: 'Field',
      path: 'connection.host',
      label: { kind: 'simple', value: 'Endpoint' },
      data_type: { kind: 'String' },
      rules: { required: true, max_length: 8 },
    };
    const [mapped] = mapChannelSchemasToForm({
      channel: [endpoint],
      device: [],
      point: [],
      action: [],
    });
    const attempted = 'relay-a.x';
    const cropped = attempted.slice(0, 8);
    const validator = mapped?.rules as {
      safeParse: (value: string) => { success: boolean };
    };
    expect(mapped?.componentProps ?? {}).not.toHaveProperty('maxLength');
    expect(
      projectActiveConfig([endpoint], { connection: { host: attempted } }),
    ).toEqual({
      connection: { host: attempted },
    });
    expect(validator.safeParse(attempted).success).toBe(false);
    expect(validator.safeParse(cropped).success).toBe(true);
  });
});
