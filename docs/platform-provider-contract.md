# BatchPlane Platform Provider Contract

Status: Architecture baseline for issue #191

## Purpose

The Platform Provider contract lets BatchPlane integrate different batch
platforms without exposing provider-native types to the core domain or shared
UI. GitHub Actions is the reference provider, Jenkins is the second provider,
and additional platforms use the same contract.

## Provider Bundle

A Provider Bundle may contain separately deployed components:

```text
Provider Bundle
  descriptor and capability declaration
  Main control/observation adapter
  optional Lite runtime adapter
  provider event/webhook adapter
  platform-side Gate connector
  installation and compatibility support
  Adapter TCK fixtures
```

The server adapter and platform-side Gate connector are not required to run in
the same process or language. They share versioned contracts.

## Provider Descriptor

```json
{
  "providerKey": "github-actions",
  "displayName": "GitHub Actions",
  "providerVersion": "1.0.0",
  "contractVersion": "batchplane.io/provider/v1",
  "configurationSchemaRef": "schema://github-actions/connection/v1",
  "batchSpecSchemaRef": "schema://github-actions/batch/v1",
  "capabilities": [],
  "supportedGateProtocolVersions": ["batchplane.io/gate/v1"]
}
```

`providerKey` is an extensible string. Core code MUST NOT use an enum that
requires a core release for every new provider.

## Capability Model

Capabilities are independently declared:

| Capability           | Meaning                                            |
| -------------------- | -------------------------------------------------- |
| `CATALOG_DISCOVER`   | Search native batches not yet governed             |
| `CATALOG_READ`       | Read a native batch and current configuration      |
| `CHANGE_REGISTER`    | Create a new native batch                          |
| `CHANGE_UPDATE`      | Change an existing native batch                    |
| `CHANGE_SUSPEND`     | Prevent new native starts without deleting history |
| `CHANGE_RESTORE`     | Restore a previously suspended native batch        |
| `CHANGE_DELETE`      | Delete or retire a native batch                    |
| `CHANGE_PLAN`        | Produce normalized/native pre-apply diff           |
| `EXECUTION_DISPATCH` | Trigger a governed run                             |
| `EXECUTION_CANCEL`   | Cancel a native run                                |
| `EXECUTION_RETRY`    | Request a new provider-native attempt              |
| `SCHEDULE_READ`      | Read native schedules                              |
| `SCHEDULE_MANAGE`    | Create/change/delete native schedules              |
| `RUN_OBSERVE`        | Read or receive normalized run state               |
| `LOG_READ`           | Fetch native logs on demand                        |
| `GATE_PRE_START`     | Enforce BatchPlane before business work            |
| `GATE_COMPLETE`      | Report completion against the same attempt         |
| `INSTALL_MANAGED`    | Install or update managed connector artifacts      |
| `RECONCILE`          | Detect drift, missing resources, and missed events |

A capability may include constraints such as supported native resource types,
trigger types, parameter types, schedule precision, or Gate coverage.

Schedule capability metadata includes:

```text
timezoneMode: NATIVE_IANA | UTC_ONLY | UNSUPPORTED
minimumIntervalSeconds
supportsMisfireRecovery
supportsOverlapPolicy
supportsStableOccurrenceId
```

An adapter must not silently emulate `NATIVE_IANA` with a fixed UTC cron when
DST can change the correct offset. Unsupported provider constraints are
validated before a Change Request is submitted.

## Provider-Neutral Data

Provider ports accept and return product contracts:

```text
ExternalResourceRef
  providerKey
  platformConnectionId
  resourceType
  nativeId
  nativeVersion
  nativeUrl

ProviderBatchSnapshot
  externalResourceRef
  displayName
  normalizedStatus
  providerSpec
  providerSpecDigest
  observedAt

NativeOperationRef
  operationType
  nativeOperationId
  nativeUrl
  acceptedAt
```

Provider-specific documents are JSON-compatible, schema-versioned values. They
must be validated before reaching a provider implementation.

## Split Port Interfaces

The provider SPI uses focused interfaces rather than one optional-method God
interface. The following Kotlin signatures are illustrative.

```kotlin
interface CatalogConnector {
    fun discover(command: DiscoverNativeBatches): Page<ProviderBatchSnapshot>
    fun get(command: GetNativeBatch): ProviderBatchSnapshot?
}

interface ChangeConnector {
    fun plan(command: PlanNativeChange): ProviderChangePlan
    fun apply(command: ApplyNativeChange): NativeOperationRef
    fun getOperation(command: GetNativeOperation): NativeOperationStatus
}

interface ExecutionConnector {
    fun dispatch(command: DispatchExecution): NativeExecutionRef
    fun cancel(command: CancelExecution): NativeOperationRef
    fun retry(command: RetryExecution): NativeExecutionRef
}

interface ScheduleConnector {
    fun list(command: ListNativeSchedules): List<NativeScheduleSnapshot>
    fun plan(command: PlanScheduleChange): ProviderChangePlan
    fun apply(command: ApplyScheduleChange): NativeOperationRef
}

interface ObservationConnector {
    fun getRun(command: GetNativeRun): NativeRunSnapshot?
    fun listRuns(command: ListNativeRuns): Page<NativeRunSnapshot>
    fun getLog(command: GetNativeLog): NativeLogChunk
}

interface InstallationConnector {
    fun inspect(command: InspectInstallation): InstallationStatus
    fun planUpgrade(command: PlanInstallationUpgrade): ProviderChangePlan
    fun applyUpgrade(command: ApplyInstallationUpgrade): NativeOperationRef
}
```

Gate enforcement is protocol-driven because the connector runs beside or
inside the native platform. It is not called as an ordinary outbound provider
method by the application server.

## Change Planning

Before approval, `plan` MUST return:

```text
ProviderChangePlan
  providerKey
  operation
  expectedBaseVersion
  normalizedChanges[]
  nativePreview
  warnings[]
  destructive
  requiredCapabilities[]
  planDigest
```

The Change Request approval binds `planDigest` and the normalized proposed
revision. `apply` MUST reject a stale native base version rather than applying
against unexpected state.

## Idempotency

Every provider command contains:

- `workspaceId`
- `platformConnectionId`
- product `operationId`
- idempotency key
- expected native version when applicable
- trace/correlation ID

The adapter MUST return the same accepted native operation for a repeated key
or a deterministic conflict if the payload differs. It MUST NOT create two
native runs or mutations because a worker retried after a timeout.

## Event Contract

Provider events are normalized before entering application use cases:

```text
ProviderEventEnvelope
  eventId
  providerKey
  platformConnectionId
  eventType
  occurredAt
  receivedAt
  nativeResourceRef
  nativeExecutionRef
  payloadVersion
  payloadDigest
  payload
```

Supported event meanings include change accepted/completed/failed, execution
queued/start/completed, schedule fired, resource changed, resource deleted,
and connector health changed.

Event delivery is at least once. The inbound adapter authenticates the sender,
stores an inbox deduplication key, and invokes an idempotent application
command.

## Error Contract

Providers map native failures to stable product codes:

- `PROVIDER_AUTHENTICATION_FAILED`
- `PROVIDER_AUTHORIZATION_FAILED`
- `PROVIDER_UNAVAILABLE`
- `PROVIDER_RATE_LIMITED`
- `PROVIDER_RESOURCE_NOT_FOUND`
- `PROVIDER_VERSION_CONFLICT`
- `PROVIDER_CAPABILITY_UNSUPPORTED`
- `PROVIDER_INPUT_INVALID`
- `PROVIDER_OPERATION_REJECTED`
- `PROVIDER_OPERATION_TIMEOUT`
- `PROVIDER_RESPONSE_INVALID`
- `PROVIDER_CONNECTOR_INCOMPATIBLE`
- `PROVIDER_GATE_NOT_INSTALLED`
- `PROVIDER_UNKNOWN_FAILURE`

Errors identify retryability and a safe operator message. Raw native responses
must not expose credentials or secret parameters.

## Installation And Compatibility

Installation inspection returns:

```text
InstallationStatus
  providerVersion
  connectorVersion
  gateProtocolVersion
  status: READY | OUTDATED | PARTIAL | MISSING | INCOMPATIBLE
  enforcementCoverage
  missingComponents[]
  outdatedComponents[]
  warnings[]
```

Managed installation or upgrade MUST produce a reviewable plan. Main may apply
an approved plan through the provider adapter. Lite may represent the same plan
as a Pull Request.

Installation status also includes the exact resolved connector artifact ref.
Production-managed Actions, plugins, or agents use an approved immutable
release reference or digest. A moving development branch is reported as a
development installation, not `READY` for production.

## UI Integration

The shared UI receives:

- provider descriptor and branding label
- connection configuration schema and UI hints
- batch provider-spec schema and UI hints
- capability and constraint descriptions
- safe validation/error messages

Core pages own product flow and layout. Providers may supply field schemas and
display metadata but MUST NOT inject untrusted remote JavaScript into the Main
or Lite UI in the initial architecture.

## Adapter TCK

Each declared capability is tested for:

- schema validation and round-trip mapping
- idempotent command retry
- stale-version rejection
- native error normalization
- event duplication and out-of-order delivery
- schedule timezone and provider-limit handling
- direct execution and rerun Gate behavior
- start/complete correlation
- secret redaction
- connection isolation
- compatibility and installation status

GitHub Actions is the first TCK reference fixture. Jenkins MUST run the same
provider-neutral cases plus Jenkins-specific integration tests before its
provider is declared production-ready.

## Initial Packaging Rule

Provider modules are compiled and released with the Main distribution during
the first implementation. Runtime loading of arbitrary third-party JVM JARs is
deferred. Contributors add a module implementing the SPI and TCK; an external
process or signed plugin model requires a separate security design.
