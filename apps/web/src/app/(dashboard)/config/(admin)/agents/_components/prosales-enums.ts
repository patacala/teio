// Mirrors prosales.core.enums — Intent/Sentiment/UrgencyLevel. Used by
// RulesTab (trigger conditions) and StrategiesTab (triggers).
export const INTENTS = [
  'greeting', 'inquiry', 'comparison', 'objection', 'negotiation',
  'scheduling', 'farewell', 'complaint', 'follow_up', 'unknown',
];
export const SENTIMENTS = ['very_positive', 'positive', 'neutral', 'negative', 'very_negative'];
export const URGENCIES = ['low', 'medium', 'high', 'critical'];
