import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { isPipelineStageLogEnabled } from './pipeline-stage-log.js';

describe('isPipelineStageLogEnabled', () => {
  test('explicit true wins over production', () => {
    const prevN = process.env.NODE_ENV;
    const prevF = process.env.LOG_PIPELINE_STAGES;
    process.env.NODE_ENV = 'production';
    process.env.LOG_PIPELINE_STAGES = 'true';
    try {
      assert.equal(isPipelineStageLogEnabled(), true);
    } finally {
      process.env.NODE_ENV = prevN;
      if (prevF === undefined) delete process.env.LOG_PIPELINE_STAGES;
      else process.env.LOG_PIPELINE_STAGES = prevF;
    }
  });

  test('explicit false wins over non-production', () => {
    const prevN = process.env.NODE_ENV;
    const prevF = process.env.LOG_PIPELINE_STAGES;
    process.env.NODE_ENV = 'development';
    process.env.LOG_PIPELINE_STAGES = '0';
    try {
      assert.equal(isPipelineStageLogEnabled(), false);
    } finally {
      process.env.NODE_ENV = prevN;
      if (prevF === undefined) delete process.env.LOG_PIPELINE_STAGES;
      else process.env.LOG_PIPELINE_STAGES = prevF;
    }
  });

  test('defaults on outside production', () => {
    const prevN = process.env.NODE_ENV;
    const prevF = process.env.LOG_PIPELINE_STAGES;
    process.env.NODE_ENV = 'development';
    delete process.env.LOG_PIPELINE_STAGES;
    try {
      assert.equal(isPipelineStageLogEnabled(), true);
    } finally {
      process.env.NODE_ENV = prevN;
      if (prevF === undefined) delete process.env.LOG_PIPELINE_STAGES;
      else process.env.LOG_PIPELINE_STAGES = prevF;
    }
  });

  test('defaults off in production', () => {
    const prevN = process.env.NODE_ENV;
    const prevF = process.env.LOG_PIPELINE_STAGES;
    process.env.NODE_ENV = 'production';
    delete process.env.LOG_PIPELINE_STAGES;
    try {
      assert.equal(isPipelineStageLogEnabled(), false);
    } finally {
      process.env.NODE_ENV = prevN;
      if (prevF === undefined) delete process.env.LOG_PIPELINE_STAGES;
      else process.env.LOG_PIPELINE_STAGES = prevF;
    }
  });
});
