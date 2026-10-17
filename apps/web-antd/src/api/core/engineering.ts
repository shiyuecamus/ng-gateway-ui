import type { RequestResponse } from '@vben/request';
import type { ChannelInfo, ConnectionPolicy } from '@vben/types';

import type { MmsAlternateAccess, MmsName } from './capability';

import { requestClient } from '#/api/request';

/** Native XML profile and protocol edition are independent evidence. */
export interface EngineeringStatus {
  storeAvailable: boolean;
  documentImportAvailable: boolean;
  sclImportAvailable: boolean;
  nsdImportAvailable: boolean;
  mmsCaptureAvailable: boolean;
  gooseSourcePlanAvailable: boolean;
  unavailableReason: null | string;
  maxInputBytes: number;
  maxJobs: number;
  maxPageNodes: number;
  maxBrowseBytes: number;
  maxMappingPoints: number;
  maxMappingBytes: number;
  maxSourceBytes: number;
  maxSourceWork: number;
}

export type NsdIdentity =
  | { date: string; role: 'applicability'; version: number }
  | {
      namespace: string;
      namespaceType:
        | 'basic'
        | 'domain'
        | 'private'
        | 'product'
        | 'transitional'
        | null;
      publicationStage: string;
      release: number;
      revision: string;
      role: 'data';
      version: number;
    }
  | {
      namespace: string;
      publicationStage: string;
      release: number;
      revision: string;
      role: 'service';
      version: number;
    };

export type NsdRole = NsdIdentity['role'];

export interface AssetInfo {
  digest: string;
  sizeBytes: number;
  source:
    | {
        associationEpoch: string;
        captureId: string;
        channelId: number;
        completedAt: string;
        configurationEpoch: string;
        configurationRevision: string;
        declarations: CapturedDeclarationProvenance;
        kind: 'mms';
        startedAt: string;
      }
    | {
        encoding: 'utf8';
        identity: NsdIdentity;
        kind: 'nsd';
        schema: '2016' | '2017B5' | '2017B6';
      }
    | {
        encoding: 'utf8' | 'utf16Be' | 'utf16Le';
        kind: 'scl';
        profile: string;
      }
    | { kind: 'document' };
  importedBy: string;
  createdAt: string;
}

export interface ServerPreview {
  index: number;
  iedName: null | string;
  accessPointCount: number;
  logicalDeviceCount: number;
  logicalNodeCount: number;
  reportCount: number;
  gooseCount: number;
}

export interface AssetPreview {
  asset: AssetInfo;
  totalServers: number;
  offset: number;
  servers: ServerPreview[];
}

export interface NodeComponent {
  name: string;
  indices: number[];
}

export type BrowseLocation =
  | {
      accessPoint: string;
      kind: 'addressParameters';
      network: number;
      server: number;
    }
  | { accessPoint: string; kind: 'networkAddresses'; server: number }
  | {
      dataSet: string;
      domain: string;
      kind: 'dataSetMembers';
      logicalNode: string;
      server: number;
    }
  | {
      domain: string;
      kind: 'data' | 'enumerationValues';
      logicalNode: string;
      path: NodeComponent[];
      server: number;
    }
  | {
      domain: string;
      kind: 'dataSets' | 'reportControls';
      logicalNode: string;
      server: number;
    }
  | { domain: string; kind: 'logicalNodes'; server: number }
  | { kind: 'accessPoints' | 'logicalDevices'; server: number };

export interface BrowseRequest {
  location: BrowseLocation;
  offset: number;
  limit: number;
}

export type DataDeclaration =
  | { cdc: null | string; kind: 'dataObject' }
  | {
      dataType: {
        binaryTimeDate: boolean | null;
        exponentWidthBits: null | number;
        maxLength: null | number;
        name: string;
        origin: 'declared' | 'observed';
        widthBits: null | number;
        wireLength: null | number;
      };
      kind: 'value';
    }
  | { kind: 'enumeration'; typeId: string }
  | { kind: 'structure' };

export interface ArrayDimension {
  count: null | number;
  packed: boolean | null;
  countReference: null | {
    name: string;
    resolution:
      | 'instanceOverride'
      | 'missingValue'
      | 'nonUniformInstances'
      | 'settingGroupDependent'
      | 'templateAndInstance'
      | 'templateDefault';
    valueKind: null | string;
  };
}

export type BrowseDeclaration =
  | {
      arrayDimensions: ArrayDimension[];
      definition: DataDeclaration;
      domain: string;
      functionalConstraint: null | string;
      functionalConstraints: string[];
      indices: number[];
      kind: 'data';
      path: NodeComponent[];
      projections: {
        arrayDimensions: ArrayDimension[];
        componentCount: number;
        functionalConstraint: string;
        structurePacked: boolean | null;
      }[];
    }
  | {
      confRev: number;
      dataSet: null | { domain: string; logicalNode: string; name: string };
      evidence:
        | {
            enabled: boolean;
            entryIdHex: null | string;
            generalInterrogation: boolean;
            kind: 'observed';
            ownerHex: null | string;
            purgeBuffer: boolean | null;
            reservation: boolean | null;
            reservationTimeSeconds: null | number;
            sequenceNumber: number;
            timeOfEntryHex: null | string;
          }
        | {
            instanceNumber: null | number;
            kind: 'declared';
            templateName: string;
          };
      kind: 'reportControl';
      reportId: null | string;
      reportKind: 'buffered' | 'unbuffered';
    }
  | { declaredClass: null | string; kind: 'logicalNode' }
  | { declaredInstance: null | string; domain: string; kind: 'logicalDevice' }
  | { index: number; kind: 'networkAddress' }
  | { kind: 'accessPoint' }
  | { kind: 'addressParameter'; value: string }
  | { kind: 'dataSet'; observedDeletable: boolean | null }
  | {
      kind: 'dataSetMember';
      memberIndex: number;
      variable: { alternate_access: MmsAlternateAccess | null; name: MmsName };
    }
  | { kind: 'enumerationValue'; ordinal: number };

export interface BrowseNode {
  name: string;
  declaration: BrowseDeclaration;
  childCount: null | number;
  target: BrowseLocation | null;
}

export type ComparisonStatus =
  | 'agreement'
  | 'conflict'
  | 'declaredOnly'
  | 'observedOnly'
  | 'unknown';
export type ComparisonReason =
  | 'accessRights'
  | 'arrayDimensions'
  | 'arrayPacking'
  | 'bufferTime'
  | 'changeTriggers'
  | 'configurationRevision'
  | 'dataObjectCdc'
  | 'defaultValues'
  | 'deviceEdition'
  | 'enumerationLabels'
  | 'iedName'
  | 'instanceValues'
  | 'integrityPeriod'
  | 'logicalNodeClass'
  | 'member'
  | 'orderedMembers'
  | 'presence'
  | 'reportAllocation'
  | 'reportDataSet'
  | 'reportId'
  | 'reportKind'
  | 'reportOptions'
  | 'reportTriggers'
  | 'representation'
  | 'structurePacking'
  | 'transience'
  | 'valueKind';

export interface ComparisonRequest {
  declaration: { digest: string; server: number };
  observation: { digest: string; server: number };
  domains: string[];
  statuses: ComparisonStatus[];
  offset: number;
  limit: number;
}

export type ComparisonEvidence =
  | { axes: ArrayDimension[]; kind: 'dimensions' }
  | {
      bufferTimeMs: number;
      confRev: number;
      dataSet: null | { domain: string; logicalNode: string; name: string };
      evidence: Extract<
        BrowseDeclaration,
        { kind: 'reportControl' }
      >['evidence'];
      integrityPeriodMs: number;
      kind: 'report';
      options: {
        bufferOverflow: boolean | null;
        confRev: boolean;
        dataReference: boolean;
        dataSetName: boolean;
        entryId: boolean;
        reasonForInclusion: boolean;
        reportTimeStamp: boolean;
        sequenceNumber: boolean;
      };
      reportId: null | string;
      reportKind: 'buffered' | 'unbuffered';
      triggers: {
        dataChange: boolean;
        dataUpdate: boolean;
        generalInterrogation: boolean | null;
        integrity: boolean;
        qualityChange: boolean;
      };
    }
  | { count: null | number; kind: 'declarationValues' }
  | {
      dataChange: boolean;
      dataUpdate: boolean;
      kind: 'changeTriggers';
      qualityChange: boolean;
    }
  | { definition: DataDeclaration; kind: 'representation' }
  | { kind: 'boolean'; value: boolean | null }
  | { kind: 'dataSet'; memberCount: number }
  | { kind: 'enumeration'; labelCount: number; typeId: string }
  | {
      kind: 'member';
      variable: { alternate_access: MmsAlternateAccess | null; name: MmsName };
    }
  | { kind: 'text'; value: null | string };

export interface ComparisonFinding {
  location: {
    domain: string;
    functionalConstraint: null | string;
    logicalNode: null | string;
    memberIndex: null | number;
    path: string[];
  };
  status: ComparisonStatus;
  reason: ComparisonReason;
  declaration: ComparisonEvidence | null;
  observation: ComparisonEvidence | null;
}

export interface ComparisonPage {
  declaration: AssetInfo;
  observation: AssetInfo;
  declarationServer: number;
  observationServer: number;
  domains: string[];
  summary: Record<ComparisonStatus, number>;
  total: number;
  totalFacts: number;
  offset: number;
  findings: ComparisonFinding[];
}

/** Exact immutable source selection; preflight is independent of runtime activation. */
export interface GooseSourceRequest {
  namespaces: {
    data: string[];
    presenceRules: 'iec71Amendment2020' | 'tr9010Edition1';
    rules: 'iec71Edition2';
    services: {
      applicability: string;
      data: string;
      primitives: ('octet6' | 'octet16')[];
      service: string;
    }[];
  };
  declaration: { digest: string; server: number };
  observation: { digest: string; server: number };
  domain: string;
  control: string;
  accessPoint: string;
  subnetwork: string;
}

/** Complete compact observed types, preserving every array axis and structure slot. */
export type GooseMemberType =
  | {
      components: { name: null | string; valueType: GooseMemberType }[];
      kind: 'structure';
    }
  | { count: number; element: GooseMemberType; kind: 'array' }
  | {
      kind: 'primitive';
      specification: Extract<DataDeclaration, { kind: 'value' }>['dataType'];
    };

export type NamespaceState =
  | { digest: string; name: string; sourceOffset: number; status: 'definition' }
  | { digest: string; status: 'matched'; value: NamespaceValue }
  | {
      reason:
        | 'missingBase'
        | 'missingDefinition'
        | 'missingOriginal'
        | 'missingType'
        | 'settingGroup'
        | 'unobserved'
        | 'unspecifiedRevision'
        | 'unspecifiedValue';
      status: 'unknown';
      value: NamespaceValue | null;
    };

export interface NamespaceValue {
  lexical: string;
  origin: 'instance' | 'template';
  level: 'cdc' | 'data' | 'logicalDevice' | 'logicalNode';
}

export interface NamespaceAttributeDeclaration {
  resolution:
    | 'absent'
    | 'settingGroupRequired'
    | 'unique'
    | 'unobserved'
    | 'unspecified';
  origin: NamespaceValue['origin'] | null;
  valueKind: null | string;
  values: { lexical: string; settingGroup: null | number }[];
}

export type NamespacePresence =
  | {
      digest: string;
      member: string;
      reason: 'cardinality' | 'forbidden' | 'group' | 'missing' | 'numbering';
      sourceOffset: number;
      status: 'violated';
    }
  | { status: 'satisfied' | 'unknown' };

export interface NamespaceScope {
  controlModel:
    | {
        conflict: boolean;
        observation:
          | { status: 'invalid' | 'readFailure' | 'unestablished' }
          | { status: 'value'; value: string };
        status: 'declared';
        value: string;
      }
    | { status: 'notApplicable' | 'unknown' };
  presence: NamespacePresence;
  substitution:
    | {
        locator: string;
        observedSv: boolean;
        source: string;
        status: 'declared';
        support: 'supported' | 'unsupported';
      }
    | { status: 'unknown' };
  declarations: Record<NamespaceValue['level'], NamespaceAttributeDeclaration>;
  observations: Record<NamespaceValue['level'], NamespaceObservedState>;
  path: { dimensions: ArrayDimension[]; name: string }[];
  position:
    | { boundsKnown: boolean; indices: number[][]; kind: 'instance' }
    | { kind: 'template'; remainingInstances: null | string };
  logicalDevice: NamespaceState;
  logicalNode: NamespaceState;
  data: NamespaceState;
  cdc: NamespaceState;
  conflict: boolean;
  unresolved: boolean;
}

export interface NamespaceObject {
  name: string;
  scopes: NamespaceScope[];
  observations: Record<NamespaceValue['level'], NamespaceObservedState>;
  logicalDevice: NamespaceState;
  logicalNode: NamespaceState;
  data: NamespaceState;
  cdc: NamespaceState;
  conflict: boolean;
  unresolved: boolean;
}

export interface NamespaceObservedState {
  effectiveNamespace: NamespaceEffectiveState;
  namespaceReference:
    | { digest: string; status: 'matched' }
    | { reason: NamespaceObservedConflict; status: 'conflict' }
    | { reason: NamespaceObservedUnknown; status: 'unknown' };
  declarationComparison:
    | { reason: NamespaceComparisonUnknown; status: 'unknown' }
    | { status: 'agreement' | 'conflict' };
  typeEvidence:
    | {
        definition: DataDeclaration;
        dimensions: ArrayDimension[];
        status: 'present';
        structurePacked: boolean | null;
      }
    | {
        status:
          | 'attributeAbsent'
          | 'functionalConstraintAbsent'
          | 'scopeAbsent'
          | 'unobserved';
      };
  readEvidence:
    | { code: string; status: 'failure' }
    | { status: 'success' | 'unobserved' };
  selection: 'concrete' | 'invalid' | 'required' | 'unavailable';
  value: NamespaceReadValue | null;
}

export type NamespaceEffectiveState =
  | {
      digest: string;
      origin:
        | {
            kind: 'definition';
            namespaceDigest: string;
            observedLevel: NamespaceValue['level'];
          }
        | { kind: 'hierarchy' | 'observed'; level: NamespaceValue['level'] };
      status: 'known';
    }
  | { reason: NamespaceEffectiveUnknown; status: 'unknown' }
  | { reason: NamespaceObservedConflict; status: 'conflict' };
export type NamespaceEffectiveUnknown =
  | { kind: 'binding'; reason: NamespaceObservedUnknown }
  | {
      kind:
        | 'cdcDefinitionUnestablished'
        | 'parentUnestablished'
        | 'profileUnestablished';
    };

export type NamespaceObservedUnknown =
  | 'attributeAbsent'
  | 'functionalConstraintAbsent'
  | 'missingOriginal'
  | 'missingValue'
  | 'readFailure'
  | 'readUnobserved'
  | 'scopeAbsent'
  | 'selectionRequired'
  | 'selectionUnavailable'
  | 'typeUnobserved'
  | 'unspecifiedRevision';
export type NamespaceObservedConflict =
  | 'attributeArray'
  | 'namespaceSyntax'
  | 'originalPurpose'
  | 'primitiveRepresentation'
  | 'selectionInvalid'
  | 'valueRepresentation';
export type NamespaceComparisonUnknown =
  | 'actualValueUnproven'
  | 'declarationAbsent'
  | 'declarationUnobserved'
  | 'declarationUnspecified'
  | 'settingGroup';

export type NamespaceReadValue =
  | { hex: string; kind: 'bitString' | 'booleanArray'; unusedBits: number }
  | {
      hex: string;
      kind:
        | 'binary32'
        | 'binary64'
        | 'binaryTime'
        | 'objectIdentifier'
        | 'octetString'
        | 'utcTime';
    }
  | { kind: 'array' | 'structure'; values: NamespaceReadValue[] }
  | { kind: 'boolean'; value: boolean }
  | {
      kind: 'integer' | 'mmsString' | 'unsigned' | 'visibleString';
      value: string;
    };

export interface GooseSourcePlan {
  capturedDeclarations: CapturedDeclarations;
  capturedDomainApplicability: 'declared' | 'notDeclared' | 'unrecorded';
  namespaces: {
    actualTypes: {
      functionalConstraint: string;
      logicalNode: string;
      object: string;
      relationship: {
        checked: number;
        status: ComparisonStatus;
        unknown: number;
      };
    }[];
    logicalNodes: {
      conflict: boolean;
      domain: string;
      logicalNode: string;
      objectCount: number;
      objects: NamespaceObject[];
      unresolved: boolean;
    }[];
    originals: AssetInfo[];
    presenceApplicability: NamespaceProfileApplicability;
    profileApplicability: NamespaceProfileApplicability;
    runtimeQualified: boolean;
  };
  declaration: AssetInfo;
  observation: AssetInfo;
  selection: GooseSourceRequest;
  dataSet: string;
  gooseId: string;
  configurationRevision: number;
  security: 'none' | 'signature' | 'signatureAndEncryption' | null;
  fixedOffsets: boolean | null;
  addressParameters: { kind: string; value: string }[];
  network: {
    appId: null | number;
    destination: null | number[];
    vlanId: null | number;
    vlanPriority: null | number;
  };
  minimumTimeMs: null | string;
  maximumTimeMs: null | string;
  members: {
    memberIndex: number;
    typeRelationship: {
      checked: number;
      status: 'agreement' | 'unknown';
      unknown: number;
    };
    valueType: GooseMemberType;
    variable: { alternate_access: MmsAlternateAccess | null; name: MmsName };
  }[];
  unresolvedRequirements: (
    | 'declaredTypeRelationship'
    | 'namespaceAndServices'
    | 'nativeIdentityAndClock'
    | 'profileAndEdition'
    | 'runtimePublication'
    | 'securityPolicy'
    | 'simulationDomain'
  )[];
}

export type NamespaceProfileApplicability =
  | {
      edition: { amendment: number; major: number };
      status: 'declaredForRules' | 'unqualifiedEdition';
    }
  | { status: 'domainNotDeclared' | 'partNotDeclared' | 'unrecorded' };

export function planGooseSource(
  request: GooseSourceRequest,
  signal: AbortSignal,
) {
  return requestClient.post<GooseSourcePlan>(
    `${root}/goose/source-plans`,
    request,
    {
      signal,
      timeout: 20_000,
    },
  );
}

export function compareEngineering(
  request: ComparisonRequest,
  signal: AbortSignal,
) {
  return requestClient.post<ComparisonPage>(`${root}/comparisons`, request, {
    signal,
    timeout: 20_000,
  });
}

export interface BrowsePage {
  digest: string;
  location: BrowseLocation;
  total: number;
  offset: number;
  nodes: BrowseNode[];
}

const root = '/engineering/iec61850';
const source = (digest: string) => `${root}/assets/${digest}`;

export function getEngineeringStatus(signal: AbortSignal) {
  return requestClient.get<EngineeringStatus>(`${root}/status`, { signal });
}

export function uploadScl(file: File, signal: AbortSignal) {
  const body = new FormData();
  body.append('file', file);
  return requestClient.post<AssetInfo>(`${root}/assets`, body, {
    headers: { 'Content-Type': 'multipart/form-data' },
    signal,
    timeout: 35_000,
  });
}

export function uploadSupportingDocument(file: File, signal: AbortSignal) {
  const body = new FormData();
  body.append('file', file);
  return requestClient.post<AssetInfo>(`${root}/documents`, body, {
    headers: { 'Content-Type': 'multipart/form-data' },
    signal,
    timeout: 25_000,
  });
}

export function uploadNsd(file: File, role: NsdRole, signal: AbortSignal) {
  const body = new FormData();
  body.append('file', file);
  return requestClient.post<AssetInfo>(`${root}/nsd?role=${role}`, body, {
    headers: { 'Content-Type': 'multipart/form-data' },
    signal,
    timeout: 35_000,
  });
}

export function getEngineeringAsset(digest: string, signal: AbortSignal) {
  return requestClient.get<AssetInfo>(source(digest), { signal });
}

export function captureEngineeringSnapshot(
  request: {
    channelId: number;
    configurationRevision: string;
    domains: string[];
  },
  signal: AbortSignal,
) {
  return requestClient.post<AssetInfo>(`${root}/snapshots`, request, {
    signal,
    timeout: 300_000,
  });
}

export function previewEngineeringAsset(
  digest: string,
  offset: number,
  limit: number,
  signal: AbortSignal,
) {
  return requestClient.get<AssetPreview>(`${source(digest)}/preview`, {
    params: { limit, offset },
    signal,
    timeout: 20_000,
  });
}

export function browseEngineering(
  digest: string,
  request: BrowseRequest,
  signal: AbortSignal,
) {
  return requestClient.post<BrowsePage>(`${source(digest)}/browse`, request, {
    signal,
    timeout: 20_000,
  });
}

export async function downloadEngineeringOriginal(
  digest: string,
  signal: AbortSignal,
) {
  const response = await requestClient.download<RequestResponse<Blob>>(
    `${source(digest)}/original`,
    { responseReturn: 'raw', signal, timeout: 20_000 },
  );
  return response.data;
}

export interface FieldTarget {
  functionalConstraint?: null | string;
  domain: string;
  logicalNode: string;
  path: NodeComponent[];
}
export interface ControlPolicy {
  expectedControlModel: number;
  originCategory: number;
  originIdentifierHex: string;
  synchronismCheck: boolean;
  interlockingCheck: boolean;
  test: boolean;
  sboClass: 'operateMany' | 'operateOnce' | null;
  selectionTimeoutMs: null | number;
  terminationTimeoutMs: null | number;
}
export type MappingPurpose =
  | { kind: 'control'; policy: ControlPolicy; target: FieldTarget }
  | { kind: 'parameterWrite'; target: FieldTarget }
  | {
      kind: 'read';
      quality: FieldTarget | null;
      sourceTime: FieldTarget | null;
      value: FieldTarget;
    };
export interface PointMapping {
  name: string;
  key: string;
  type: 0 | 1;
  unit: null | string;
  purpose: MappingPurpose;
}
export interface ReportPointMapping {
  pointIndex: number;
  valueMember: number;
  qualityMember: null | number;
  timeMember: null | number;
}
export type ReportReservation =
  | { kind: 'brImplicitNoReservationField' }
  | { kind: 'brTimed'; seconds: number }
  | { kind: 'urUnreserved' };
export interface ReportMapping {
  domain: string;
  logicalNode: string;
  reportName: string;
  reportId: string;
  reservation: ReportReservation;
  points: ReportPointMapping[];
}
export interface MappingRequest {
  server: number;
  accessPoint: null | string;
  points: PointMapping[];
  reports: ReportMapping[];
}
export interface MappingPreview {
  digest: string;
  server: number;
  accessPoint: null | string;
  devices: { declaredInstance: null | string; domain: string }[];
  points: {
    accessMode: number;
    dataType: number;
    deviceIndex: number;
    driverConfig: Record<string, unknown>;
    key: string;
    name: string;
    type: 0 | 1;
    unit: null | string;
  }[];
  reports: {
    confRev: number;
    dataSet: unknown;
    kind: string;
    members: unknown[];
    points: ReportPointMapping[];
    rcb: unknown;
    reportId: string;
    reservation: ReportReservation;
  }[];
}
export type StandardPart =
  | 'acsi72'
  | 'dataClasses73'
  | 'logicalNodes74'
  | 'mapping81'
  | 'scl6'
  | 'semantics71';
export type DocumentRole =
  | 'mics'
  | 'pics'
  | 'pixit'
  | 'standardReference'
  | 'tics'
  | 'vendorDocumentation';
export interface SubstitutionDeclaration {
  support: 'supported' | 'unsupported';
  source: string;
  locator: string;
  objects: {
    domain: string;
    logicalNode: string;
    path: { indices: number[]; name: string }[];
  }[];
}

export interface IedContract {
  manufacturer: null | string;
  model: null | string;
  firmware: null | string;
  domains: string[];
  documents: {
    digest: string;
    label: string;
    locator: null | string;
    roles: DocumentRole[];
  }[];
  substitution: SubstitutionDeclaration[];
  parts: {
    edition: { amendment: number; major: number };
    part: StandardPart;
    publication: string;
    sources: string[];
  }[];
}

export interface GoosePublicationSource {
  id: string;
  selection: GooseSourceRequest;
  publisher: [number, number, number, number, number, number];
  tag:
    | { identifier: number; kind: 'tagged'; priority: number }
    | { kind: 'untagged' };
  trafficDomain: 'normal' | 'simulated';
  talMultiplier: number;
  expiryOffsetMs: number;
  maxTalMs: number;
  recoveryConfirmations: number;
}
export interface GoosePublicationField {
  memberIndex: number;
  path: (number | string)[];
}
export interface GoosePublicationPoint {
  sourceIndex: number;
  name: string;
  key: string;
  type: 0 | 1;
  unit: null | string;
  value: GoosePublicationField;
  quality: GoosePublicationField | null;
  sourceTime: GoosePublicationField | null;
}
export type PublicationAcquisition =
  | { contract: IedContract; mapping: MappingRequest; protocol: 'mms' }
  | {
      mapping: {
        devices: { domain: string; name: string }[];
        points: GoosePublicationPoint[];
        sources: GoosePublicationSource[];
      };
      protocol: 'goose';
    };
export interface PublicationMapping {
  digest: string;
  devices: MappingPreview['devices'];
  points: MappingPreview['points'];
  acquisition:
    | {
        accessPoint: null | string;
        protocol: 'mms';
        reports: MappingPreview['reports'];
        server: number;
      }
    | {
        deviceNames: string[];
        protocol: 'goose';
        sources: {
          declarations: { contract: IedContract; snapshotDigest: string };
          dependencies: string[];
          source: GoosePublicationSource;
        }[];
      };
}

export interface PublicationRequest {
  target:
    | { baseRevision: string; channelId: number; kind: 'replace' }
    | { kind: 'create' };
  channel: {
    connectionConfig: Record<string, unknown>;
    connectionPolicy: ConnectionPolicy;
    driverId: number;
    name: string;
    period: null | number;
    reportType: 0 | 1;
    status: 0 | 1;
  };
  acquisition: PublicationAcquisition;
}
export interface PublicationPreview {
  previewDigest: string;
  currentConfiguration: ChannelInfo['configuration'];
  mapping: PublicationMapping;
  deviceIds: (null | number)[];
  pointIds: (null | number)[];
  removed: { id: number; kind: string; name: string }[];
  contract: IedContract | null;
}
export interface EngineeringPublicationRecord {
  channelId: number;
  desiredRevision: string;
  baseRevision: null | string;
  sourceDigest: string;
  previewDigest: string;
  publishedBy: string;
  createdAt: string;
}
export interface PublicationReceipt {
  publication: EngineeringPublicationRecord;
  configuration: NonNullable<ChannelInfo['configuration']>;
  contract: IedContract | null;
}
export interface IedContractRecord {
  publication: EngineeringPublicationRecord;
  contract: IedContract;
}

export type CapturedDeclarations =
  | {
      kind: 'published';
      snapshot: {
        contract: IedContract;
        publication: EngineeringPublicationRecord;
      };
    }
  | { kind: 'unrecorded' };

export type CapturedDeclarationProvenance =
  | { kind: 'published'; snapshotDigest: string }
  | { kind: 'unrecorded' };
export function getIedContract(channelId: number, signal: AbortSignal) {
  return requestClient.get<IedContractRecord | null>(
    `${root}/channels/${channelId}/contract`,
    { signal },
  );
}
export function previewPublication(
  digest: string,
  proposal: PublicationRequest,
  signal: AbortSignal,
) {
  return requestClient.post<PublicationPreview>(
    `${source(digest)}/publication-preview`,
    proposal,
    { signal, timeout: 25_000 },
  );
}
export function publishEngineering(
  digest: string,
  proposal: PublicationRequest,
  previewDigest: string,
  signal: AbortSignal,
) {
  return requestClient.post<PublicationReceipt>(
    `${source(digest)}/publish`,
    { proposal, previewDigest },
    { signal, timeout: 45_000 },
  );
}
