/* global process */
import { createNjTelemetryHandler } from '../server/njTelemetryProxy.mjs'
export const maxDuration = 30
export default createNjTelemetryHandler(process.env)
