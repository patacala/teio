export * from './automation.entity';
export * from './automation-version.entity';
export * from './automation-trigger.entity';
export * from './automation-schedule.entity';
export * from './automation-run.entity';
export * from './automation-run-step.entity';
export * from './automation-delivery.entity';

import { AutomationEntity } from './automation.entity';
import { AutomationVersionEntity } from './automation-version.entity';
import { AutomationTriggerEntity } from './automation-trigger.entity';
import { AutomationScheduleEntity } from './automation-schedule.entity';
import { AutomationRunEntity } from './automation-run.entity';
import { AutomationRunStepEntity } from './automation-run-step.entity';
import { AutomationDeliveryEntity } from './automation-delivery.entity';

export const AUTOMATION_ENTITIES = [
  AutomationEntity,
  AutomationVersionEntity,
  AutomationTriggerEntity,
  AutomationScheduleEntity,
  AutomationRunEntity,
  AutomationRunStepEntity,
  AutomationDeliveryEntity,
];
