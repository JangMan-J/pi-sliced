// The tracer version. Rules added in a later version run only under that version, so a stored Trace
// always re-derives under the version that wrote it. PI_SLICED_TRACER selects a version still being
// prepared; the default is the version the committed Traces and checks use.
export const TRACER = process.env.PI_SLICED_TRACER ?? "trace-3";
export const TRACER_N = Number(TRACER.split("-")[1]);
