'use strict';

const { z } = require('zod');

const BaseSettings = {
  maxPositions: z.number().int().min(1).max(10).optional(),
  lotSize: z.number().positive().max(100).optional(),
  profitTarget: z.number().positive().max(1000).optional(),
  riskPercent: z.number().positive().max(5).optional(),
  maxDailyLoss: z.number().positive().max(20).optional(),
  maxConsecutiveLosses: z.number().int().min(1).max(20).optional(),
  maxHoldSeconds: z.number().int().min(5).max(600).optional(),
  maxSpread: z.number().positive().max(100).optional(),
  minExpectedNetProfit: z.number().positive().max(1000).optional(),
  minSignalQuality: z.number().min(0).max(1).optional(),
  newsBlackoutMinutes: z.number().int().min(0).max(240).optional(),
  sessions: z.array(z.enum(['sydney', 'tokyo', 'london', 'newyork'])).optional(),
  maxAccountExposure: z.number().positive().max(1).optional(),
};

// PUT /  — full replace: requires the core set to be present
const SettingsUpdateSchema = z.object({
  maxPositions: BaseSettings.maxPositions.required,
  lotSize: BaseSettings.lotSize.required,
  profitTarget: BaseSettings.profitTarget.required,
  riskPercent: BaseSettings.riskPercent.required,
  maxDailyLoss: BaseSettings.maxDailyLoss.required,
  maxConsecutiveLosses: BaseSettings.maxConsecutiveLosses.required,
  maxHoldSeconds: BaseSettings.maxHoldSeconds.required,
  maxSpread: BaseSettings.maxSpread.required,
  minSignalQuality: BaseSettings.minSignalQuality.optional(),
  minExpectedNetProfit: BaseSettings.minExpectedNetProfit.optional(),
  newsBlackoutMinutes: BaseSettings.newsBlackoutMinutes.optional(),
  sessions: BaseSettings.sessions.optional(),
  maxAccountExposure: BaseSettings.maxAccountExposure.optional(),
}).strict();

// PATCH / — partial update, at least one field required
const SettingsPatchSchema = z
  .object(BaseSettings)
  .strict()
  .refine((v) => Object.keys(v).length > 0, {
    message: 'At least one field must be provided',
  });

const PositionSlotSchema = z
  .object({
    lotSize: z.number().positive().max(100).optional(),
    profitTarget: z.number().positive().max(1000).optional(),
    enabled: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, {
    message: 'At least one slot field must be provided',
  });

const PositionSlotParamsSchema = z.object({
  index: z
    .string()
    .regex(/^\d+$/, 'index must be a non-negative integer')
    .transform((v) => Number(v)),
});

module.exports = {
  SettingsUpdateSchema,
  SettingsPatchSchema,
  PositionSlotSchema,
  PositionSlotParamsSchema,
};