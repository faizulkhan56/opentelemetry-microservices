// Initialize OpenTelemetry before any other dependencies
const { diag, DiagConsoleLogger, DiagLogLevel } = require('@opentelemetry/api');
diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);

// Load instrumentations before other dependencies
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');

// Configure instrumentations before loading exporter
const instrumentations = getNodeAutoInstrumentations({
  '@opentelemetry/instrumentation-mongodb': { enabled: true },
  '@opentelemetry/instrumentation-amqplib': { enabled: true },
  '@opentelemetry/instrumentation-winston': { enabled: true },
  '@opentelemetry/instrumentation-grpc': { enabled: true },
});

// Load exporter after instrumentations
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-grpc');

// Load ENV
const config = require('./config/index')

// Enable diagnostics for debugging
diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: config.otelExporterEnpoint || 'http://tempo:4317',
  }),
  instrumentations: [instrumentations],
  serviceName: config.otelServiceName || 'order-processor',
});

function initTracing() {
  sdk.start();
  console.log('OpenTelemetry tracing initialized'); // Console log for early feedback

  process.on('SIGTERM', () => {
    sdk
      .shutdown()
      .then(() => console.log('OpenTelemetry tracing shut down'))
      .catch((error) => console.error('Error shutting down OpenTelemetry:', error))
      .finally(() => process.exit(0));
  });
}

// Initialize tracing immediately
initTracing();

// Export for use in other modules if needed
module.exports = { initTracing };