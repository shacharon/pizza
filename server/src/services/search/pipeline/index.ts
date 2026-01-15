/**
 * V2 Pipeline Exports
 * 
 * Central export point for the new pipeline architecture
 */

// Types
export type {
  PipelineContext,
  GateResult,
  IntentLiteResult,
  SearchPlan,
  PipelineResult
} from './types.js';

// Pipeline runner
export {
  runSearchPipelineV2,
  createPipelineDependencies,
  type PipelineDependencies
} from './pipeline.js';

// Adapters
export { GateAdapter } from './adapters/gate-adapter.js';

// Stages
export { executeIntentLiteStage } from './stages/intent-lite.stage.js';
export { executeRouteMapStage } from './stages/route-map.stage.js';
