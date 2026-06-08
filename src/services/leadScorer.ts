import { ILead } from '../db/models';

export interface ScoringResult {
  score: number;
  status: 'Cold' | 'Warm' | 'Hot';
}

/**
 * Programmatically calculates lead score and determines status based on parameters in Guide.md
 */
export function calculateLeadScore(lead: Partial<ILead>): ScoringResult {
  let score = 0;

  // 1. Phone Verified (All WhatsApp users have verified phone numbers)
  if (lead.phone) {
    score += 10;
  }

  // 2. Budget Match (+30 if budget is provided)
  if (lead.budget && lead.budget.trim().length > 0 && !/unknown|none/i.test(lead.budget)) {
    score += 30;
  }

  // 3. Timeline Score (+25 for Immediate, graded for others)
  if (lead.timeline) {
    const timelineLower = lead.timeline.toLowerCase();
    if (timelineLower.includes('immediate') || timelineLower.includes('now') || timelineLower.includes('today')) {
      score += 25;
    } else if (timelineLower.includes('1 month') || timelineLower.includes('soon')) {
      score += 15;
    } else if (timelineLower.includes('3 month') || timelineLower.includes('later')) {
      score += 10;
    } else {
      // Just researching or other
      score += 5;
    }
  }

  // 4. Correct Location Preference (+20 if location is specified)
  if (lead.locationPreference && lead.locationPreference.trim().length > 0 && !/unknown|none/i.test(lead.locationPreference)) {
    score += 20;
  }

  // 5. Investor or Purchase Type (+15 if purchase type is specified)
  if (lead.purchaseType && (lead.purchaseType.toLowerCase().includes('invest') || lead.purchaseType.toLowerCase().includes('use') || lead.purchaseType.toLowerCase().includes('self'))) {
    score += 15;
  }

  // Determine status based on thresholds in Guide.md
  let status: 'Cold' | 'Warm' | 'Hot' = 'Cold';
  if (score >= 70) {
    status = 'Hot';
  } else if (score >= 40) {
    status = 'Warm';
  }

  return { score, status };
}
